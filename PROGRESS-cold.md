# Progress: compile only blocks that ran (branch cold, wip/cold)

Bench: /home/claude/bench/bench-c.mjs (V86=<abs dir>), builds in /home/claude/bench/cold/<name>.
base = origin/master cbac223.

## Done
- c1: interpreter marks the address after each conditional jump (jmpcc16/32) in a per-page
  bitmap (pool of 4096 slots x 512 B, MARK_SLOT_OF_PAGE); analysis follows a jcc edge only
  if its target is marked or an entry point; cold edges exit to the interpreter.
  set_jit_config(7, 0) = off. First look (1 run): nginx process 3.2 -> 2.3 s, cpu 11.3 -> 9.0 s,
  main the same or less.

## Next
- profiler stats (cold edges, evictions, bytes), goapp, spring, A/B
