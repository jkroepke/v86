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

- spring cpu s, run d last pair (load ~10): m2 120.2, c4 122.2. All spring runs: m2 131.0 130.2
  136.5 149.0 120.2 (median 131.0); c4 148.9 159.3 152.1 122.2.
- cpu workload, 3x3 rounds alternated (load ~12), cpu ms medians: m2 7330, c4 chaining on 6565,
  c4 chaining off (6=0) 6540. => chaining itself gives nothing on cpu either.

## Decision (2026-11-13)
- Not merged to master: chaining (shared stub, direct exits, registers as arguments) shows a gain
  only in the micro bench (xm 3860 -> ~3300 ms cpu, callgrind -6 % host instructions), none on
  spring or cpu, and it adds +4.6 % TurboFan compile work on spring. Branch stays as wip/chain.

## Open ideas
- Spring is bound by TurboFan compiling JIT modules (56 % of all CPU of the process, background
  threads). Smaller generated code per module or fewer recompiles (invalidation of JVM code
  pages) should pay more than faster transitions.
- Fewer transitions instead of cheaper ones: speculate (7) includes more pages, but it costs
  compile time; it was slower on spring (134 s vs 116 s).
- If chaining is picked up again: measure on a quiet machine; the spring cpu time follows the
  machine load (120-160 s for the same build).

## Old numbers (previous agent, before rebase, noisy)
- spring base ~131-140 s wall / 101-104 s cpu; chain1 162 s / 107 s (one run). Profiler: CYCLE_INTERNAL 542M -> 100M, CHAIN 447M.
