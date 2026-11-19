// browser worker: one pod-bench run (saved state and kernel modules given), posts the results
globalThis.BENCH_ENV = { READINTO: "1", KJIT_WARM_WAIT: "1000" };
onmessage = async ({ data: d }) => { try {
  const B = "/tools/pod-bench", SRC = B + "/data/tabernetes", v86dir = "/" + d.build;
  const mods = { ...(await import(SRC + "/initramfs.js")), ...(await import(SRC + "/kernelboot.js")), ...(await import(SRC + "/rootfs.js")),
    V86: (await import(v86dir + "/libv86.mjs")).V86 };
  const files = {};
  for (const [k, v] of Object.entries(d.files)) files[k] = new Uint8Array(v);
  const { run } = await import(B + "/core.mjs");
  const log = [];
  const res = await run({ module: d.module, state: d.state, mods, read: (n) => files[n], workload: d.wl, rounds: d.rounds, v86dir,
    kjitBlob: d.nokjit ? undefined : d.kjit, kjitWarm: 3000, prewarm: "init", jitcfg: d.jitcfg,
    log: (s) => { log.push(s); postMessage({ progress: s }); } });
  postMessage({ done: res.map((r) => r.done), log });
} catch (e) { postMessage({ error: String(e && e.stack || e) }); } };
