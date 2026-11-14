#!/bin/bash
# abs.sh <workload> <reps> <warm> <reqs> <dirA> <dirB> [rounds]: alternating steady-state runs
# (STEADY=1 PCPU=1) of two builds; prints the medians per request of each build
cd "$(dirname "$0")"
wl=$1; n=$2; warm=$3; reqs=$4; A=$5; B=$6; rounds=${7:-1}; out=$(mktemp)
for i in $(seq "$n"); do
  for d in "$A" "$B"; do
    STEADY=1 PCPU=1 WARM=$warm REQS=$reqs V86=$d node bench.mjs "$wl" "$rounds" 2>&1 | grep " steady [0-9]" | sed "s|^|$d |"
  done
done > "$out"
python3 - "$out" "$A" "$B" <<'PY'
import re, sys, statistics as st
lines = open(sys.argv[1]).read().splitlines()
for d in sys.argv[2:]:
    rows = [l for l in lines if l.startswith(d + " ")]
    def m(pat):
        v = [float(re.search(pat, l).group(1)) for l in rows if re.search(pat, l)]
        return st.median(v) if v else float("nan")
    print(f"{d}: {m(r': ([0-9.]+) ms/req'):.2f} ms/req, cpu {m(r'cpu ([0-9.]+) ms/req'):.2f}, process cpu {m(r'process cpu ([0-9.]+) ms/req'):.2f}, p50 {m(r'p50 ([0-9.]+)'):.2f}, p99 {m(r'p99 ([0-9.]+)'):.2f} ms ({len(rows)} runs)")
PY
cat "$out" > "${ABS_LOG:-/dev/null}"
rm -f "$out"
