// node server.cjs <vmdir>: serves the v86 checkout at / and <vmdir> (vmlinux, init, state.bin, kjit.bin) at /vm/
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "../../.."), vmdir = path.resolve(process.argv[2]);
const types = { ".mjs": "text/javascript", ".js": "text/javascript", ".html": "text/html", ".wasm": "application/wasm" };
http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  const p = u.startsWith("/vm/") ? path.join(vmdir, u.slice(4)) : path.join(root, u);
  fs.readFile(p, (e, d) => {
    if (e) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); s.end(d);
  });
}).listen(Number(process.env.PORT || 8077));
