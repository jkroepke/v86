#!/usr/bin/env node

// Build: nasm tests/benchmark/jit-flags.asm -o build/jit-flags.bin
// Pass multiple wasm builds to alternate their measurements in one process.
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { setImmediate as set_immediate } from "node:timers/promises";
import { V86 } from "../../src/main.js";

const stat_source = fs.readFileSync("src/rust/profiler.rs", "utf8");
const stats = stat_source.match(/pub enum stat \{([\s\S]*?)\}/)[1].match(/\b[A-Z][A-Z0-9_]+\b/g);
const wasm_paths = process.argv.slice(2);
if(!wasm_paths.length) wasm_paths.push("build/v86.wasm");
const builds = [];
for(const wasm_path of wasm_paths)
{
    const emulator = new V86({
        autostart: false,
        memory_size: 2 * 1024 * 1024,
        wasm_path,
        log_level: 0,
    });
    await new Promise(resolve => emulator.add_listener("emulator-loaded", resolve));
    const cpu = emulator.v86.cpu;
    cpu.is_32[0] = cpu.stack_size_32[0] = 1;
    cpu.segment_offsets[5] = 0x8000;
    cpu.segment_is_null[5] = 0;
    cpu.mem8.set(fs.readFileSync("build/jit-flags.bin"), 0x1000);
    cpu.update_state_flags();
    const build = { emulator, cpu, wasm_path, times: [], cpu_times: [], compiled_bytes: 0 };
    cpu.test_hook_did_generate_wasm = code => build.compiled_bytes += code.length;
    builds.push(build);
}

for(let run = 0; run < 6; run++)
{
    // Alternate the order as well as the builds, to reduce timing drift.
    for(const build of run % 2 ? [...builds].reverse() : builds)
    {
        const { cpu } = build;
        cpu.instruction_pointer[0] = 0x1000;
        cpu.in_hlt[0] = 0;
        cpu.reg32.fill(0);
        cpu.wm.exports.profiler_init();
        const cpu_start = process.cpuUsage();
        const start = performance.now();
        while(!cpu.in_hlt[0])
        {
            cpu.main_loop();
            await set_immediate();
        }
        const elapsed = performance.now() - start;
        if(run)
        {
            const usage = process.cpuUsage(cpu_start);
            build.times.push(elapsed);
            build.cpu_times.push((usage.user + usage.system) / 1000);
        }
    }
}

for(const { emulator, cpu, wasm_path, times, cpu_times, compiled_bytes } of builds)
{
    console.log(JSON.stringify({
        wasm_path,
        node: process.version,
        milliseconds: times,
        median_ms: [...times].sort((a, b) => a - b)[2],
        cpu_milliseconds: cpu_times,
        median_cpu_ms: [...cpu_times].sort((a, b) => a - b)[2],
        instructions: cpu.instruction_counter[0] / 6,
        compiled_bytes,
        stats: Object.fromEntries(stats.map((name, i) => [name, cpu.wm.exports.profiler_stat_get(i)])
            .filter(([name]) => /CONDITION|SEG_OFFSET.*GS/.test(name))),
        conditions: cpu.wm.exports.profiler_condition_get ? Array.from({ length: 9 }, (_, previous) =>
            Array.from({ length: 16 }, (_, condition) => cpu.wm.exports.profiler_condition_get(previous, condition))) : [],
    }));
    await emulator.destroy();
}
