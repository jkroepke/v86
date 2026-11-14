// node korder.cjs <System.map> <gstat.json>... > order.txt
//
// An order of the kernel functions for `ld.lld --symbol-ordering-file`: the functions that
// run often and call each other end up in the same pages. The JIT of v86 compiles a page once
// it ran enough instructions, and a module of one page ends at every jump into another page,
// so the hot kernel code should fill few pages.
//
// The input is GSTAT output of a release build with V86_GUESTSTAT=1, recorded with the JIT
// threshold so high that the interpreter runs everything (JITCFG=4=2000000000): only the
// interpreter records the calls. System.map must belong to the vmlinux of the recording.
//
// The order is C3 (Ottoni and Maher, "Optimizing Function Placement for Large-Scale
// Data-Center Applications", CGO 2017): from the hottest function down, a function joins the
// cluster of its most frequent caller while the cluster stays within CLUSTER bytes (default
// one page); then the clusters go hottest per byte first. Each profile counts the same,
// whatever its length.
const fs = require("fs");
const CLUSTER = Number(process.env.CLUSTER || 4096);
const KTEXT = 0xc1000000;
const [mapFile, ...files] = process.argv.slice(2);
if (!mapFile || !files.length) {
  console.error("usage: node korder.cjs System.map gstat.json... > order.txt");
  process.exit(2);
}
const syms = fs.readFileSync(mapFile, "utf8").split("\n").map((l) => l.split(" "))
  .filter((p) => p.length === 3 && /[tTwW]/.test(p[1])).map((p) => [parseInt(p[0], 16), p[2]])
  .sort((a, b) => a[0] - b[0]);
const find = (addr) => {
  let lo = 0, hi = syms.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (syms[m][0] <= addr) lo = m; else hi = m - 1; }
  return lo;
};
const size = (k) => Math.max(16, (syms[k + 1]?.[0] ?? syms[k][0] + 64) - syms[k][0]);

const heat = new Map(); // function -> share of the sampled kernel instructions
const callers = new Map(); // function -> Map(caller -> share of the calls)
for (const f of files) {
  const g = JSON.parse(fs.readFileSync(f));
  if (!g.ekeys) throw new Error(`${f}: no call edges (a GSTAT build of v86 with gueststat::edge)`);
  let samples = 0; for (const [, n] of g.khist) samples += n;
  for (const [i, n] of g.khist) {
    const k = find(KTEXT + i * 16);
    heat.set(k, (heat.get(k) || 0) + n / samples);
  }
  const cnt = new Map(g.ecnt); let calls = 0; for (const [, n] of g.ecnt) calls += n;
  for (const [i, key] of g.ekeys) {
    const kk = BigInt(key) - 1n;
    const from = find(KTEXT + Number(kk >> 24n)), to = find(KTEXT + Number(kk & 0xffffffn));
    if (from === to) continue;
    if (!callers.has(to)) callers.set(to, new Map());
    const m = callers.get(to); m.set(from, (m.get(from) || 0) + cnt.get(i) / calls);
  }
}

const fns = new Set(heat.keys());
for (const [to, m] of callers) { fns.add(to); for (const k of m.keys()) fns.add(k); }
const cluster = new Map();
for (const k of fns) cluster.set(k, { fns: [k], size: size(k), heat: heat.get(k) || 0 });
for (const f of [...fns].sort((a, b) => (heat.get(b) || 0) - (heat.get(a) || 0))) {
  let best = -1, w = 0;
  for (const [p, x] of callers.get(f) || []) if (x > w) { w = x; best = p; }
  if (best < 0) continue;
  const cf = cluster.get(f), cp = cluster.get(best);
  if (cf === cp || cf.size + cp.size > CLUSTER) continue;
  cp.fns.push(...cf.fns); cp.size += cf.size; cp.heat += cf.heat;
  for (const k of cf.fns) cluster.set(k, cp);
}
const seen = new Set();
for (const c of [...new Set(cluster.values())].sort((a, b) => b.heat / b.size - a.heat / a.size)) {
  for (const k of c.fns) {
    const name = syms[k][1];
    if (!seen.has(name)) { seen.add(name); console.log(name); }
  }
}
