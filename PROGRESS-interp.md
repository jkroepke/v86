# Progress note: interpreter speed (branch interp, pushed as wip/interp)

Temporary file for a relaunched helper. Remove it before the final commits.

## Done
- Rebased onto claude/project-thread-6qrl9l (b7c0670): 3 commits, no conflicts.
  1. Return interpreter results in a register and add a modrm fast path
  2. Run the loop of the interpreter inside the generated function
  3. WIP: read immediate values inline in the interpreter (was uncommitted; not measured yet)
- Builds in /home/claude/bench: v86-m2 = base (2012667 bytes), r2 = commits 1+2 (2030611),
  r3 = 1+2+3 (2054899). Build script: scratchpad bld.sh (make build/v86.wasm build/libv86.mjs,
  copy to /home/claude/bench/<name>).
- Bench needs an absolute path: V86=/home/claude/bench/r2 node bench.mjs nginx 5

## Current step
- callgrind (bench/icg.sh <abs dir> nginx 1) of v86-m2, r2, r3 to decide whether commit 3 stays.

## Next
- Hotness bookkeeping after each interpreted block (jit_increase_hotness_and_maybe_compile:
  mutex + HashMap + HashSet) -> flat array, same behaviour.
- Tests: MAX_PARALLEL_TESTS=1 make nasmtests nasmtests-force-jit; make rust-test
- Final numbers: iab.sh nginx / cpu, JITCFG 0=1, spring; wasm size.

## Numbers
- (old base, before rebase) nginx cpu median of 20: JIT off 1290 -> 990 ms, JIT on 1180 -> 1090 ms

## Update 12:55
- callgrind, nginx (boot + 1 round, 65.2M guest instr), Ir of generated code per guest instr:
  v86-m2 165, r2 145.3, r3 142.7 (icg.sh prints a wrong "per guest" value: it counts only the boot;
  divide Ir by 65.2M)
- r4 = r3 without the inline immediates in gen/generate_interpreter.js: 2020366 bytes (r3 2054899).
  callgrind running -> scratchpad icg-r4.txt. Decide: inline immediates worth 34 KB?
- r5 = r3 + hotness commit (PAGE_HOTNESS flat array + KNOWN_ENTRY_POINTS cache in jit.rs):
  2057738 bytes; callgrind running -> icg-r5.txt. Tests not run yet on any of it.
