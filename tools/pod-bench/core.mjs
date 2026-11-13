// shared by bench.mjs (Node.js) and web/worker.mjs (browser)
let O, V86, initramfs, bootKernel, Tree, LayerStorage, modes;
const MEMORY = 256 << 20;
const IP = "192.168.86.100", GATEWAY = "192.168.86.1";
const path = { join: (a, b) => a + "/" + b };
function options() {
  return {
    ...(O.module ? { wasm_fn: (env) => WebAssembly.instantiate(O.module, env).then((i) => i.exports) } : {}),
    wasm_path: path.join(O.v86dir, "v86.wasm"), filesystem: {}, memory_size: MEMORY, uart1: true, autostart: false,
    disable_keyboard: true, disable_mouse: true, disable_speaker: true, vga_memory_size: 256 << 10,
    preserve_mac_from_state_image: true,
    net_device: { type: "virtio", relay_url: "fetch", vm_ip: IP, router_ip: GATEWAY },
    ...(O.v86opts || {}),
  };
}
function jitcfg(e) {
  for (const kv of (O.cpuhide || "").split(",").filter(Boolean)) { const [k, v] = kv.split("=").map(Number); e.v86.cpu.wm.exports.set_cpuid_hidden(k, v); }
  for (const kv of (O.jitcfg || "").split(",").filter(Boolean)) { const [k, v] = kv.split("=").map(Number); e.v86.cpu.set_jit_config(k, v); }
}
function lines(e, port, cb) {
  const got = []; let line = "";
  e.add_listener(`serial${port}-output-byte`, (b) => {
    if (b === 13) return;
    if (b !== 10) { line += String.fromCharCode(b); return; }
    got.push(line); cb?.(line); line = "";
  });
  return got;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, pred, ms = 120_000) {
  const t = Date.now();
  while (!pred()) { if (Date.now() - t > ms) throw new Error(`timeout: ${what}`); await sleep(2); }
}

// tar -> entries of layers.js
function tarEntries(buf) {
  const out = []; let off = 0; let longName = null;
  const str = (o, n) => { let s = ""; for (let i = 0; i < n && buf[o + i]; i++) s += String.fromCharCode(buf[o + i]); return s; };
  const oct = (o, n) => parseInt(str(o, n).trim() || "0", 8);
  while (off + 512 <= buf.length) {
    if (buf[off] === 0) break;
    let name = str(off, 100); const prefix = str(off + 345, 155);
    if (prefix) name = prefix + "/" + name;
    const size = oct(off + 124, 12), type = String.fromCharCode(buf[off + 156] || 48);
    const data = off + 512;
    if (type === "L") { longName = str(data, size); off = data + Math.ceil(size / 512) * 512; continue; }
    if (type === "x" || type === "g") {
      const pax = new TextDecoder().decode(buf.subarray(data, data + size));
      for (const l of pax.split("\n")) { const m = l.match(/^\d+ path=(.*)$/); if (m) longName = m[1]; }
      off = data + Math.ceil(size / 512) * 512; continue;
    }
    if (longName) { name = longName; longName = null; }
    out.push([name, type, oct(off + 100, 8) & 0o7777, oct(off + 108, 8), oct(off + 116, 8), oct(off + 136, 12), size, data, str(off + 157, 100)]);
    off = data + Math.ceil(size / 512) * 512;
  }
  return out;
}
const images = {};
function image(name) {
  if (!images[name]) {
    const buf = new Uint8Array(O.read(`${name}.tar`));
    images[name] = { buf, entries: tarEntries(buf) };
  }
  return images[name];
}
function rootfs(img, conf) {
  const { buf, entries } = image(img);
  const tree = new Tree(); tree.layer = 0; tree.addLayer("L", entries); tree.layer = 1;
  const now = Math.floor(Date.now() / 1000), enc = new TextEncoder(), mem = new Map();
  const extra = {
    ".tabernetes/config.json": enc.encode(JSON.stringify(conf)),
    "etc/hosts": enc.encode(`127.0.0.1\tlocalhost\n${IP}\tbench\n`),
    "etc/resolv.conf": enc.encode(`nameserver ${GATEWAY}\n`),
  };
  for (const [p, d] of Object.entries(extra)) { const k = `mem:${mem.size}`; mem.set(k, d); tree.set(p, { uid: 0, gid: 0, mtime: now, mode: modes.S_IFREG | 0o644, size: d.length, key: k }); }
  for (const d of ["dev", "proc", "sys", "tmp"]) if (!tree.files.has(d)) tree.set(d, { uid: 0, gid: 0, mtime: now, mode: modes.S_IFDIR | 0o1777 });
  const layer = { read: async (o, n) => buf.subarray(o, o + n) };
  return { json: tree.v86(), storage: new LayerStorage(new Map([["L", layer]]), mem) };
}

const PATH = "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const DEFAULT_SCRIPT = "i=0; while [ $i -lt 30000 ]; do i=$((i+1)); done; cat /bin/busybox /bin/busybox /bin/busybox /bin/busybox > /tmp/b; gzip -c /tmp/b > /tmp/b.gz; gunzip -c /tmp/b.gz | sha256sum; sha256sum /tmp/b; echo done";
// text tools of Debian (glibc i386 uses its SSE2 string functions: memchr, strlen, memcmp, ...)
const GLIBC_SCRIPT = "find / -xdev -name '*.pm' | xargs cat > /tmp/a; cat /tmp/a /tmp/a /tmp/a /tmp/a > /tmp/b; grep -c sub /tmp/b; grep -ci 'return undef' /tmp/b; sort /tmp/b | uniq | wc -l; tr a-z A-Z < /tmp/b | grep -c SUB; sed 's/my /our /g' /tmp/b | wc -c; awk '{n+=length($0)} END {print n}' /tmp/b; cut -c1-20 /tmp/b | sort -u | wc -l; cmp /tmp/b /tmp/b; sha256sum /tmp/b; sha256sum < /tmp/b; echo done";
const confs = () => ({
  nginx: ["nginx", { args: ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], env: [PATH, "NGINX_VERSION=1"], cwd: "/" }],
  spring: ["spring", O.spring],
  cpu: ["alpine", { args: ["/bin/sh", "-c", O.script || DEFAULT_SCRIPT], env: [PATH], cwd: "/" }],
  simd: ["micro", { args: ["/micro", globalThis.process?.env?.MICRO_N || "8000"], env: [PATH], cwd: "/" }],
  glibc: ["nginx", { args: ["/bin/sh", "-c", O.script || GLIBC_SCRIPT], env: [PATH], cwd: "/" }],
});

async function boot() {
  const e = new V86(options());
  const control = lines(e, 1);
  const con = lines(e, 0);
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  jitcfg(e);
  const t0 = performance.now();
  bootKernel(e.v86.cpu, { kernel: O.read("vmlinux"), initrd: initramfs(O.read("init")), cmdline: "console=ttyS0 quiet loglevel=3" });
  e.run();
  try { await until("ready", () => control.includes("ready")); } catch (err) { console.error(con.join("\n")); throw err; }
  const ms = performance.now() - t0, instr = e.v86.cpu.instruction_counter[0];
  await e.stop();
  const state = await e.save_state();
  await e.destroy();
  return { ms, instr, state };
}

function httpGet(e) {
  return new Promise((resolve) => {
    const c = e.network_adapter.connect(80);
    let got = "";
    c.on("connect", () => c.write(new TextEncoder().encode("GET / HTTP/1.0\r\nHost: x\r\n\r\n")));
    c.on("data", (d) => { got += new TextDecoder().decode(d); if (got.includes("\r\n\r\n")) { resolve(got.split("\r\n")[0]); c.close(); } });
    c.on("close", () => resolve(got ? got.split("\r\n")[0] : null));
    c.on("shutdown", () => resolve(got ? got.split("\r\n")[0] : null));
    setTimeout(() => resolve(null), 500);
  });
}

async function pod(state, wl) {
  const [img, c] = confs()[wl];
  const conf = { ...c, user: "", hostname: "bench", ip: IP, gateway: GATEWAY, stdin: false, stdinOnce: false, tty: false };
  const e = new V86(options());
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  jitcfg(e);
  const tr = performance.now();
  await e.restore_state(state);
  const restoreMs = performance.now() - tr;
  const control = lines(e, 1);
  const con = lines(e, 0);
  const f = rootfs(img, conf);
  e.fs9p.storage = f.storage; e.fs9p.load_from_json(f.json);
  const cpu = e.v86.cpu;
  if (O.stats) cpu.wm.exports.profiler_init();
  const i0 = cpu.instruction_counter[0];
  const c0 = O.cpu?.() ?? 0;
  const t0 = performance.now();
  e.run();
  e.serial_send_bytes(1, new TextEncoder().encode(`go ${Date.now()} ${"ab".repeat(32)}\n`));
  await until("started", () => control.includes("started") || control.some((l) => l.startsWith("exit")));
  const r = { started: performance.now() - t0, restore: restoreMs };
  try {
    if (wl === "nginx" || wl === "spring") {
      for (;;) {
        const s = await httpGet(e);
        if (s && s.startsWith("HTTP/")) break;
        if (performance.now() - t0 > 600000) throw new Error("no http");
        await sleep(wl === "spring" ? 200 : 20);
      }
    } else {
      await until("exit", () => control.some((l) => l.startsWith("exit")));
      if (!con.some((l) => l.includes("done"))) throw new Error("cpu workload failed: " + con.join("\n"));
      const sums = con.filter((l) => / (-|\/tmp\/b)$/.test(l)).map((l) => l.split(" ")[0]);
      if (sums.length !== 2 || sums[0] !== sums[1]) throw new Error("checksums differ: " + con.join("\n"));
    }
  } catch (err) { console.error(control, con.join("\n")); throw err; }
  r.done = performance.now() - t0;
  r.cpu = (O.cpu?.() ?? 0) - c0;
  if (O.stats) { const out = []; O.stats.forEach((n, i) => { const v = cpu.wm.exports.profiler_stat_get(i); if (v) out.push(`${n}=${v}`); }); O.log(out.join("\n")); }
  r.minstr = ((cpu.instruction_counter[0] - i0) >>> 0) / 1e6;
  await e.destroy();
  return r;
}


export async function run(o) {
  O = o; ({ V86, initramfs, bootKernel, Tree, LayerStorage, modes } = o.mods);
  const log = o.log;
  const b = o.state ? { ms: 0, instr: 0, state: o.state } : await boot();
  if (o.onState) o.onState(b.state);
  log(`boot ready ${b.ms.toFixed(0)} ms ${(b.instr / 1e6).toFixed(1)}M instr`);
  const res = [];
  for (let i = 0; i < o.rounds; i++) {
    await o.hook?.(i, "start");
    const r = await pod(b.state, o.workload);
    await o.hook?.(i, "end");
    res.push(r);
    log(`${o.workload} round ${i}: restore ${r.restore.toFixed(0)} ms, started ${r.started.toFixed(0)} ms, done ${r.done.toFixed(0)} ms, cpu ${r.cpu.toFixed(0)} ms, ${r.minstr.toFixed(1)}M instr, ${(r.minstr / r.done * 1000).toFixed(1)}M instr/s`);
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  if (res.length)   log(`MEDIAN ${o.workload}: done ${med(res.map((r) => r.done)).toFixed(0)} ms, cpu ${med(res.map((r) => r.cpu)).toFixed(0)} ms, started ${med(res.map((r) => r.started)).toFixed(0)} ms, ${med(res.map((r) => r.minstr)).toFixed(1)}M instr, ${med(res.map((r) => r.minstr / r.done * 1000)).toFixed(1)} Mips`);
  return res;
}
