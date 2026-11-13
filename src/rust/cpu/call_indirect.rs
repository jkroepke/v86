// Calls the function of a generated module (see jit::jit_generate_module), which takes the
// registers as arguments
#[no_mangle]
pub fn call_indirect_module(
    f: fn(u16, i32, i32, i32, i32, i32, i32, i32, i32),
    state: u16,
    r: &[i32; 8],
) {
    f(state, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
}
