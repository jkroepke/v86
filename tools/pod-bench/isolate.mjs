// isolate.mjs <workload> <workers> <rounds per worker>: every worker is a new V8 isolate, like the
// worker of a pod in a tab. All share the compiled v86.wasm (and its optimised code) and the state.
// Round 0 of a worker runs the JavaScript of v86 cold, later rounds warm.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.BENCH_DATA || path.join(here, "data");
const V86DIR = path.resolve(process.env.V86 || path.join(here, "../../build"));
const VM = process.env.VMDIR || path.join(DATA, "vm");
if (isMainThread) {
  const [workload = "nginx", workers = "4", rounds = "3"] = process.argv.slice(2);
  const module = await WebAssembly.compile(fs.readFileSync(path.join(V86DIR, "v86.wasm")));
  const state = fs.readFileSync(process.env.STATE_FILE);
  const sab = new SharedArrayBuffer(state.byteLength); new Uint8Array(sab).set(state);
  for (let w = 0; w < Number(workers); w++) {
    await new Promise((resolve, reject) => {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { workload, rounds: Number(rounds), module, sab, prewarm: process.env.PREWARM } });
      wk.on("message", (l) => console.log(`worker ${w}: ${l}`));
      wk.on("error", reject); wk.on("exit", resolve);
    });
  }
  process.exit(0);
} else {
  const { run } = await import("./core.mjs");
  const SRC = path.join(DATA, "tabernetes");
  const mods = {
    ...(await import(path.join(SRC, "initramfs.js"))), ...(await import(path.join(SRC, "kernelboot.js"))), ...(await import(path.join(SRC, "rootfs.js"))),
    V86: (await import(path.join(V86DIR, "libv86.mjs"))).V86,
  };
  const read = (n) => new Uint8Array(fs.readFileSync(n.endsWith(".tar") ? path.join(DATA, n) : path.join(VM, n)));
  const state = new Uint8Array(workerData.sab).slice().buffer;
  await run({ mods, v86dir: V86DIR, read, workload: workerData.workload, rounds: workerData.rounds, module: workerData.module, state, prewarm: workerData.prewarm, prewarmSleep: 300,
    kjitBlob: process.env.KJIT_FILE ? new Uint8Array(fs.readFileSync(process.env.KJIT_FILE)).buffer : undefined,
    log: (l) => { if (/round|prewarm/.test(l)) parentPort.postMessage(l); } });
  process.exit(0);
}
