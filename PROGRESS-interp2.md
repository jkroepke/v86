# interp2 progress (branch wip/interp2)

Baseline = origin/master cbac223 (build copy: /home/claude/bench/v86/i2base).

## Done
- Profiles of nginx/goapp (V8 + perf): interpreter::run 45 % / 40 %, JIT code 9 % / 18 %,
  modrm_resolve_packed 7 % / 8 %, main_loop 7 %, safe_read32s 3-4 %. Flat inside run().
- Counters nginx: 2.09M interpreted blocks, 34M steps (16 per block), 0.29M JIT entries.
- Background CPU: in Node rounds >= 1, all of it is V8 compiling the JIT modules
  (JIT off: process cpu == main cpu). v86.wasm itself: ~0.25-0.3 s TurboFan per fresh process.
- JIT threshold (JITCFG=4=n), main / process CPU per round:
  nginx 200k 860/3030, 500k 740/1200, 1M 850/1250; goapp 200k 2280/9730, 500k 2080/4510,
  1M 2050/3260; cpu 200k 6660/11940, 1M 6220/9260; glibc 200k 5970/15740, 1M 6390/11910.

## Next
- spring at 200k/500k/1M (scratchpad spring-thr.txt), then pick the threshold.
- interpreter per-instruction work (dispatch, imm reads, loop bookkeeping).
- browser check of v86.wasm compile sharing between pod workers; tabernetes patch.
