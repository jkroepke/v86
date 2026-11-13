const p = JSON.parse(require('fs').readFileSync(process.argv[2]));
const byId = new Map(p.nodes.map(n => [n.id, n])); const c = new Map(); let total = 0;
p.samples.forEach((s, i) => { const n = byId.get(s); const f = n.callFrame.functionName; const u = n.callFrame.url;
  let k = /^wasm-function\[/.test(f) ? 'JIT code' : u.includes('v86.wasm') ? (f === 'main_loop' ? 'main_loop' : /interpreter|modrm|read_imm|safe_read|safe_write|instructions|arith|fpu|string|misc_instr|sse/.test(f) ? 'interpreter+helpers' : /hash|jit|codegen|wasmgen|control_flow|dlmalloc|memcpy|memset/.test(f) ? 'jit compiler/bookkeeping' : 'other wasm:' + f.slice(0, 60)) : u.includes('libv86') ? 'v86 JS' : f.startsWith('(') ? f : 'other JS';
  const t = p.timeDeltas[i] || 0; c.set(k, (c.get(k) || 0) + t); total += t; });
for (const [k, t] of [...c].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((t / 1000).toFixed(0).padStart(7), (100 * t / total).toFixed(1).padStart(5) + '%', k);
