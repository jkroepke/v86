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
- ab e1/e12/e3 spring, 4 rounds each (main / process ms): e1 74740/106295, e12 73335/105645,
  e3 64730/84665 (base was 79110/110330)
- perf e3: JIT samples -23 %, spills 12.6 % -> 5 % of JIT; TLB check still ~30 % of JIT
  (13 instr per access), main_loop 14 % (misses: state_table 22 %, Code header 9 %, MODULE_USE 6 %)
- e4: bails do not add hotness/entry points (RUN_INTERPRETED_DIFFERENT_STATE miscount fixed,
  JIT_BAIL counter): 739K bails in spring, 158 recompiles (base 139)
- e5: + page-cross bit via lea/xor; jit_find_cache_entry_in_page removed; expect tests updated
  (task_switch_test_sse fails in wabt 1.0.6: SIMD opcodes, also on master)
- final A/B base vs e5 (fin-*.txt): spring main 75260 -> 62820, process 105560 -> 82790,
  wall 77757 -> 63743, peak 729 -> 731 MiB; JIT bytes 24.1 -> 28.0 MB (bail code is longer)
  nginx 695 -> 685 / 1105 -> 1030; goapp 1970 -> 1925 / 3270 -> 2790;
  cpu 5500 -> 4865 / 7565 -> 6125; glibc 5310 -> 4875 / 8385 -> 6970
- tests on e5 code: nasmtests 15613/15613, force-jit 15613/15613 (fixtures copied from
  v86-cold: same .asm), rust-test ok
- e6: one shared bail block per module (site: set local + br) to cut the bytes
- e6 vs e5 spring: 62.4/80.3 -> 61.3/78.2 s, JIT bytes 28.0 -> 22.6 MB
- base vs e6: spring 75.5/106.7 -> 59.3/76.0 s; cpu 5.58/7.63 -> 4.76/6.00; glibc 5.34/8.35 ->
  4.76/6.72; goapp 1.98/3.39 -> 1.93/2.75; nginx 0.70/1.05 -> 0.67/0.98
- DONE: master 2d86538 (+ 19aedc1 doc fix), dist d07236b (0.5.81-fork.2d8653814d64)

## Next
- tests (all-debug, nasmtests, nasmtests-force-jit, rust-test, expect-tests update), merge, dist
- maybe: MODULE_USE counter into Code header line; jump cache for main_loop
