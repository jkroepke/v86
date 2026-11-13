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

- nginx start: 53M guest instructions, 75 % interpreted. The JIT threshold
  (200k instructions per page) is rarely reached; lower thresholds were
  slower (compile cost).
- spring: ~9G instructions; 486M entries into JIT modules with only ~16
  instructions each, 473M exits to another page. Profile: 55 % JIT code,
  15 % main_loop (dispatch into modules), 15 % interpreter.
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
  n) cut nothing, the pages really have new hot code; 55 % of the bytes
  of a module never run in its life, but the interpreter runs through
  jumps, so it cannot tell which blocks ran; a module for only the new
  entry points of a page would save ~16 % of the bytes (profiler
  counters RECOMPILE_*), not done.
- Measure process CPU, not only the main thread: `tools/pod-bench`
  reports the main thread; read `/proc/self/stat` for all threads.

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

Work in progress lives on `wip/*` and `codex/*` branches.
