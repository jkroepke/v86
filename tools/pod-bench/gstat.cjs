// node gstat.cjs <gstat.json> [System.map] [syscall_32.tbl]: report of the guest counters
const fs = require("fs");
const [file, mapFile, tblFile] = process.argv.slice(2);
const g = JSON.parse(fs.readFileSync(file));
const c = Object.fromEntries(g.names.map((n, i) => [n, g.counters[i]]));
const M = (v) => (v / 1e6).toFixed(2) + "M", pct = (v, t) => (100 * v / t).toFixed(1) + "%";
const kern = c.INSTR_KERNEL_SYSCALL + c.INSTR_KERNEL_PAGE_FAULT + c.INSTR_KERNEL_IRQ + c.INSTR_KERNEL_OTHER, tot = kern + c.INSTR_USER;
console.log(`instructions ${M(tot)}: user ${M(c.INSTR_USER)} (${pct(c.INSTR_USER, tot)}), kernel ${M(kern)} (${pct(kern, tot)})`);
console.log(`  kernel by cause of entry: syscall ${pct(c.INSTR_KERNEL_SYSCALL, tot)}, page fault ${pct(c.INSTR_KERNEL_PAGE_FAULT, tot)}, irq ${pct(c.INSTR_KERNEL_IRQ, tot)}, other ${pct(c.INSTR_KERNEL_OTHER, tot)}`);
console.log(`  in JIT code: user ${pct(c.INSTR_USER_JIT, c.INSTR_USER)} of user instr (${(c.INSTR_USER_JIT / Math.max(1, c.RUNS_USER_JIT)).toFixed(0)} instr per entry), kernel ${pct(c.INSTR_KERNEL_JIT, kern)} of kernel instr (${(c.INSTR_KERNEL_JIT / Math.max(1, c.RUNS_KERNEL_JIT)).toFixed(0)} per entry); interpreted: user ${M(c.INSTR_USER - c.INSTR_USER_JIT)} in ${M(c.RUNS_USER_INTERPRETED)} blocks, kernel ${M(kern - c.INSTR_KERNEL_JIT)} in ${M(c.RUNS_KERNEL_INTERPRETED)} blocks`);
const ms = c.MS_USER + c.MS_KERNEL + c.MS_IDLE;
console.log(`host time ${ms.toFixed(0)} ms (wall ${g.wallMs.toFixed(0)}, main cpu ${g.cpuMs.toFixed(0)}): user ${c.MS_USER.toFixed(0)} (${pct(c.MS_USER, ms)}), kernel ${c.MS_KERNEL.toFixed(0)} (${pct(c.MS_KERNEL, ms)}), idle ${c.MS_IDLE.toFixed(0)} (${pct(c.MS_IDLE, ms)})`);
console.log(`  ns per instruction: user ${(c.MS_USER * 1e6 / c.INSTR_USER).toFixed(1)}, kernel ${(c.MS_KERNEL * 1e6 / kern).toFixed(1)}`);
const pfU = c.PF_USER_NOT_PRESENT_READ + c.PF_USER_NOT_PRESENT_WRITE + c.PF_USER_PROTECTION_READ + c.PF_USER_PROTECTION_WRITE;
const pfK = c.PF_KERNEL_NOT_PRESENT_READ + c.PF_KERNEL_NOT_PRESENT_WRITE + c.PF_KERNEL_PROTECTION_READ + c.PF_KERNEL_PROTECTION_WRITE;
console.log(`page faults ${pfU + pfK}: user ${pfU} (not present r/w ${c.PF_USER_NOT_PRESENT_READ}/${c.PF_USER_NOT_PRESENT_WRITE}, protection r/w ${c.PF_USER_PROTECTION_READ}/${c.PF_USER_PROTECTION_WRITE}), kernel ${pfK} (np ${c.PF_KERNEL_NOT_PRESENT_READ}/${c.PF_KERNEL_NOT_PRESENT_WRITE}, prot ${c.PF_KERNEL_PROTECTION_READ}/${c.PF_KERNEL_PROTECTION_WRITE}); ${(c.INSTR_KERNEL_PAGE_FAULT / Math.max(1, pfU)).toFixed(0)} kernel instr per user fault`);
const sc = c.SYSENTER + c.INT80;
console.log(`syscalls ${sc}: sysenter ${c.SYSENTER}, int80 ${c.INT80}; sysexit ${c.SYSEXIT}, iret ${c.IRET}; ${(c.INSTR_KERNEL_SYSCALL / Math.max(1, sc)).toFixed(0)} kernel instr per syscall; cpl changes ${c.CPL_CHANGE}`);
console.log(`cr3 writes ${c.CR3_WRITE} (+${c.CR3_WRITE_SAME} same value), invlpg ${c.INVLPG}; ${c.TLB_CLEAR} flushes without global pages dropped ${c.TLB_ENTRIES_DROPPED} entries (${(c.TLB_ENTRIES_DROPPED / Math.max(1, c.TLB_CLEAR)).toFixed(0)} per flush, ${c.TLB_CODE_DROPPED} with JIT code) and kept ${(c.TLB_ENTRIES_KEPT_GLOBAL / Math.max(1, c.TLB_CLEAR)).toFixed(0)} global entries per flush`);
console.log(`hlt ${c.HLT}, rdtsc ${c.RDTSC}`);
let names = {};
if (tblFile) for (const l of fs.readFileSync(tblFile, "utf8").split("\n")) { const m = l.match(/^(\d+)\s+\S+\s+(\S+)/); if (m) names[m[1]] = m[2]; }
const vec = (v) => v === 14 ? "#PF" : v === 0x80 ? "int80" : v === 13 ? "#GP" : v === 7 ? "#NM" : v === 6 ? "#UD" : v >= 32 ? `irq${v - 32 >= 16 ? "?" : v - 32}(vec ${v})` : `exc${v}`;
console.log("interrupts by vector: " + g.vectors.sort((a, b) => b[1] - a[1]).map(([v, n]) => `${vec(v)} ${n}`).join(", "));
const si = Object.fromEntries(g.syscallInstr);
console.log("syscalls (count, kernel instr, instr/call):");
for (const [n, cnt] of g.syscalls.sort((a, b) => (si[b[0]] || 0) - (si[a[0]] || 0)).slice(0, 22)) console.log(`  ${String(names[n] || n).padEnd(22)} ${String(cnt).padStart(8)} ${M(si[n] || 0).padStart(10)} ${pct(si[n] || 0, tot).padStart(6)} ${((si[n] || 0) / cnt).toFixed(0).padStart(8)}`);
const ports = {}; for (const [p, n] of g.portReads) (ports[p] ??= [0, 0])[0] = n; for (const [p, n] of g.portWrites) (ports[p] ??= [0, 0])[1] = n;
console.log("port I/O (port: reads/writes): " + Object.entries(ports).sort((a, b) => b[1][0] + b[1][1] - a[1][0] - a[1][1]).slice(0, 16).map(([p, [r, w]]) => `0x${Number(p).toString(16)}: ${r}/${w}`).join(", "));
if (mapFile) {
  const syms = fs.readFileSync(mapFile, "utf8").split("\n").map((l) => l.split(" ")).filter((p) => p.length === 3 && /[tT]/.test(p[1])).map((p) => [parseInt(p[0], 16), p[2]]).sort((a, b) => a[0] - b[0]);
  const by = {}; let total = 0;
  for (const [i, n] of g.khist) {
    const addr = 0xc1000000 + i * 16;
    let lo = 0, hi = syms.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (syms[m][0] <= addr) lo = m; else hi = m - 1; }
    by[syms[lo][1]] = (by[syms[lo][1]] || 0) + n; total += n;
  }
  if (process.env.SYM2OBJ) {
    const o = {}; for (const l of fs.readFileSync(process.env.SYM2OBJ, "utf8").split("\n")) { const [sym, f] = l.split(" "); if (f) o[sym] ??= f.replace(/^\.\//, ""); }
    const grp = {}, files = {};
    for (const [n, v] of Object.entries(by)) { const f = o[n] || "?"; const d = f.split("/").slice(0, f.startsWith("arch") || f.startsWith("drivers") || f.startsWith("net") || f.startsWith("fs") ? 3 : 1).join("/").replace(/\.o$/, ""); grp[d] = (grp[d] || 0) + v; files[f] = (files[f] || 0) + v; }
    console.log("kernel by directory: " + Object.entries(grp).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([d, v]) => `${d} ${pct(v, total)}`).join(", "));
    console.log("kernel by file: " + Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([d, v]) => `${d.replace(/\.o$/, "")} ${pct(v, total)}`).join(", "));
  }
  const all = c.SAMPLES_USER + c.SAMPLES_KERNEL + c.SAMPLES_KERNEL_OUTSIDE;
  console.log(`kernel functions (samples of ${total} kernel, ${all} all; % of all instructions; outside kernel text ${c.SAMPLES_KERNEL_OUTSIDE}):`);
  for (const [n, v] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 40))) console.log(`  ${n.padEnd(36)} ${String(v).padStart(8)} ${pct(v, total).padStart(6)} of kernel ${pct(v, all).padStart(6)} of all`);
}
