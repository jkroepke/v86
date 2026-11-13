# jitmem progress

Goal: less main-thread time for spring (JIT memory access code / main_loop).
Base: origin/master 50b5d0a. Builds in /home/claude/bench/jm/{base,prof}.
statnames regenerated: /home/claude/bench/jm/statnames.json (145 counters).

## Done
- worktree /home/claude/v86-jitmem, base + profiler builds
- running: STATS spring (jm/out/stats-spring.txt), V8 profile (jm/out/spring.cpuprofile)

## Next
- analyse profiles, pick top item
