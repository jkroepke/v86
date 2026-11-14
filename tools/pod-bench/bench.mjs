// Benchmark of a tabernetes pod in v86 under Node.js. See README.md.
//   V86=build node tools/pod-bench/bench.mjs <nginx|cpu|spring|glibc|goapp|loop> <rounds>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.BENCH_DATA || path.join(here, "data");
const SRC = process.env.TABERNETES_SRC || path.join(DATA, "tabernetes");
const V86DIR = path.resolve(process.env.V86 || path.join(here, "../../build"));
const VM = process.env.VMDIR || path.join(DATA, "vm");
const mods = {
  ...(await import(path.join(SRC, "initramfs.js"))),
  ...(await import(path.join(SRC, "kernelboot.js"))),
  ...(await import(path.join(SRC, "rootfs.js"))),
  V86: (await import(path.join(V86DIR, "libv86.mjs"))).V86,
};
const [workload = "nginx", rounds = "3"] = process.argv.slice(2);
const read = (n) => new Uint8Array(fs.readFileSync(n.endsWith(".tar") ? path.join(DATA, n) : path.join(VM, n)));

// PROF=file.cpuprofile writes a V8 CPU profile of rounds PROFROUND (default 1) to the last
let hook;
if (process.env.PROF) {
  const insp = await import("node:inspector/promises");
  const ses = new insp.Session();
  ses.connect();
  await ses.post("Profiler.enable");
  await ses.post("Profiler.setSamplingInterval", { interval: 200 });
  // with STEADY=1 only the measured requests of round PROFROUND (default 0)
  const steady = process.env.STEADY === "1", pr = Number(process.env.PROFROUND ?? (steady ? 0 : 1));
  hook = async (i, w) => {
    if (i === pr && w === (steady ? "measure" : "start")) await ses.post("Profiler.start");
    if (i === (steady ? pr : Number(rounds) - 1) && w === (steady ? "measured" : "end")) {
      const { profile } = await ses.post("Profiler.stop");
      fs.writeFileSync(process.env.PROF, JSON.stringify(profile));
    }
  };
}
// PERF_CTL=fifo with STEADY=1: perf record -D -1 --control=fifo:<fifo> records only the
// measured requests (jitdump: node --perf-prof, then perf inject --jit)
if (process.env.PERF_CTL && process.env.STEADY === "1") {
  const prev = hook;
  hook = async (i, w) => {
    await prev?.(i, w);
    if (w === "measure") fs.writeFileSync(process.env.PERF_CTL, "enable\n");
    if (w === "measured") fs.writeFileSync(process.env.PERF_CTL, "disable\n");
  };
}
// CPU time of the main thread (Linux): less noisy than wall time when other processes run.
// PCPU=1 adds the CPU time of the whole process: V8 compiles the JIT modules of v86 on
// background threads, which can be more CPU time than the main thread uses.
const cpuOf = (file) => () => {
  try {
    const f = fs.readFileSync(file, "utf8").split(") ")[1].split(" ");
    return (Number(f[11]) + Number(f[12])) * 10;
  } catch { return 0; }
};
// schedstat has the run time of the thread in nanoseconds. The ticks of stat (10 ms) are far
// off for a thread that wakes up for a moment 100 times per second, like an idle pod.
const schedstat = `/proc/self/task/${process.pid}/schedstat`;
const runtime = () => { try { return Number(fs.readFileSync(schedstat, "utf8").split(" ")[0]) / 1e6; } catch { return 0; } };
const cpu = runtime() > 0 ? runtime : cpuOf(`/proc/self/task/${process.pid}/stat`);
const pcpu = process.env.PCPU === "1" ? cpuOf("/proc/self/stat") : undefined;
// STATS=1 with a profiler build (make with-profiler) prints the counters of src/rust/profiler.rs
let stats;
if (process.env.STATS === "1") {
  const src = fs.readFileSync(path.join(here, "../../src/rust/profiler.rs"), "utf8");
  stats = src.match(/pub enum stat \{([\s\S]*?)\}/)[1].split("\n").map((l) => l.trim().replace(/,$/, "")).filter((l) => l && !l.startsWith("//"));
}
// GSTAT=file.json writes the guest counters of src/rust/gueststat.rs for the last round
// (needs make with-profiler, or V86_GUESTSTAT=1 make build/v86.wasm); gstat.cjs prints them
let gstat, gstatOut;
if (process.env.GSTAT) {
  const src = fs.readFileSync(path.join(here, "../../src/rust/gueststat.rs"), "utf8");
  gstat = src.match(/pub enum G \{([\s\S]*?)\}/)[1].split("\n").map((l) => l.trim().replace(/,$/, "")).filter((l) => l && !l.startsWith("//") && l !== "COUNT");
  gstatOut = (g) => fs.writeFileSync(process.env.GSTAT, JSON.stringify(g));
}
const springJSON = path.join(DATA, "spring.json");
await run({
  spring: fs.existsSync(springJSON) ? JSON.parse(fs.readFileSync(springJSON)) : null,
  hook, cpu, pcpu, stats, gstat, gstatOut, idleMs: Number(process.env.IDLE_MS || 0), scrapes: process.env.SCRAPES ? Number(process.env.SCRAPES) : undefined,
  steady: process.env.STEADY === "1", warm: process.env.WARM ? Number(process.env.WARM) : undefined, reqs: process.env.REQS ? Number(process.env.REQS) : undefined, curve: Number(process.env.CURVE || 0), httpTimeout: Number(process.env.HTTP_TIMEOUT || 0), cmdline: process.env.CMDLINE, mods, v86dir: V86DIR, read, workload, rounds: Number(rounds),
  jitcfg: process.env.JITCFG, kjitThreshold: Number(process.env.KJIT || 0), kjitWorkload: process.env.KJIT_WL, kjitTop: Number(process.env.KJIT_TOP || 0), kjitWarm: Number(process.env.KJIT_WARM || 0),
  kjitBlob: process.env.KJIT_FILE && fs.existsSync(process.env.KJIT_FILE) ? new Uint8Array(fs.readFileSync(process.env.KJIT_FILE)).buffer : undefined,
  onKjit: process.env.KJIT_FILE ? (b) => fs.writeFileSync(process.env.KJIT_FILE, new Uint8Array(b)) : undefined, cpuhide: process.env.CPUHIDE, script: process.env.SCRIPT,
  state: process.env.STATE_FILE && fs.existsSync(process.env.STATE_FILE) ? new Uint8Array(fs.readFileSync(process.env.STATE_FILE)).buffer : undefined,
  onState: process.env.STATE_FILE ? (b) => { if (!fs.existsSync(process.env.STATE_FILE)) fs.writeFileSync(process.env.STATE_FILE, new Uint8Array(b)); } : undefined,
  v86opts: process.env.V86OPTS && JSON.parse(process.env.V86OPTS), log: console.log,
});
process.exit(0);
