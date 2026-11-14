# AGENTS.md

Guidance for coding agents (Claude, Codex, others) and humans that work on
this fork. Read it before you change something.

## What this fork is

jkroepke/v86 is a fork of [copy/v86](https://github.com/copy/v86) that is
tuned for [tabernetes](https://github.com/jkroepke/tabernetes): container
images (linux/386) run in v86, one web worker per pod, in a browser tab. It
is a "hack fork": upstream does not take AI contributions, so nothing here
is sent upstream. Speed for tabernetes pods is the goal; features that
tabernetes does not use matter less, but nothing may break.

## Rules

- Sign off every commit for the DCO as the maintainer:
  `git config user.name "Jan-Otto Kröpke"; git config user.email mail@jkroepke.de`,
  then `git commit -s`. Check the git user first: sandboxes often default
  to another name.
- No mention of AI tools in commit messages.
- Commit messages in plain English: what changed, why, and the measured
  numbers (workload, before -> after, how measured).
- `master` is the integration branch. The maintainer allows direct pushes
  to `master` after the tests below pass; no pull requests needed.
  Agents that cannot run the tests (no ptrace for gdb, no Docker) push to a
  branch instead: `codex/<topic>` or `wip/<topic>`; someone with the tests
  merges it.
- Long work: push WIP to `wip/<topic>` often and keep a short progress note
  (done, next step, last numbers), so a restarted session resumes from it.
  Sandboxes restart without warning.
- Browser features that only some browsers have must degrade silently
  (feature detection, fallback). v86.wasm needs wasm SIMD; tabernetes runs
  in current Chrome, Firefox and Safari.

## Build and test

    make build/v86.wasm build/libv86.mjs      # release, ~20 s (Rust + Closure)
    make with-profiler                         # release with counters (overwrites build/v86.wasm)
    make all-debug                             # needed by the tests
    MAX_PARALLEL_TESTS=1 make nasmtests nasmtests-force-jit
    make rust-test
    make expect-tests                          # needs wabt; update .wast only where intended

nasmtests compare every instruction with the host CPU through gdb (apt:
`nasm gdb gcc-multilib` or `libc6-dev-i386`). They must pass, in the
interpreter and with the JIT forced, before anything goes to `master`. New
instructions need new test cases (tests/nasm, gen/x86_table.js).

## Release to tabernetes

tabernetes pins the branch `dist` of this fork (`"v86":
"github:jkroepke/v86#<commit>"` in `web/package.json`). `tools/dist.sh
--push` builds the release files of a clean `master` and adds one commit to
`dist` with only the npm package files. The version is unique per commit
(`0.5.<count>-fork.<sha>`) because tabernetes keys its saved VM states by it:
a state saved by another build (other CPUID, other device state) is not
restored. After a push, bump the commit in tabernetes.

## Measure

Use `tools/pod-bench` (see its README): nginx (program start, mostly the
interpreter), cpu (JIT-bound), glibc, spring (a JVM, jumps between JIT
modules). Report main-thread CPU time and wall time, medians of several
rounds, before and after, in the same session. Noise is about 10 %.
Profiler counters (`STATS=1`) and V8 CPU profiles (`PROF=`) show where the
time goes. `GSTAT=` shows what the guest does (user and kernel, system
calls, interrupts, port I/O), `IDLE_MS=` what an idle pod costs.

## Where the time goes (measured 2026-11-13)

- nginx start: 51M guest instructions, 82 % interpreted (75 % with the old
  JIT threshold of 200k). Profile of the main thread: interpreter::run
  45 %, JIT code 9 %, modrm_resolve_packed 7 %, main_loop 7 %; goapp: 40 %,
  18 %, 8 %, 7 %. The interpreter decodes every instruction again: ~120 host
  instructions per guest instruction (callgrind), ~90 Mips also for hot
  loops (cpu with the JIT off). The profile inside `run` is flat. What paid
  was to take loads and branches out of the loop over the instructions;
  what did not: a displacement without branches in the modrm fast path
  (+2 % host instructions), the modrm fast path as a function without calls
  for flat segments (-0.8 %, +13 KB of wasm).
- A decoded instruction cache for the interpreter does not pay (branch
  `wip/interp-cache`, 2026-11-14). Interpreted code is reused a lot (nginx:
  41M interpreted instructions at 247k addresses, only 1.8 % in their first
  4 runs), but decoding is not the large cost. perf with jitdump of nginx:
  the loop head (fetch of the opcode byte, checks, dispatch) is ~22 % of
  `interpreter::run`, `modrm_resolve_packed` ~11 % and the immediate reads
  ~2 % of the main thread; the rest is the work of the instructions. The
  prototype kept a 32-byte entry per physical address of pages with entry
  points (tag with a generation per page, bumped by `jit_dirty_page`): the
  opcode of a generated "cached" arm (one byte and 0F opcodes without
  prefixes), the length, modrm, base/index/scale/segment, displacement and
  immediate. nginx main-thread CPU, 4 alternating runs: 578-618 ms ->
  734-787 ms (+28 %). The tag load missed the host caches (23 % of `run`:
  an entry per byte of code is 32x its footprint; a 512 KB table missed
  more and was slower still), and the cached arms reloaded the entry
  pointer from spill slots. With the JIT off in practice (threshold 4G,
  cpu workload, so the hot loops fit the caches) it was no faster either:
  19.8 / 20.1 s -> 19.4 / 22.8 s. Smaller entries cannot win what the
  hot-loop case does not show.
- Superblocks in the interpreter do not pay (branch `wip/superblock`,
  2026-11-14). Direct jumps already go on inside the page: jmp rel, jcc
  and loop have `no_block_boundary_in_interpreted` (upstream), and the
  block ends only when eip leaves the page or after
  `INTERPRETER_ITERATION_LIMIT` with a jump back. What ends the 2.34M
  interpreted blocks of an nginx start (profiler build, last instruction
  of the block): ret 935k (819k into another page), call rel 858k (751k
  into another page), jmp/call through memory 265k, jmp/jcc out of the
  page ~160k; only ~14 % end with a target in the same page (goapp 14 %,
  glibc 6 %). The prototype went on after a call rel in the page, and
  after ret and jmp/call through memory when the target is in the page
  and the page has no compiled code (the target is recorded as an entry
  point). Interpreted blocks: nginx 2.34M -> 2.03M, goapp 3.17M -> 2.73M,
  glibc 13.7M -> 12.9M; the JIT compiled the same (same compiles and
  bytes; ~1-4 % fewer entry points, the analysis follows call targets).
  Main-thread CPU, medians of 3 alternating sets (nginx 4-10 x 4 rounds,
  goapp 4-10 x 3): nginx 565 / 554 / 556 -> 544 / 573 / 557 ms, goapp
  941 / 993 / 989 -> 951 / 990 / 983 ms; glibc 4049 -> 3957 ms, cpu
  4007 -> 4060 ms (4 x 2 rounds); process CPU unchanged. That fits the
  ceiling: 14 % of the blocks times the ~8 % of `main_loop` is ~1 %. Going
  on into another page would need the same work as a new block (TLB,
  `tlb_code`, marks, hotness and entry point of the new page), so only the
  call and return of `cycle_internal` would be saved.
- Background CPU: V8 compiles every JIT module twice, first with Liftoff,
  then the hot ones with TurboFan on background threads (~40 ms per page
  module). With the threshold of 200k that was 2 s per nginx start and 6.8 s
  per goapp start, more than the main thread used, for code that hardly
  ran. `PCPU=1` of pod-bench shows it; the CPU time of the main thread does
  not.
- v86.wasm itself: V8 optimises its hot functions per process (~0.3 s of
  background CPU, the interpreter is one function of 72 KB) and shares the
  code between workers only while a module of the same bytes is alive. A
  pod that starts alone runs Liftoff code first (the interpreter is ~1.6x
  slower). An embedder should compile v86.wasm once, keep the
  `WebAssembly.Module` and pass it to every worker (`wasm_fn`); pod-bench
  does not show this, its rounds share the module.
- spring: ~9G instructions; 486M entries into JIT modules with only ~16
  instructions each, 473M exits to another page. perf of the main thread
  (after the memory access changes below): JIT code 47 %, interpreter
  26 % (1.2G instructions, mostly pages below the JIT threshold), main_loop
  14 %. perf puts about half of main_loop on the loads after
  `Code.state_table`, the `Code` header and `MODULE_USE`, but they are not
  the cost: a direct-mapped jump cache keyed by eip (4096 x 16 bytes, 96 %
  hits) moved the samples onto its own line and left main_loop at 14 % and
  spring unchanged (3 pairs: 60.6 / 59.1 -> 61.6 / 60.9 s main). Without
  the `MODULE_USE` counter at all: 60.8 -> 59.6 s (noise), so it is not
  worth a change either. The cost per entry (~17 ns) is the call into the
  module and its return, not the lookup.
- SSE/MMX is 0.2-0.3 % of the instructions of these workloads and the
  kernel runs none; newer SSE/AVX levels do not help them.
- Generated wasm: spring compiled ~111 MB of JIT modules in a release
  build with up to 3 pages per module (profiler builds make ~2x the bytes).

## The guest kernel and the devices (measured 2026-11-13)

Counters of `src/rust/gueststat.rs` (`GSTAT=` of `tools/pod-bench`), Linux
7.3.4 with the configuration of tabernetes, 256 MiB, a release build with
`V86_GUESTSTAT=1`:

| workload | instructions | in the kernel | host time in the kernel | kernel instructions in JIT code |
|----------|--------------|---------------|-------------------------|---------------------------------|
| nginx    | 50M          | 55 %          | 69 %                    | 10 %                            |
| goapp    | 175M         | 22 %          | 34 %                    | 20 %                            |
| glibc    | 1004M        | 25 %          | 54 %                    | 67 %                            |
| spring   | 8505M        | 4 %           | 11 %                    | 70 %                            |

- A kernel instruction costs 2-3.5 times the host time of a user
  instruction (nginx 20 against 11 ns, glibc 12 against 3.4 ns). The reason
  is not the events below but that kernel code runs in the interpreter, or
  in JIT code with ~27 instructions per entry: its instructions spread over
  330-430 pages (90 % of them on ~90 pages), and few pages reach the JIT
  threshold in a pod start. A lower threshold for kernel pages only
  did not pay, because of the compiles: with 200k, main-thread CPU -4 % to
  +1 % and wall time +2 % to +8 % (nginx, goapp, glibc); with 50k, CPU up to
  +12 % and wall time +9 % to +55 %. Not kept.
- What the kernel does there: nginx start is system calls (30 % of all
  instructions; execve 240k, exit_group 177k, openat 31k each) and page
  faults (24 %; 1650 faults of 7500 instructions each: file pages over 9p
  with fault-around). glibc text tools: read, getdents64 and
  copy_file_range are 18 %, with 15400 9p requests. spring: read (9p) 1.6 %,
  futex 0.6 %; the scheduler is 40 % of the kernel instructions.
- Events per workload (nginx / goapp / glibc / spring): page faults 1.7k /
  1.5k / 3.6k / 17k; system calls 1.5k / 3.9k / 17.7k / 37k (glibc and musl
  programs use sysenter, Go uses int 0x80); CR3 writes 130 / 19 / 3.9k / 41;
  invlpg 390 / 104 / 500 / 1.7k; timer interrupts 100 per second (PIT,
  periodic); 9p interrupts 770 / 540 / 15.4k / 12.4k; port I/O is the PIC
  (3-5 per interrupt, in Rust) and the virtio notify and ISR ports (one each
  per 9p request). No APIC, no IPIs: the kernel has no SMP.
- None of these events is a cost in v86. In V8 profiles `do_page_walk` is
  0.2 %, and `clear_tlb`, `call_interrupt_vector`, `iret`, `switch_seg`,
  `io_port_write8` and `handle_irqs` are 0.1 % or less each. A CR3 write
  keeps the global pages (1000-6000 entries, the kernel) and drops 30-160
  entries of the process. The JVM invalidated 193 modules by writing code.
  spring fills the list of valid TLB entries (10000) 356 times, which drops
  all entries of the process: 1.3M of its 1.6M page walks, about 0.2 % of
  the time.
- The timers of the devices run once per 100k instructions and on hlt;
  rdtsc is one call of `performance.now` (270k calls in spring).
- Idle was the cost: see `hlt_wait` in the list of changes. What is left
  (20 ms of CPU per second and pod in a Chromium worker) is the tick of the
  guest: the kernel of tabernetes never stops it. `NO_HZ_IDLE` needs
  `tsc=reliable` on the command line, and the PIT cannot wait longer than
  27 ms. With `CONFIG_X86_UP_APIC`, the option `acpi: true` of v86 and
  `tsc=reliable highres=off`, an idle pod takes 2 interrupts and 16k
  instructions per second instead of 100 and 240k: 3 ms of CPU per
  second. v86 still wakes up 10 times per second (the timers of the devices
  return at most 100 ms). Without `highres=off` the Go runtime sleeps for
  real: goapp +10 % instructions.
- `CONFIG_SLUB_TINY=n` in the guest: -1.7 % (nginx) and -3.4 % (glibc)
  instructions, no change of CPU time beyond the noise, +3.5M instructions
  per boot.

## Compiling the JIT modules (measured 2026-11-13)

- V8 compiles each module with Liftoff, then recompiles hot functions
  with TurboFan on background threads (dynamic tiering). Almost every
  module of spring gets hot: TurboFan was ~60 % of the CPU time of the
  process (`node --liftoff-only`: process 310 -> 117 s, main thread only
  +0-3 %; `--wasm-tiering-budget` 10x/100x: -10/-15 %). These threads
  share the cores with the other pods of a tab, and a page cannot set V8
  flags: what v86 controls is the size and the number of modules.
- TurboFan costs ~1.3-2.5 us per wasm byte and grows faster than the
  function (17 KB: 0.7 us/B, 170 KB: 2.5 us/B); Liftoff ~0.03 us/B.
  Hence one page per module (`set_jit_config(1, n)` sets more).
- Dead ends: no two modules have the same bytes (a cache by content is
  useless); a back-off for pages that are compiled again (threshold <<
  n) cut nothing, the pages really have new hot code; a module for only
  the new entry points of a page would save ~16 % of the bytes (profiler
  counters RECOMPILE_*; with cold blocks left out, recompiles are ~27 %
  of the bytes of spring, so ~10 % at most), not done: a page would need
  two modules and the state table one module per entry.
- Cold blocks: 55 % of the bytes of a module never ran in its life. The
  interpreter now marks where it went on after each conditional jump
  (one bit per byte of the page, `mark_conditional_jump`), and the
  analysis follows only marked edges; an unmarked edge leaves the module
  like a jump to another page. Cold bytes 55 % -> 15-20 %. Also leaving
  out the instruction after a call or block boundary unless it ran saved
  nothing. A lower JIT threshold (400k) with cold blocks: main thread of
  goapp/cpu -5..12 %, but spring slower and process CPU higher; 750k
  stays.
- Where the bytes of a module go: about 40 % are the inline TLB checks
  of memory accesses (~48 bytes each, ~one per 120 bytes of module).
- Measure process CPU, not only the main thread: `tools/pod-bench`
  reports the main thread; read `/proc/self/stat` for all threads.

## Memory accesses in JIT code (measured 2026-11-13)

- spring does ~4.2G memory accesses through the inline TLB check, and
  only ~1M miss the fast path (TLB miss, page crossed, dirty bit, page
  with code, MMIO). perf with jitdump (`node --perf-prof`, `perf inject
  --jit`) shows each instruction of the JIT code.
- The fast path test is one compare: `(entry & mask) | page_cross ==
  TLB_VALID`, where page_cross is bit 12 of `addr ^ (addr + size - 1)`.
  Two compares joined by `i32.and` made V8 emit setcc/movzx/test chains.
- A missed fast path leaves the module (bail, `codegen::JIT_BAIL`): the
  site sets the low bits of eip, a shared block per module sets
  `cpu::jit_bailed`, and the interpreter runs the rest of the block
  (without hotness or a new entry point). Before, the module called
  `safe_*_slow_jit`. A call anywhere makes V8 keep every live local in a
  stack slot too (all registers are caller-saved): stores of the guest
  registers at every write were 12.6 % of the JIT samples, now 5 %. ~0.7M
  bails in spring. `set_jit_config(8, 0)` gives the calls back.
- Indirect jumps (ret, call through a register) look up `tlb_code`
  inline instead of calling `jit_find_cache_entry_in_page` (`Code` is
  `repr(C)`; key at 0x2000).
- The TLB check is ~13 host instructions per access and ~30 % of the
  JIT samples, but it is not on the critical path: the CPU runs it beside
  the work. Tried (branch `wip/jit3`, 2026-11-13): one check for several
  accesses with the same address registers in a basic block (the first
  access keeps its address in wasm memory in a local; a later one with
  another displacement only checks that it stays in that page, the
  builder counts writes to the register locals, calls and blocks end a
  group, push/pop move the group of ESP). It skipped the check for 33 %
  of the accesses of cpu and glibc and 25 % of goapp; callgrind of cpu:
  -2.2 % host instructions, JIT bytes -6 %; CPU time: cpu 5050 -> 5000,
  glibc 4958 -> 4890 ms (noise). An access outside the page of its group
  must bail (a full check at every site makes the modules 6 % larger than
  without groups): 0.4M bails in cpu; with a page compiled again without
  groups after 32 misses, spring still compiled 464 pages again (JVM
  objects across page boundaries), grouped only 7 % and its process CPU
  went up 79.6 -> 84.3 s with the same main thread. Parked.

## Kernel JIT modules for every pod (measured 2026-11-14)

- Every pod restores the same VM state: the kernel has the same code at
  the same physical pages in every pod, only the image is new. But each
  pod is a new instance with an empty JIT, and kernel code spreads over
  ~400 pages, so few kernel pages reach the threshold in a start: nginx ran
  its kernel instructions (55 %, 69 % of the time) almost all in the
  interpreter.
- `jit_record_start`, `jit_export(limit)`, `V86.jit_prepare` and
  `jit_import` (`src/cpu.js`, `jit_export_*`/`jit_import_*` in `jit.rs`):
  one start with a low threshold records the modules of cpl 0 code; the
  embedder ships them (tabernetes builds them with its kernel), compiles
  them once (the Modules can be posted to workers) and installs them in
  each new instance after `restore_state`. A module has no virtual
  addresses in it (eip is set relative to its page), but it has its table
  index and the addresses of statics of v86.wasm: the import takes the
  same table index, `jit_layout_id` rejects another layout of v86.wasm
  (compare it unsigned: `>>> 0`), and two 32-bit hashes of each page must
  match. A page that the guest writes later drops its module as usual.
  CHECK_JIT_STATE_INVARIANTS passed with imports (debug build).
- V8 compiles a function at its first call (lazy compilation, Node.js and
  Chromium): `jit_prepare` calls each function once in an instance with a
  scratch memory whose imports throw, so the first pod does not compile
  them (~100 ms in Chromium for 200 modules).
- Recording: the generic busybox start `warm` of pod-bench (httpd + wget
  over loopback, ls, gzip, find), threshold 20k: ~200 modules, 3.3-4.2 MB
  (0.5-0.6 MB gzip); 5k and 100k were the same within the noise.
  Installing them takes 2-5 ms per pod. `jit_export(limit)` keeps the most
  entered modules (`MODULE_USE`): 50 are 1.15 MB (0.17 MB gzip).
- Node.js, recorded with `warm`, measured with other workloads (3 x 4
  alternating rounds in one process, main thread / process CPU, all
  modules): nginx 553 / 860 -> 369 / 760 ms (wall 561 -> 387 ms), goapp to
  its first answer 509 -> 411 ms (cpu 987 -> 860 ms), glibc 4027 / 5800 ->
  3272 / 4410 ms; spring (kernel 4 %) 48.8 / 62.8 -> 49.6 / 62.7 s (noise).
- The cost is the first pod of a process (a tab): V8 optimises the hot
  modules with TurboFan then (~1.5 us per byte on other threads). nginx in
  a fresh Node.js process, first / later pod, wall time against no modules
  (4 alternating runs, busy 4-core machine): 25 modules +5 % / -4 %, 50
  +19 % / -18 %, 100 +47 % / -19 %, all +40 % / -30 %; process CPU of the
  first pod +0.2 / +0.4 / +0.8 / +1.4 s, later pods with 50: -9 %. Headless
  Chromium, 5 pods per tab, each in a new worker: first pod 625 -> 825 ms
  (50 modules) and 745 ms (all), later pods 596 -> 508 ms (50) and 390 ms
  (all); CPU of all Chromium processes for the 5 pods 8.2 -> 8.1 s (50)
  and 8.9 s (all). Calling the functions a few hundred times in the
  scratch instance did not get them optimised earlier.
- Dropped without measuring, because they only help a second start of
  the same app: a JIT profile of the app (pages and entry points, keyed by
  a hash of the page) and a VM state saved after the app answered. The
  kernel modules are the part of that idea that every pod shares.

## Applications after their start (measured 2026-11-14)

`STEADY=1` of `tools/pod-bench` measures requests after a warm-up. Node.js, one new
connection per request over the network adapter of v86, release build of 60e7e76:

| workload | per request | guest instructions | kernel | after |
|----------|-------------|--------------------|--------|-------|
| nginx `/` | 4.0 ms (2.4-2.9 ms after 1000+) | 0.19M | 88 % | 20 requests |
| goapp `/metrics` | 10-11 ms (9.5 ms after 1000+) | 2.8M | 17 % | 200 |
| spring `/` | 18 ms, then 5.3-6 ms | 2.6M, then 0.54M | 18 % | 100, then ~2000 (the JVM compiles its own code) |
| loop (shell, awk, gzip) | 800 ms per tick | 412M | - | 3 ticks |

- The 70-85 ms per scrape of goapp are its warm-up: the first 10 scrapes take ~28 ms of
  CPU each, ~14 ms after 100, ~10 ms after 300.
- ns per guest instruction in the steady state (GSTAT): loop ~2, goapp user 2.8 and kernel
  7-8, nginx kernel 12-15, spring user 9-10 and kernel 17. The slow code is code that leaves
  its JIT module often: 10 (spring), 23 (kernel) and 30 (Go) instructions per entry.
- Main thread (perf with jitdump, only the measured requests): JIT code 40-53 %, the
  interpreter 12-31 %, main_loop 11-16 %, jump tables of the modules 4-6 %; the network
  adapter, 9p and the UART in JS are only 2-4 %.
- Module entries cost more than the ~17 ns measured before, and the cost depends on how
  many modules are in use: V8 gives every wasm module its own code space. A micro
  benchmark (one call_indirect site, functions in a random cycle, 3.5 KB of wasm each):
  64 modules 7 ns per call, 256 modules 24-26 ns, 1024 modules 156 ns; the same functions
  in modules of 16 functions: 6, 6-8 and 18 ns (Node.js 22 and Chromium 153 alike). The
  entries of goapp go to ~220 modules (90 % to 110), of spring to ~820 (90 % to 214). So
  several pages (one function each) in one wasm module should cut the cost per entry.
- nginx: sendfile is 46k kernel instructions per request, close 24k, write 20k (the
  access log goes byte by byte to the UART: 84 port writes and 4 interrupts per request).
- goapp: 15 reads (/proc) of 15k and 3 socket writes of 49k kernel instructions per scrape.
- Dead ends:
  - Modules that enter the next module themselves (return_call_indirect through the
    table, with the checks of cycle_internal in the epilogue, 87 % of the entries
    chained): goapp +8 % CPU in Node.js 22 (its indirect tail calls are 2-4x slower than
    call + return), no change in Chromium 153.
  - Compiling the rest of the interpreted code sooner: with JIT_THRESHOLD 30k, spring
    after 3000 requests interprets 6 % instead of 24 % of its user instructions, but the
    time per request does not change (6.0 against 5.6-6.4 ms): that code leaves the
    module every ~10 instructions, interpreted or not. goapp after 2000 scrapes interprets
    1.3 % and is only ~5 % faster than after 200 (8 %). A rule that compiles pages that
    ran in two epochs of 1 s and collected 50k instructions: goapp after 200 scrapes -6 %
    CPU, but spring start +4 % main thread and +24 % process CPU. Not kept.
  - Pages per module (`set_jit_config(1, n)`) 3 or 8: goapp and nginx in the steady state
    within the noise.

## Instruction set extensions: what pays (measured 2026-11-13)

- Who uses them in an i386 pod: OpenSSL (SHA-1/256 with SHA: 5-6x fewer
  instructions; AES with AES-NI; vpaes, ChaCha20 and SHA-1/256 with SSSE3)
  and the string functions of glibc with SSSE3 (strcmp, strcpy: 2-8x fewer
  instructions in a micro benchmark; memcpy-ssse3 instead of `rep movs`
  costs 1-3 % more instructions in text tools). Go on 386 and musl use none
  of them, and the kernel of the pods has no crypto.
- FSRM in CPUID: no effect. The i386 kernel and the i386 glibc have no
  FSRM path (only x86_64 has).
- bswap and bsf/bsr are 0.07 % of the instructions of Spring Boot: MOVBE,
  BMI1/2, LZCNT and TZCNT cannot pay.
- An instruction that the JIT runs through a helper call can cost more than
  the scalar code it replaces: SSSE3 only paid after pshufb and palignr
  became Wasm SIMD.

## Changes of this fork (newest last)

- MessageChannel yield inside a worker (no helper worker round trip per ms).
- FxHash for the maps of the JIT (`src/rust/hash.rs`); `set_jit_config(4, n)`
  sets the JIT threshold.
- `restore_state` does not zero fresh memory (`cpu.memory_fresh`).
- WebAssembly SIMD for hot SSE2 integer instructions in JIT code
  (`set_jit_config(5, 0)` turns it off).
- Reuse of lazy flags in the JIT (conditions after mov/lea/inc/add/...,
  GS base cached per basic block).
- `tools/pod-bench` and this file.
- Interpreter (2026-11-13): helpers return an i64 instead of a `Result`
  through the shadow stack; the loop over the instructions of a block is
  inside the generated `interpreter::run`; the modrm byte, immediate values
  and a modrm fast path are inlined (+34 KB of wasm for the immediates,
  -4 % CPU, kept on purpose); `safe_read*`/`safe_write*` have a TLB fast
  path. The hotness of pages is a flat array with a cache of known entry
  points (`PAGE_HOTNESS`, `KNOWN_ENTRY_POINTS` in `jit.rs`) instead of a
  lock and two maps per interpreted block. CPU time of the main thread,
  paired runs: nginx -22 % (JIT off -31 %), goapp -24 %, cpu -3 % (noise).
  v86.wasm 2012667 -> 2057741 bytes.
- 9p (2026-11-13): replies to Tlopen, Tread, Treaddir and Tclunk go out
  in the same call when the data is at hand (no promise, the guest does
  not go idle and wake up); Rread data is written straight into the guest
  buffers (`get_write_views`), not through `replybuffer`; a storage may
  offer `readInto(key, offset, dest, size)` for a synchronous read into
  guest memory (-1: use `read`). A directory is listed once per open, not
  for every request. 9p, virtio and port I/O in JS are only 2-6 % of the
  main thread (profiles of nginx, goapp, glibc), so a port to Rust is not
  worth it. nginx -7 % CPU (-9 % with `readInto`), glibc -5.5 % guest
  instructions.
- SSSE3, the SHA extensions, AES-NI and PCLMULQDQ
  (`src/rust/cpu/instructions_0f38.rs`), reported in CPUID. The opcode maps
  0F 38 and 0F 3A are not in `gen/x86_table.js`: the third byte is
  dispatched by hand through `find_0f38`/`find_0f3a` (interpreter, JIT and
  analysis use the same table), so their tests are written by hand in
  `tests/nasm`. `set_cpuid_hidden(0, 0x2000202)` and
  `set_cpuid_hidden(1, 0x20000000)` (wasm exports) give the old CPUID.
- pextrb/w/d and pinsrb/d of SSE4.1, without the CPUID bit: OpenSSL uses
  them in its AES-NI and SHA code without a check (every real CPU with AES
  or SHA has SSE4.1). Report SSE4.1 only when all of it exists.
- More Wasm SIMD in the JIT (pshufb, palignr, padd, psub, pcmpgt, shifts by
  immediate), and MMX quadword instructions as i64 code (32-bit OpenSSL
  does SHA-512 and RSA in mm registers).

- JIT modules of one page (was up to 3), a table of 3000 modules (was
  900), and a full table drops the least entered half of the modules
  instead of all. Process CPU (all threads): spring -39 %, goapp -30 %,
  cpu and nginx -25 %; main thread the same or faster; peak RSS of spring
  1108 -> 770 MiB. Profiler counters for compiled, recompiled and cold
  code (`profiler_flush()` before reading them).
- Interpreter loop (2026-11-13): the loop keeps the operand size bit of the
  opcode (it changes only at the end of a block) and makes one comparison
  per instruction for "the block has ended" and "the next instruction is in
  another page" (`interpreter_page` in `cpu.rs`). Whatever changes the
  translation of the code page ends the block (`invalidate_eip_translation`,
  a fetch across the end of the page), so the loop does not check
  `last_virt_eip` either. Host instructions per guest instruction (callgrind,
  nginx, JIT off): 134.4 -> 118.0. CPU of the main thread with the JIT off:
  nginx -8 %, goapp -7.5 % (paired runs). v86.wasm 2069938 -> 2063864 bytes.
- JIT threshold 200k -> 750k instructions per page (`JIT_THRESHOLD`,
  `set_jit_config(4, n)`). Measured with 500k, 750k and 1M: the CPU of the
  main thread is flat or better up to 1M, the CPU of the process falls
  (fewer modules for V8 to compile: nginx 45-52 -> 11, goapp 155 -> 49).
  Together with the interpreter loop, main thread / process / wall time per
  start (medians of 3 x 4-6 rounds on a busy machine): nginx 770 / 2830 /
  1050 ms -> 710 / 1090 / 820 ms, goapp 2060 / 8840 / 2950 ms -> 1950 / 3070
  / 2070 ms; cpu 5860 / 10420 ms -> 5980 / 9230 ms, glibc 5870 / 15200 ms ->
  5730 / 11850 ms. spring (one round each): 87.4 / 161.5 s -> 84.6 /
  137.2 s. In headless Chromium nginx answers after 0.79 s instead of
  1.39 s. If modules get cheaper to compile, measure the threshold again.
- Cold blocks (2026-11-13): JIT modules contain only the blocks that the
  interpreter reached through a conditional jump before the page got hot
  (marks per page in `jit.rs`, a pool of 4096 slots of 512 bytes; a page
  without a slot is compiled whole; `set_jit_config(7, 0)` turns it off;
  forced compiles of the tests compile all blocks). Wasm bytes compiled:
  spring 135 -> 87 MB, cpu 9.4 -> 5.5, goapp 15.0 -> 10.4, nginx 4.2 ->
  3.3 MB (profiler build, threshold 200k); recompiles of spring 505 ->
  558. Against 61a717b (threshold 750k), process / main CPU, medians of
  3-4 x 2-3 rounds (spring 3 x 1) in Node.js: spring 133.9 / 82.1 -> 109.8 /
  77.1 s (wall 83.9 -> 78.8 s), goapp 3.85 / 1.91 -> 3.31 / 1.96 s, cpu
  9.23 / 5.85 -> 8.11 / 5.88 s, glibc 11.88 / 5.70 -> 9.17 / 5.55 s,
  nginx 1.16 / 0.71 s (no change: few modules at 750k). Headless
  Chromium, CPU of all browser processes: cpu 29.4 -> 24.4 s (wall per
  round 6.02 -> 5.83 s), nginx 7.18 -> 6.46 s (wall 694 -> 688 ms).
- Memory accesses in JIT code (2026-11-13, see the section above): one
  compare for the TLB fast path, a bail to the interpreter instead of
  calls to `safe_*_slow_jit`, inline lookup of indirect jumps.
  Against 50b5d0a, main thread / process CPU, medians of alternating runs
  in Node.js (spring 3 x 1 round, others 4-5 x 2 rounds): spring 75.5 /
  106.7 -> 59.3 / 76.0 s (wall 80.5 -> 64.2 s), cpu 5.58 / 7.63 -> 4.76 /
  6.00 s, glibc 5.34 / 8.35 -> 4.76 / 6.72 s, goapp 1.98 / 3.39 -> 1.93 /
  2.75 s, nginx 0.70 / 1.05 -> 0.67 / 0.98 s. Wasm bytes of the JIT
  modules: spring 24.1 -> 22.6 MB, cpu 4.8 -> 4.5, glibc 7.4 -> 7.0 MB.
  Step by step on spring (main / process): one compare 79.1 / 110.3 ->
  74.6 / 106.5 s; inline lookup of indirect jumps 74.7 -> 73.3 s main;
  bails 73.3 / 105.6 -> 64.7 / 84.7 s; one bail block per module instead
  of the code at every site (28.0 -> 22.6 MB) 62.4 / 80.3 -> 61.3 / 78.2 s.
  v86.wasm 2072984 -> 2075009 bytes.

- Idle (2026-11-13): `main_loop` returns whole milliseconds when an idle
  guest waits in hlt for a timer (`hlt_wait` in `cpu.rs`). It returned the
  exact time, and for less than 1 ms the caller does not sleep: with the
  100 Hz tick of Linux, the last millisecond before every tick was a busy
  loop (115 calls of `main_loop` per tick in a Chromium worker, 440 in
  Node.js). An idle pod: 89 -> 20 ms of CPU per second in a Chromium worker
  (4 pods: 356 -> 75), 87 -> 24 in Node.js. The timer interrupt of an idle
  guest comes up to 1 ms late; interrupts of devices end the sleep as
  before. The guest is idle when it ran less than 6000 instructions since
  its last wait (a tick takes 2400-3100). After more work the wait is exact
  as before: with whole milliseconds for every wait, goapp took 3-6 % more
  wall time (the Go runtime waits for the tick between pieces of work).
  With the rule, nginx, goapp and glibc did not change beyond the noise.
- `src/rust/gueststat.rs`: counters about the guest (user and kernel
  instructions and host time, JIT share, system calls by number,
  interrupts by vector, port I/O by port, page faults, TLB flushes, a
  histogram of kernel addresses) in the profiler build, or in a release
  build with `V86_GUESTSTAT=1 make build/v86.wasm`.
- Kernel JIT modules for every pod (2026-11-14, see the section above):
  `jit_record_start`, `jit_export`, `V86.jit_prepare`, `jit_import`.
  tabernetes ships the 50 most entered ones with its kernel. nginx in
  Node.js: the first pod of a process +19 % wall time, every later pod
  -18 % (main thread -17 %).

Work in progress lives on `wip/*` and `codex/*` branches.
