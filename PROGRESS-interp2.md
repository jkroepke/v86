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

## 18:10 update
- spring 1 round, threshold 200k / 500k / 1M: main 88.4 / 84.4 / 82.8 s, process 162 / 142 / 131 s.
  -> raise JIT_THRESHOLD (candidate 500k-1M); to measure again in quiet A/B.
- Uncommitted-then-committed here: size bit of the opcode kept in InterpreterLoop (no is_32 load
  per instruction; update_cs_size ends the block), modrm fast path with a branch-free
  displacement. JIT off ipair nginx: -2..-4 % (noisy).
- Browser (bench/web/fresh.html, pw2.cjs): posting one WebAssembly.Module from the page to each
  pod worker: "started" 42-81 ms instead of 100-176 ms, Chromium CPU ~0.4 s less per pod.
  Draft tabernetes patch in scratchpad tab/ (vm.js postStart, bridge.js relay, vmworker.js wasm_fn).
