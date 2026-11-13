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

## 18:30 update
- Interpreter (build i2c): size bit in the loop + blocks end when the eip translation changes
  (no last_virt_eip check per instruction). callgrind (bench/icg.sh, nginx, JIT off), host
  instructions per guest instruction: 134.4 -> 127.0 (size bit) -> 121.2 (-9.8 %).
  Tried and dropped: branch-free modrm displacement (+2 % Ir), modrm fast path as leaf function
  for flat segments (-0.8 % Ir for +13.5 KB wasm).
- nasmtests, nasmtests-force-jit, rust-test passed on i2c.
- JIT_THRESHOLD 200k -> 750k (build i2f). 3-way 500k/750k/1M under load: nginx main 790/800/780,
  760/770/720, 840/740/790; process 2280/1770/1500, 2280/1540/1420, 2450/1580/1670.
  goapp main 2200/2040/2230, 2130/2090/2120; process 4750/3470/3590, 4940/3270/3090.
- tools/pod-bench: PCPU=1 prints process CPU.
- Tabernetes patch written: /mnt/project-files/v86/tabernetes-share-wasm-module.patch
  (started 180 -> 70 ms, -0.4 s CPU per pod in headless Chromium).

## Next
- final A/B (scratchpad final-ab.txt, final-nojit.txt), AGENTS.md, clean commits, rebase,
  tests again, push master, tools/dist.sh --push.

## Done (18:48)
Merged to master as 5abbf86..61a717b (clean commits, branch interp2-final), dist 829b3ee
(0.5.79-fork.61a717b16788). Nothing left on this branch. Open: bump the commit in tabernetes,
apply /mnt/project-files/v86/tabernetes-share-wasm-module.patch there.
