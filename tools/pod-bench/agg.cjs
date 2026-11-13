const p = JSON.parse(require('fs').readFileSync(process.argv[2]));
const self = new Map(); const byId = new Map(p.nodes.map(n => [n.id, n]));
const dt = p.timeDeltas; const counts = new Map();
p.samples.forEach((s, i) => counts.set(s, (counts.get(s) || 0) + (dt[i] || 0)));
let total = 0;
for (const [id, t] of counts) { const n = byId.get(id); const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' ' + (cf.url||'').split('/').pop() + ':' + cf.lineNumber; self.set(k, (self.get(k) || 0) + t); total += t; }
const arr = [...self].sort((a, b) => b[1] - a[1]).slice(0, +(process.argv[3]||40));
for (const [k, t] of arr) console.log((t / 1000).toFixed(0).padStart(7), (100 * t / total).toFixed(1).padStart(5) + '%', k);
console.log('total ms', (total/1000).toFixed(0));
