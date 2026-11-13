# JIT conditions and GS microbenchmark

The workload is a raw 32-bit guest program, not a Linux or JVM benchmark. It
runs 10 million iterations of INC, NEG, CMP, ADD, SHL, ADC, SETcc, CMOVcc,
MOV, GS loads and a DEC/JNZ loop. It executes 330,000,002 x86 instructions.

Build each revision separately, retaining the resulting Wasm files:

```sh
make build/v86.wasm
cp build/v86.wasm /tmp/release.wasm
make with-profiler
cp build/v86.wasm /tmp/profiler.wasm
nasm tests/benchmark/jit-flags.asm -o build/jit-flags.bin
node tests/benchmark/jit-flags.js /tmp/before-release.wasm /tmp/after-release.wasm
node tests/benchmark/jit-flags.js /tmp/before-profiler.wasm /tmp/after-profiler.wasm
```

For pair attribution on the baseline, apply only the condition-array
instrumentation in `profiler.rs` and `gen_condition_fn`. The existing aggregate
counters need no baseline changes. The harness warms up once, then alternates
builds and their order for five measured runs in one Node process.

Measured on 2026-11-13, Node v24.22.1, x86_64, Rust 1.100.0, baseline `b440861`:

| Measurement | Before | After |
| --- | ---: | ---: |
| Release median wall time | 441.5 ms | 233.1 ms |
| Release median process CPU time | 439.7 ms | 241.0 ms |
| Release generated Wasm bytes | 3,526 | 2,337 |
| Profiler median wall time | 894.9 ms | 693.9 ms |
| CONDITION_UNOPTIMISED | 390,000,000 | 30,000,000 |
| CONDITION_OPTIMISED | 90,000,000 | 210,000,000 |
| CONDITION_UNOPTIMISED_UNHANDLED_L | 20,000,000 | 0 |
| CONDITION_UNOPTIMISED_UNHANDLED_LE | 0 | 0 |
| Conditions attributed to OTHER | 100,000,000 | 0 |
| CONDITIONAL_JUMP | 10,000,000 | 10,000,000 |
| SEG_OFFSET_NOT_OPTIMISED_GS | 80,000,000 | 80,000,000 |

Release wall-time samples (ms): before 466.9, 441.5, 447.0, 432.5, 438.3;
after 230.3, 236.9, 233.1, 230.8, 247.0. These measurements describe this
microbenchmark; they do not establish a JVM speedup.

The guest instruction mix is unchanged: each iteration has 11 MOVs (8 GS
loads), 13 SETcc, 1 CMOVcc, 7 arithmetic/compare/shift instructions and 1 Jcc.
The aggregate condition counters also count nested flag evaluations; they
are not counts of unique x86 conditions. The remaining 30 million fallback
increments are INC's saved CF at the loop's basic-block entry and composite
BE tests after SHL/ADC. The latter already use known CF/ZF individually.

The pair counters identify 100 million conditions whose producer was lost
across MOV/SETcc/CMOVcc. Preserving the producer removes their flags_changed
checks, while saved operands avoid stale register aliases. INC and immediate
ADD gain direct signed comparisons; ADC/SBB and constant nonzero shifts
combine the saved result with stored OF. NEG16/32 is tracked as subtraction
from zero.

The GS counter deliberately keeps its meaning: GS remains a runtime segment
base. The loop now loads its base and null state once per basic block rather
than eight times. The null check remains on each access. Segment reloads end
a basic block, so subsequent blocks reload both values. The new expectation
tests show the generated loads and their lifetime.

Flag metadata is still reset at basic-block entries. Jcc-to-Jcc reuse across
blocks and general register-source ADD signed conditions remain fallback
cases; no cross-block dataflow or module transition changes are introduced.

Validation in the development environment:

- `make rust-test`: passed (2 Rust tests and Wasm output verification).
- `make expect-tests`: passed, including 3 new expectation tests; existing
  expected outputs are unchanged.
- `node tests/api/jit-gs.js`: passed GS reload and null-segment checks.
- 4,992 condition bytes from `lazy-condition-reuse.asm` matched native x86
  in both the interpreter and forced JIT. The native reference used the same
  8/16/32-bit operations in a 64-bit executable, since this environment
  cannot execute ELF32 binaries.
- Both requested NASM make targets were attempted. GDB fixture generation
  fails because ptrace is unavailable (`Operation not permitted`). The full
  suites therefore have not passed here; run them on an unrestricted x86
  host before merging.
