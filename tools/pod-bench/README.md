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
| goapp  | access-log-exporter   | HTTP on 4040, then 20 scrapes of /metrics | a static Go binary (386): runtime start, GC, int 0x80 system calls |
| spring | see below             | HTTP answer on port 80       | a JVM (C1 JIT code in the guest), ~100 s, jumps between pages |
| loop   | `alpine`              | with `STEADY=1` only         | one shell process: a shell loop, awk, gzip, again and again |

`spring` needs `data/spring.tar` (flat `docker export` of a linux/386 image
with a 32-bit OpenJDK 21 and a Spring Boot app) and `data/spring.json`
(`{"args": [...], "env": [...], "cwd": "..."}`). The example of
jkroepke/tabernetes PR #15 (`examples/spring-boot`) builds such an image.

## Output and options

Each round prints `restore` (state restore), `started` (init started the
container), `done` (wall time from "go" to the end), `cpu` (CPU time of the
main thread, from /proc/.../schedstat; less noisy when other processes run) and the guest
instructions (32-bit counter: wraps for spring). Run-to-run noise is about
10 %: compare medians of several rounds, or use `ab.sh`.

- `STEADY=1 [WARM=n] [REQS=n]`: steady state of a running application instead of the
  start. The pod starts, then gets WARM requests (default 20) and REQS more (default 200)
  that are measured, one after the other, each on a new connection over the network
  adapter of v86: nginx `/`, goapp `/metrics`, spring `/` (`hello`); for `loop`, a
  request is one `tick` of the loop (use `WARM=3 REQS=10`). Prints wall time, CPU time of
  the main thread (and of the process with `PCPU=1`) and guest instructions per request,
  and the latency (p50, p90, p99, max). `PROF` and `GSTAT` cover only the measured
  requests, `PROF` of round `PROFROUND` (default 0)
- `SCRAPES=n`: scrapes of /metrics for goapp (default 20); `HTTP_TIMEOUT=ms`: give up waiting for HTTP
- `V86=<dir>`: directory with `v86.wasm` and `libv86.mjs` (default `build/`)
- `JITCFG="k=v,..."`: `cpu.set_jit_config(k, v)` (0 JIT off, 1 pages per module,
  2 loop safety, 3 extra basic blocks, 4 JIT threshold, 5 SIMD off with 0, 7 cold blocks off with 0)
- `CPUHIDE="0=0x2000202,1=0x20000000"`: `set_cpuid_hidden(i, bits)`, here the CPUID
  without pclmulqdq, ssse3, aes (0: leaf 1 ecx) and sha (1: leaf 7 ebx)
- `PCPU=1`: also print the CPU time of the whole process per round. V8 compiles the JIT
  modules of v86 on background threads; that does not show in the CPU time of the main thread
- `STATS=1`: print the counters of `src/rust/profiler.rs` (needs `make with-profiler`)
- `PROF=x.cpuprofile [PROFROUND=n]`: V8 CPU profile from round n to the end;
  `node agg.cjs x.cpuprofile 40` lists self time per function, `node cat.cjs
  x.cpuprofile` groups it (JIT code, main_loop, interpreter, ...)
- `GSTAT=x.json`: write the counters of `src/rust/gueststat.rs` for the last round
  (needs `make with-profiler`, or `V86_GUESTSTAT=1 make build/v86.wasm` for a release
  build with only these counters). `node gstat.cjs x.json [System.map] [syscall_32.tbl]`
  prints them: user and kernel instructions and host time, system calls, interrupts, port
  I/O, page faults, TLB flushes, and the kernel functions when `System.map` belongs to
  the `vmlinux` in `VMDIR` (`SYM2OBJ=` groups them by source file: lines of
  `symbol object-file`, made with `nm` over the build tree of the kernel)
- `IDLE_MS=n`: after the workload, let the pod idle for n ms and print the CPU time
  and the guest instructions per second (with `GSTAT`, the counters are of that time)
- `CMDLINE="..."`: another kernel command line (default `console=ttyS0 quiet loglevel=3`)
- `ab.sh <workload> <reps> <dirA> <dirB>`: alternating runs of two builds
- `BENCH_DATA`, `VMDIR`, `TABERNETES_SRC`: other locations of the data

`core.mjs` has no Node.js dependencies: it also runs in a browser worker
(pass `read`, `mods`, `v86dir` and `log` to `run`).
