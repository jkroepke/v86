// shared by bench.mjs (Node.js) and web/worker.mjs (browser)
let O, V86, initramfs, bootKernel, Tree, LayerStorage, modes;
const MEMORY = 256 << 20;
// the environment: Node.js, or globalThis.BENCH_ENV in a browser worker
const ENV = globalThis.process?.env ?? globalThis.BENCH_ENV ?? {};
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
  const byte = (b) => {
    if (b === 13) return;
    if (b !== 10) { line += String.fromCharCode(b); return; }
    got.push(line); cb?.(line); line = "";
  };
  e.add_listener(`serial${port}-output-byte`, byte);
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
  // READINTO=1: synchronous reads like the OPFS sync access handles of tabernetes (layers.js)
  if (ENV.READINTO === "1") layer.readInto = (o, dest) => { dest.set(buf.subarray(o, o + dest.length)); return dest.length; };
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
  tiny: ["alpine", { args: ["/bin/sh", "-c", O.tinyScript || "echo done"], env: [PATH], cwd: "/" }],
  cpu: ["alpine", { args: ["/bin/sh", "-c", O.script || DEFAULT_SCRIPT], env: [PATH], cwd: "/" }],
  simd: ["micro", { args: ["/micro", globalThis.process?.env?.MICRO_N || "8000"], env: [PATH], cwd: "/" }],
  // a static Go binary (jkroepke/access-log-exporter, GOARCH=386): Go runtime start, then /metrics
  goapp: ["goapp", { args: ["/access-log-exporter", "--config", "/config.yaml", "--syslog.listen-address", "udp://0.0.0.0:8514"], env: [PATH], cwd: "/" }],
  glibc: ["nginx", { args: ["/bin/sh", "-c", O.script || GLIBC_SCRIPT], env: [PATH], cwd: "/" }],
  // steady state: one process runs on and prints "tick" after each piece of work
  loop: ["alpine", { args: ["/bin/sh", "-c", O.script || LOOP_SCRIPT], env: [PATH], cwd: "/" }],
  net: ["alpine", { args: ["/bin/sh", "-c", NET_SCRIPT], env: [PATH], cwd: "/" }],
});
// net: the network adapter of v86 (fake_network.js) against busybox: httpd for small and
// large answers, an echo server and a sink for uploads
const NET_SCRIPT = "mkdir -p /w; echo hi > /w/s; dd if=/dev/urandom of=/w/big bs=1024 count=" + (ENV.NET_KB || 4096) + " 2>/dev/null; md5sum /w/big; " +
  "nc -lk -p 80 -e cat /w/big & nc -lk -p 7000 -e cat & nc -lk -p 9000 -e sh -c 'md5sum >&2' & nc -lk -p 7001 -e sh & sleep 0.5; echo netready; while :; do sleep 1000; done";
// steady state (STEADY=1): what an application costs per request after its warm-up
const HTTP = { nginx: [80, "/", "Welcome to nginx"], goapp: [4040, "/metrics", "go_goroutines"], spring: [80, "/", "ello"] };

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
  // CURVE=n: print the mean time per request of every n warm-up requests
  let tc = performance.now(), cc = O.cpu?.() ?? 0;
  for (let k = 0; k < warm; k++) {
    await one();
    if (O.curve && (k + 1) % O.curve === 0) {
      const t = performance.now(), c = O.cpu?.() ?? 0;
      O.log(`  warm-up ${k + 1}: ${((t - tc) / O.curve).toFixed(2)} ms/req, cpu ${((c - cc) / O.curve).toFixed(2)} ms/req`);
      tc = t; cc = c;
    }
  }
  await O.hook?.(O.round, "measure");
  if (O.gstat) cpu.wm.exports.gueststat_reset();
  if (O.stats) cpu.wm.exports.profiler_init();
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
// net: latency and throughput over the network adapter, like port-forward of tabernetes
async function net(e, con, r, cpu) {
  await until("netready", () => con.includes("netready"));
  const md5 = con.find((l) => l.endsWith("/w/big")).split(" ")[0];
  const crypto = await import("node:crypto");
  const nreq = Number(ENV.NET_REQS || 50);
  const meas = async (f) => {
    const c0 = O.cpu?.() ?? 0, i0 = cpu.instruction_counter[0], t = performance.now();
    const x = await f();
    return { ms: performance.now() - t, cpu: (O.cpu?.() ?? 0) - c0, minstr: ((cpu.instruction_counter[0] - i0) >>> 0) / 1e6, x };
  };
  // a request on a new connection each: connect, GET of 3 bytes, close
  const echoOnce = (e) => new Promise((resolve) => {
    const c = e.network_adapter.connect(7000); let got = "";
    c.on("connect", () => c.write(new TextEncoder().encode("hi\n")));
    c.on("data", (d) => { got += new TextDecoder().decode(d); if (got.length >= 3) { c.close(); resolve(got); } });
    c.on("close", () => resolve(got)); setTimeout(() => resolve(null), 5000);
  });
  for (let k = 0; k < 5; k++) await echoOnce(e);
  const lat = [];
  const q = await meas(async () => { for (let k = 0; k < nreq; k++) { const t = performance.now(); const m = await echoOnce(e); if (m !== "hi\n") throw new Error("bad echo " + m); lat.push(performance.now() - t); } });
  r.req = { p50: pct(lat, 0.5), p90: pct(lat, 0.9), cpu: q.cpu / nreq, minstr: q.minstr / nreq };
  // round trips of 64 bytes on one connection (echo)
  const echo = await new Promise((resolve, reject) => {
    const c = e.network_adapter.connect(7000), msg = new Uint8Array(64).fill(65), rt = [];
    let got = 0, t, n = 0, c0, i0;
    const send = () => { t = performance.now(); got = 0; c.write(msg); };
    c.on("connect", () => { c0 = O.cpu?.() ?? 0; i0 = cpu.instruction_counter[0]; send(); });
    c.on("data", (d) => { got += d.length; if (got < 64) return; rt.push(performance.now() - t); if (++n < nreq * 4) send(); else { c.close(); resolve({ p50: pct(rt.slice(5), 0.5), p90: pct(rt.slice(5), 0.9), cpu: ((O.cpu?.() ?? 0) - c0) / n, minstr: ((cpu.instruction_counter[0] - i0) >>> 0) / 1e6 / n }); } });
    c.on("close", () => reject(new Error("echo closed")));
    setTimeout(() => reject(new Error("echo timeout")), 60000);
  });
  r.echo = echo;
  // guest -> host: GET of the large file
  const kb = Number(ENV.NET_KB || 4096);
  const down = await meas(() => new Promise((resolve, reject) => {
    const c = e.network_adapter.connect(80), parts = [];
    c.on("data", (d) => parts.push(d.slice()));
    const fin = () => {
      const body = Buffer.concat(parts);
      const h = crypto.createHash("md5").update(body).digest("hex");
      if (h !== md5) reject(new Error(`download: md5 ${h} != ${md5}, ${body.length} bytes`)); else resolve(body.length);
    };
    c.on("shutdown", () => { c.close(); fin(); }); c.on("close", fin);
    setTimeout(() => reject(new Error("download timeout")), 600000);
  }));
  r.down = { mbps: kb / 1024 / (down.ms / 1000), ms: down.ms, cpu: down.cpu, minstr: down.minstr };
  // host -> guest: the same bytes to nc | md5sum
  const big = new Uint8Array(kb * 1024); crypto.randomFillSync(big);
  const want = crypto.createHash("md5").update(big).digest("hex");
  const n0 = con.length;
  const up = await meas(() => new Promise((resolve, reject) => {
    const c = e.network_adapter.connect(9000);
    c.on("connect", () => { for (let o = 0; o < big.length; o += 65536) c.write(big.subarray(o, o + 65536)); c.close(); });
    const iv = setInterval(() => { const l = con.slice(n0).find((x) => x.endsWith(" -")); if (l) { clearInterval(iv); l.startsWith(want) ? resolve() : reject(new Error("upload md5 " + l)); } }, 1);
    setTimeout(() => reject(new Error("upload timeout")), 600000);
  }));
  // the pod as a client of the fetch adapter: GET and POST through fetch() to a local server
  const http = await import("node:http");
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") { const h = crypto.createHash("md5"); let n = 0; req.on("data", (d) => { h.update(d); n += d.length; }); req.on("end", () => res.end(h.digest("hex") + " " + n + " " + req.headers["content-length"] + "\n")); }
    else res.end(big);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const sport = srv.address().port;
  const shell = (cmd) => new Promise((resolve, reject) => {
    const c = e.network_adapter.connect(7001); let out = "";
    c.on("connect", () => { c.write(new TextEncoder().encode(cmd + "; exit\n")); });
    c.on("data", (d) => { out += new TextDecoder().decode(d); });
    const fin = () => resolve(out.trim());
    c.on("shutdown", () => { c.close(); fin(); }); c.on("close", fin);
    setTimeout(() => reject(new Error("shell timeout: " + cmd)), 600000);
  });
  const fget = await meas(() => shell(`wget -q -O - http://${sport}.external/big | md5sum`));
  if (!fget.x.startsWith(want)) throw new Error("fetch GET md5 " + fget.x);
  r.fget = { mbps: kb / 1024 / (fget.ms / 1000), ms: fget.ms, cpu: fget.cpu, minstr: fget.minstr };
  // busybox wget posts the file as a C string: no NUL bytes
  const pmd5 = (await shell(`base64 /w/big | head -c ${kb * 1024} > /w/post; md5sum /w/post`)).split(" ")[0];
  const fpost = await meas(() => shell(`wget -q -O - --post-file /w/post http://${sport}.external/post`));
  if (!fpost.x.startsWith(pmd5)) throw new Error("fetch POST md5 " + fpost.x + " != " + pmd5);
  r.fpost = { mbps: kb / 1024 / (fpost.ms / 1000), ms: fpost.ms, cpu: fpost.cpu, minstr: fpost.minstr };
  srv.close();
  r.upload = { mbps: kb / 1024 / (up.ms / 1000), ms: up.ms, cpu: up.cpu, minstr: up.minstr };
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

async function pod(state, wl, rec) {
  const [img, c] = confs()[wl];
  const conf = { ...c, user: "", hostname: "bench", ip: IP, gateway: GATEWAY, stdin: false, stdinOnce: false, tty: false };
  // init of tabernetes 1.24+ (pod sandbox) reads containers and start; older ones the fields above
  conf.containers = [{ name: "c", root: "/", args: c.args, env: c.env, cwd: c.cwd, user: "", stdin: false, stdinOnce: false, tty: false, console: true }];
  conf.start = ["0"];
  const tc = performance.now();
  const e = new V86(options());
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  const ctorMs = performance.now() - tc;
  jitcfg(e);
  const tr = performance.now();
  await e.restore_state(state);
  const restoreMs = performance.now() - tr;
  const r0 = { ctor: ctorMs };
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
  await until("started", () => control.some((l) => l === "started" || l.startsWith("started ")) || control.some((l) => l.startsWith("exit")));
  const r = { ...r0, started: performance.now() - t0, restore: restoreMs };
  try {
    if (wl === "net") {
      await net(e, con, r, cpu);
    } else if (O.steady) {
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
      if (wl !== "tiny") {
      const sums = con.filter((l) => / (-|\/tmp\/b)$/.test(l)).map((l) => l.split(" ")[0]);
      if (sums.length !== 2 || sums[0] !== sums[1]) throw new Error("checksums differ: " + con.join("\n"));
      }
    }
  } catch (err) { console.error(control, con.join("\n")); throw err; }
  r.done = performance.now() - t0;
  r.cpu = (O.cpu?.() ?? 0) - c0;
  if (O.stats && cpu.wm.exports.profiler_module_entries) {
    // how many modules the entries go to: the working set of JIT code
    const e = []; for (let i = 0; i < 3000; i++) { const v = cpu.wm.exports.profiler_module_entries(i); if (v) e.push(v); }
    e.sort((a, b) => b - a); const total = e.reduce((a, b) => a + b, 0);
    const cover = (f) => { let s = 0; for (let i = 0; i < e.length; i++) { s += e[i]; if (s >= f * total) return i + 1; } return e.length; };
    O.log(`module entries ${total}: ${e.length} modules entered, 50 % in ${cover(0.5)}, 90 % in ${cover(0.9)}, 99 % in ${cover(0.99)}`);
  }
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
    O.gstatOut({ names: O.gstat, counters: O.gstat.map((_, i) => g(0, i)), vectors: arr(1, 256), syscalls: arr(2, 512), syscallInstr: arr(3, 512), portReads: arr(4, 65536), portWrites: arr(5, 65536), khist: arr(6, 1 << 20), uhist: arr(7, 1 << 20), ekeys: arr(8, 1 << 17), ecnt: arr(9, 1 << 17), stacks: (() => { const a = []; for (let i = 0; ; i++) { const v = g(10, i); if (v < 0) break; a.push(v); } return a; })(), wallMs: r.done, cpuMs: r.cpu });
  }
  if (rec) rec.out = e.jit_export(O.kjitTop);
  await e.destroy();
  return r;
}


// PREWARM=init: the "warm" command of init (tabernetes vm/init) in a VM that is thrown away
async function initWarm(state) {
  const e = new V86(options());
  await new Promise((r) => e.add_listener("emulator-loaded", r));
  await e.restore_state(state);
  if (O.kjit) e.jit_import(O.kjit);
  const control = lines(e, 1);
  const i0 = e.v86.cpu.instruction_counter[0];
  e.run();
  e.serial_send_bytes(1, new TextEncoder().encode("warm\n"));
  await until("warmed", () => control.includes("warmed"));
  const minstr = ((e.v86.cpu.instruction_counter[0] - i0) >>> 0) / 1e6;
  await e.destroy();
  return { minstr };
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
    if (o.kjitWarm) {
      // like warm() of tabernetes web/src/jit.js: V8 tiers the modules up before the first pod
      const t = performance.now(), memory = new WebAssembly.Memory({ initial: 512 });
      const stop = () => { throw new Error("stop"); };
      const e = new Proxy({}, { get: (_, k) => (k === "m" ? memory : stop) });
      for (const m of O.kjit.modules) {
        try { const f = new WebAssembly.Instance(m.module, { e }).exports.f; for (let i = 0; i < o.kjitWarm; i++) f(0); } catch {}
      }
      log(`kjit: warmed with ${o.kjitWarm} calls each in ${(performance.now() - t).toFixed(0)} ms`);
      await sleep(Number(ENV.KJIT_WARM_WAIT ?? 1000)); // TurboFan runs on other threads
    }
    log(`kjit: ${O.kjit.modules.length} kernel modules, ${(blob.byteLength / 1024).toFixed(0)} KiB, prepared in ${(performance.now() - t).toFixed(0)} ms`);
  }
  if (o.prewarm) {
    // PREWARM=<workload>: one start before the rounds, then a pause: what does warm code of v86.wasm give the first round?
    const t = performance.now(), c = o.cpu?.() ?? 0;
    const r = o.prewarm === "init" ? await initWarm(b.state) : await pod(b.state, o.prewarm);
    log(`prewarm ${o.prewarm}: ${(performance.now() - t).toFixed(0)} ms, cpu ${((o.cpu?.() ?? 0) - c).toFixed(0)} ms, ${r.minstr.toFixed(1)}M instr`);
    await sleep(o.prewarmSleep ?? 1500);
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
    if (r.req) {
      const f = (x) => x.toFixed(2);
      log(`net ${i}: request p50 ${f(r.req.p50)} p90 ${f(r.req.p90)} ms cpu ${f(r.req.cpu)} ms ${f(r.req.minstr)}M | echo p50 ${f(r.echo.p50)} p90 ${f(r.echo.p90)} ms cpu ${f(r.echo.cpu)} ms ${(r.echo.minstr*1000).toFixed(0)}k | down ${f(r.down.mbps)} MB/s cpu ${r.down.cpu.toFixed(0)} ms ${r.down.minstr.toFixed(0)}M | up ${f(r.upload.mbps)} MB/s cpu ${r.upload.cpu.toFixed(0)} ms ${r.upload.minstr.toFixed(0)}M | fetch get ${f(r.fget.mbps)} MB/s ${r.fget.minstr.toFixed(0)}M post ${f(r.fpost.mbps)} MB/s ${r.fpost.minstr.toFixed(0)}M`);
    }
    if (r.ss) {
      const s = r.ss;
      log(`${o.workload} steady ${i}: ${s.n} requests after ${O.warm ?? 20}, up ${r.up.toFixed(0)} ms: ${s.ms.toFixed(2)} ms/req (${s.rps.toFixed(1)}/s), cpu ${s.cpu.toFixed(2)} ms/req${o.pcpu ? `, process cpu ${s.pcpu.toFixed(2)} ms/req` : ""}, ${s.minstr.toFixed(3)}M instr/req, latency p50 ${s.p50.toFixed(2)} p90 ${s.p90.toFixed(2)} p99 ${s.p99.toFixed(2)} max ${s.max.toFixed(2)} ms`);
      continue;
    }
    log(`${o.workload} round ${i}: ctor ${r.ctor.toFixed(0)} ms, restore ${r.restore.toFixed(0)} ms, started ${r.started.toFixed(0)} ms, done ${r.done.toFixed(0)} ms, cpu ${r.cpu.toFixed(0)} ms${r.imported !== undefined ? `, imported ${r.imported} in ${r.importMs.toFixed(1)} ms` : ""}${o.pcpu ? `, process cpu ${r.pcpu.toFixed(0)} ms` : ""}, ${r.minstr.toFixed(1)}M instr, ${(r.minstr / r.done * 1000).toFixed(1)}M instr/s${O.idleMs ? `, idle: cpu ${r.idleCpu.toFixed(1)} ms/s, ${(r.idleInstr / 1000).toFixed(0)}k instr/s` : ""}${r.up ? `, up ${r.up.toFixed(0)} ms, scrape ${r.scrape.toFixed(1)} ms` : ""}`);
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
