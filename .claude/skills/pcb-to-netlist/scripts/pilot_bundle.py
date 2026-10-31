"""Put everything needed to map one kit into a single folder, plus a map-file skeleton.

Usage:
    python -E -P pilot_bundle.py <pcb-kits root> <goodsNo> <out_dir>

Copies the numbered pad overlay(s), the board render(s), the parts-list image(s), the seller text
and the extraction JSON, then writes <out_dir>/map.txt with the header filled in from index.json,
the io line and part lines drafted by auto_map.py (silk read with the glyph bank; doubtful lines
commented "# ?"), and the list of multi-pad nets as comments. Checking the draft against the overlay
and the parts list, and writing what it missed, is the part that needs a human (or an LLM).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit_types import NOISE_WORDS  # noqa: E402


def auto_draft(board: Path, nets: Path) -> list[str] | None:
    """Part lines from auto_map.py, or None when the glyph bank is not built yet."""
    from silk_ocr import BANK_PATH  # noqa: E402

    if not BANK_PATH.exists():
        print(f"no {BANK_PATH.name}: map.txt gets no auto_map draft (build it with silk_train.py)")
        return None
    from auto_map import draft, render  # noqa: E402
    from lexicon import Lexicon  # noqa: E402
    from silk_ocr import Bank  # noqa: E402

    return render(draft(board, nets, Bank.load(), Lexicon()))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    root, goods, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    kit = next(k for k in json.loads((root / "index.json").read_text(encoding="utf-8")) if k["goodsNo"] == goods)
    src = root / goods
    boards = [im["file"] for im in kit["images"] if im["kind"] == "board-trace"]
    boms = [im["file"] for im in kit["images"] if im["kind"] in ("bom-table", "diagram")]
    for f in boards + boms + ["info.txt"]:
        shutil.copy(src / f, out / f)
    for n in range(len(boards)):
        for ext in ("json", "png"):
            shutil.copy(src / f"board{n}_nets.{ext}", out / f"board{n}_nets.{ext}")
    # SMD kits: re-extract with virtual pads for the SMD legs (the stock extraction leaves them unmapped).
    info = (src / "info.txt").read_text(encoding="utf-8", errors="ignore")
    if "SMD" in info.upper():
        from extract_nets import run as extract  # noqa: E402
        for n, f in enumerate(boards):
            extract(src / f, str(out / f"board{n}_nets"), 3, smd=True)

    slug = NOISE_WORDS.sub(" ", kit["name"]).strip().lower().replace(" ", "-")
    nets = json.loads((src / "board0_nets.json").read_text(encoding="utf-8"))
    multi = [(k, v) for k, v in nets["nets"].items() if len(v) > 1]
    lone = [p["id"] for p in nets["pads"] if len(nets["nets"][str(p["net"])]) == 1 and not p["ground"]]
    lines = [
        f"id pp-{slug}",
        f"goods {goods}",
        f"name {NOISE_WORDS.sub(' ', kit['name']).strip()}",
        "motif ",
        f"type {kit['type']}",
        "desc ",
        f"image {boards[0]}",
        "BOM ",
        "io IN= OUT= V9= GND=",
        "",
        f"# {len(nets['pads'])} pads; multi-pad nets: " + " ".join(f"n{k}={v}" for k, v in multi),
        f"# lone non-ground pads (off-board points or broken traces): {[p for p in lone if p not in nets.get('unconnected', [])]}",
        f"# no copper at all (unused pins, empty lugs, off-board rings - NC unless the render hides a trace): {nets.get('unconnected', [])}",
        *[f"# hint: pad {k} likely joins {v} (copper tint under the silk - confirm on the render, then JUMP)" for k, v in nets.get("hints", {}).items()],
        f"# seller: {kit['about']}",
        "",
        "STAGE input input 입력",
    ]
    subprocess.run(
        [sys.executable, "-E", "-P", str(Path(__file__).resolve().parent / "suggest_parts.py"), str(out / boards[0]), str(out / "board0_nets.json"), str(out / "suggest"), "4"],
        check=True,
        capture_output=True,
    )
    draft = auto_draft(out / boards[0], out / "board0_nets.json")
    if draft:
        io = next((ln for ln in draft if ln.startswith("io ")), None)
        if io:
            lines[lines.index("io IN= OUT= V9= GND=")] = f"{io}   # auto_map: check the pads"
        lines += ["", "# --- auto_map.py draft: live lines read clearly, '# ?' lines need a look (SKILL.md: 초안 검토) ---"]
        lines += [ln for ln in draft if ln and not ln.startswith("io ")]
    lines += ["", "# --- part candidates from suggest_parts.py (fill kind/value; check every line against suggest.png) ---"]
    lines += ["# " + ln for ln in (out / "suggest.txt").read_text(encoding="utf-8").splitlines()]
    (out / "map.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out}: {len(boards)} board(s), {len(boms)} parts-list/diagram image(s), {len(nets['pads'])} pads")


if __name__ == "__main__":
    main()
