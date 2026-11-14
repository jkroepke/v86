// The decoded instruction cache of the interpreter.
//
// The interpreter decodes an instruction every time it runs it: the opcode byte, the modrm
// byte, the sib byte, the displacement and the immediate value, each read from guest memory
// with a check that eip is still in the page of the last translation. Pages below the JIT
// threshold run every instruction ~150 times on average in a pod start, so the decoded form is
// kept here: an entry per physical address with the opcode of a cached arm of the interpreter
// (src/rust/gen/interpreter.rs), the length, the modrm byte, the parts of the address and the
// immediate value.
//
// - Only pages with entry points of the JIT are cached: a write to them reaches
//   jit_dirty_page (TLB_HAS_CODE), which gives the page a new generation. The generation is
//   part of the tag of each entry, so the entries of the old code never match again.
// - Only 32-bit code without prefixes is cached. Other instructions get an entry that runs
//   the normal arm of the interpreter (the opcode byte, length 1), which reads the rest of the
//   instruction from guest memory as before.
// - The table is direct mapped: the entries of a page are at a hash of the page plus the
//   offset in the page.

use crate::cpu::cpu::{get_seg, interpreter_page, InterpreterLoop, BLOCK_END};
use crate::cpu::global_pointers::{eip_phys, instruction_pointer, is_32, reg32};
use crate::cpu::global_pointers::{segment_is_null, segment_offsets};
use crate::cpu::memory;
use crate::gen::interpreter::DIC_DESC;
use crate::page::Page;
use crate::paging::OrPageFault;
use crate::regs::{DS, SS};

// The arm of the interpreter that fills an entry
pub const OP_MISS: u32 = 0x600;
// Passed to gen::interpreter::run at the start of a block: look up the first instruction
pub const OP_BLOCK: u32 = 0x601;

#[repr(C, align(32))]
#[derive(Clone, Copy)]
pub struct Entry {
    // physical address | generation << 32
    tag: u64,
    op: u16,
    len: u8,
    modrm: u8,
    base: u8,
    index: u8,
    scale: u8,
    seg: u8,
    disp: i32,
    imm: i32,
    // -1 when the address has a base (an index) register, else 0
    base_mask: i32,
    index_mask: i32,
}

const EMPTY: Entry = Entry {
    tag: 0,
    op: 0,
    len: 0,
    modrm: 0,
    base: 0,
    index: 0,
    scale: 0,
    seg: 0,
    disp: 0,
    imm: 0,
    base_mask: 0,
    index_mask: 0,
};

const BITS: u32 = 18;
const SIZE: usize = 1 << BITS;
const MASK: usize = SIZE - 1;
static mut TABLE: [Entry; SIZE] = [EMPTY; SIZE];

// Per physical page: the generation (bits 1..30) and whether the page has entry points
// (bit 0). Entries are only made for pages with entry points.
static mut PAGE_GEN: [u32; 0x100000] = [0; 0x100000];
const GEN_MASK: u32 = 0x3FFF_FFFF;
// never matches: generations are below 2^30
const TAG_NEVER: u64 = u64::MAX;

// The physical page of the block that the interpreter runs
static mut CUR_PAGE: u32 = u32::MAX;

pub static mut DIC_ENABLED: bool = true;

// Called by the JIT when it records the first entry point of a page
pub fn page_has_entry_points(page: Page) {
    unsafe {
        let g = &mut PAGE_GEN[page.to_u32() as usize];
        *g |= 1;
    }
}

// Called by the JIT when the page was written (or its entry points dropped)
pub fn page_dirty(page: Page) {
    unsafe {
        let p = page.to_u32();
        let g = &mut PAGE_GEN[p as usize];
        if *g & 1 != 0 {
            *g = (*g & !1).wrapping_add(2) & GEN_MASK;
        }
        if p == CUR_PAGE {
            // the block of the interpreter looked up its entries with the old generation
            interpreter_page = BLOCK_END;
        }
    }
}

#[inline(always)]
fn page_base(page: u32) -> usize { (page.wrapping_mul(0x9E37_79B1) >> (32 - BITS)) as usize }

#[inline(always)]
unsafe fn entry_ptr(state: &InterpreterLoop, phys: u32) -> *mut Entry {
    std::ptr::addr_of_mut!(TABLE)
        .cast::<Entry>()
        .add((state.dic_base + (phys & 0xFFF) as usize) & MASK)
}

// The start of a block: eip is at its first instruction
#[inline(always)]
pub unsafe fn block_start(state: &mut InterpreterLoop) {
    let eip = *instruction_pointer;
    let phys = (*eip_phys ^ eip) as u32;
    let page = phys >> 12;
    let g = PAGE_GEN[page as usize];
    CUR_PAGE = page;
    state.dic_base = page_base(page);
    if g & 1 != 0 && *is_32 && DIC_ENABLED {
        state.dic_tag = (g as u64) << 32;
        state.dic_fill = true;
    }
    else {
        state.dic_tag = TAG_NEVER;
        state.dic_fill = false;
    }
}

// The opcode of the instruction at eip (phys): a cached arm, or OP_MISS. A cached instruction
// moves eip to its end.
#[inline(always)]
pub unsafe fn lookup(state: &mut InterpreterLoop, eip: i32, phys: u32) -> u32 {
    let e = entry_ptr(state, phys);
    if (*e).tag == state.dic_tag | phys as u64 {
        *instruction_pointer = eip + (*e).len as i32;
        state.dic_entry = e;
        (*e).op as u32
    }
    else {
        OP_MISS
    }
}

// The arm OP_MISS: decode the instruction at eip, make an entry, and return the opcode to run.
// The state of the loop stays in wasm locals: only values go to the function that is not inlined.
#[inline(always)]
pub unsafe fn dic_miss(state: &mut InterpreterLoop) -> u32 {
    let op = miss(state.dic_tag, state.dic_fill, state.dic_base, state.size_bit);
    state.dic_entry = MISS_ENTRY;
    op
}

static mut MISS_ENTRY: *mut Entry = std::ptr::null_mut();

#[inline(never)]
unsafe fn miss(tag: u64, fill: bool, base: usize, size_bit: u32) -> u32 {
    let eip = *instruction_pointer;
    let phys = (*eip_phys ^ eip) as u32;
    if !fill {
        *instruction_pointer = eip + 1;
        return *memory::mem8.offset(phys as isize) as u32 | size_bit;
    }
    let e = std::ptr::addr_of_mut!(TABLE).cast::<Entry>().add((base + (phys & 0xFFF) as usize) & MASK);
    decode(phys, &mut *e);
    (*e).tag = tag | phys as u64;
    *instruction_pointer = eip + (*e).len as i32;
    MISS_ENTRY = e;
    (*e).op as u32
}

// Decodes the 32-bit instruction at phys. An instruction that is not cached (a prefix, an
// instruction that crosses the end of the page, ...) gets the normal arm of its first byte.
unsafe fn decode(phys: u32, e: &mut Entry) {
    let avail = 0x1000 - (phys & 0xFFF);
    let mem = memory::mem8.offset(phys as isize);
    let b0 = *mem as u32;
    *e = EMPTY;
    e.op = (b0 | 0x100) as u16;
    e.len = 1;
    let rd8 = |p: u32| -> Option<u32> {
        if p < avail { Some(*mem.offset(p as isize) as u32) } else { None }
    };
    let rd32 = |p: u32| -> Option<i32> {
        if p + 4 <= avail { Some(memory::read32_no_mmap_check(phys + p)) } else { None }
    };
    let (map, opcode, mut p) = if b0 == 0x0F {
        match rd8(1) {
            Some(o) => (1, o, 2),
            None => return,
        }
    }
    else {
        (0, b0, 1)
    };
    let row = (map << 12 | 1 << 11 | opcode << 3) as usize;
    let mut desc = DIC_DESC[row];
    if desc & 1 == 0 {
        return;
    }
    let mut modrm = 0;
    let mut base = 0u32;
    let mut index = 0u32;
    let mut scale = 0u32;
    let mut seg = DS as u32;
    let mut disp = 0i32;
    let mut base_mask = 0;
    let mut index_mask = 0;
    if desc & 2 != 0 {
        modrm = match rd8(p) {
            Some(m) => m,
            None => return,
        };
        p += 1;
        desc = DIC_DESC[row | (modrm >> 3 & 7) as usize];
        if desc & 1 == 0 {
            return;
        }
        if modrm < 0xC0 {
            let rm = modrm & 7;
            let mode = modrm >> 6;
            if rm == 4 {
                let sib = match rd8(p) {
                    Some(s) => s,
                    None => return,
                };
                p += 1;
                let b = sib & 7;
                let i = sib >> 3 & 7;
                if b == 5 && mode == 0 {
                    disp = match rd32(p) {
                        Some(d) => d,
                        None => return,
                    };
                    p += 4;
                }
                else {
                    base = b;
                    base_mask = -1;
                    if b == 4 || b == 5 {
                        seg = SS as u32;
                    }
                }
                if i != 4 {
                    index = i;
                    index_mask = -1;
                    scale = sib >> 6;
                }
            }
            else if rm == 5 && mode == 0 {
                disp = match rd32(p) {
                    Some(d) => d,
                    None => return,
                };
                p += 4;
            }
            else {
                base = rm;
                base_mask = -1;
                if rm == 5 {
                    seg = SS as u32;
                }
            }
            if mode == 1 {
                disp = disp.wrapping_add(match rd8(p) {
                    Some(d) => d as i8 as i32,
                    None => return,
                });
                p += 1;
            }
            else if mode == 2 {
                disp = disp.wrapping_add(match rd32(p) {
                    Some(d) => d,
                    None => return,
                });
                p += 4;
            }
        }
    }
    let imm = match desc >> 2 & 7 {
        0 => 0,
        1 => match rd8(p) {
            Some(i) => {
                p += 1;
                i as i32
            },
            None => return,
        },
        2 => match rd8(p) {
            Some(i) => {
                p += 1;
                i as i8 as i32
            },
            None => return,
        },
        3 => match (rd8(p), rd8(p + 1)) {
            (Some(lo), Some(hi)) => {
                p += 2;
                (lo | hi << 8) as i32
            },
            _ => return,
        },
        4 => match rd32(p) {
            Some(i) => {
                p += 4;
                i
            },
            _ => return,
        },
        _ => {
            dbg_assert!(false);
            return;
        },
    };
    *e = Entry {
        tag: 0,
        op: (0x200 << map | 0x100 | opcode) as u16,
        len: p as u8,
        modrm: modrm as u8,
        base: base as u8,
        index: index as u8,
        scale: scale as u8,
        seg: seg as u8,
        disp,
        imm,
        base_mask,
        index_mask,
    };
}

#[inline(always)]
pub unsafe fn dic_modrm(state: &InterpreterLoop) -> i32 { (*state.dic_entry).modrm as i32 }

#[inline(always)]
pub unsafe fn dic_imm(state: &InterpreterLoop) -> i32 { (*state.dic_entry).imm }

// The address of the memory operand without the segment (lea)
#[inline(always)]
pub unsafe fn dic_ea(state: &InterpreterLoop) -> i32 {
    let e = &*state.dic_entry;
    e.disp
        .wrapping_add(*reg32.offset(e.base as isize) & e.base_mask)
        .wrapping_add((*reg32.offset(e.index as isize) << e.scale) & e.index_mask)
}

#[inline(always)]
pub unsafe fn dic_resolve(state: &InterpreterLoop) -> OrPageFault<i32> {
    let seg = (*state.dic_entry).seg as i32;
    if *segment_is_null.offset(seg as isize) {
        return null_segment(seg);
    }
    Ok(dic_ea(state).wrapping_add(*segment_offsets.offset(seg as isize)))
}

#[cold]
#[inline(never)]
unsafe fn null_segment(seg: i32) -> OrPageFault<i32> { get_seg(seg) }
