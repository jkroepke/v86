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
// a shell loop, awk and gzip: the same work again and again, in one shell process
const LOOP_SCRIPT = "head -c 300000 /bin/busybox > /tmp/b; while :; do i=0; while [ $i -lt 3000 ]; do i=$((i+1)); done; awk 'BEGIN{for(i=0;i<30000;i++)s+=i*i%7; print s}' > /dev/null; gzip -c /tmp/b | gunzip | md5sum > /dev/null; echo tick; done";
// a generic start for the kernel modules of KJIT: processes, files over 9p, pipes, TCP over loopback
const WARM_SCRIPT = "httpd -p 127.0.0.1:8080 -h /etc; for i in 1 2 3 4 5 6 7 8; do wget -q -O /tmp/p http://127.0.0.1:8080/passwd; ls -l /usr/bin /lib > /dev/null; cat /etc/* 2>/dev/null | gzip | wc -c > /dev/null; done; find / -xdev > /tmp/b; sha256sum /tmp/b; sha256sum < /tmp/b; echo done";
const confs = () => ({
  warm: ["alpine", { args: ["/bin/sh", "-c", WARM_SCRIPT], env: [PATH], cwd: "/" }],
  nginx: ["nginx", { args: ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], env: [PATH, "NGINX_VERSION=1"], cwd: "/" }],
  spring: ["spring", O.spring],
  cpu: ["alpine", { args: ["/bin/sh", "-c", O.script || DEFAULT_SCRIPT], env: [PATH], cwd: "/" }],
  simd: ["micro", { args: ["/micro", globalThis.process?.env?.MICRO_N || "8000"], env: [PATH], cwd: "/" }],
  // a static Go binary (jkroepke/access-log-exporter, GOARCH=386): Go runtime start, then /metrics
  goapp: ["goapp", { args: ["/access-log-exporter", "--config", "/config.yaml", "--syslog.listen-address", "udp://0.0.0.0:8514"], env: [PATH], cwd: "/" }],
  glibc: ["nginx", { args: ["/bin/sh", "-c", O.script || GLIBC_SCRIPT], env: [PATH], cwd: "/" }],
  // steady state: one process runs on and prints "tick" after each piece of work
  loop: ["alpine", { args: ["/bin/sh", "-c", O.script || LOOP_SCRIPT], env: [PATH], cwd: "/" }],
});
// steady state (STEADY=1): what an application costs per request after its warm-up
const HTTP = { nginx: [80, "/", "Welcome to nginx"], goapp: [4040, "/metrics", "go_goroutines"], spring: [80, "/", "hello"] };

async function boot() {
  const e = new V86(options());
  const control = lines(e, 1);
  const con = lines(e, 0);
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  jitcfg(e);
  const t0 = performance.now();
  bootKernel(e.v86.cpu, { kernel: O.read("vmlinux"), initrd: initramfs(O.read("init")), cmdline: O.cmdline || "console=ttyS0 quiet loglevel=3" });
  e.run();
  try { await until("ready", () => control.includes("ready")); } catch (err) { console.error(con.join("\n")); throw err; }
  const ms = performance.now() - t0, instr = e.v86.cpu.instruction_counter[0];
  await e.stop();
  const state = await e.save_state();
  await e.destroy();
  return { ms, instr, state };
}

// httpGet returns the status line, or with body the whole answer.
function httpGet(e, port = 80, path = "/", body = false) {
  return new Promise((resolve) => {
    const c = e.network_adapter.connect(port);
    let got = "";
    c.on("connect", () => c.write(new TextEncoder().encode(`GET ${path} HTTP/1.0\r\nHost: x\r\n\r\n`)));
    c.on("data", (d) => { got += new TextDecoder().decode(d); if (!body && got.includes("\r\n\r\n")) { resolve(got.split("\r\n")[0]); c.close(); } });
    const fin = () => resolve(got ? (body ? got : got.split("\r\n")[0]) : null);
    c.on("close", fin);
    c.on("shutdown", fin);
    setTimeout(() => (body ? fin() : resolve(null)), body ? 20000 : 500);
  });
}

// STEADY=1: start the pod, wait until it serves, send WARM requests (or wait for WARM
// ticks of the loop), then measure REQS more: wall time, CPU time and guest instructions
// per request, and the latency of each request. PROF and GSTAT cover only that phase.
async function steady(e, wl, con, r, t0, cpu) {
  const warm = O.warm ?? 20, n = O.reqs ?? 200;
  let one;
  if (wl === "loop") {
    let seen = 0, scanned = 0;
    const count = () => { for (; scanned < con.length; scanned++) if (con[scanned] === "tick") seen++; return seen; };
    await until("tick", () => count() > 0, O.httpTimeout || 1500000);
    one = async () => { const want = count() + 1; await until("tick", () => count() >= want); };
  } else {
    const [port, path, want] = HTTP[wl];
    for (;;) {
      const s = await httpGet(e, port);
      if (s && s.startsWith("HTTP/")) break;
      if (performance.now() - t0 > (O.httpTimeout || 1500000)) throw new Error("no http");
      await sleep(wl === "spring" ? 200 : 20);
    }
    one = async () => {
      const m = await httpGet(e, port, path, true);
      if (!m || !m.includes(want)) throw new Error(`bad answer of ${path}: ` + String(m).slice(0, 200));
    };
  }
  r.up = performance.now() - t0;
  for (let k = 0; k < warm; k++) await one();
  await O.hook?.(O.round, "measure");
  if (O.gstat) cpu.wm.exports.gueststat_reset();
  const c0 = O.cpu?.() ?? 0, p0 = O.pcpu?.() ?? 0, i0 = cpu.instruction_counter[0], ts = performance.now();
  const lat = [];
  for (let k = 0; k < n; k++) { const t = performance.now(); await one(); lat.push(performance.now() - t); }
  const dt = performance.now() - ts;
  r.ss = {
    n, ms: dt / n, rps: n / dt * 1000, cpu: ((O.cpu?.() ?? 0) - c0) / n, pcpu: ((O.pcpu?.() ?? 0) - p0) / n,
    minstr: ((cpu.instruction_counter[0] - i0) >>> 0) / 1e6 / n,
    p50: pct(lat, 0.5), p90: pct(lat, 0.9), p99: pct(lat, 0.99), max: Math.max(...lat),
  };
  await O.hook?.(O.round, "measured");
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

async function pod(state, wl, rec) {
  const [img, c] = confs()[wl];
  const conf = { ...c, user: "", hostname: "bench", ip: IP, gateway: GATEWAY, stdin: false, stdinOnce: false, tty: false };
  const e = new V86(options());
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  jitcfg(e);
  const tr = performance.now();
  await e.restore_state(state);
  const restoreMs = performance.now() - tr;
  const r0 = {};
  const control = lines(e, 1);
  const con = lines(e, 0);
  const f = rootfs(img, conf);
  e.fs9p.storage = f.storage; e.fs9p.load_from_json(f.json);
  const cpu = e.v86.cpu;
  if (rec) { e.jit_record_start(); cpu.set_jit_config(4, rec.threshold); }
  if (O.kjit) { const t = performance.now(); r0.imported = e.jit_import(O.kjit); r0.importMs = performance.now() - t; }
  if (O.stats) cpu.wm.exports.profiler_init();
  if (O.gstat) cpu.wm.exports.gueststat_reset();
  const i0 = cpu.instruction_counter[0];
  const c0 = O.cpu?.() ?? 0;
  const t0 = performance.now();
  e.run();
  e.serial_send_bytes(1, new TextEncoder().encode(`go ${Date.now()} ${"ab".repeat(32)}\n`));
  await until("started", () => control.includes("started") || control.some((l) => l.startsWith("exit")));
  const r = { ...r0, started: performance.now() - t0, restore: restoreMs };
  try {
    if (O.steady) {
      await steady(e, wl, con, r, t0, cpu);
    } else if (wl === "nginx" || wl === "spring" || wl === "goapp") {
      const port = wl === "goapp" ? 4040 : 80;
      for (;;) {
        const s = await httpGet(e, port);
        if (s && s.startsWith("HTTP/")) break;
        if (performance.now() - t0 > (O.httpTimeout || 1500000)) throw new Error("no http");
        await sleep(wl === "spring" ? 200 : 20);
      }
      if (wl === "goapp") {
        // steady state: scrape /metrics back to back, like Prometheus
        r.up = performance.now() - t0;
        const n = O.scrapes ?? 20, ts = performance.now();
        for (let k = 0; k < n; k++) {
          const m = await httpGet(e, port, "/metrics", true);
          if (!m || !m.includes("go_goroutines")) throw new Error("bad /metrics: " + String(m).slice(0, 200));
        }
        r.scrape = (performance.now() - ts) / n;
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
  if (O.idleMs) {
    // the pod has nothing to do: what do its timers cost?
    await sleep(500);
    if (O.gstat) cpu.wm.exports.gueststat_reset();
    const c1 = O.cpu?.() ?? 0, i1 = cpu.instruction_counter[0], t1 = performance.now();
    await sleep(O.idleMs);
    const dt = (performance.now() - t1) / 1000;
    r.idleCpu = ((O.cpu?.() ?? 0) - c1) / dt;
    r.idleInstr = ((cpu.instruction_counter[0] - i1) >>> 0) / dt;
  }
  if (O.gstat) {
    // counters of src/rust/gueststat.rs; the arrays as [index, value] pairs
    const g = cpu.wm.exports.gueststat_get;
    const arr = (kind, n) => { const out = []; for (let i = 0; i < n; i++) { const v = g(kind, i); if (v) out.push([i, v]); } return out; };
    O.gstatOut({ names: O.gstat, counters: O.gstat.map((_, i) => g(0, i)), vectors: arr(1, 256), syscalls: arr(2, 512), syscallInstr: arr(3, 512), portReads: arr(4, 65536), portWrites: arr(5, 65536), khist: arr(6, 1 << 20), uhist: arr(7, 1 << 20), wallMs: r.done, cpuMs: r.cpu });
  }
  if (rec) rec.out = e.jit_export();
  await e.destroy();
  return r;
}


export async function run(o) {
  O = o; ({ V86, initramfs, bootKernel, Tree, LayerStorage, modes } = o.mods);
  const log = o.log;
  const b = o.state ? { ms: 0, instr: 0, state: o.state } : await boot();
  if (o.onState) o.onState(b.state);
  log(`boot ready ${b.ms.toFixed(0)} ms ${(b.instr / 1e6).toFixed(1)}M instr`);
  if (o.kjitThreshold || o.kjitBlob) {
    // kernel modules: recorded in one start with a low JIT threshold (or read from a file),
    // compiled once, installed in every round (jit_export, V86.jit_prepare, jit_import)
    let blob = o.kjitBlob;
    if (!blob) {
      const rec = { threshold: o.kjitThreshold };
      await pod(b.state, o.kjitWorkload || o.workload, rec);
      blob = rec.out;
      o.onKjit?.(blob);
    }
    const t = performance.now();
    O.kjit = await V86.jit_prepare(blob);
    log(`kjit: ${O.kjit.modules.length} kernel modules, ${(blob.byteLength / 1024).toFixed(0)} KiB, prepared in ${(performance.now() - t).toFixed(0)} ms`);
  }
  const res = [];
  for (let i = 0; i < o.rounds; i++) {
    await o.hook?.(i, "start");
    // o.pcpu: CPU time of all threads. V8 compiles wasm on background threads, and a compile
    // that a round started may end in the next one: compare medians of several rounds.
    const p0 = o.pcpu?.() ?? 0;
    O.round = i;
    const r = await pod(b.state, o.workload);
    r.pcpu = (o.pcpu?.() ?? 0) - p0;
    await o.hook?.(i, "end");
    res.push(r);
    if (r.ss) {
      const s = r.ss;
      log(`${o.workload} steady ${i}: ${s.n} requests after ${O.warm ?? 20}, up ${r.up.toFixed(0)} ms: ${s.ms.toFixed(2)} ms/req (${s.rps.toFixed(1)}/s), cpu ${s.cpu.toFixed(2)} ms/req${o.pcpu ? `, process cpu ${s.pcpu.toFixed(2)} ms/req` : ""}, ${s.minstr.toFixed(3)}M instr/req, latency p50 ${s.p50.toFixed(2)} p90 ${s.p90.toFixed(2)} p99 ${s.p99.toFixed(2)} max ${s.max.toFixed(2)} ms`);
      continue;
    }
    log(`${o.workload} round ${i}: restore ${r.restore.toFixed(0)} ms, started ${r.started.toFixed(0)} ms, done ${r.done.toFixed(0)} ms, cpu ${r.cpu.toFixed(0)} ms${r.imported !== undefined ? `, imported ${r.imported} in ${r.importMs.toFixed(1)} ms` : ""}${o.pcpu ? `, process cpu ${r.pcpu.toFixed(0)} ms` : ""}, ${r.minstr.toFixed(1)}M instr, ${(r.minstr / r.done * 1000).toFixed(1)}M instr/s${O.idleMs ? `, idle: cpu ${r.idleCpu.toFixed(1)} ms/s, ${(r.idleInstr / 1000).toFixed(0)}k instr/s` : ""}${r.up ? `, up ${r.up.toFixed(0)} ms, scrape ${r.scrape.toFixed(1)} ms` : ""}`);
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  if (res.length && res[0].ss) {
    const m = (k) => med(res.map((r) => r.ss[k]));
    log(`MEDIAN ${o.workload} steady: ${m("ms").toFixed(2)} ms/req, cpu ${m("cpu").toFixed(2)} ms/req${o.pcpu ? `, process cpu ${m("pcpu").toFixed(2)} ms/req` : ""}, ${m("minstr").toFixed(3)}M instr/req, p50 ${m("p50").toFixed(2)} p99 ${m("p99").toFixed(2)} ms`);
    return res;
  }
  if (res.length)   log(`MEDIAN ${o.workload}: done ${med(res.map((r) => r.done)).toFixed(0)} ms, cpu ${med(res.map((r) => r.cpu)).toFixed(0)} ms${o.pcpu ? `, process cpu ${med(res.map((r) => r.pcpu)).toFixed(0)} ms` : ""}, started ${med(res.map((r) => r.started)).toFixed(0)} ms, ${med(res.map((r) => r.minstr)).toFixed(1)}M instr, ${med(res.map((r) => r.minstr / r.done * 1000)).toFixed(1)} Mips${res[0].up ? `, up ${med(res.map((r) => r.up)).toFixed(0)} ms, scrape ${med(res.map((r) => r.scrape)).toFixed(1)} ms` : ""}`);
  return res;
}
