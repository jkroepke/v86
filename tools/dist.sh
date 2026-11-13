#!/bin/sh
# dist.sh: build the release files of HEAD and commit them to the branch
# "dist", which tabernetes pins as "github:jkroepke/v86#<commit>". npm installs
# a Git dependency as it is, so the branch holds only what the npm package
# holds: no Rust or Java is needed where tabernetes builds.
# Usage: tools/dist.sh [--push]   (run from a clean checkout of master)
set -eu
cd "$(dirname "$0")/.."
test -z "$(git status --porcelain --untracked-files=no)" || { echo "dist.sh: the checkout has changes" >&2; exit 1; }
src=$(git rev-parse --short=12 HEAD)
make build/v86.wasm build/libv86.mjs build/libv86.js
base=$(node -p 'require("./package.json").version')
count=$(git rev-list --count HEAD)
ver="$base.$count-fork.$src"   # unique per commit: tabernetes keys saved VM states by it
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" 2>/dev/null || rm -rf "$tmp"' EXIT
if git rev-parse -q --verify refs/remotes/origin/dist >/dev/null || git fetch -q origin dist 2>/dev/null; then
  git worktree add -q --detach "$tmp" origin/dist
else
  git worktree add -q --detach "$tmp" HEAD && git -C "$tmp" checkout -q --orphan dist-new && git -C "$tmp" rm -rqf .
fi
find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
mkdir -p "$tmp/build"
cp LICENSE Readme.md v86.d.ts "$tmp/"
cp build/v86.wasm build/libv86.mjs build/libv86.js "$tmp/build/"
node -e '
const p = require("./package.json");
p.version = process.argv[1];
p.repository = "github:jkroepke/v86";
delete p.scripts; delete p.devDependencies;
require("fs").writeFileSync(process.argv[2] + "/package.json", JSON.stringify(p, null, 2) + "\n");
' "$ver" "$tmp"
git -C "$tmp" add -A
git -C "$tmp" commit -q -s -m "Build of $src ($ver)" -m "Built by tools/dist.sh from $(git rev-parse HEAD)."
echo "dist commit $(git -C "$tmp" rev-parse HEAD) = $ver"
if [ "${1:-}" = "--push" ]; then git -C "$tmp" push origin HEAD:refs/heads/dist; fi
