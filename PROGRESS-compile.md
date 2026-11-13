# Progress: compile cost of JIT modules (branch compile, wip/compile)

Bench: /home/claude/bench/bench-c.mjs (bench.mjs + process CPU of all threads
per round, "PCPU" line; STATNAMES=<file>; uses core-c.mjs which calls
profiler_flush before reading stats). Builds in /home/claude/bench/compile/<name>.
Statnames for this branch: /home/claude/bench/compile/statnames.json.

## Done
- profiler counters: COMPILE_RECOMPILE(_BYTES), COMPILE_AFTER_INVALIDATE(_BYTES),
  PAGE_COMPILED_* histogram, MODULE_ENTERED_* / MODULE_BYTES_ENTERED_* histograms,
  MODULE_PAGES_* (profiler builds only; arrays size 1 otherwise)
- nginx --trace-wasm-compilation-times: TurboFan on JIT modules costs ~10 us
  per wasm byte, superlinear (17 KB: 6.7 us/B, 180 KB: 15 us/B, one 180 KB
  function = 2.7 s TF). Liftoff: ~0.05 us/B. nginx process CPU 5.3 s vs main
  1.0 s: background is mostly TF of JIT modules (25.7 s TF thread time in the
  whole process incl. boot vs 1.3 s TF for v86.wasm).

## Next
- tiering flags on spring (compile/tier.sh -> compile/tier.out)
- spring STATS run (compile/stats-spring.txt)
