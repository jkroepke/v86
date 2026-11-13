# Progress: JIT module chaining (branch chain, worktree /home/claude/v86-chain)

## Done
- Squashed the old WIP (tail call chaining + speculated targets) into one commit, backup tag `chain-wip-backup`.
- Rebased onto claude/project-thread-6qrl9l (SIMD + flag reuse). jit config indices: 5=SIMD, 6=chaining, 7=speculate, 8=EXIT_SAMPLE_THRESHOLD, 9=MAX_GUEST_PAGES. cpu.js enables 6 when tail calls validate.
- Build of the rebased state: /home/claude/bench/v86-c2 (chain+spec on by default).

## Current step
- Quick cpu workload: v86-m2 vs v86-c2 vs c2 JITCFG=7=0 (chain only) vs 6=0,7=0.

## Next
- nginx, spring (1 round per variant, 2-3x), nasm tests with chaining on, then decide what to keep.

## Old numbers (previous agent, before rebase, noisy)
- spring base ~131-140 s wall / 101-104 s cpu; chain1 162 s / 107 s (one run). Profiler: CYCLE_INTERNAL 542M -> 100M, CHAIN 447M.
