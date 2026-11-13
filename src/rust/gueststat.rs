// Counters about the guest for the profiler build (`make with-profiler`): where its
// instructions run (user, kernel, by cause of the kernel entry), which events it causes
// (interrupts by vector, system calls by number, port I/O by port, page faults, TLB flushes)
// and a histogram of sampled kernel addresses. tools/pod-bench reads them with GSTAT=1.
// Without the feature `profiler` every function here is empty.
#![allow(static_mut_refs)]

// V86_GUESTSTAT=1 make build/v86.wasm: a release build with only these counters, for host
// times that the other counters of the profiler build do not distort
pub const ON: bool = cfg!(feature = "profiler") || option_env!("V86_GUESTSTAT").is_some();

#[allow(non_camel_case_types)]
#[derive(Copy, Clone)]
pub enum G {
    INSTR_USER,
    INSTR_KERNEL_SYSCALL,
    INSTR_KERNEL_PAGE_FAULT,
    INSTR_KERNEL_IRQ,
    INSTR_KERNEL_OTHER,
    INSTR_USER_JIT,
    INSTR_KERNEL_JIT,
    RUNS_USER_JIT,
    RUNS_KERNEL_JIT,
    RUNS_USER_INTERPRETED,
    RUNS_KERNEL_INTERPRETED,
    MS_USER,
    MS_KERNEL,
    MS_IDLE,
    SYSENTER,
    SYSEXIT,
    IRET,
    INT80,
    HLT,
    RDTSC,
    CR3_WRITE,
    CR3_WRITE_SAME,
    INVLPG,
    TLB_CLEAR,
    TLB_ENTRIES_DROPPED,
    TLB_ENTRIES_KEPT_GLOBAL,
    TLB_CODE_DROPPED,
    PF_USER_NOT_PRESENT_READ,
    PF_USER_NOT_PRESENT_WRITE,
    PF_USER_PROTECTION_READ,
    PF_USER_PROTECTION_WRITE,
    PF_KERNEL_NOT_PRESENT_READ,
    PF_KERNEL_NOT_PRESENT_WRITE,
    PF_KERNEL_PROTECTION_READ,
    PF_KERNEL_PROTECTION_WRITE,
    CPL_CHANGE,
    SAMPLES_USER,
    SAMPLES_KERNEL,
    SAMPLES_KERNEL_OUTSIDE,
    COUNT,
}

const N: usize = if ON { 1 } else { 0 };
// Kernel text starts at 0xc1000000 (i386, 3G/1G split); 16 MiB in buckets of 16 bytes
const KTEXT: u32 = 0xc100_0000;
const KBUCKETS: usize = (16 << 20) >> 4;
const SAMPLE_PERIOD: u32 = 997;

static mut COUNTERS: [f64; G::COUNT as usize] = [0.0; G::COUNT as usize];
static mut VECTORS: [u32; 256 * N] = [0; 256 * N];
static mut SYSCALLS: [u32; 512 * N] = [0; 512 * N];
static mut SYSCALL_INSTR: [f64; 512 * N] = [0.0; 512 * N];
static mut PORT_READS: [u32; 0x10000 * N] = [0; 0x10000 * N];
static mut PORT_WRITES: [u32; 0x10000 * N] = [0; 0x10000 * N];
static mut KHIST: [u32; KBUCKETS * N] = [0; KBUCKETS * N];
// Sampled user pages (virtual page number -> samples)
static mut UHIST: [u32; 0x100000 * N] = [0; 0x100000 * N];

// Why the guest is in the kernel: the last entry from user mode
static mut CAUSE: G = G::INSTR_KERNEL_OTHER;
static mut CAUSE_SYSCALL: usize = 0;
static mut SAMPLE_ACC: u32 = 0;
static mut TIME_BUCKET: G = G::MS_KERNEL;
static mut TIME_LAST: f64 = 0.0;

#[inline(always)]
pub fn inc(g: G) { add(g, 1.0) }
#[inline(always)]
pub fn add(g: G, by: f64) {
    if ON {
        unsafe { COUNTERS[g as usize] += by }
    }
}

/// A block of `count` instructions ran; it started at `eip` with privilege level `cpl`
#[inline(always)]
pub fn block(cpl: u8, eip: i32, count: u32, jit: bool) {
    if !ON || count == 0 {
        return;
    }
    unsafe {
        let user = (cpl == 3) as usize;
        if jit {
            COUNTERS[G::INSTR_KERNEL_JIT as usize - user] += count as f64;
            COUNTERS[G::RUNS_KERNEL_JIT as usize - user] += 1.0;
        }
        else {
            COUNTERS[G::RUNS_KERNEL_INTERPRETED as usize - user] += 1.0;
        }
        if cpl == 3 {
            COUNTERS[G::INSTR_USER as usize] += count as f64;
        }
        else {
            COUNTERS[CAUSE as usize] += count as f64;
            if let G::INSTR_KERNEL_SYSCALL = CAUSE {
                SYSCALL_INSTR[CAUSE_SYSCALL] += count as f64;
            }
        }
        SAMPLE_ACC += count;
        while SAMPLE_ACC >= SAMPLE_PERIOD {
            SAMPLE_ACC -= SAMPLE_PERIOD;
            if cpl == 3 {
                COUNTERS[G::SAMPLES_USER as usize] += 1.0;
                UHIST[(eip as u32 >> 12) as usize] += 1;
            }
            else {
                let i = ((eip as u32).wrapping_sub(KTEXT) >> 4) as usize;
                if i < KBUCKETS {
                    COUNTERS[G::SAMPLES_KERNEL as usize] += 1.0;
                    KHIST[i] += 1;
                }
                else {
                    COUNTERS[G::SAMPLES_KERNEL_OUTSIDE as usize] += 1.0;
                }
            }
        }
    }
}

unsafe fn time_switch(bucket: G) {
    let now = crate::cpu::cpu::js::microtick();
    if TIME_LAST != 0.0 {
        COUNTERS[TIME_BUCKET as usize] += now - TIME_LAST;
    }
    TIME_LAST = now;
    TIME_BUCKET = bucket;
}

#[inline(always)]
pub fn cpl_changed(cpl: u8) {
    if ON {
        unsafe {
            COUNTERS[G::CPL_CHANGE as usize] += 1.0;
            time_switch(if cpl == 3 { G::MS_USER } else { G::MS_KERNEL });
        }
    }
}
#[inline(always)]
pub fn idle(idle: bool) {
    if ON {
        unsafe {
            time_switch(if idle { G::MS_IDLE } else { G::MS_KERNEL });
            if !idle {
                // an interrupt ended the wait in hlt
                CAUSE = G::INSTR_KERNEL_IRQ;
            }
        }
    }
}

/// An interrupt or exception goes through the IDT
#[inline(always)]
pub fn interrupt(vector: i32, is_software_int: bool, from_cpl: u8, eax: i32) {
    if !ON {
        return;
    }
    unsafe {
        VECTORS[vector as usize & 0xFF] += 1;
        if is_software_int && vector == 0x80 {
            COUNTERS[G::INT80 as usize] += 1.0;
            syscall(eax);
        }
        else if from_cpl == 3 {
            CAUSE = if vector == 14 {
                G::INSTR_KERNEL_PAGE_FAULT
            }
            else if vector >= 32 {
                G::INSTR_KERNEL_IRQ
            }
            else {
                G::INSTR_KERNEL_OTHER
            };
        }
    }
}

#[inline(always)]
pub fn syscall(eax: i32) {
    if ON {
        unsafe {
            CAUSE = G::INSTR_KERNEL_SYSCALL;
            CAUSE_SYSCALL = (eax as u32).min(511) as usize;
            SYSCALLS[CAUSE_SYSCALL] += 1;
        }
    }
}

#[inline(always)]
pub fn page_fault(user: bool, present: bool, write: bool) {
    if ON {
        let i = G::PF_USER_NOT_PRESENT_READ as usize
            + if user { 0 } else { 4 }
            + if present { 2 } else { 0 }
            + write as usize;
        unsafe { COUNTERS[i] += 1.0 }
    }
}

#[inline(always)]
pub fn port(port: i32, write: bool) {
    if ON {
        unsafe {
            if write {
                PORT_WRITES[port as usize & 0xFFFF] += 1
            }
            else {
                PORT_READS[port as usize & 0xFFFF] += 1
            }
        }
    }
}

/// kind 0: counter, 1: interrupts by vector, 2: system calls by number, 3: kernel
/// instructions by system call, 4: port reads, 5: port writes, 6: samples per 16 bytes of
/// kernel text (from 0xc1000000), 7: samples per user page
#[no_mangle]
pub fn gueststat_get(kind: u32, index: u32) -> f64 {
    if !ON {
        return 0.0;
    }
    let i = index as usize;
    unsafe {
        match kind {
            0 if i < COUNTERS.len() => COUNTERS[i],
            1 if i < VECTORS.len() => VECTORS[i] as f64,
            2 if i < SYSCALLS.len() => SYSCALLS[i] as f64,
            3 if i < SYSCALL_INSTR.len() => SYSCALL_INSTR[i],
            4 if i < PORT_READS.len() => PORT_READS[i] as f64,
            5 if i < PORT_WRITES.len() => PORT_WRITES[i] as f64,
            6 if i < KHIST.len() => KHIST[i] as f64,
            7 if i < UHIST.len() => UHIST[i] as f64,
            _ => -1.0,
        }
    }
}

#[no_mangle]
pub fn gueststat_reset() {
    if !ON {
        return;
    }
    unsafe {
        COUNTERS.iter_mut().for_each(|x| *x = 0.0);
        VECTORS.iter_mut().for_each(|x| *x = 0);
        SYSCALLS.iter_mut().for_each(|x| *x = 0);
        SYSCALL_INSTR.iter_mut().for_each(|x| *x = 0.0);
        PORT_READS.iter_mut().for_each(|x| *x = 0);
        PORT_WRITES.iter_mut().for_each(|x| *x = 0);
        KHIST.iter_mut().for_each(|x| *x = 0);
        UHIST.iter_mut().for_each(|x| *x = 0);
        TIME_LAST = 0.0;
    }
}
