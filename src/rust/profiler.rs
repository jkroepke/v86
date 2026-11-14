#[allow(non_camel_case_types)]
pub enum stat {
    COMPILE,
    COMPILE_SKIPPED_NO_NEW_ENTRY_POINTS,
    COMPILE_WRONG_ADDRESS_SPACE,
    COMPILE_CUT_OFF_AT_END_OF_PAGE,
    COMPILE_WITH_LOOP_SAFETY,
    COMPILE_PAGE,
    COMPILE_BASIC_BLOCK,
    COMPILE_DUPLICATED_BASIC_BLOCK,
    COMPILE_WASM_BLOCK,
    COMPILE_WASM_LOOP,
    COMPILE_DISPATCHER,
    COMPILE_ENTRY_POINT,
    COMPILE_WASM_TOTAL_BYTES,

    RUN_INTERPRETED,
    RUN_INTERPRETED_NEW_PAGE,
    RUN_INTERPRETED_PAGE_HAS_CODE,
    RUN_INTERPRETED_PAGE_HAS_ENTRY_AFTER_PAGE_WALK,
    RUN_INTERPRETED_NEAR_END_OF_PAGE,
    RUN_INTERPRETED_DIFFERENT_STATE,
    RUN_INTERPRETED_DIFFERENT_STATE_CPL3,
    RUN_INTERPRETED_DIFFERENT_STATE_FLAT,
    RUN_INTERPRETED_DIFFERENT_STATE_IS32,
    RUN_INTERPRETED_DIFFERENT_STATE_SS32,
    RUN_INTERPRETED_MISSED_COMPILED_ENTRY_RUN_INTERPRETED,
    RUN_INTERPRETED_STEPS,

    RUN_FROM_CACHE,
    RUN_FROM_CACHE_STEPS,

    DIRECT_EXIT,
    INDIRECT_JUMP,
    INDIRECT_JUMP_NO_ENTRY,
    NORMAL_PAGE_CHANGE,
    NORMAL_FALLTHRU,
    NORMAL_FALLTHRU_WITH_TARGET_BLOCK,
    NORMAL_BRANCH,
    NORMAL_BRANCH_WITH_TARGET_BLOCK,
    CONDITIONAL_JUMP,
    CONDITIONAL_JUMP_PAGE_CHANGE,
    CONDITIONAL_JUMP_EXIT,
    CONDITIONAL_JUMP_FALLTHRU,
    CONDITIONAL_JUMP_FALLTHRU_WITH_TARGET_BLOCK,
    CONDITIONAL_JUMP_BRANCH,
    CONDITIONAL_JUMP_BRANCH_WITH_TARGET_BLOCK,
    DISPATCHER_SMALL,
    DISPATCHER_LARGE,
    LOOP,

    LOOP_SAFETY,

    CONDITION_OPTIMISED,
    CONDITION_UNOPTIMISED,
    CONDITION_UNOPTIMISED_PF,
    CONDITION_UNOPTIMISED_UNHANDLED_L,
    CONDITION_UNOPTIMISED_UNHANDLED_LE,

    FAILED_PAGE_CHANGE,

    SAFE_READ_FAST,
    SAFE_READ_SLOW_PAGE_CROSSED,
    SAFE_READ_SLOW_NOT_VALID,
    SAFE_READ_SLOW_NOT_USER,
    SAFE_READ_SLOW_IN_MAPPED_RANGE,

    SAFE_WRITE_FAST,
    SAFE_WRITE_SLOW_PAGE_CROSSED,
    SAFE_WRITE_SLOW_NOT_VALID,
    SAFE_WRITE_SLOW_NOT_USER,
    SAFE_WRITE_SLOW_IN_MAPPED_RANGE,
    SAFE_WRITE_SLOW_READ_ONLY,
    SAFE_WRITE_SLOW_HAS_CODE,

    SAFE_READ_WRITE_FAST,
    SAFE_READ_WRITE_SLOW_PAGE_CROSSED,
    SAFE_READ_WRITE_SLOW_NOT_VALID,
    SAFE_READ_WRITE_SLOW_NOT_USER,
    SAFE_READ_WRITE_SLOW_IN_MAPPED_RANGE,
    SAFE_READ_WRITE_SLOW_READ_ONLY,
    SAFE_READ_WRITE_SLOW_HAS_CODE,

    PAGE_FAULT,
    TLB_MISS,

    MAIN_LOOP,
    MAIN_LOOP_IDLE,
    DO_MANY_CYCLES,
    CYCLE_INTERNAL,

    INVALIDATE_ALL_MODULES_NO_FREE_WASM_INDICES,
    INVALIDATE_MODULE_WRITTEN_WHILE_COMPILED,
    INVALIDATE_MODULE_UNUSED_AFTER_OVERWRITE,
    INVALIDATE_MODULE_DIRTY_PAGE,

    INVALIDATE_PAGE_HAD_CODE,
    INVALIDATE_PAGE_HAD_ENTRY_POINTS,
    DIRTY_PAGE_DID_NOT_HAVE_CODE,

    RUN_FROM_CACHE_EXIT_SAME_PAGE,
    RUN_FROM_CACHE_EXIT_NEAR_END_OF_PAGE,
    RUN_FROM_CACHE_EXIT_DIFFERENT_PAGE,

    CLEAR_TLB,
    FULL_CLEAR_TLB,
    TLB_FULL,
    TLB_GLOBAL_FULL,

    MODRM_SIMPLE_REG,
    MODRM_SIMPLE_REG_WITH_OFFSET,
    MODRM_SIMPLE_CONST_OFFSET,
    MODRM_COMPLEX,

    SEG_OFFSET_OPTIMISED,
    SEG_OFFSET_NOT_OPTIMISED,
    SEG_OFFSET_NOT_OPTIMISED_ES,
    SEG_OFFSET_NOT_OPTIMISED_FS,
    SEG_OFFSET_NOT_OPTIMISED_GS,
    SEG_OFFSET_NOT_OPTIMISED_NOT_FLAT,

    // compile statistics (see jit.rs: module_compiled, module_freed)
    COMPILE_RECOMPILE,
    COMPILE_RECOMPILE_BYTES,
    COMPILE_AFTER_INVALIDATE,
    COMPILE_AFTER_INVALIDATE_BYTES,
    PAGE_COMPILED_1,
    PAGE_COMPILED_2,
    PAGE_COMPILED_3_4,
    PAGE_COMPILED_5_8,
    PAGE_COMPILED_9_16,
    PAGE_COMPILED_17_MORE,
    MODULE_FREED,
    MODULE_ENTERED_0,
    MODULE_ENTERED_1_9,
    MODULE_ENTERED_10_99,
    MODULE_ENTERED_100_999,
    MODULE_ENTERED_1K_10K,
    MODULE_ENTERED_10K_100K,
    MODULE_ENTERED_100K_MORE,
    MODULE_BYTES_ENTERED_0,
    MODULE_BYTES_ENTERED_1_9,
    MODULE_BYTES_ENTERED_10_99,
    MODULE_BYTES_ENTERED_100_999,
    MODULE_BYTES_ENTERED_1K_10K,
    MODULE_BYTES_ENTERED_10K_100K,
    MODULE_BYTES_ENTERED_100K_MORE,
    MODULE_PAGES_1,
    MODULE_PAGES_2,
    MODULE_PAGES_3_MORE,
    MODULE_BYTES_PAGES_1,
    MODULE_BYTES_PAGES_2,
    MODULE_BYTES_PAGES_3_MORE,
    MODULE_BLOCKS_EXECUTED,
    MODULE_BLOCKS_COLD,
    MODULE_BLOCK_BYTES_EXECUTED,
    MODULE_BLOCK_BYTES_COLD,
    MODULE_BLOCK_BYTES_ENTRY_EXECUTED,
    MODULE_BLOCK_BYTES_ENTRY_COLD,
    MODULE_BLOCKS_ENTRY_EXECUTED,
    MODULE_BLOCKS_ENTRY_COLD,
    RECOMPILE_BLOCK_BYTES,
    RECOMPILE_DELTA_BLOCK_BYTES,
    MARKS_EVICTED,
    COMPILE_COLD_EDGE,
    COMPILE_WITHOUT_MARKS,
    JIT_BAIL,
    COMPILE_FUNCTION,
    COMPILE_SPLIT_MODULE,
    REGION_CALL,
    REGION_LEAVE,
}

#[allow(non_upper_case_globals)]
pub static mut stat_array: [u64; 500] = [0; 500];

// Rows: other, cmp, sub, dec, add, inc, adc/sbb, nonzero shift, bitwise.
// Columns are the low four bits of the x86 condition code.
#[allow(non_upper_case_globals)]
pub static mut condition_array: [u64; 9 * 16] = [0; 9 * 16];

#[no_mangle]
pub fn profiler_condition_get(previous: u32, condition: u32) -> f64 {
    if cfg!(feature = "profiler") && previous < 9 && condition < 16 {
        unsafe { condition_array[(previous * 16 + condition) as usize] as f64 }
    }
    else {
        0.0
    }
}

pub fn stat_increment(stat: stat) { stat_increment_by(stat, 1); }

pub fn stat_increment_by(stat: stat, by: u64) {
    if cfg!(feature = "profiler") {
        unsafe { stat_array[stat as usize] += by }
    }
}

// Per wasm table index: entries from the main loop and size of the module (0: free)
// (only allocated in profiler builds)
const MODULES: usize = if cfg!(feature = "profiler") { crate::jit::WASM_TABLE_SIZE as usize } else { 1 };
const PAGES: usize = if cfg!(feature = "profiler") { 0x100000 } else { 1 };
static mut MODULE_ENTRIES: [u64; MODULES] = [0; MODULES];
static mut MODULE_BYTES: [u32; MODULES] = [0; MODULES];
// Per physical page: number of modules compiled for it, invalidations with code
static mut PAGE_COMPILES: [u16; PAGES] = [0; PAGES];
static mut PAGE_INVALIDATIONS: [u16; PAGES] = [0; PAGES];

// profiler: basic blocks (address, code bytes) per module, executed (module, address)
static mut BLOCKS: Option<crate::hash::HashMap<u16, Vec<(u32, u32, bool)>>> = None;
static mut EXECUTED: Option<crate::hash::HashSet<(u16, u32)>> = None;

#[allow(static_mut_refs)]
pub fn module_blocks(index: u16, blocks: Vec<(u32, u32, bool)>) {
    if !cfg!(feature = "profiler") {
        return;
    }
    unsafe {
        let ex = EXECUTED.get_or_insert_with(Default::default);
        for &(a, _, _) in &blocks {
            ex.remove(&(index, a));
        }
        BLOCKS.get_or_insert_with(Default::default).insert(index, blocks);
    }
}

#[allow(static_mut_refs)]
pub fn module_delta(index: u16, delta: &crate::hash::HashSet<u32>) {
    if !cfg!(feature = "profiler") {
        return;
    }
    unsafe {
        if let Some(blocks) = BLOCKS.as_ref().and_then(|b| b.get(&index)) {
            for &(a, bytes, _) in blocks {
                stat_increment_by(stat::RECOMPILE_BLOCK_BYTES, bytes as u64);
                if delta.contains(&a) {
                    stat_increment_by(stat::RECOMPILE_DELTA_BLOCK_BYTES, bytes as u64);
                }
            }
        }
    }
}

#[allow(static_mut_refs)]
pub fn block_entered(index: u16, addr: u32) {
    if cfg!(feature = "profiler") {
        unsafe {
            EXECUTED.get_or_insert_with(Default::default).insert((index, addr));
        }
    }
}

#[allow(static_mut_refs)]
fn count_blocks(index: u16) {
    unsafe {
        let blocks = match BLOCKS.as_mut().and_then(|b| b.remove(&index)) {
            Some(b) => b,
            None => return,
        };
        let ex = EXECUTED.get_or_insert_with(Default::default);
        for (a, bytes, entry) in blocks {
            let executed = ex.remove(&(index, a));
            if entry {
                stat_increment(if executed { stat::MODULE_BLOCKS_ENTRY_EXECUTED } else { stat::MODULE_BLOCKS_ENTRY_COLD });
                stat_increment_by(
                    if executed { stat::MODULE_BLOCK_BYTES_ENTRY_EXECUTED } else { stat::MODULE_BLOCK_BYTES_ENTRY_COLD },
                    bytes as u64,
                );
            }
            if executed {
                stat_increment(stat::MODULE_BLOCKS_EXECUTED);
                stat_increment_by(stat::MODULE_BLOCK_BYTES_EXECUTED, bytes as u64);
            }
            else {
                stat_increment(stat::MODULE_BLOCKS_COLD);
                stat_increment_by(stat::MODULE_BLOCK_BYTES_COLD, bytes as u64);
            }
        }
    }
}

pub fn module_entered(index: u16) {
    if cfg!(feature = "profiler") {
        unsafe { MODULE_ENTRIES[index as usize] += 1 }
    }
}

pub fn module_compiled(index: u16, bytes: u32, pages: &[u32]) {
    if !cfg!(feature = "profiler") {
        return;
    }
    unsafe {
        MODULE_ENTRIES[index as usize] = 0;
        MODULE_BYTES[index as usize] = bytes;
        let (n, b) = match pages.len() {
            1 => (stat::MODULE_PAGES_1, stat::MODULE_BYTES_PAGES_1),
            2 => (stat::MODULE_PAGES_2, stat::MODULE_BYTES_PAGES_2),
            _ => (stat::MODULE_PAGES_3_MORE, stat::MODULE_BYTES_PAGES_3_MORE),
        };
        stat_increment(n);
        stat_increment_by(b, bytes as u64);
        let mut recompile = false;
        let mut after_invalidate = false;
        for &p in pages {
            let c = &mut PAGE_COMPILES[p as usize];
            if *c > 0 {
                recompile = true;
            }
            *c = c.saturating_add(1);
            if PAGE_INVALIDATIONS[p as usize] > 0 {
                after_invalidate = true;
            }
        }
        if recompile {
            stat_increment(stat::COMPILE_RECOMPILE);
            stat_increment_by(stat::COMPILE_RECOMPILE_BYTES, bytes as u64);
        }
        if after_invalidate {
            stat_increment(stat::COMPILE_AFTER_INVALIDATE);
            stat_increment_by(stat::COMPILE_AFTER_INVALIDATE_BYTES, bytes as u64);
        }
    }
}

pub fn page_invalidated(page: u32) {
    if cfg!(feature = "profiler") {
        unsafe {
            let c = &mut PAGE_INVALIDATIONS[page as usize];
            *c = c.saturating_add(1);
        }
    }
}

pub fn module_freed(index: u16) {
    if !cfg!(feature = "profiler") {
        return;
    }
    unsafe {
        let bytes = MODULE_BYTES[index as usize];
        if bytes == 0 {
            return;
        }
        MODULE_BYTES[index as usize] = 0;
        count_blocks(index);
        stat_increment(stat::MODULE_FREED);
        bucket_module(MODULE_ENTRIES[index as usize], bytes);
    }
}

fn bucket_module(entries: u64, bytes: u32) {
    let (n, b) = match entries {
        0 => (stat::MODULE_ENTERED_0, stat::MODULE_BYTES_ENTERED_0),
        1..=9 => (stat::MODULE_ENTERED_1_9, stat::MODULE_BYTES_ENTERED_1_9),
        10..=99 => (stat::MODULE_ENTERED_10_99, stat::MODULE_BYTES_ENTERED_10_99),
        100..=999 => (stat::MODULE_ENTERED_100_999, stat::MODULE_BYTES_ENTERED_100_999),
        1000..=9999 => (stat::MODULE_ENTERED_1K_10K, stat::MODULE_BYTES_ENTERED_1K_10K),
        10000..=99999 => (stat::MODULE_ENTERED_10K_100K, stat::MODULE_BYTES_ENTERED_10K_100K),
        _ => (stat::MODULE_ENTERED_100K_MORE, stat::MODULE_BYTES_ENTERED_100K_MORE),
    };
    stat_increment(n);
    stat_increment_by(b, bytes as u64);
}

/// Add the modules that are still alive to the histograms and the compile counts of pages
#[no_mangle]
pub fn profiler_flush() {
    if !cfg!(feature = "profiler") {
        return;
    }
    unsafe {
        for i in 0..MODULES {
            if MODULE_BYTES[i] != 0 {
                bucket_module(MODULE_ENTRIES[i], MODULE_BYTES[i]);
                count_blocks(i as u16);
            }
        }
        #[allow(static_mut_refs)]
        for &c in PAGE_COMPILES.iter() {
            match c {
                0 => {},
                1 => stat_increment(stat::PAGE_COMPILED_1),
                2 => stat_increment(stat::PAGE_COMPILED_2),
                3..=4 => stat_increment(stat::PAGE_COMPILED_3_4),
                5..=8 => stat_increment(stat::PAGE_COMPILED_5_8),
                9..=16 => stat_increment(stat::PAGE_COMPILED_9_16),
                _ => stat_increment(stat::PAGE_COMPILED_17_MORE),
            }
        }
    }
}

#[no_mangle]
pub fn profiler_init() {
    unsafe {
        BLOCKS = None;
        EXECUTED = None;
        #[allow(static_mut_refs)]
        for x in MODULE_ENTRIES.iter_mut() {
            *x = 0
        }
        #[allow(static_mut_refs)]
        for x in MODULE_BYTES.iter_mut() {
            *x = 0
        }
        #[allow(static_mut_refs)]
        for x in PAGE_COMPILES.iter_mut() {
            *x = 0
        }
        #[allow(static_mut_refs)]
        for x in PAGE_INVALIDATIONS.iter_mut() {
            *x = 0
        }
        #[allow(static_mut_refs)]
        for x in condition_array.iter_mut() {
            *x = 0
        }
        #[allow(static_mut_refs)]
        for x in stat_array.iter_mut() {
            *x = 0
        }
    }
}

#[no_mangle]
pub fn profiler_stat_get(stat: stat) -> f64 {
    if cfg!(feature = "profiler") {
        unsafe { stat_array[stat as usize] as f64 }
    }
    else {
        0.0
    }
}

#[no_mangle]
pub fn profiler_is_enabled() -> bool { cfg!(feature = "profiler") }
