"""Tile images of one kind from index.json into labelled contact sheets, to eyeball a classification.

Usage:
    python -E -P contact_sheet.py <root_dir> <kind> <out_prefix> [cols=6] [cell=220] [per_sheet=36]

Writes <out_prefix>_00.png, _01.png ... each holding up to <per_sheet> thumbnails captioned with the
goodsNo and the start of the kit name.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAPTION_H = 16


def font() -> ImageFont.ImageFont:
    for name in ("malgun.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, 12)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    root, kind, prefix = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    cell = int(sys.argv[5]) if len(sys.argv) > 5 else 220
    per = int(sys.argv[6]) if len(sys.argv) > 6 else 36
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    items = [(k, im) for k in index for im in k["images"] if im["kind"] == kind]
    f = font()
    for sheet, start in enumerate(range(0, len(items), per)):
        chunk = items[start : start + per]
        rows = (len(chunk) + cols - 1) // cols
        out = Image.new("RGB", (cols * cell, rows * (cell + CAPTION_H)), "white")
        draw = ImageDraw.Draw(out)
        for i, (kit, im) in enumerate(chunk):
            x, y = (i % cols) * cell, (i // cols) * (cell + CAPTION_H)
            with Image.open(root / kit["goodsNo"] / im["file"]) as src:
                thumb = src.convert("RGB")
                thumb.thumbnail((cell - 4, cell - 4))
                out.paste(thumb, (x + 2, y + 2))
            draw.text((x + 2, y + cell), f"{kit['goodsNo'][-4:]} {kit['name'][:22]}", fill="black", font=f)
        path = Path(f"{prefix}_{sheet:02d}.png")
        out.save(path)
        print(path, len(chunk))


if __name__ == "__main__":
    main()
