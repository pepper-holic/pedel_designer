"""Classify every collected kit's images and write references/pcb-kits/index.json.

Usage:
    python -E -P build_index.py <root_dir> [<categories.tsv>]

<root_dir> holds one folder per goodsNo as written by fetch_kit.py. <categories.tsv> is the output
of `fetch_kit.py --list ...` (cateCd, goodsNo, name) and only adds category codes to the index.

Each image gets a `kind`:
  board-trace   white background, magenta pads and yellow-green traces: the layout render to read
                nets from (the most useful image).
  board-render  photo-like render or photo of a green/purple board, often with wiring overlaid.
  bom-table     tall, mostly white table: the parts list (some rows highlighted in yellow/red).
  diagram       wide, mostly white drawing: off-board wiring (jacks, footswitch, DC) or a table of
                value differences between the variants a board supports.
  shared        the same URL appears on many kit pages (capacitor-code guide, pot tab picture...).
  photo         anything else (build photos, enclosures).
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_kit import page_images, split_page, text_of  # noqa: E402
from kit_types import board_key, item_kind, kit_type  # noqa: E402

SHARED_MIN_KITS = 6


def pixel_stats(path: Path) -> dict[str, float] | None:
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            rgb = im.convert("RGB")
            w, h = rgb.size
            small = rgb.resize((min(w, 200), max(1, int(h * min(w, 200) / w))))
    except OSError:
        return None
    n = small.size[0] * small.size[1]
    white = magenta = trace = green = saturated = 0
    for r, g, b in small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata():
        hi, lo = max(r, g, b), min(r, g, b)
        if lo > 225:
            white += 1
        if r > 190 and b > 190 and g < 140:
            magenta += 1
        if r > 180 and g > 180 and b < 150:
            trace += 1
        if g > r + 30 and g > b + 10 and hi < 170:
            green += 1
        if hi - lo > 60:
            saturated += 1
    return {"w": w, "h": h, "white": white / n, "magenta": magenta / n, "trace": trace / n, "green": green / n, "sat": saturated / n}


def classify(st: dict[str, float] | None) -> str:
    if st is None:
        return "photo"
    if st["white"] > 0.4 and st["magenta"] > 0.01 and st["trace"] > 0.02:
        return "board-trace"
    if st["white"] > 0.55 and st["sat"] < 0.12 and st["h"] > 1.2 * st["w"]:
        return "bom-table"
    if st["green"] > 0.2 or (st["magenta"] > 0.01 and st["white"] < 0.4):
        return "board-render"
    if st["white"] > 0.55:
        return "diagram"
    return "photo"


BOILERPLATE = ("실제 공연과 레코딩", "클래식 페달중에 유사한", "1노브로 콘트롤", "class=", "오류 안내")


def about_line(text: str, title: str = "") -> str:
    """The seller's own description of the pedal: the sentences before the build notes, minus the
    title, links, section headers and the stock sentences pasted into every page."""
    keep = []
    for ln in text.splitlines():
        if ln.startswith("◎ 본 페달") or ln.startswith("◎ 부품팩") or ln.startswith("◎ 본 앰프"):
            break
        if ln.startswith(("◎", "http", "//", "*", "-")) or ln.strip() == title.strip() or any(b in ln for b in BOILERPLATE):
            continue
        keep.append(ln)
        if len(" ".join(keep)) > 120:
            break
    return " ".join(keep)[:200]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    root = Path(sys.argv[1])
    cats: dict[str, list[str]] = {}
    if len(sys.argv) > 2:
        for row in Path(sys.argv[2]).read_text(encoding="utf-8").splitlines():
            parts = row.split("\t")
            if len(parts) >= 2:
                cats.setdefault(parts[1], []).append(parts[0])

    kits = sorted(p for p in root.iterdir() if p.is_dir() and (p / "page.html").exists())
    url_count: Counter[str] = Counter()
    pages: dict[str, tuple[str, str, list[str]]] = {}
    for kit in kits:
        page = (kit / "page.html").read_text(encoding="utf-8", errors="ignore")
        title, detail = split_page(page, kit.name)
        text = text_of(detail)
        (kit / "info.txt").write_text(f"{title}\nhttps://www.pedalparts.co.kr/goods/goods_view.php?goodsNo={kit.name}\n\n{text}", encoding="utf-8")
        srcs = page_images(page)
        pages[kit.name] = (title, text, srcs)
        url_count.update(set(srcs))

    index = []
    for kit in kits:
        title, text, srcs = pages[kit.name]
        images = []
        for i, img in enumerate(sorted(p for p in kit.iterdir() if p.name.startswith("img_"))):
            src = srcs[i] if i < len(srcs) else ""
            st = pixel_stats(img)
            kind = "shared" if src and url_count[src] >= SHARED_MIN_KITS else classify(st)
            images.append({"file": img.name, "kind": kind, "w": st["w"] if st else 0, "h": st["h"] if st else 0, "src": src})
        index.append({
            "goodsNo": kit.name,
            "name": title,
            "item": item_kind(title, cats.get(kit.name, [])),
            "type": kit_type(title, about_line(text, title), cats.get(kit.name, [])),
            "categories": cats.get(kit.name, []),
            "about": about_line(text, title),
            "url": f"https://www.pedalparts.co.kr/goods/goods_view.php?goodsNo={kit.name}",
            "images": images,
        })
        kinds = Counter(im["kind"] for im in images)
        print(f"{kit.name}\t{index[-1]['type']}\t{dict(kinds)}\t{title}")

    # A bare board or sticker usually has no description of its own: borrow the family of the kit
    # with the same name, and cross-link the two.
    kits_by_key = {board_key(k["name"]): k for k in index if k["item"] == "kit"}
    for entry in index:
        if entry["item"] == "kit":
            continue
        kit = kits_by_key.get(board_key(entry["name"]))
        if kit:
            entry["kitGoodsNo"] = kit["goodsNo"]
            if entry["type"] == "unknown":
                entry["type"] = kit["type"]

    (root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    summary = Counter(k["type"] for k in index if k["item"] == "kit")
    print("items:", dict(Counter(k["item"] for k in index)))
    boards = sum(1 for k in index if any(im["kind"] == "board-trace" for im in k["images"]))
    print(f"{len(index)} products, {boards} with a board-trace image; kits by type: {dict(summary)}")


if __name__ == "__main__":
    main()
