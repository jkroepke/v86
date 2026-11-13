# Progress: JIT module chaining (branch chain, worktree /home/claude/v86-chain)

## Done
- Squashed the old WIP (tail call chaining + speculated targets) into one commit, backup tag `chain-wip-backup`.
- Rebased onto claude/project-thread-6qrl9l (SIMD + flag reuse). jit config indices: 5=SIMD, 6=chaining, 7=speculate, 8=EXIT_SAMPLE_THRESHOLD, 9=MAX_GUEST_PAGES. cpu.js enables 6 when tail calls validate.
- Build of the rebased state: /home/claude/bench/v86-c2 (chain+spec on by default).

## Findings so far
- cpu workload (3 rounds, cpu ms): m2 6640, c2 6570, c2 7=0 6380, c2 6=0,7=0 6370 (noise; machine load ~10).
- spring 1 round (cpu ms): m2 116350, c2 7=0 118770 -> chain via shared stub: no gain.
- Micro bench chain2/xm (24 funcs on own pages, 192M transitions; workload `xm` in chain2/core.mjs, tar /home/claude/bench/chainxm.tar; `xs` = same code on one page):
  xs 1290 ms; xm base 3860, shared chain 4050, direct chain (v86-c3, config 10) 3470. => ~13 ns per transition.
- perf (jitdump) of shared chain stub: dependent load chain eip -> tlb_code -> Code -> state_table -> V8 dispatch table dominates.
- Added gen_exit_and_chain_direct: per exit site, constant tlb_code address, own indirect jump. Build v86-c3. Only when JIT_SPECULATE (7) is off.

- Registers as arguments of the module function (FN_MODULE, 9 i32 params; call_indirect_module in
  cpu.rs passes reg32). Build v86-c4. xm (7=0, 3x3 rounds alternated, cpu ms): c3 3580/3840/3820,
  c4 3290/3100/3710; xs c3 1370, c4 1170. nginx/cpu/goapp run fine.

- Profiler spring c4 7=0: RUN_FROM_CACHE 47M, CHAIN 310M, CHAIN_DIRECT 226M (miss 5M), CHAIN_NO_ENTRY 28M,
  INDIRECT_JUMP_NO_ENTRY 338M, CYCLE_INTERNAL 109M (was 542M without chaining). So nearly all
  transitions are chained, yet spring cpu does not drop.
- spring cpu s (load ~20, one round each, alternated): m2 131.0 130.2 136.5 149.0; c3 132.2 168.8;
  c4 148.9 159.3. c4 looks worse on spring (?), better on xm. cpu workload (6 rounds alternated):
  medians m2 ~7850, c3 ~7315, c4 ~7345 ms.
- callgrind of nginx does not finish under this load (no http in 1500 s); icg.sh round parsing broken.

- spring perf (all threads, -F 1000, m2 vs c4 7=0 run at the same time): main thread 158.1k vs
  160.5k samples; V8 compile threads 240.6k vs 251.8k (+4.6 %, the code of the direct chain exits).
  Over all threads: TurboFan compile 56.5 % / 57.5 %, JIT modules 23.0 % / 25.5 %, v86 Rust
  (main loop etc.) 10.4 % / 6.9 %. => Chaining removes the main loop work, but the lookup and the
  tail call in the modules cost the same. Spring main thread: no gain. More than half of all CPU of
  spring is TurboFan compiling JIT modules (background threads).
- spring cpu s, run d (alternated): m2 136.5 149.0 120.2; c4 159.3 152.1.

## Current step
- spring A/B running (chain2/run.sh tag b, results in chain2/results.txt): m2 vs c4 7=0 vs c3 7=0, 2x.
- c4 state: all-debug, rust-test, nasmtests 15600/15600, nasmtests-force-jit 15600/15600 pass.
- callgrind (icg.sh, xm, 7=0): generated code Ir c3 9460M -> c4 8301M (-12 %), all of node 25.0G -> 23.5G.
- spring under load ~20 (wall 430-510 s): m2 131.0/130.2 s cpu, c3 132.2; first c4 run hit the 600 s
  http timeout (raised to 1500 s in core.mjs, HTTP_TIMEOUT env). Profiler run of c4 spring: scratchpad
  stats-spring-c4.txt (bench/v86-c4-prof, statnames in scratchpad/statnames-c4.json).

## Next
- nginx, spring (1 round per variant, 2-3x), nasm tests with chaining on, then decide what to keep.

## Old numbers (previous agent, before rebase, noisy)
- spring base ~131-140 s wall / 101-104 s cpu; chain1 162 s / 107 s (one run). Profiler: CYCLE_INTERNAL 542M -> 100M, CHAIN 447M.
