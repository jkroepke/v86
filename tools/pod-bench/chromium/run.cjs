// node run.cjs <wl> <reps> <rounds> <variant>...: alternating runs, a new headless Chromium each.
// A variant is "build" (a directory of the checkout with v86.wasm and libv86.mjs) or "build:4=200000"
// (with JITCFG). Needs server.cjs running and playwright (NODE_PATH=$(npm root -g)).
const { chromium } = require("playwright");
const [wl, reps, rounds, ...vs] = process.argv.slice(2);
(async () => {
  const res = Object.fromEntries(vs.map((v) => [v, []]));
  for (let i = 0; i < Number(reps); i++) for (const v of vs) {
    const [build, jitcfg = ""] = v.split(":");
    const b = await chromium.launch();
    const p = await b.newPage();
    p.on("console", (m) => console.error(v, m.text().slice(0, 300)));
    await p.goto(`http://localhost:${process.env.PORT || 8077}/tools/pod-bench/chromium/index.html?build=${build}&jitcfg=${jitcfg}&wl=${wl}&rounds=${rounds}${process.env.NOKJIT ? "&nokjit" : ""}`);
    await p.waitForFunction(() => window.result, null, { timeout: 600000 });
    const r = await p.evaluate(() => window.result);
    await b.close();
    if (r.error) { console.error(v, r.error); continue; }
    res[v].push(r.done);
    console.log(v, r.done.map((x) => x.toFixed(0)).join(" "));
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  for (const v of vs) {
    const f = res[v].map((d) => d[0]), l = res[v].flatMap((d) => d.slice(1));
    console.log(`${v}: first pod median ${med(f)?.toFixed(0)} ms (${f.length}), later pods ${med(l)?.toFixed(0)} ms (${l.length})`);
  }
})();
