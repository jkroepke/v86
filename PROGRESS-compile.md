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

- TIERING (2 reps each, main / process s): default 110.5/313.6, 111.3/306.4;
  --liftoff-only 114.5/118.0, 112.5/116.0; --no-liftoff 285.6/289.7,
  274.6/278.5; --no-wasm-dynamic-tiering 109.9/297.7, 97.8/283.9;
  budget 10x 104.3/278.5, 98.7/277.9; budget 100x 104.7/264.0, 98.3/259.0.
  => TF of JIT modules costs ~190 s background CPU and buys 0-3 % main thread.
- JITCFG (2 reps): default 96.3/269.7, 111.0/308.3; 1=1 99.7/210.4,
  96.6/207.5; 1=2 97.7/228.2, 98.0/228.0; 4=600000 99.8/246.3, 94.8/239.7.
- spring profiler stats p3 (3 pages): 1248 modules 222 MB; cold block bytes
  54.6 %; recompiles with a live old module 84 MB of which 48.6 MB delta.
- p3 with 1=1: 2322 modules 172.6 MB; interpreted steps 916M vs 1028M;
  module entries 515M vs 399M; table full once (900 slots) -> clear all ->
  1232 compiles after invalidation (83 MB). => try a bigger table / eviction.
- running: compile/ab-spring1.out (base vs 1=1 vs 1=1 + table 3000),
  compile/small-*.out (nginx/cpu/goapp default vs 1=1)

- small workloads, Node, 10 rounds, default vs 1=1 (main / process s,
  median): nginx 0.84/4.44 -> 0.82/3.20; cpu 6.04/15.18 -> 5.98/11.09
  (peak RSS 369 -> 296 MiB); goapp 3.39/17.01 -> 2.75/11.33 (577 -> 413 MiB).
- Chrome 153 (bench/pw-c.cjs, port 8096 server compile/server-c.cjs, whole
  browser CPU incl. boot): cpu 43.1/44.6 -> 34.2/34.4 s, wall median
  13.9/14.1 -> 11.1/9.3 s; nginx 19.1/19.7 -> 15.6/14.7 s, wall 2.0/2.3 ->
  1.44/1.38 s.
- offline TF (cpu workload modules): 3 pages 6.09 MB 9.8-10.3 s; 1 page
  4.43 MB 5.8-6.4 s. codex (1 page) 4.22 MB 5.4-6.2 s (~-5..8 %).
- MAX_PAGES default 1; eviction of the least entered half instead of clearing
  everything when the table is full (build compile/ev); back-off removed.
- rebased on origin/master f9c8dbc; worktree /home/claude/v86-compile-cx =
  compile + codex commits (clean cherry-pick), build compile/newcx;
  origin/master build compile/mst.
- tests on compile (rebased): rust-test ok; nasmtests running;
  expect-tests need wabt (codex Makefile fetches it from npm).

- FINAL A/B (compile/final-*.out; mst = origin/master, new = this branch,
  newcx = + codex): spring main/process 90.1/263.4 -> 86.5/159.5 (newcx
  83.2/155.7); goapp 2.51/12.50 -> 2.12/8.79 (8.91); cpu 5.62/13.90 ->
  5.51/10.44 (10.38); nginx 0.75/3.75 -> 0.74/2.83 (2.83). Codex adds
  nothing measurable on top -> not merged.
- final commits on branch compile-final2 (worktree /home/claude/v86-compile-final2):
  counters, one page + 3000 table + eviction (+ expect constants), AGENTS.md.
  Expect tests: master's snapshots fail with the only wabt we can fetch
  (1.0.39) for unrelated formatting; constants verified with codex run.js.

## Next
- tiering flags on spring (compile/tier.sh -> compile/tier.out)
- spring STATS run (compile/stats-spring.txt)
