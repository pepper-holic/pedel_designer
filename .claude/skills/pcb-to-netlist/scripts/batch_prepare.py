"""Tool-only pass over every kit with a board render: extract pads/nets and sort kits by difficulty.

Usage:
    python -E -P batch_prepare.py <pcb-kits root>

For each kit (index.json item "kit") and each of its board-trace images it writes
<root>/<goodsNo>/board<N>_nets.json and board<N>_nets.png (the numbered overlay a reader maps parts
on), then <root>/triage.json: one row per board with the extraction counts, whether another kit
shows the same board image, and a tier:
  A  simulatable family, <= 60 pads, at most 2 lone pads - start here
  B  simulatable family, otherwise
  C  family the simulator cannot run yet (delay, reverb, modulation, compressor, gate, utility, amp)
Lone pads are non-ground pads whose net has no other pad: either an off-board wire point or a trace
the extractor could not follow - many of them on one board means a closer look is needed.
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_nets import run  # noqa: E402

SIMULATABLE = {"overdrive", "distortion", "fuzz", "buffer-boost", "preamp", "eq", "unknown"}
EASY_PADS = 60
EASY_LONE = 2


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    root = Path(sys.argv[1])
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    rows = []
    first_kit_by_src: dict[str, str] = {}
    for kit in index:
        if kit["item"] != "kit":
            continue
        boards = [im for im in kit["images"] if im["kind"] == "board-trace"]
        for n, im in enumerate(boards):
            prefix = root / kit["goodsNo"] / f"board{n}_nets"
            try:
                st = run(root / kit["goodsNo"] / im["file"], str(prefix), 3)
            except Exception as err:  # one unreadable image must not stop the batch
                print(f"{kit['goodsNo']} {im['file']}: {err}")
                continue
            same = first_kit_by_src.setdefault(im["src"], kit["goodsNo"]) if im["src"] else kit["goodsNo"]
            family_ok = kit["type"] in SIMULATABLE
            if not family_ok:
                tier = "C"
            elif st["pads"] <= EASY_PADS and st["loneNonGroundPads"] <= EASY_LONE:
                tier = "A"
            else:
                tier = "B"
            rows.append({
                "goodsNo": kit["goodsNo"],
                "name": kit["name"],
                "type": kit["type"],
                "about": kit["about"][:80],
                "board": n,
                "image": im["file"],
                "sameBoardAs": same if same != kit["goodsNo"] else None,
                "bomImages": [i["file"] for i in kit["images"] if i["kind"] == "bom-table"],
                **st,
                "twoLayer": st["bottomLayerPixels"] > 0.03 * max(st["topLayerPixels"], 1),
                "tier": tier,
            })
    rows.sort(key=lambda r: (r["tier"], r["pads"]))
    (root / "triage.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    unique = [r for r in rows if not r["sameBoardAs"]]
    print(f"{len(rows)} boards ({len(unique)} distinct) from {len({r['goodsNo'] for r in rows})} kits")
    print("tiers (distinct boards):", dict(Counter(r["tier"] for r in unique)))
    print("two-layer:", sum(r["twoLayer"] for r in unique), " lone pads > 2:", sum(r["loneNonGroundPads"] > 2 for r in unique))


if __name__ == "__main__":
    main()
