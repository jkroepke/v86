# jitmem progress

Goal: less main-thread time for spring (JIT memory access code / main_loop).
Base: origin/master 50b5d0a. Builds in /home/claude/bench/jm/{base,prof,e1,e12,e3}.
statnames regenerated: /home/claude/bench/jm/statnames.json (145 counters).
Scripts: jm/ab.sh (alternating runs), jm/med.py (medians), jm/perf.sh, jm/perfj.sh (perf + jitdump).

## Profile of master (spring, Node)
- V8 CPU profile: JIT code 49 %, interpreter 23 %, main_loop 14 %, v86 JS 4 %, jit compiler 4 %
- perf main thread: JIT (turbofan) 52 %, interpreter 22 %, main_loop 12 %; liftoff 0.2 %
- main_loop: ~45 % of its samples are cache-miss stalls on tlb_code, Code.state_flags,
  Code.state_table, MODULE_USE (one chain per module entry, 487M entries)
- JIT code: TLB check compiled as and/cmp/sete/movzx + and/cmp/setle/movzx + test/jne;
  spills (stores to stack) at definitions because slow-path calls clobber all registers
- counters: 4.2G fast memory accesses, ~1M slow; 293M indirect jumps, 274M leave the module

## Experiments
- e1: TLB fast check as one compare (OR page-cross bit 12 into masked flags):
  spring main 79.1 -> 74.6 s, process 110.3 -> 106.5 s (5 alternating pairs)
- e12: + inlined jit_find_cache_entry_in_page (Code is repr(C), key u32 at 0x2000)
- e3: + JIT_BAIL: missed fast path leaves the module, interpreter runs (jit_bailed flag)
  first try hung: bail at an entry block re-entered the module forever -> jit_bailed flag
- running: ab e1/e12/e3 spring (jm/out/ab-e123-spring.txt)

## Next
- measure all workloads, profiler counters for e3 (bails, recompiles)
- then main_loop misses
