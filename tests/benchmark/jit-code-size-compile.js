#!/usr/bin/env node

// Instantiate captured JIT modules without running a guest or the code generator.
// Use a fresh process per sample; --no-wasm-lazy-compilation also measures eager
// compilation of function bodies. MODULE_DIR in the corpus runner writes inputs.
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const directory = process.argv[2];
const modules = fs.readdirSync(directory).sort().map(file => fs.readFileSync(`${directory}/${file}`));
const memory = new WebAssembly.Memory({ initial: 64 });
const imports = { e: new Proxy({ m: memory }, {
    get: (_, name) => name === "m" ? memory : () => 0,
}) };
// Eager background compilation alone does not keep Node's event loop alive.
const keep_alive = setInterval(() => {}, 1000);
try
{
    const start = performance.now();
    const usage = process.cpuUsage();
    for(const module of modules) await WebAssembly.instantiate(module, imports);
    const elapsed = performance.now() - start;
    const cpu = process.cpuUsage(usage);
    console.log(JSON.stringify({ directory, modules: modules.length,
        bytes: modules.reduce((sum, module) => sum + module.length, 0),
        milliseconds: elapsed, cpu_milliseconds: (cpu.user + cpu.system) / 1000 }));
}
finally
{
    clearInterval(keep_alive);
}
