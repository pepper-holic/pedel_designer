#!/usr/bin/env bash
# Tool-only tail of the kit pipeline, once map.txt is written.
#   bash finish_kit.sh <bundle_dir> <goodsNo> [--layout]
# 1. kit_netlist: map.txt + board0_nets.json -> apps/web/src/core/library/kits/circuits/<id>.json (prints check: lines)
# 2. verify_overlay: map drawn on the board render -> <bundle>/verify.png
# 3. (--layout) suggest_layout appends AT lines to map.txt if it has none, then regenerates
# 4. copies map.txt to references/pcb-kits/maps/<goodsNo>.txt and runs the kit tests
set -euo pipefail
B="$1"; G="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"
cd "$ROOT"
ID=$(grep -m1 '^id ' "$B/map.txt" | awk '{print $2}')
IMG=$(grep -m1 '^image ' "$B/map.txt" | awk '{print $2}')
OUT="apps/web/src/core/library/kits/circuits/$ID.json"
python -E -P "$HERE/kit_netlist.py" "$B/map.txt" "$B/board0_nets.json" "$OUT"
if [ "${3:-}" = "--layout" ] && ! grep -q '^AT ' "$B/map.txt"; then
  printf '\n# --- schematic placement: draft from suggest_layout.py ---\n' >> "$B/map.txt"
  python -E -P "$HERE/suggest_layout.py" "$OUT" >> "$B/map.txt"
  python -E -P "$HERE/kit_netlist.py" "$B/map.txt" "$B/board0_nets.json" "$OUT"
fi
python -E -P "$HERE/verify_overlay.py" "$B/map.txt" "$B/board0_nets.json" "$B/$IMG" "$B/verify.png" 4
cp "$B/map.txt" "references/pcb-kits/maps/$G.txt"
(cd apps/web && npx vitest run tests/solver/kit-circuits.test.ts 2>&1 | grep -E '×|FAIL|Error|Tests ' | head -20)
