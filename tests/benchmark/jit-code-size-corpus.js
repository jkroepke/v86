#!/usr/bin/env node

// Recompile captured Linux code pages with identical input and entry points.
// Needs a debug core, which exports jit_force_generate_unsafe. Pages are only
// compiled here; the Linux workload itself is timed with the release core.
import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { V86 } from "../../src/main.js";

const [wasm_path = "build/v86-debug.wasm", directory = "build/jit-code-size-corpus"] = process.argv.slice(2);
const pages = JSON.parse(fs.readFileSync(`${directory}/pages.json`, "utf8"));
const emulator = new V86({ wasm_path, memory_size: 2 << 20, autostart: false, log_level: 0 });
await new Promise(resolve => emulator.add_listener("emulator-loaded", resolve));
const cpu = emulator.v86.cpu;
assert(cpu.jit_force_generate_unsafe, "use a debug core");
cpu.set_jit_config(1, 1);
const base = 0x10000;
const results = [];
for(const { file, flags, entry_offset } of pages)
{
    cpu.jit_clear_cache();
    cpu.mem8.set(fs.readFileSync(`${directory}/${file}`), base);
    cpu.is_32[0] = flags & 1;
    cpu.stack_size_32[0] = flags >> 1 & 1;
    cpu.cpl[0] = flags & 4 ? 3 : 0;
    cpu.segment_offsets.fill(0);
    cpu.segment_is_null.fill(0);
    cpu.segment_is_null[3] = flags & 8 ? 0 : 1;
    cpu.update_state_flags();
    cpu.instruction_pointer[0] = base + entry_offset;
    let bytes, compile_start;
    cpu.test_hook_did_generate_wasm = code => {
        bytes = code.length;
        if(process.env.MODULE_DIR)
        {
            fs.mkdirSync(process.env.MODULE_DIR, { recursive: true });
            fs.writeFileSync(`${process.env.MODULE_DIR}/${file}.wasm`, code);
        }
        compile_start = performance.now();
    };
    const finished = new Promise(resolve => cpu.test_hook_did_finalize_wasm = resolve);
    const start = performance.now();
    cpu.jit_force_generate(base + entry_offset);
    const codegen_ms = performance.now() - start;
    await finished;
    results.push({ file, bytes, codegen_ms, compile_ms: performance.now() - compile_start });
}
console.log(JSON.stringify({ wasm_path, node: process.version, pages: pages.length,
    bytes: results.reduce((sum, r) => sum + r.bytes, 0),
    bytes_per_page: results.reduce((sum, r) => sum + r.bytes, 0) / pages.length,
    codegen_ms: results.reduce((sum, r) => sum + r.codegen_ms, 0),
    compile_ms: results.reduce((sum, r) => sum + r.compile_ms, 0), results }));
await emulator.destroy();
