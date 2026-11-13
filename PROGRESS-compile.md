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

- spring STATS (master + counters, compile/stats-spring.txt): 1212 modules,
  211 MB wasm; 821 recompiles = 139 MB (66 % of bytes); 517 compiles after
  an invalidation = 69 MB; 562 invalidations of pages with code; pages
  compiled 1x: 1002, 2x: 222, 3-4x: 156, 5-8x: 82, 9-16x: 33, 17+: 7.
  955 of 1212 modules span 3 pages (196 MB). Modules entered >= 10k times:
  860 (163 MB); entered < 100 times: 63 (9 MB).
- tiering (one run each, loaded machine): default main 110.5 s / process
  313.6 s; --liftoff-only main 114.5 s / process 118.0 s (!); --no-liftoff
  main 285.6 s / process 289.7 s (JIT modules arrive late).
- offline: compile/tfbench.mjs, tfeach.mjs (node --no-liftoff
  --no-wasm-lazy-compilation --single-threaded) on dumped modules (bench-c
  DUMP=<dir>): TF 1.6-1.9 us/byte, Liftoff 0.03 us/byte; superlinear
  (17 KB 0.74 us/B, 100 KB 1.5, 170 KB 2.5).
- RECOMPILE_BACKOFF (set_jit_config(6, n), default 0 = off): a page needs
  JIT_THRESHOLD << min(modules+invalidations, n) for its next module.

- NOTE: profiler builds generate ~2x the wasm (enter_basic_block calls etc.):
  release spring = ~1288 modules / 111.5 MB (incl. boot), profiler 211 MB.
- identical modules (sha1 of bytes, release spring): 0 of 1288 -> a cache by
  content is useless.
- backoff 6=2 (stats run): 1171 compiles / 215 MB (vs 1212 / 211 MB),
  interpreted steps +11 %: recompiles are pages with genuinely new hot code.
  Back-off does not pay.
- tiering rep 1: no-dynamic-tiering main 109.9 / process 297.7 s; budget 10x
  104.3 / 278.5 s -> almost all compiled bytes get TF anyway (hot).
- JITCFG rep 1 (main / process s): default 96.3 / 269.7; 1=1 97.7 / 228.2;
  1=2 99.8 / 246.4.
- nginx cold code (profiler): 55 % of block bytes never run in their module.
- counters RECOMPILE_BLOCK_BYTES / RECOMPILE_DELTA_BLOCK_BYTES: bytes a
  module for only the new entry points would need (stops at old entries).

## Next
- tiering flags on spring (compile/tier.sh -> compile/tier.out)
- spring STATS run (compile/stats-spring.txt)
