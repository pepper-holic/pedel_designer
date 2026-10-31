"""Draw a part map back onto its board render, to check it against the silkscreen by eye.

Usage:
    python -E -P verify_overlay.py <map.txt> <nets.json> <board.jpg> <out.png> [scale=3]

Every part becomes a coloured line through its pads with "ref value" at the middle, pots and
transistors get their lug/pin letters, the io pads are boxed. A part drawn across the wrong pads
shows up as a label sitting on a different printed value or a line crossing the board to nowhere.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

COLORS = {"R": (210, 40, 40), "C": (20, 90, 220), "L": (120, 60, 0), "D": (160, 0, 160), "Q": (0, 140, 60), "POT": (220, 120, 0), "IC": (0, 120, 140), "T": (90, 90, 90)}


def main() -> None:
    map_path, nets_path, board, out = (Path(a) for a in sys.argv[1:5])
    scale = int(sys.argv[5]) if len(sys.argv) > 5 else 3
    pads = {p["id"]: p for p in json.loads(nets_path.read_text(encoding="utf-8"))["pads"]}
    im = Image.open(board).convert("RGB")
    im = Image.blend(im, Image.new("RGB", im.size, "white"), 0.45).resize((im.width * scale, im.height * scale), Image.LANCZOS)
    draw = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("arialbd.ttf", 6 * scale)
        small = ImageFont.truetype("arialbd.ttf", 5 * scale)
    except OSError:
        font = small = ImageFont.load_default()

    def at(pad: str) -> tuple[float, float]:
        if not pad.lstrip("-").isdigit():  # off-board point (IN/OUT/V9/GND): draw it off the board's edge
            return (im.width - 6 * scale, 6 * scale)
        p = pads[int(pad)]
        return p["x"] * scale, p["y"] * scale

    counters: dict[str, int] = {}
    for raw in map_path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        head, *rest = line.split()
        if head == "io":
            for tok in rest:
                k, v = tok.split("=")
                x, y = at(v)
                r = 9 * scale
                draw.rectangle((x - r, y - r, x + r, y + r), outline=(0, 0, 0), width=scale)
                draw.text((x + r + 2, y - r), k, fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill="white")
            continue
        if head not in COLORS:
            continue
        color = COLORS[head]
        if head in ("R", "C", "L"):
            value, a, b, *ref = rest
            counters[head] = counters.get(head, 0) + 1
            name = ref[0] if ref else f"{head}{counters[head]}"
            points = [at(a), at(b)]
            label = f"{name} {value}"
            tags = []
        elif head == "POT":
            value, ref, l1, w, l3 = rest
            points = [at(l1), at(w), at(l3)]
            label = f"{ref} {value}"
            tags = [("1", l1), ("w", w), ("3", l3)]
        else:
            part, *pins = rest
            kv = dict(t.split("=") for t in pins if "=" in t)
            ref = next((t for t in pins if "=" not in t), head)
            points = [at(v) for v in kv.values()]
            label = f"{ref} {part}"
            tags = list(kv.items())
        draw.line(points, fill=color, width=2 * scale)
        for x, y in points:
            draw.ellipse((x - 3 * scale, y - 3 * scale, x + 3 * scale, y + 3 * scale), outline=color, width=scale)
        for tag, pad in tags:
            x, y = at(pad)
            draw.text((x - 2 * scale, y + 3 * scale), tag, fill=color, font=small, stroke_width=2, stroke_fill="white")
        mx = sum(p[0] for p in points) / len(points)
        my = sum(p[1] for p in points) / len(points)
        draw.text((mx, my - 4 * scale), label, fill=color, font=font, anchor="mm", stroke_width=3, stroke_fill="white")
    im.save(out)
    print(out)


if __name__ == "__main__":
    main()
