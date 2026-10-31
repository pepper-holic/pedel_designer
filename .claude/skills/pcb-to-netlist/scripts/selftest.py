"""Re-extract the hand-verified reference boards and compare with their known nets.

Usage (from the repo root):  python -E -P .claude/skills/pcb-to-netlist/scripts/selftest.py

Run after any change to extract_nets.py. The reference nets (tests/reference_nets.json) were checked
pad by pad against the silkscreen and against the original pedals' published schematics; a change
that merges or splits any of them is wrong, however much it helps some other board. Boards whose
image is not on this machine (references/ is not in git) are skipped with a note.
"""

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from extract_nets import run  # noqa: E402


def main() -> None:
    refs = json.loads((HERE.parent / "tests" / "reference_nets.json").read_text(encoding="utf-8"))
    failed = 0
    for ref in refs:
        image = Path(ref["image"])
        if not image.exists():
            print(f"skip {ref['name']}: {image} not collected here")
            continue
        # Ids follow the board's reference extraction (pads.assign_ids), as every map does.
        previous = image.parent / "board0_nets.json"
        with tempfile.TemporaryDirectory() as tmp:
            run(image, f"{tmp}/x", 1, previous=previous if previous.exists() else None)
            got = json.loads(Path(f"{tmp}/x.json").read_text(encoding="utf-8"))
        nets = sorted(sorted(v) for v in got["nets"].values())
        if len(got["pads"]) != ref["pads"] or nets != ref["nets"]:
            failed += 1
            want = {tuple(n) for n in ref["nets"]}
            have = {tuple(n) for n in nets}
            print(f"FAIL {ref['name']}: pads {len(got['pads'])}/{ref['pads']}; wrong nets {sorted(have - want)}; missing {sorted(want - have)}")
        else:
            print(f"ok   {ref['name']}: {ref['pads']} pads, {len(nets)} nets")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
