#![allow(non_snake_case)]

// Instructions of the three-byte opcode maps 0F 38 and 0F 3A: SSSE3 and the SHA extensions.
//
// These maps are not in gen/x86_table.js. The generators only know one-byte and 0F opcodes, so
// 0F 38 and 0F 3A are "prefix" entries there, and the third opcode byte is dispatched by hand:
// instr_0F38/instr_0F3A (interpreter, here), instr_0F38_jit/instr_0F3A_jit (jit_instructions.rs)
// and instr_0F38_analyze/instr_0F3A_analyze (analysis.rs). All three use `find_0f38` and
// `find_0f3a`, so an instruction is added in one place.

use crate::cpu::cpu::*;
use crate::cpu::global_pointers::*;
use crate::prefix::{PREFIX_66, PREFIX_F2, PREFIX_F3};

#[derive(Copy, Clone)]
pub enum Op {
    // fn(source: xmm/m128, destination register)
    Xmm(unsafe fn(reg128, i32), &'static str),
    // fn(source: mm/m64, destination register)
    Mmx(unsafe fn(u64, i32), &'static str),
    // the same with an immediate byte
    XmmImm(unsafe fn(reg128, i32, i32), &'static str),
    MmxImm(unsafe fn(u64, i32, i32), &'static str),
}

macro_rules! xmm {
    ($f:ident) => {
        Some(Op::Xmm($f, stringify!($f)))
    };
}
macro_rules! mmx {
    ($f:ident) => {
        Some(Op::Mmx($f, stringify!($f)))
    };
}

pub fn find_0f38(opcode: u8, prefixes_: u8) -> Option<Op> {
    if prefixes_ & (PREFIX_F2 | PREFIX_F3) != 0 {
        return None;
    }
    if prefixes_ & PREFIX_66 != 0 {
        match opcode {
            0x00 => xmm!(instr_660F3800),
            0x01 => xmm!(instr_660F3801),
            0x02 => xmm!(instr_660F3802),
            0x03 => xmm!(instr_660F3803),
            0x04 => xmm!(instr_660F3804),
            0x05 => xmm!(instr_660F3805),
            0x06 => xmm!(instr_660F3806),
            0x07 => xmm!(instr_660F3807),
            0x08 => xmm!(instr_660F3808),
            0x09 => xmm!(instr_660F3809),
            0x0A => xmm!(instr_660F380A),
            0x0B => xmm!(instr_660F380B),
            0x1C => xmm!(instr_660F381C),
            0x1D => xmm!(instr_660F381D),
            0x1E => xmm!(instr_660F381E),
            _ => None,
        }
    }
    else {
        match opcode {
            0x00 => mmx!(instr_0F3800),
            0x01 => mmx!(instr_0F3801),
            0x02 => mmx!(instr_0F3802),
            0x03 => mmx!(instr_0F3803),
            0x04 => mmx!(instr_0F3804),
            0x05 => mmx!(instr_0F3805),
            0x06 => mmx!(instr_0F3806),
            0x07 => mmx!(instr_0F3807),
            0x08 => mmx!(instr_0F3808),
            0x09 => mmx!(instr_0F3809),
            0x0A => mmx!(instr_0F380A),
            0x0B => mmx!(instr_0F380B),
            0x1C => mmx!(instr_0F381C),
            0x1D => mmx!(instr_0F381D),
            0x1E => mmx!(instr_0F381E),
            0xC8 => xmm!(instr_0F38C8),
            0xC9 => xmm!(instr_0F38C9),
            0xCA => xmm!(instr_0F38CA),
            0xCB => xmm!(instr_0F38CB),
            0xCC => xmm!(instr_0F38CC),
            0xCD => xmm!(instr_0F38CD),
            _ => None,
        }
    }
}

pub fn find_0f3a(opcode: u8, prefixes_: u8) -> Option<Op> {
    if prefixes_ & (PREFIX_F2 | PREFIX_F3) != 0 {
        return None;
    }
    if prefixes_ & PREFIX_66 != 0 {
        match opcode {
            0x0F => Some(Op::XmmImm(instr_660F3A0F, "instr_660F3A0F")),
            _ => None,
        }
    }
    else {
        match opcode {
            0x0F => Some(Op::MmxImm(instr_0F3A0F, "instr_0F3A0F")),
            0xCC => Some(Op::XmmImm(instr_0F3ACC, "instr_0F3ACC")),
            _ => None,
        }
    }
}

unsafe fn run(op: Option<Op>) {
    let op = match op {
        Some(op) => op,
        None => {
            trigger_ud();
            return;
        },
    };
    let modrm_byte = return_on_pagefault!(read_imm8());
    if !task_switch_test_mmx() {
        return;
    }
    let r = modrm_byte >> 3 & 7;
    match op {
        Op::Xmm(f, _) => {
            let source = if modrm_byte < 0xC0 {
                return_on_pagefault!(safe_read128s(return_on_pagefault!(modrm_resolve(
                    modrm_byte
                ))))
            }
            else {
                read_xmm128s(modrm_byte & 7)
            };
            f(source, r)
        },
        Op::XmmImm(f, _) => {
            let source = if modrm_byte < 0xC0 {
                return_on_pagefault!(safe_read128s(return_on_pagefault!(modrm_resolve(
                    modrm_byte
                ))))
            }
            else {
                read_xmm128s(modrm_byte & 7)
            };
            let imm = return_on_pagefault!(read_imm8());
            f(source, r, imm)
        },
        Op::Mmx(f, _) => {
            let source = if modrm_byte < 0xC0 {
                return_on_pagefault!(safe_read64s(return_on_pagefault!(modrm_resolve(
                    modrm_byte
                ))))
            }
            else {
                read_mmx64s(modrm_byte & 7)
            };
            f(source, r)
        },
        Op::MmxImm(f, _) => {
            let source = if modrm_byte < 0xC0 {
                return_on_pagefault!(safe_read64s(return_on_pagefault!(modrm_resolve(
                    modrm_byte
                ))))
            }
            else {
                read_mmx64s(modrm_byte & 7)
            };
            let imm = return_on_pagefault!(read_imm8());
            f(source, r, imm)
        },
    }
}

pub unsafe fn instr_0F38() {
    let prefixes_ = *prefixes;
    let opcode = return_on_pagefault!(read_imm8());
    run(find_0f38(opcode as u8, prefixes_))
}
pub unsafe fn instr_0F3A() {
    let prefixes_ = *prefixes;
    let opcode = return_on_pagefault!(read_imm8());
    run(find_0f3a(opcode as u8, prefixes_))
}

// SSSE3. Every instruction exists for xmm (N = 16 bytes) and for mm registers (N = 8 bytes).

fn words<const N: usize>(x: [u8; N]) -> [i16; 8] {
    let mut w = [0; 8];
    for i in 0..N / 2 {
        w[i] = i16::from_le_bytes([x[2 * i], x[2 * i + 1]]);
    }
    w
}
fn from_words<const N: usize>(w: [i16; 8]) -> [u8; N] {
    let mut x = [0; N];
    for i in 0..N / 2 {
        let b = w[i].to_le_bytes();
        x[2 * i] = b[0];
        x[2 * i + 1] = b[1];
    }
    x
}
fn dwords<const N: usize>(x: [u8; N]) -> [i32; 4] {
    let mut d = [0; 4];
    for i in 0..N / 4 {
        d[i] = i32::from_le_bytes([x[4 * i], x[4 * i + 1], x[4 * i + 2], x[4 * i + 3]]);
    }
    d
}
fn from_dwords<const N: usize>(d: [i32; 4]) -> [u8; N] {
    let mut x = [0; N];
    for i in 0..N / 4 {
        x[4 * i..4 * i + 4].copy_from_slice(&d[i].to_le_bytes());
    }
    x
}
fn saturate16(x: i32) -> i16 { x.max(-0x8000).min(0x7FFF) as i16 }

fn pshufb<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = [0; N];
    for i in 0..N {
        x[i] = if s[i] & 0x80 != 0 { 0 } else { d[s[i] as usize & (N - 1)] };
    }
    x
}
// horizontal add or subtract of pairs of words
fn phw<const N: usize>(d: [u8; N], s: [u8; N], f: &dyn Fn(i32, i32) -> i16) -> [u8; N] {
    let (d, s) = (words(d), words(s));
    let n = N / 4;
    let mut x = [0; 8];
    for i in 0..n {
        x[i] = f(d[2 * i] as i32, d[2 * i + 1] as i32);
        x[n + i] = f(s[2 * i] as i32, s[2 * i + 1] as i32);
    }
    from_words(x)
}
fn phd<const N: usize>(d: [u8; N], s: [u8; N], f: &dyn Fn(i32, i32) -> i32) -> [u8; N] {
    let (d, s) = (dwords(d), dwords(s));
    let n = N / 8;
    let mut x = [0; 4];
    for i in 0..n {
        x[i] = f(d[2 * i], d[2 * i + 1]);
        x[n + i] = f(s[2 * i], s[2 * i + 1]);
    }
    from_dwords(x)
}
fn pmaddubsw<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = [0; 8];
    for i in 0..N / 2 {
        x[i] = saturate16(
            d[2 * i] as i32 * s[2 * i] as i8 as i32
                + d[2 * i + 1] as i32 * s[2 * i + 1] as i8 as i32,
        );
    }
    from_words(x)
}
fn psignb<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = [0; N];
    for i in 0..N {
        let s = s[i] as i8;
        x[i] = if s < 0 {
            (d[i] as i8).wrapping_neg() as u8
        }
        else if s == 0 {
            0
        }
        else {
            d[i]
        };
    }
    x
}
fn psignw<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let (d, s) = (words(d), words(s));
    let mut x = [0; 8];
    for i in 0..N / 2 {
        x[i] = if s[i] < 0 {
            d[i].wrapping_neg()
        }
        else if s[i] == 0 {
            0
        }
        else {
            d[i]
        };
    }
    from_words(x)
}
fn psignd<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let (d, s) = (dwords(d), dwords(s));
    let mut x = [0; 4];
    for i in 0..N / 4 {
        x[i] = if s[i] < 0 {
            d[i].wrapping_neg()
        }
        else if s[i] == 0 {
            0
        }
        else {
            d[i]
        };
    }
    from_dwords(x)
}
fn pmulhrsw<const N: usize>(d: [u8; N], s: [u8; N]) -> [u8; N] {
    let (d, s) = (words(d), words(s));
    let mut x = [0; 8];
    for i in 0..N / 2 {
        x[i] = (((d[i] as i32 * s[i] as i32 >> 14) + 1) >> 1) as i16;
    }
    from_words(x)
}
fn pabsb<const N: usize>(_d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = [0; N];
    for i in 0..N {
        x[i] = (s[i] as i8).wrapping_abs() as u8;
    }
    x
}
fn pabsw<const N: usize>(_d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = words(s);
    for i in 0..N / 2 {
        x[i] = x[i].wrapping_abs();
    }
    from_words(x)
}
fn pabsd<const N: usize>(_d: [u8; N], s: [u8; N]) -> [u8; N] {
    let mut x = dwords(s);
    for i in 0..N / 4 {
        x[i] = x[i].wrapping_abs();
    }
    from_dwords(x)
}
// the bytes of destination:source, shifted right by `shift` bytes
fn palignr<const N: usize>(d: [u8; N], s: [u8; N], shift: i32) -> [u8; N] {
    let shift = shift as usize & 0xFF;
    let mut x = [0; N];
    for i in 0..N {
        let j = i + shift;
        x[i] = if j < N {
            s[j]
        }
        else if j < 2 * N {
            d[j - N]
        }
        else {
            0
        };
    }
    x
}

unsafe fn xmm_op(source: reg128, r: i32, f: &dyn Fn([u8; 16], [u8; 16]) -> [u8; 16]) {
    let destination = read_xmm128s(r);
    write_xmm_reg128(
        r,
        reg128 {
            u8: f(destination.u8, source.u8),
        },
    );
}
unsafe fn mmx_op(source: u64, r: i32, f: &dyn Fn([u8; 8], [u8; 8]) -> [u8; 8]) {
    let destination = read_mmx64s(r);
    write_mmx_reg64(
        r,
        u64::from_le_bytes(f(destination.to_le_bytes(), source.to_le_bytes())),
    );
    transition_fpu_to_mmx();
}

macro_rules! ssse3 {
    ($xmm:ident, $mmx:ident, $f:expr) => {
        #[no_mangle]
        pub unsafe fn $xmm(source: reg128, r: i32) { xmm_op(source, r, &$f) }
        #[no_mangle]
        pub unsafe fn $mmx(source: u64, r: i32) { mmx_op(source, r, &$f) }
    };
}

// pshufb
ssse3!(instr_660F3800, instr_0F3800, pshufb);
// phaddw, phaddd, phaddsw
ssse3!(instr_660F3801, instr_0F3801, |d, s| phw(
    d,
    s,
    &|a, b| (a + b) as i16
));
ssse3!(instr_660F3802, instr_0F3802, |d, s| phd(d, s, &|a, b| a
    .wrapping_add(b)));
ssse3!(instr_660F3803, instr_0F3803, |d, s| phw(d, s, &|a, b| {
    saturate16(a + b)
}));
// pmaddubsw
ssse3!(instr_660F3804, instr_0F3804, pmaddubsw);
// phsubw, phsubd, phsubsw
ssse3!(instr_660F3805, instr_0F3805, |d, s| phw(
    d,
    s,
    &|a, b| (a - b) as i16
));
ssse3!(instr_660F3806, instr_0F3806, |d, s| phd(d, s, &|a, b| a
    .wrapping_sub(b)));
ssse3!(instr_660F3807, instr_0F3807, |d, s| phw(d, s, &|a, b| {
    saturate16(a - b)
}));
// psignb, psignw, psignd
ssse3!(instr_660F3808, instr_0F3808, psignb);
ssse3!(instr_660F3809, instr_0F3809, psignw);
ssse3!(instr_660F380A, instr_0F380A, psignd);
// pmulhrsw
ssse3!(instr_660F380B, instr_0F380B, pmulhrsw);
// pabsb, pabsw, pabsd
ssse3!(instr_660F381C, instr_0F381C, pabsb);
ssse3!(instr_660F381D, instr_0F381D, pabsw);
ssse3!(instr_660F381E, instr_0F381E, pabsd);

#[no_mangle]
pub unsafe fn instr_660F3A0F(source: reg128, r: i32, imm8: i32) {
    // palignr xmm, xmm/m128, imm8
    xmm_op(source, r, &|d, s| palignr(d, s, imm8))
}
#[no_mangle]
pub unsafe fn instr_0F3A0F(source: u64, r: i32, imm8: i32) {
    // palignr mm, mm/m64, imm8
    mmx_op(source, r, &|d, s| palignr(d, s, imm8))
}

// SHA extensions. One instruction does the work of many scalar ones (sha256rnds2: two rounds),
// which is why they pay off in an emulator.

#[no_mangle]
pub unsafe fn instr_0F38C8(source: reg128, r: i32) {
    // sha1nexte xmm, xmm/m128
    let destination = read_xmm128s(r);
    let mut result = source;
    result.u32[3] = source.u32[3].wrapping_add(destination.u32[3].rotate_left(30));
    write_xmm_reg128(r, result);
}
#[no_mangle]
pub unsafe fn instr_0F38C9(source: reg128, r: i32) {
    // sha1msg1 xmm, xmm/m128
    let d = read_xmm128s(r).u32;
    let s = source.u32;
    write_xmm_reg128(
        r,
        reg128 {
            u32: [s[2] ^ d[0], s[3] ^ d[1], d[0] ^ d[2], d[1] ^ d[3]],
        },
    );
}
#[no_mangle]
pub unsafe fn instr_0F38CA(source: reg128, r: i32) {
    // sha1msg2 xmm, xmm/m128
    let d = read_xmm128s(r).u32;
    let s = source.u32;
    let w16 = (d[3] ^ s[2]).rotate_left(1);
    let w17 = (d[2] ^ s[1]).rotate_left(1);
    let w18 = (d[1] ^ s[0]).rotate_left(1);
    let w19 = (d[0] ^ w16).rotate_left(1);
    write_xmm_reg128(
        r,
        reg128 {
            u32: [w19, w18, w17, w16],
        },
    );
}
#[no_mangle]
pub unsafe fn instr_0F3ACC(source: reg128, r: i32, imm8: i32) {
    // sha1rnds4 xmm, xmm/m128, imm8
    let d = read_xmm128s(r).u32;
    let w = source.u32;
    let (mut a, mut b, mut c, mut d, mut e) = (d[3], d[2], d[1], d[0], 0u32);
    let k = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6][imm8 as usize & 3];
    for i in 0..4 {
        let f = match imm8 & 3 {
            0 => b & c ^ !b & d,
            2 => b & c ^ b & d ^ c & d,
            _ => b ^ c ^ d,
        };
        let t = f
            .wrapping_add(a.rotate_left(5))
            .wrapping_add(w[3 - i])
            .wrapping_add(e)
            .wrapping_add(k);
        e = d;
        d = c;
        c = b.rotate_left(30);
        b = a;
        a = t;
    }
    write_xmm_reg128(r, reg128 { u32: [d, c, b, a] });
}
#[no_mangle]
pub unsafe fn instr_0F38CB(source: reg128, r: i32) {
    // sha256rnds2 xmm, xmm/m128, <xmm0>
    let wk = read_xmm128s(0).u32;
    let s1 = read_xmm128s(r).u32;
    let s2 = source.u32;
    let (mut a, mut b, mut e, mut f) = (s2[3], s2[2], s2[1], s2[0]);
    let (mut c, mut d, mut g, mut h) = (s1[3], s1[2], s1[1], s1[0]);
    for i in 0..2 {
        let t1 = h
            .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
            .wrapping_add(e & f ^ !e & g)
            .wrapping_add(wk[i]);
        let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22))
            .wrapping_add(a & b ^ a & c ^ b & c);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    write_xmm_reg128(r, reg128 { u32: [f, e, b, a] });
}
fn sigma0(x: u32) -> u32 { x.rotate_right(7) ^ x.rotate_right(18) ^ x >> 3 }
fn sigma1(x: u32) -> u32 { x.rotate_right(17) ^ x.rotate_right(19) ^ x >> 10 }
#[no_mangle]
pub unsafe fn instr_0F38CC(source: reg128, r: i32) {
    // sha256msg1 xmm, xmm/m128
    let d = read_xmm128s(r).u32;
    let w4 = source.u32[0];
    write_xmm_reg128(
        r,
        reg128 {
            u32: [
                d[0].wrapping_add(sigma0(d[1])),
                d[1].wrapping_add(sigma0(d[2])),
                d[2].wrapping_add(sigma0(d[3])),
                d[3].wrapping_add(sigma0(w4)),
            ],
        },
    );
}
#[no_mangle]
pub unsafe fn instr_0F38CD(source: reg128, r: i32) {
    // sha256msg2 xmm, xmm/m128
    let d = read_xmm128s(r).u32;
    let (w14, w15) = (source.u32[2], source.u32[3]);
    let w16 = d[0].wrapping_add(sigma1(w14));
    let w17 = d[1].wrapping_add(sigma1(w15));
    let w18 = d[2].wrapping_add(sigma1(w16));
    let w19 = d[3].wrapping_add(sigma1(w17));
    write_xmm_reg128(
        r,
        reg128 {
            u32: [w16, w17, w18, w19],
        },
    );
}
