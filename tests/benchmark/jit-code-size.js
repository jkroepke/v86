#!/usr/bin/env node

// Run each build in a fresh process to avoid sharing V8's compiled-module cache.
import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { V86 } from "../../src/main.js";

const wasm_path = process.argv[2] || "build/v86.wasm";
const stat_source = fs.readFileSync("src/rust/profiler.rs", "utf8");
const stat_names = stat_source.match(/pub enum stat \{([\s\S]*?)\}/)[1].match(/\b[A-Z][A-Z0-9_]+\b/g);
const emulator = new V86({
    wasm_path,
    bios: { url: "bios/seabios.bin" },
    vga_bios: { url: "bios/vgabios.bin" },
    bzimage: { url: "images/buildroot-bzimage68.bin" },
    cmdline: "console=ttyS0 audit=0",
    memory_size: 128 * 1024 * 1024,
    filesystem: {},
    autostart: false,
    log_level: 0,
});
await new Promise(resolve => emulator.add_listener("emulator-loaded", resolve));
const cpu = emulator.v86.cpu;
const pending = new Map();
const modules = [];
let compile_ms = 0;
let generated_bytes = 0;
const finalize = cpu.codegen_finalize;
cpu.codegen_finalize = function(index, start, flags, ptr, len)
{
    generated_bytes += len;
    if(process.env.MODULE_DIR)
    {
        fs.mkdirSync(process.env.MODULE_DIR, { recursive: true });
        fs.writeFileSync(`${process.env.MODULE_DIR}/${modules.length}.wasm`,
            new Uint8Array(cpu.wasm_memory.buffer, ptr, len));
    }
    modules.push(len);
    pending.set(index, performance.now());
    return finalize.call(this, index, start, flags, ptr, len);
};
const finished = cpu.codegen_finalize_finished;
cpu.codegen_finalize_finished = function(index, start, flags)
{
    compile_ms += performance.now() - pending.get(index);
    pending.delete(index);
    return finished(index, start, flags);
};
cpu.wm.exports.profiler_init();

function snapshot()
{
    const stats = Object.fromEntries(stat_names.map((name, i) => [name, cpu.wm.exports.profiler_stat_get(i)])
        .filter(([name]) => name.startsWith("COMPILE")));
    return { elapsed_ms: performance.now(), compile_ms, generated_bytes, modules: modules.length, stats };
}
function delta(before, after)
{
    return Object.fromEntries(Object.keys(after).map(key => [key,
        typeof after[key] === "number" ? after[key] - before[key] : delta(before[key], after[key])]));
}

const results = [];
let line = "";
let started = false;
let phase_start;
const boot_start = snapshot();
const cpu_command = "lua -e 'local x=1; for i=1,3000000 do x=(x*1664525+1013904223)%4294967296 end; assert(x==3644761281)'";
const start_command = "(bench_status=0; for i in $(seq 1 30); do /bin/busybox sha256sum /bin/busybox >/dev/null || bench_status=$?; done; test $bench_status = 0)";
const phases = [{ name: "warmup", command: `${cpu_command} && ${start_command}` }];
for(let i = 0; i < 5; i++)
{
    phases.push({ name: "cpu", command: cpu_command }, { name: "program_start", command: start_command });
}
let phase = 0;

function next()
{
    // Split the marker in the echoed command so only its output can match.
    emulator.serial0_send(`echo V86_BEGIN''; ${phases[phase].command}; echo V86_END''_$?\n`);
}

const timeout = setTimeout(() => { throw new Error("Linux benchmark timed out: " + line); }, 180000);
emulator.add_listener("serial0-output-byte", async byte => {
    const chr = String.fromCharCode(byte);
    if(process.env.SERIAL) process.stderr.write(chr);
    if(chr === "\r") return;
    if(chr === "\n")
    {
        if(line === "V86_BEGIN") phase_start = snapshot();
        if(line.startsWith("V86_END_"))
        {
            assert.equal(line, "V86_END_0", "guest workload failed");
            results.push({ phase: phases[phase].name, ...delta(phase_start, snapshot()) });
            phase++;
            if(phase === phases.length)
            {
                clearTimeout(timeout);
                await emulator.stop();
                const total = snapshot();
                console.log(JSON.stringify({ wasm_path, node: process.version, v8: process.versions.v8,
                    results, total: delta(boot_start, total),
                    bytes_per_page: total.stats.COMPILE_PAGE ? generated_bytes / total.stats.COMPILE_PAGE : null }));
                await emulator.destroy();
                return;
            }
            next();
        }
        line = "";
    }
    else line += chr;
    if(!started && line.endsWith("~% "))
    {
        started = true;
        results.push({ phase: "boot", ...delta(boot_start, snapshot()) });
        next();
    }
});
emulator.run();
