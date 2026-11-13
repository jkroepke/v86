# guestk: time in the guest kernel and emulated devices (WIP note)

Worktree /home/claude/v86-guestk, branch guestk, pushed as wip/guestk.

## Done
- src/rust/gueststat.rs: guest counters (profiler build, or release with
  V86_GUESTSTAT=1 make build/v86.wasm): user/kernel instructions, JIT share,
  syscalls, vectors, ports, page faults, TLB, kernel IP samples.
- Private bench copy with GSTAT=<json>, IDLE_MS, CMDLINE, BOOTLOG:
  /home/claude/bench/gk/{bench,core}.mjs; report: node gstat.cjs x.json System.map syscall_32.tbl
  (SYM2OBJ=/home/claude/work/gk/sym2obj.txt groups by source file).
- Builds in /home/claude/bench/gk: base (master), prof (profiler), gs (release+counters), hlt (fix).
- Kernel with symbols: /home/claude/work/gk/linux (v7.3.4, tabernetes config), VMDIR=/home/claude/work/gk/vm.
- Chromium idle test: node server.cjs & ; node pw-idle.cjs "?v86=hlt&pods=4"
- FIX: hlt_wait() in cpu.rs main_loop: an idle pod no longer busy-loops in the last
  millisecond before each timer tick. Idle pod: Node 87 -> 26 ms/s CPU, Chromium worker
  88 -> 22 ms/s (4 pods 357 -> 79 ms/s).

## Numbers (release speed, gs build)
- nginx: 50M instr, 55 % kernel (syscall 30 %, page fault 24 %), 69 % of host time; 90 % of kernel instr interpreted
- goapp: 175M, 22 % kernel, 34 % of time
- glibc: 1004M, 25.5 % kernel, 54 % of time (15.4k 9p requests)
- spring: 8.6G, 5 % kernel, 11 % of time (profiler build)
- TLB flushes, page fault entry, irq entry, port I/O: each < 0.3 % of host time (V8 profile).
- Guest tick: PIT periodic 100 Hz, NO_HZ never active (tsc not valid for hres). tsc=reliable
  on the kernel command line: 38 wakes/s (PIT one-shot max 27 ms).


## State (later)
- Docs written (AGENTS.md, tools/pod-bench/README.md), GSTAT/IDLE_MS/CMDLINE ported to tools/pod-bench.
- tabernetes proposal written: /mnt/project-files/v86/tabernetes-idle-apic-timer.patch
  (X86_UP_APIC + acpi:true + tsc=reliable highres=off: idle pod 22 -> 3.3 ms/s).
- Tried and dropped: lower JIT threshold for kernel pages; SLUB_TINY=n.
- Next: tests (all-debug, nasmtests, nasmtests-force-jit, rust-test; log in
  /home/claude/bench/gk/tests1.log), squash into two commits without this file,
  rebase on origin/master, push master, tools/dist.sh --push from a clean master checkout.
## DONE (final)
- master 3535e2b (two commits on 19aedc1), tests passed, dist be73c07 = 0.5.84-fork.3535e2be6968.
- hlt_wait final: whole ms only when the guest ran < 6000 instructions since its last wait.
- Nothing left to do here; tabernetes proposal in /mnt/project-files/v86/tabernetes-idle-apic-timer.patch.
