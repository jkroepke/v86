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
time goes.

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
  14 %. About half of main_loop are cache misses per module entry:
  `Code.state_table`, the `Code` header and `MODULE_USE`.
- SSE/MMX is 0.2-0.3 % of the instructions of these workloads and the
  kernel runs none; newer SSE/AVX levels do not help them.
- Generated wasm: spring compiled ~111 MB of JIT modules in a release
  build with up to 3 pages per module (profiler builds make ~2x the bytes).

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
- Left: the TLB check is ~13 host instructions per access and ~30 % of
  the JIT samples; the chain address -> entry -> physical address is on
  the critical path of every load. Not tried: one check for several
  accesses with the same base register in a block.

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

Work in progress lives on `wip/*` and `codex/*` branches.
