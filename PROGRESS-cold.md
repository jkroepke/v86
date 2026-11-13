# Progress: compile only blocks that ran (branch cold, wip/cold)

Bench: /home/claude/bench/bench-c.mjs (V86=<abs dir>), builds in /home/claude/bench/cold/<name>.
base = origin/master cbac223.

## Done
- c1: interpreter marks the address after each conditional jump (jmpcc16/32) in a per-page
  bitmap (pool of 4096 slots x 512 B, MARK_SLOT_OF_PAGE); analysis follows a jcc edge only
  if its target is marked or an entry point; cold edges exit to the interpreter.
  set_jit_config(7, 0) = off. First look (1 run): nginx process 3.2 -> 2.3 s, cpu 11.3 -> 9.0 s,
  main the same or less.

- profiler stats (cold/stats1.txt, stats-spring.txt), 7=0 -> 7=1: wasm bytes nginx 4.20 -> 3.26 MB,
  cpu 9.37 -> 5.50, goapp 15.0 -> 10.4, spring 135 -> 87 MB; cold block bytes 55 % -> 15-20 %;
  compiles spring 1663 -> 1692, recompiles 505 -> 558; no mark slot evictions; interpreted
  steps not higher (less). Filtering also return addresses / boundaries (level 2): no gain, dropped.
- A/B release spring (cold/ab-spring.out): rep1-2 process 165/161 -> 128/126 s, main 90.8/89.9 ->
  83.8/81.7, peak RSS 756/786 -> 641/672 MiB.

## Next
- profiler stats (cold edges, evictions, bytes), goapp, spring, A/B
