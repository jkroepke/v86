#!/bin/bash
# ab.sh <workload> <reps> <dirA> <dirB>: alternating runs of two builds, 5 rounds each,
# prints the median wall and main-thread CPU time of each build.
cd "$(dirname "$0")"
wl=$1; n=$2; A=$3; B=$4; out=$(mktemp)
for i in $(seq "$n"); do
  for d in "$A" "$B"; do V86=$d node bench.mjs "$wl" 5 2>&1 | grep "round" | sed "s|^|$d |"; done
done > "$out"
for d in "$A" "$B"; do
  med() { grep "^$d " "$out" | sed "s/.* $1 \([0-9]*\) ms.*/\1/" | sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}'; }
  echo "$d: median done $(med done) ms, cpu $(med cpu) ms ($(grep -c "^$d " "$out") rounds)"
done
rm -f "$out"
