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

## Current step
- Next: pass registers as params of the module function in chained calls (skip 8 stores + 8 loads).

## Next
- nginx, spring (1 round per variant, 2-3x), nasm tests with chaining on, then decide what to keep.

## Old numbers (previous agent, before rebase, noisy)
- spring base ~131-140 s wall / 101-104 s cpu; chain1 162 s / 107 s (one run). Profiler: CYCLE_INTERNAL 542M -> 100M, CHAIN 447M.
