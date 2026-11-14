// node kpages.cjs <System.map> <gstat.json>...
//
// How many pages of kernel text the kernel instructions of a recording ran on: all pages,
// and the pages that hold 50, 90 and 99 % of the sampled instructions. "packed" is the same
// for an ideal order (the functions by heat per byte, without gaps): the lower bound.
// It checks a kernel function order (korder.cjs, tabernetes vm/kernel-order.txt): with a
// good order, the 90 % value is close to the packed one; in link order it is 2-3x higher.
// The recording (GSTAT of a V86_GUESTSTAT=1 build) must be of the kernel of System.map.
const fs = require("fs");
const KTEXT = 0xc1000000;
const [mapFile, ...files] = process.argv.slice(2);
if (!mapFile || !files.length) {
  console.error("usage: node kpages.cjs System.map gstat.json...");
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
for (const f of files) {
  const g = JSON.parse(fs.readFileSync(f));
  const pages = new Map(), fns = new Map();
  let total = 0;
  for (const [i, n] of g.khist) {
    const addr = KTEXT + i * 16;
    pages.set(addr >>> 12, (pages.get(addr >>> 12) || 0) + n);
    const k = find(addr);
    fns.set(k, (fns.get(k) || 0) + n);
    total += n;
  }
  const cover = (vals, p) => {
    vals.sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < vals.length; i++) { s += vals[i]; if (s >= p * total) return i + 1; }
    return vals.length;
  };
  const byDensity = [...fns.entries()]
    .map(([k, n]) => ({ n, size: (syms[k + 1]?.[0] ?? syms[k][0] + 64) - syms[k][0] }))
    .sort((a, b) => b.n / b.size - a.n / a.size);
  const packed = {};
  let bytes = 0, s = 0;
  for (const x of byDensity) {
    bytes += x.size; s += x.n;
    for (const p of [0.5, 0.9, 0.99]) if (!packed[p] && s >= p * total) packed[p] = Math.ceil(bytes / 4096);
  }
  const v = [...pages.values()];
  console.log(`${f}: ${pages.size} kernel pages ran; 50/90/99 % of the instructions on ` +
    `${cover(v, 0.5)}/${cover(v, 0.9)}/${cover(v, 0.99)} pages (packed: ${packed[0.5]}/${packed[0.9]}/${packed[0.99]}); ${fns.size} functions`);
}
