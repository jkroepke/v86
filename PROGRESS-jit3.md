# jit3 progress (round 2 on spring main thread)
Base: origin/master 19aedc1. Builds in /home/claude/bench/j3/{base,...}. Scripts: /home/claude/bench/jm.
## Log
- perf base spring (pj-base): main 61.9k samples; JIT 45 %, interpreter::run 15 %, main_loop 14 %;
  JIT: TLB check 30 %, phys 6 %, prologue+dispatch 11 %, spills 4.6 %
- jc (jump cache 4096 x 16 B, gen counter): hit 96 % spring, 99 % cpu; spring A/B 3 pairs:
  base 60.6/59.1 vs jc 61.6/60.9 s main -> no gain (maybe worse)
- mg (shared TLB check per address registers, bail on miss): global epoch: 10 % of accesses;
  per-register write tracking (mg2): cpu 33 %, goapp 25 % of accesses grouped; misses cpu 372k
- A/B base vs mg2 (3x2 rounds): cpu 4895/4885, glibc 4725/4840, goapp 1975/1960, nginx 720/680 -> nothing
- mg3: JITCFG 10=1 = full TLB check on group miss instead of bail: cpu ~4850 vs ~5000 (noise 5 %)
- callgrind cpu (host Ir of node): base 19843M, mg3 19414M (-2.2 %), mg3 10=1 19407M; generated code
  13481 -> 13218 -> 12867M. JIT bytes cpu: base 1.6 MB, mg (bail) 1.5, 10=1 1.7
- jc dropped (perf: stall moved to the jump cache line itself, main_loop share unchanged)
- rebased on 3535e2b (pod-bench cpu from schedstat now). mg4 = groups + miss feedback: group miss
  bails with jit_bailed=2, after 8 misses at an instruction its page is dirtied and that
  instruction checks the TLB itself. cpu misses 372k -> 120, 15 recompiles; 33 % of accesses grouped
- A/B harness: /home/claude/bench/j3/ab.sh (tools/pod-bench, data links in j3/data), j3/med.py
