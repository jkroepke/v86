#!/bin/bash
# Fetches what the benchmark needs into tools/pod-bench/data:
# - the pod VM (vmlinux, init) of a tabernetes release
# - three modules of tabernetes that boot the VM and build the 9p root file system
# - container images as flat tars (docker export of the linux/386 variant)
set -euo pipefail
cd "$(dirname "$0")"
TAG=${TABERNETES_VERSION:-v1.9.0}
mkdir -p data/vm data/tabernetes
curl -fsSL "https://github.com/jkroepke/tabernetes/releases/download/$TAG/tabernetes.tar.gz" | tar xz -C data ./vm/vmlinux ./vm/init
for f in initramfs.js kernelboot.js rootfs.js; do
  curl -fsSL "https://raw.githubusercontent.com/jkroepke/tabernetes/$TAG/web/src/$f" -o "data/tabernetes/$f"
done
for img in nginx alpine; do
  [ -f "data/$img.tar" ] && continue
  docker pull -q --platform linux/386 "$img:latest" >/dev/null
  cid=$(docker create --platform linux/386 "$img:latest")
  docker export "$cid" > "data/$img.tar"
  docker rm "$cid" >/dev/null
done
echo "ready: $(ls data)"
