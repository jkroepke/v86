#!/usr/bin/env node


import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import x86_table from "./x86_table.js";
import * as rust_ast from "./rust_ast.js";
import { hex, get_switch_value, get_switch_exist, finalize_table_rust } from "./util.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "src/rust/gen/");

fs.mkdirSync(OUT_DIR, { recursive: true });

const table_arg = get_switch_value("--table");
const gen_all = get_switch_exist("--all");
const to_generate = {
    interpreter: gen_all || table_arg === "interpreter",
    interpreter0f: gen_all || table_arg === "interpreter0f",
};

assert(
    Object.keys(to_generate).some(k => to_generate[k]),
    "Pass --table [interpreter|interpreter0f] or --all to pick which tables to generate"
);

// How an instruction ends early (after a page fault, for example): the main table is the body of
// the loop of the interpreter and leaves the block of the instruction, the 0f table is a function
// for a single instruction and returns
let exit_instruction = "return";

// The cached arms of the main table run an instruction from the decoded instruction cache
// (src/rust/cpu/dic.rs): the modrm byte, the address and the immediate value come from the
// decoded entry instead of the code bytes. Only instructions without prefixes are cached.
let cached_mode = false;
// The decoder of dic.rs needs to know the operands of each cached instruction: one byte per
// map (0: one byte opcodes, 1: 0F), operand size, opcode and reg field of the modrm byte
// (bit 0: cached, bit 1: modrm byte, bits 2-4: immediate 1 imm8, 2 imm8s, 3 imm16, 4 imm32)
const dic_desc = new Uint8Array(2 * 2 * 256 * 8);
let dic_cur = null; // { map, size, opcode } while the cached arm of an opcode is generated
const DIC_IMM_NONE = 0;
const DIC_IMM = { imm8: 1, imm8s: 2, imm16: 3, imm32: 4 };

function dic_set_desc(g, desc)
{
    const sizes = dic_cur.size === undefined ? [0, 1] : [dic_cur.size === 32 ? 1 : 0];
    const gs = g === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [g];
    for(const size of sizes)
        for(const g of gs)
            dic_desc[dic_cur.map << 12 | size << 11 | dic_cur.opcode << 3 | g] = desc;
}

// The descriptor of an encoding in the cached table, or 0 when it is not cached
function dic_encoding_desc(encoding, size)
{
    if(encoding.prefix || encoding.immaddr || encoding.extra_imm8 || encoding.extra_imm16 ||
        encoding.custom_sti || encoding.ignore_mod)
    {
        return 0;
    }
    if(encoding.custom_modrm_resolve && (encoding.opcode & 0xFF) !== 0x8D)
    {
        return 0;
    }
    let desc = 1;
    if(encoding.e) desc |= 2;
    const imm = dic_imm_kind(encoding, size);
    if(imm === undefined) return 0;
    return desc | (imm === null ? DIC_IMM_NONE : DIC_IMM[imm]) << 2;
}

function dic_imm_kind(encoding, size_variant)
{
    const size = (encoding.os || encoding.opcode % 2 === 1) ? size_variant : 8;
    if(encoding.imm8) return "imm8";
    if(encoding.imm8s) return "imm8s";
    if(encoding.imm16 || encoding.imm1632 && size === 16) return "imm16";
    if(encoding.imm32 || encoding.imm1632 && size === 32) return "imm32";
    if(encoding.imm1632) return undefined;
    return null;
}

gen_table();

function wrap_imm_call(imm)
{
    return `match ${imm} { Ok(o) => o, Err(()) => ${exit_instruction} }`;
}

function gen_read_imm_call(op, size_variant)
{
    if(cached_mode)
    {
        return dic_imm_kind(op, size_variant) ? "dic_imm(&state)" : undefined;
    }
    let size = (op.os || op.opcode % 2 === 1) ? size_variant : 8;

    if(op.imm8 || op.imm8s || op.imm16 || op.imm1632 || op.imm32 || op.immaddr)
    {
        if(op.imm8)
        {
            return wrap_imm_call("read_imm8()");
        }
        else if(op.imm8s)
        {
            return wrap_imm_call("read_imm8s()");
        }
        else
        {
            if(op.immaddr)
            {
                // immaddr: depends on address size
                return wrap_imm_call("read_moffs()");
            }
            else
            {
                assert(op.imm1632 || op.imm16 || op.imm32);

                if(op.imm1632 && size === 16 || op.imm16)
                {
                    return wrap_imm_call("read_imm16()");
                }
                else
                {
                    assert(op.imm1632 && size === 32 || op.imm32);
                    return wrap_imm_call("read_imm32s()");
                }
            }
        }
    }
    else
    {
        return undefined;
    }
}

function gen_call(name, args)
{
    args = args || [];
    return `${name}(${args.join(", ")});`;
}

/*
 * Current naming scheme:
 * instr(16|32|)_(66|F2|F3)?0F?[0-9a-f]{2}(_[0-7])?(_mem|_reg|)
 */
function make_instruction_name(encoding, size)
{
    const suffix = encoding.os ? String(size) : "";
    const opcode_hex = hex(encoding.opcode & 0xFF, 2);
    const first_prefix = (encoding.opcode & 0xFF00) === 0 ? "" : hex(encoding.opcode >> 8 & 0xFF, 2);
    const second_prefix = (encoding.opcode & 0xFF0000) === 0 ? "" : hex(encoding.opcode >> 16 & 0xFF, 2);
    const fixed_g_suffix = encoding.fixed_g === undefined ? "" : `_${encoding.fixed_g}`;
    const module = first_prefix === "0F" || second_prefix === "0F" ? "instructions_0f" : "instructions";

    assert(first_prefix === "" || first_prefix === "0F" || first_prefix === "F2" || first_prefix === "F3");
    assert(second_prefix === "" || second_prefix === "66" || second_prefix === "F2" || second_prefix === "F3");

    return `${module}::instr${suffix}_${second_prefix}${first_prefix}${opcode_hex}${fixed_g_suffix}`;
}

function gen_instruction_body(encodings, size)
{
    const encoding = encodings[0];

    let has_66 = [];
    let has_f2 = [];
    let has_f3 = [];
    let no_prefix = [];

    for(let e of encodings)
    {
        if((e.opcode >>> 16) === 0x66) has_66.push(e);
        else if((e.opcode >>> 8 & 0xFF) === 0xF2 || (e.opcode >>> 16) === 0xF2) has_f2.push(e);
        else if((e.opcode >>> 8 & 0xFF) === 0xF3 || (e.opcode >>> 16) === 0xF3) has_f3.push(e);
        else no_prefix.push(e);
    }

    if(has_f2.length || has_f3.length)
    {
        assert((encoding.opcode & 0xFF0000) === 0 || (encoding.opcode & 0xFF00) === 0x0F00);
    }

    if(has_66.length)
    {
        assert((encoding.opcode & 0xFF00) === 0x0F00);
    }

    const code = [];

    if(encoding.e)
    {
        code.push(cached_mode ?
            "let modrm_byte = dic_modrm(&state);" :
            `let modrm_byte = ${wrap_imm_call("read_modrm_byte()")};`);
    }

    if(cached_mode)
    {
        // a cached instruction has no prefix
        if(!no_prefix.length) return null;
        const body = gen_instruction_body_after_prefix(no_prefix, size);
        if(!body) return null;
        return [].concat(code, body);
    }

    if(has_66.length || has_f2.length || has_f3.length)
    {
        const if_blocks = [];

        if(has_66.length) {
            const body = gen_instruction_body_after_prefix(has_66, size);
            if_blocks.push({ condition: "prefixes_ & prefix::PREFIX_66 != 0", body, });
        }
        if(has_f2.length) {
            const body = gen_instruction_body_after_prefix(has_f2, size);
            if_blocks.push({ condition: "prefixes_ & prefix::PREFIX_F2 != 0", body, });
        }
        if(has_f3.length) {
            const body = gen_instruction_body_after_prefix(has_f3, size);
            if_blocks.push({ condition: "prefixes_ & prefix::PREFIX_F3 != 0", body, });
        }

        const check_prefixes = encoding.sse ? "(prefix::PREFIX_66 | prefix::PREFIX_F2 | prefix::PREFIX_F3)" : "(prefix::PREFIX_F2 | prefix::PREFIX_F3)";

        const else_block = {
            body: [].concat(
                "dbg_assert!((prefixes_ & " + check_prefixes + ") == 0);",
                gen_instruction_body_after_prefix(no_prefix, size)
            )
        };

        return [].concat(
            "let prefixes_ = *prefixes;",
            code,
            {
                type: "if-else",
                if_blocks,
                else_block,
            }
        );
    }
    else {
        return [].concat(
            code,
            gen_instruction_body_after_prefix(encodings, size)
        );
    }
}

function gen_instruction_body_after_prefix(encodings, size)
{
    const encoding = encodings[0];

    if(encoding.fixed_g !== undefined)
    {
        assert(encoding.e);

        // instruction with modrm byte where the middle 3 bits encode the instruction

        // group by opcode without prefix plus middle bits of modrm byte
        let cases = encodings.reduce((cases_by_opcode, case_) => {
            assert(typeof case_.fixed_g === "number");
            cases_by_opcode[case_.opcode & 0xFFFF | case_.fixed_g << 16] = case_;
            return cases_by_opcode;
        }, Object.create(null));
        cases = Object.values(cases).sort((e1, e2) => e1.fixed_g - e2.fixed_g);

        return [
            {
                type: "switch",
                condition: "modrm_byte >> 3 & 7",
                cases: cases.map(case_ => {
                    const fixed_g = case_.fixed_g;
                    let body;
                    if(cached_mode)
                    {
                        const desc = dic_encoding_desc(case_, size);
                        dic_set_desc(fixed_g, desc);
                        body = desc ? gen_instruction_body_after_fixed_g(case_, size) : ["dbg_assert!(false);"];
                    }
                    else
                    {
                        body = gen_instruction_body_after_fixed_g(case_, size);
                    }

                    return {
                        conditions: [fixed_g],
                        body,
                    };
                }),

                default_case: {
                    varname: "x",
                    body: [
                        `dbg_log!("#ud ${encoding.opcode.toString(16).toUpperCase()}/{} at {:x}", x, *instruction_pointer);`,
                        "trigger_ud();",
                    ],
                }
            },
        ];
    }
    else {
        assert(encodings.length === 1);
        if(cached_mode)
        {
            const desc = dic_encoding_desc(encodings[0], size);
            dic_set_desc(undefined, desc);
            if(!desc) return null;
        }
        return gen_instruction_body_after_fixed_g(encodings[0], size);
    }
}

function gen_instruction_body_after_fixed_g(encoding, size)
{
    const instruction_prefix = [];
    const instruction_postfix =
        (encoding.block_boundary && !encoding.no_block_boundary_in_interpreted) ||
        (!encoding.custom && encoding.e) ?
        ["after_block_boundary();"] : [];

    if(encoding.task_switch_test || encoding.sse)
    {
        instruction_prefix.push(
            {
                type: "if-else",
                if_blocks: [
                    {
                        condition: encoding.sse ? "!task_switch_test_mmx()" : "!task_switch_test()",
                        body: [`${exit_instruction};`],
                    }
                ],
            });
    }

    const imm_read = gen_read_imm_call(encoding, size);
    const instruction_name = make_instruction_name(encoding, size);

    if(encoding.e)
    {
        // instruction with modrm byte

        const imm_read = gen_read_imm_call(encoding, size);

        if(encoding.ignore_mod)
        {
            assert(!imm_read, "Unexpected instruction (ignore mod with immediate value)");

            // Has modrm byte, but the 2 mod bits are ignored and both
            // operands are always registers (0f20-0f24)

            return [].concat(
                instruction_prefix,
                gen_call(instruction_name, ["modrm_byte & 7", "modrm_byte >> 3 & 7"]),
                instruction_postfix
            );
        }
        else
        {
            let mem_args;

            if(cached_mode && encoding.custom_modrm_resolve)
            {
                // lea: the address without the segment
                assert((encoding.opcode & 0xFF) === 0x8D && encoding.fixed_g === undefined && !imm_read);
                return [].concat(
                    instruction_prefix,
                    {
                        type: "if-else",
                        if_blocks: [{
                            condition: "modrm_byte < 0xC0",
                            body: [`write_reg${size}(modrm_byte >> 3 & 7, dic_ea(&state));`],
                        }],
                        else_block: {
                            body: [gen_call(`${instruction_name}_reg`, ["modrm_byte & 7", "modrm_byte >> 3 & 7"])],
                        },
                    },
                    instruction_postfix
                );
            }
            else if(cached_mode)
            {
                mem_args = [`match dic_resolve(&state) { Ok(a) => a, Err(()) => ${exit_instruction} }`];
            }
            else if(encoding.custom_modrm_resolve)
            {
                // requires special handling around modrm_resolve
                mem_args = ["modrm_byte"];
            }
            else
            {
                mem_args = [`match modrm_resolve(modrm_byte) { Ok(a) => a, Err(()) => ${exit_instruction} }`];
            }

            const reg_args = ["modrm_byte & 7"];

            if(encoding.fixed_g === undefined)
            {
                mem_args.push("modrm_byte >> 3 & 7");
                reg_args.push("modrm_byte >> 3 & 7");
            }

            if(imm_read)
            {
                mem_args.push(imm_read);
                reg_args.push(imm_read);
            }

            return [].concat(
                instruction_prefix,
                {
                    type: "if-else",
                    if_blocks: [
                        {
                            condition: "modrm_byte < 0xC0",
                            body: [].concat(
                                gen_call(`${instruction_name}_mem`, mem_args)
                            ),
                        }
                    ],
                    else_block: {
                        body: [gen_call(`${instruction_name}_reg`, reg_args)],
                    },
                },
                instruction_postfix
            );
        }
    }
    else
    {
        const args = [];

        if(imm_read)
        {
            args.push(imm_read);
        }

        if(encoding.extra_imm16)
        {
            assert(imm_read);
            args.push(wrap_imm_call("read_imm16()"));
        }
        else if(encoding.extra_imm8)
        {
            assert(imm_read);
            args.push(wrap_imm_call("read_imm8()"));
        }

        return [].concat(
            instruction_prefix,
            gen_call(instruction_name, args),
            instruction_postfix
        );
    }
}

function gen_table()
{
    let by_opcode = Object.create(null);
    let by_opcode0f = Object.create(null);

    for(let o of x86_table)
    {
        let opcode = o.opcode;

        if((opcode & 0xFF00) === 0x0F00)
        {
            opcode &= 0xFF;
            by_opcode0f[opcode] = by_opcode0f[opcode] || [];
            by_opcode0f[opcode].push(o);
        }
        else
        {
            opcode &= 0xFF;
            by_opcode[opcode] = by_opcode[opcode] || [];
            by_opcode[opcode].push(o);
        }
    }

    exit_instruction = "break 'instruction";

    let cases = [];
    for(let opcode = 0; opcode < 0x100; opcode++)
    {
        let encoding = by_opcode[opcode];
        assert(encoding && encoding.length);

        let opcode_hex = hex(opcode, 2);
        let opcode_high_hex = hex(opcode | 0x100, 2);

        if(encoding[0].os)
        {
            cases.push({
                conditions: [`0x${opcode_hex}`],
                body: gen_instruction_body(encoding, 16),
            });
            cases.push({
                conditions: [`0x${opcode_high_hex}`],
                body: gen_instruction_body(encoding, 32),
            });
        }
        else
        {
            cases.push({
                conditions: [`0x${opcode_hex}`, `0x${opcode_high_hex}`],
                body: gen_instruction_body(encoding, undefined),
            });
        }
    }
    // the cached arms: 0x200 | size << 8 | opcode for one byte opcodes, 0x400 | ... for 0F
    cached_mode = true;
    for(const [map, by] of [[0, by_opcode], [1, by_opcode0f]])
    {
        for(let opcode = 0; opcode < 0x100; opcode++)
        {
            const encoding = by[opcode];
            const base = 0x200 << map;
            const variants = encoding[0].os ? [[16, [opcode]], [32, [opcode | 0x100]]] : [[undefined, [opcode, opcode | 0x100]]];
            for(const [size, ops] of variants)
            {
                dic_cur = { map, size, opcode };
                if(map === 0 && opcode === 0x0F) continue;
                const body = gen_instruction_body(encoding, size);
                if(!body) continue;
                cases.push({
                    conditions: ops.map(o => "0x" + hex(base | o, 3)),
                    body,
                });
            }
        }
    }
    cached_mode = false;
    dic_cur = null;
    cases.push({
        conditions: ["crate::cpu::dic::OP_MISS"],
        body: ["opcode = dic_miss(&mut state);", "continue 'instructions;"],
    });

    const table = {
        type: "switch",
        condition: "opcode",
        cases,
        default_case: {
            body: ["assert!(false);"]
        },
    };
    if(to_generate.interpreter)
    {
        const code = [
            "#![cfg_attr(rustfmt, rustfmt_skip)]",

            "use crate::cpu::cpu::{after_block_boundary, modrm_resolve, read_modrm_byte};",
            "// the immediate values are read inline in this table",
            "use crate::cpu::cpu::{read_imm8_inline as read_imm8, read_imm8s_inline as read_imm8s};",
            "use crate::cpu::cpu::{read_imm16_inline as read_imm16, read_imm32s_inline as read_imm32s};",
            "use crate::cpu::cpu::read_moffs;",
            "use crate::cpu::cpu::{task_switch_test, task_switch_test_mmx, trigger_ud};",
            "use crate::cpu::instructions_0f;",
            "use crate::cpu::cpu::{interpreter_loop_start, interpreter_loop_next};",
            "use crate::cpu::cpu::{write_reg16, write_reg32};",
            "use crate::cpu::dic::{dic_ea, dic_imm, dic_miss, dic_modrm, dic_resolve};",
            "use crate::cpu::instructions;",
            "use crate::cpu::global_pointers::{instruction_pointer, prefixes};",
            "use crate::prefix;",

            "// Runs the instruction with this opcode and then the instructions that follow it, up to",
            "// the end of the block (see interpreter_loop_next). The loop is in this function, so an",
            "// instruction of the interpreter costs no call and no return. Returns how many",
            "// instructions ran.",
            "#[allow(unused_variables)]",
            "pub unsafe fn run(mut opcode: u32) -> u32 {",
            "let mut state = interpreter_loop_start(&mut opcode);",
            "'instructions: loop {",
            "'instruction: {",
            table,
            "}",
            "match interpreter_loop_next(&mut state) { Some(next) => opcode = next, None => return state.count }",
            "}",
            "}",
            "// the operands of the cached instructions, for the decoder of dic.rs",
            `pub static DIC_DESC: [u8; ${dic_desc.length}] = [${Array.from(dic_desc).join(",")}];`,
        ];

        finalize_table_rust(
            OUT_DIR,
            "interpreter.rs",
            rust_ast.print_syntax_tree([].concat(code)).join("\n") + "\n"
        );
    }

    exit_instruction = "return";

    const cases0f = [];
    for(let opcode = 0; opcode < 0x100; opcode++)
    {
        let encoding = by_opcode0f[opcode];

        assert(encoding && encoding.length);

        let opcode_hex = hex(opcode, 2);
        let opcode_high_hex = hex(opcode | 0x100, 2);

        if(encoding[0].os)
        {
            cases0f.push({
                conditions: [`0x${opcode_hex}`],
                body: gen_instruction_body(encoding, 16),
            });
            cases0f.push({
                conditions: [`0x${opcode_high_hex}`],
                body: gen_instruction_body(encoding, 32),
            });
        }
        else
        {
            let block = {
                conditions: [`0x${opcode_hex}`, `0x${opcode_high_hex}`],
                body: gen_instruction_body(encoding, undefined),
            };
            cases0f.push(block);
        }
    }

    const table0f = {
        type: "switch",
        condition: "opcode",
        cases: cases0f,
        default_case: {
            body: ["assert!(false);"]
        },
    };

    if(to_generate.interpreter0f)
    {
        const code = [
            "#![cfg_attr(rustfmt, rustfmt_skip)]",

            "use crate::cpu::cpu::{after_block_boundary, modrm_resolve, read_modrm_byte};",
            "use crate::cpu::cpu::{read_imm8, read_imm16, read_imm32s};",
            "use crate::cpu::cpu::{task_switch_test, task_switch_test_mmx, trigger_ud};",
            "use crate::cpu::instructions_0f;",
            "use crate::cpu::global_pointers::{instruction_pointer, prefixes};",
            "use crate::prefix;",

            "pub unsafe fn run(opcode: u32) {",
            table0f,
            "}",
        ];

        finalize_table_rust(
            OUT_DIR,
            "interpreter0f.rs",
            rust_ast.print_syntax_tree([].concat(code)).join("\n") + "\n"
        );
    }
}
