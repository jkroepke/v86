//! A fast hasher for the maps of the JIT. The keys are small integers
//! (pages, offsets, addresses) that the guest cannot choose freely, so
//! there is no need for SipHash, the default of std. SipHash was about
//! 5 % of the time of a Linux program start, where every interpreted
//! basic block updates the hotness of its page.

use std::hash::{BuildHasherDefault, Hasher};

pub type HashMap<K, V> = std::collections::HashMap<K, V, BuildHasherDefault<FxHasher>>;
pub type HashSet<K> = std::collections::HashSet<K, BuildHasherDefault<FxHasher>>;

/// The hash function of rustc (FxHash) on 32-bit words.
#[derive(Default, Clone, Copy)]
pub struct FxHasher {
    hash: u32,
}

const SEED: u32 = 0x9e37_79b9;

impl FxHasher {
    #[inline]
    fn add(&mut self, word: u32) { self.hash = (self.hash.rotate_left(5) ^ word).wrapping_mul(SEED); }
}

impl Hasher for FxHasher {
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        let mut chunks = bytes.chunks_exact(4);
        for c in &mut chunks {
            self.add(u32::from_le_bytes([c[0], c[1], c[2], c[3]]));
        }
        for &b in chunks.remainder() {
            self.add(b as u32);
        }
    }
    #[inline]
    fn write_u8(&mut self, i: u8) { self.add(i as u32) }
    #[inline]
    fn write_u16(&mut self, i: u16) { self.add(i as u32) }
    #[inline]
    fn write_u32(&mut self, i: u32) { self.add(i) }
    #[inline]
    fn write_u64(&mut self, i: u64) {
        self.add(i as u32);
        self.add((i >> 32) as u32)
    }
    #[inline]
    fn write_usize(&mut self, i: usize) { self.add(i as u32) }
    #[inline]
    fn write_i32(&mut self, i: i32) { self.add(i as u32) }
    #[inline]
    fn finish(&self) -> u64 {
        // hashbrown takes the bucket from the low bits and the tag from the
        // high bits: mix the high bits of the product into the low ones
        (self.hash ^ (self.hash >> 15)) as u64
    }
}
