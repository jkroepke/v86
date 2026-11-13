// Benchmark of a tabernetes pod in v86 under Node.js. See README.md.
//   V86=build node tools/pod-bench/bench.mjs <nginx|cpu|spring|glibc> <rounds>
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
  hook = async (i, w) => {
    if (i === Number(process.env.PROFROUND ?? 1) && w === "start") await ses.post("Profiler.start");
    if (i === Number(rounds) - 1 && w === "end") {
      const { profile } = await ses.post("Profiler.stop");
      fs.writeFileSync(process.env.PROF, JSON.stringify(profile));
    }
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
const cpu = cpuOf(`/proc/self/task/${process.pid}/stat`);
const pcpu = process.env.PCPU === "1" ? cpuOf("/proc/self/stat") : undefined;
// STATS=1 with a profiler build (make with-profiler) prints the counters of src/rust/profiler.rs
let stats;
if (process.env.STATS === "1") {
  const src = fs.readFileSync(path.join(here, "../../src/rust/profiler.rs"), "utf8");
  stats = src.match(/pub enum stat \{([\s\S]*?)\}/)[1].split("\n").map((l) => l.trim().replace(/,$/, "")).filter((l) => l && !l.startsWith("//"));
}
const springJSON = path.join(DATA, "spring.json");
await run({
  spring: fs.existsSync(springJSON) ? JSON.parse(fs.readFileSync(springJSON)) : null,
  hook, cpu, pcpu, stats, mods, v86dir: V86DIR, read, workload, rounds: Number(rounds),
  jitcfg: process.env.JITCFG, cpuhide: process.env.CPUHIDE, script: process.env.SCRIPT,
  v86opts: process.env.V86OPTS && JSON.parse(process.env.V86OPTS), log: console.log,
});
process.exit(0);
