#!/usr/bin/env node

import assert from "node:assert/strict";
import { V86 } from "../../src/main.js";

async function run(code, setup, check)
{
    const emulator = new V86({ autostart: false, memory_size: 2 * 1024 * 1024, log_level: 0 });
    await new Promise(resolve => emulator.add_listener("emulator-loaded", resolve));
    const cpu = emulator.v86.cpu;
    cpu.is_32[0] = cpu.stack_size_32[0] = 1;
    cpu.mem8.set(code, 0x1000);
    cpu.instruction_pointer[0] = 0x1000;
    setup(cpu, emulator);
    cpu.update_state_flags();
    await new Promise(resolve => {
        cpu.test_hook_did_finalize_wasm = resolve;
        cpu.jit_force_generate(0x1000);
    });
    for(let cycles = 0; !cpu.in_hlt[0] && cycles < 100; cycles++) cpu.main_loop();
    assert(cpu.in_hlt[0], "guest must finish");
    check(cpu);
    await emulator.destroy();
}

// mov ax, 0x800; mov gs, ax; mov ebx, [gs:0]; mov ecx, [gs:4]
// mov ax, 0x900; mov gs, ax; mov edx, [gs:0]; mov esi, [gs:4]
// mov ax, 0; mov gs, ax; mov edi, [gs:0]; hlt
await run(new Uint8Array([
    0x66, 0xB8, 0, 8, 0x8E, 0xE8, 0x65, 0x8B, 0x1D, 0, 0, 0, 0,
    0x65, 0x8B, 0x0D, 4, 0, 0, 0,
    0x66, 0xB8, 0, 9, 0x8E, 0xE8, 0x65, 0x8B, 0x15, 0, 0, 0, 0,
    0x65, 0x8B, 0x35, 4, 0, 0, 0,
    0x66, 0xB8, 0, 0, 0x8E, 0xE8, 0x65, 0x8B, 0x3D, 0, 0, 0, 0, 0xF4,
]), cpu => {
    cpu.mem32s[0] = 0x11223344;
    cpu.mem32s[0x8000 >> 2] = 11;
    cpu.mem32s[0x8004 >> 2] = 12;
    cpu.mem32s[0x9000 >> 2] = 21;
    cpu.mem32s[0x9004 >> 2] = 22;
}, cpu => {
    assert.equal(cpu.reg32[3], 11);
    assert.equal(cpu.reg32[1], 12);
    assert.equal(cpu.reg32[2], 21);
    assert.equal(cpu.reg32[6], 22);
    assert.equal(cpu.reg32[7], 0x11223344);
});

// A null GS must still fault. Caching a base must not remove its null check.
let faults = 0;
await run(new Uint8Array([0x65, 0x8B, 0x05, 0, 0, 0, 0, 0xF4]), (cpu, emulator) => {
    cpu.segment_is_null[5] = 1;
    cpu.protected_mode[0] = 1;
    emulator.cpu_exception_hook = number => {
        assert.equal(number, 13);
        faults++;
        cpu.in_hlt[0] = 1;
        return true;
    };
}, () => assert.equal(faults, 1));
console.log("GS reload and null-segment tests passed");
