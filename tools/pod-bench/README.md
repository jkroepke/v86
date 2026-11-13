# pod-bench

Measures v86 the way [tabernetes](https://github.com/jkroepke/tabernetes) uses
it: a Linux 7.3 i386 kernel boots without a BIOS, init waits in an initramfs,
the VM state is saved, and every round restores it and starts a container
image from a 9p root file system (like `web/src/vmworker.js` in tabernetes).

    tools/pod-bench/setup.sh                      # once: VM, tabernetes modules, images
    make build/v86.wasm build/libv86.mjs
    V86=build node tools/pod-bench/bench.mjs nginx 5

## Workloads

| name   | image                 | ends when                    | what it stresses                               |
|--------|-----------------------|------------------------------|------------------------------------------------|
| nginx  | `nginx` (Debian)      | HTTP answer on port 80       | program start, ~51M instructions, 82 % interpreted |
| cpu    | `alpine`              | exit; sha256 sums must match | JIT code: shell loop, gzip, sha256 (~2.4G instr) |
| glibc  | `nginx` (Debian)      | exit                         | grep/sort/sed/awk on text, glibc SSE2 string functions |
| spring | see below             | HTTP answer on port 80       | a JVM (C1 JIT code in the guest), ~100 s, jumps between pages |

`spring` needs `data/spring.tar` (flat `docker export` of a linux/386 image
with a 32-bit OpenJDK 21 and a Spring Boot app) and `data/spring.json`
(`{"args": [...], "env": [...], "cwd": "..."}`). The example of
jkroepke/tabernetes PR #15 (`examples/spring-boot`) builds such an image.

## Output and options

Each round prints `restore` (state restore), `started` (init started the
container), `done` (wall time from "go" to the end), `cpu` (CPU time of the
main thread, from /proc; less noisy when other processes run) and the guest
instructions (32-bit counter: wraps for spring). Run-to-run noise is about
10 %: compare medians of several rounds, or use `ab.sh`.

- `V86=<dir>`: directory with `v86.wasm` and `libv86.mjs` (default `build/`)
- `JITCFG="k=v,..."`: `cpu.set_jit_config(k, v)` (0 JIT off, 1 pages per module,
  2 loop safety, 3 extra basic blocks, 4 JIT threshold, 5 SIMD off with 0)
- `CPUHIDE="0=0x2000202,1=0x20000000"`: `set_cpuid_hidden(i, bits)`, here the CPUID
  without pclmulqdq, ssse3, aes (0: leaf 1 ecx) and sha (1: leaf 7 ebx)
- `PCPU=1`: also print the CPU time of the whole process per round. V8 compiles the JIT
  modules of v86 on background threads; that does not show in the CPU time of the main thread
- `STATS=1`: print the counters of `src/rust/profiler.rs` (needs `make with-profiler`)
- `PROF=x.cpuprofile [PROFROUND=n]`: V8 CPU profile from round n to the end;
  `node agg.cjs x.cpuprofile 40` lists self time per function, `node cat.cjs
  x.cpuprofile` groups it (JIT code, main_loop, interpreter, ...)
- `ab.sh <workload> <reps> <dirA> <dirB>`: alternating runs of two builds
- `BENCH_DATA`, `VMDIR`, `TABERNETES_SRC`: other locations of the data

`core.mjs` has no Node.js dependencies: it also runs in a browser worker
(pass `read`, `mods`, `v86dir` and `log` to `run`).
