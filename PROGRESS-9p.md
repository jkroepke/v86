# 9p / I/O track (branch ninep, WIP pushed to wip/9p)

## Done
- Baseline profiles (master build, V8 profile, inclusive share of main thread):
  nginx: 9p+virtio-9p ~2 %, io_port_write16 2.0 %, wasm-to-js 3.3 %; main_loop 84 %.
  goapp: 9p 0.3 %, port_write16 2.2 % (mostly virtio-net), GC 3.8 %.
  glibc: port_write16 4.8 % = 9p 4.5 % (FillDirectory 1.9 %, TextEncoder 1.5 %).
  => a wasm port of 9p/virtio is not worth it (<5 %).
- Requests per pod (stats build, bench/9p/stats): nginx ~750 (225 Tread = 11 MB, avg 49 KB),
  goapp ~160 (131 Tread = 11.2 MB, avg 86 KB), glibc ~16k (8052 Tread = 35 MB, 1851 Treaddir).
  Reads use the big msize (not split). Before: all Tread/Tlopen/Treaddir answered async.
- WIP commit: Rread data straight into guest buffers (no replybuffer copy),
  sync completion when data is at hand (OpenInode/CloseInode sync, FS.ReadNow),
  optional storage.readInto(key, offset, dest, size) (zero copy, sync), dir listing
  only rebuilt at Tlopen/readdir offset 0, FillDirectory encodes once.
- Bench helpers in /home/claude/bench/9p: bench9p.mjs/core9p.mjs (ROOTFS=, LAYER_INTO=1
  emulates an OPFS sync access handle with fs.readSync), rootfs-into.js (LayerStorage.readInto),
  ab3.sh (A master / B new / C new+readInto).

- Split into 2 commits (3b841e1 read path/readInto, 23bd2ed directory listing), measured,
  correctness: bench/9p/check.sh hashes equal for master / new / new+readInto (chk3-*.txt).

## Next
- tests: eslint, rust-test not needed; push ninep to master after rebase on origin/master.
- report; tabernetes proposal: LayerStorage.readInto (bench/9p/rootfs-into.js) + layers.js
  read-only sync access handle in vmworker.
