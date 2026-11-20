// node stacks.cjs gstat.json System.map [filter-func] : inclusive kernel profile from sampled stacks
const fs = require("fs");
const [file, mapFile, focus] = process.argv.slice(2);
const g = JSON.parse(fs.readFileSync(file));
const syms = fs.readFileSync(mapFile, "utf8").split("\n").map((l) => l.split(" ")).filter((p) => p.length === 3 && /[tT]/.test(p[1])).map((p) => [parseInt(p[0], 16), p[2]]).sort((a, b) => a[0] - b[0]);
const sym = (a) => { let lo = 0, hi = syms.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (syms[m][0] <= a) lo = m; else hi = m - 1; } return syms[lo][1]; };
const D = 24, st = g.stacks, n = st.length / D;
const allSamples = g.counters[g.names.indexOf("SAMPLES_USER")] + g.counters[g.names.indexOf("SAMPLES_KERNEL")];
const incl = {}, self = {}, bycause = {}, callers = {}, callees = {};
const tagName = (t) => t === 1000 ? "#PF" : t === 1001 ? "irq" : t === 1002 ? "other" : "sys" + t;
let used = 0;
for (let i = 0; i < n; i++) {
  const s = st.slice(i * D, i * D + D);
  const tag = tagName(s[0]);
  const fr = []; for (let d = 1; d < D && s[d]; d++) fr.push(sym(s[d] - (d > 1 ? 1 : 0)));
  if (focus && !fr.includes(focus)) continue;
  if (process.env.CAUSE && tag !== process.env.CAUSE) continue;
  used++;
  bycause[tag] = (bycause[tag] || 0) + 1;
  self[fr[0]] = (self[fr[0]] || 0) + 1;
  for (const f of new Set(fr)) incl[f] = (incl[f] || 0) + 1;
  if (focus) { const k = fr.indexOf(focus); if (k > 0) callees[fr[k - 1]] = (callees[fr[k - 1]] || 0) + 1; if (k + 1 < fr.length) callers[fr[k + 1]] = (callers[fr[k + 1]] || 0) + 1; }
}
const pct = (v) => (100 * v / allSamples).toFixed(2) + "%";
console.log(`${used} kernel samples${focus ? " with " + focus : ""}, ${allSamples} all; percentages of all instructions`);
console.log("by cause: " + Object.entries(bycause).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${pct(v)}`).join(", "));
const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
if (process.env.SELF) { console.log("self:"); for (const [f, v] of top(self, Number(process.env.SELF))) console.log(`  ${f.padEnd(40)} ${pct(v).padStart(7)}`); }
console.log("inclusive:"); for (const [f, v] of top(incl, Number(process.env.TOP || 60))) console.log(`  ${f.padEnd(40)} ${pct(v).padStart(7)}  self ${pct(self[f] || 0)}`);
if (focus) { console.log("callers:"); for (const [f, v] of top(callers, 15)) console.log(`  ${f.padEnd(40)} ${pct(v)}`); console.log("callees:"); for (const [f, v] of top(callees, 25)) console.log(`  ${f.padEnd(40)} ${pct(v)}`); }
