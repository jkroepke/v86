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
- Generated wasm: spring compiles ~218 MB of JIT modules (~175 KB each).

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

Work in progress lives on `wip/*` and `codex/*` branches.
