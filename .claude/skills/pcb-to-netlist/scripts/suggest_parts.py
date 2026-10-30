"""Propose part lines for a map from the silkscreen outlines of a board render.

Usage:
    python -E -P suggest_parts.py <board.jpg> <nets.json> <out_prefix> [scale=4]

A part body on these renders is a white area closed by a silk outline. For every such outline:
  - 3+ pads inside (transistor, trimmer, IC, pot footprint)     -> "Q?/POT?/IC? pads ..."
  - 2 pads inside (electrolytic circle, box cap, small diode)    -> "C? a b" / "D?"
  - no pad inside but long and thin (axial resistor/diode/cap)   -> the nearest pad just beyond each end
Writes <out_prefix>.txt (one candidate per line, kind still "?", value blank, with its body box) and
<out_prefix>.png: the render enlarged with every candidate boxed and numbered, so a reader fills the
values from one picture. Candidates are suggestions - every line must still be checked against the
silk and the parts list (verify_overlay.py does the final check).
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_nets import bridge, classify  # noqa: E402

MIN_AREA = 40
MAX_AREA_FRACTION = 0.25
AXIAL_ASPECT = 1.8
END_REACH = 0.9  # of the body's length, beyond each end, to look for that end's pad


def regions(mask: dict, w: int, h: int) -> list[list[tuple[int, int]]]:
    """White areas not connected to the image border (inside a closed silk outline). Copper and pad
    pixels inside a body count as white, so a body painted over a trace is still one region."""
    blocked = {q for q, k in mask.items() if k == "silk"}
    outside: set = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    stack = [q for q in stack if q not in blocked]
    outside.update(stack)
    while stack:
        x, y = stack.pop()
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= q[0] < w and 0 <= q[1] < h and q not in blocked and q not in outside:
                outside.add(q)
                stack.append(q)
    seen: set = set()
    out = []
    for y in range(h):
        for x in range(w):
            q = (x, y)
            if q in blocked or q in outside or q in seen:
                continue
            comp, stack = [], [q]
            seen.add(q)
            while stack:
                a, b = stack.pop()
                comp.append((a, b))
                for n in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= n[0] < w and 0 <= n[1] < h and n not in blocked and n not in outside and n not in seen:
                        seen.add(n)
                        stack.append(n)
            if MIN_AREA <= len(comp) <= MAX_AREA_FRACTION * w * h:
                out.append(comp)
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    board, nets_path, prefix = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    scale = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    im = Image.open(board).convert("RGB")
    w, h = im.size
    px = im.load()
    mask = {}
    for y in range(h):
        for x in range(w):
            k = classify(*px[x, y])
            if k:
                mask[(x, y)] = k
    for layer in ("top", "bot"):
        bridge(mask, layer, w, h)
    pads = json.loads(nets_path.read_text(encoding="utf-8"))["pads"]

    silk = {q for q, k in mask.items() if k == "silk"}
    by_id = {p["id"]: p for p in pads}

    def body_score(a: dict, b: dict) -> float:
        """Fraction of the stretch between two aligned pads that has a silk outline on BOTH sides
        within a body's half-width - the long sides of a resistor/diode/box-cap body, or the circle
        of an electrolytic, run there."""
        dx, dy = b["x"] - a["x"], b["y"] - a["y"]
        dist = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / dist, dy / dist
        nx, ny = -uy, ux
        reach = int(max(a["r"], b["r"]) * 1.6) + 2
        hits = total = 0
        for k in range(1, 20):
            t = 0.2 + 0.6 * k / 20
            cx, cy = a["x"] + dx * t, a["y"] + dy * t
            total += 1
            sides = 0
            for sign in (-1, 1):
                if any((int(round(cx + nx * sign * d)), int(round(cy + ny * sign * d))) in silk for d in range(2, reach)):
                    sides += 1
            hits += sides == 2
        return hits / total

    def between(a: dict, b: dict) -> bool:
        """Another pad sits on the segment between a and b."""
        for p in pads:
            if p is a or p is b:
                continue
            t = ((p["x"] - a["x"]) * (b["x"] - a["x"]) + (p["y"] - a["y"]) * (b["y"] - a["y"])) / max(1e-9, (b["x"] - a["x"]) ** 2 + (b["y"] - a["y"]) ** 2)
            if 0 < t < 1:
                qx, qy = a["x"] + t * (b["x"] - a["x"]), a["y"] + t * (b["y"] - a["y"])
                if abs(qx - p["x"]) + abs(qy - p["y"]) < p["r"]:
                    return True
        return False

    cands = []
    used: set[int] = set()
    pairs = []
    for a in pads:
        for b in pads:
            if a["id"] >= b["id"] or a["id"] in used or b["id"] in used:
                continue
            aligned = abs(a["x"] - b["x"]) < 3 or abs(a["y"] - b["y"]) < 3
            dist = ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
            rr = max(a["r"], b["r"])
            if not aligned or not (2.2 * rr <= dist <= 14 * rr) or between(a, b):
                continue
            sc = body_score(a, b)
            if sc >= 0.75:
                pairs.append((sc, -dist, a["id"], b["id"]))
    for sc, nd, i, j in sorted(pairs, reverse=True):
        if i in used or j in used:
            continue
        a, b = by_id[i], by_id[j]
        first, second = sorted((a, b), key=lambda p: (p["y"], p["x"]))
        cands.append({"kind": "?", "pads": [first["id"], second["id"]], "box": (int(min(a["x"], b["x"])), int(min(a["y"], b["y"])), int(max(a["x"], b["x"])), int(max(a["y"], b["y"])))})
        used.update({i, j})

    # transistors / trimmers: three collinear pads at a small, even pitch
    for a in pads:
        for b in pads:
            for c in pads:
                if not (a["id"] < b["id"] < c["id"]) or {a["id"], b["id"], c["id"]} & used:
                    continue
                for (p, q, r) in ((a, b, c), (a, c, b), (b, a, c)):
                    d1 = ((q["x"] - p["x"]) ** 2 + (q["y"] - p["y"]) ** 2) ** 0.5
                    d2 = ((r["x"] - q["x"]) ** 2 + (r["y"] - q["y"]) ** 2) ** 0.5
                    straight = abs((q["x"] - p["x"]) * (r["y"] - q["y"]) - (q["y"] - p["y"]) * (r["x"] - q["x"])) < 0.15 * d1 * d2
                    if straight and abs(d1 - d2) < 2 and d1 < 6.5 * max(p["r"], q["r"]) and body_score(p, r) >= 0.6:
                        cands.append({"kind": "Q?" if d1 < 3.2 * max(p["r"], q["r"]) else "POT?", "pads": [p["id"], q["id"], r["id"]], "box": (min(t["x"] for t in (p, q, r)), min(t["y"] for t in (p, q, r)), max(t["x"] for t in (p, q, r)), max(t["y"] for t in (p, q, r)))})
                        used.update({p["id"], q["id"], r["id"]})
                        break
    cands.sort(key=lambda c: (c["box"][1] // 12, c["box"][0]))
    lines = []
    for i, c in enumerate(cands):
        lines.append(f"{c['kind']} ? {' '.join(map(str, c['pads']))}   # cand {i} box {c['box']}")
    free = [p["id"] for p in pads if p["id"] not in used and not p["ground"]]
    lines.append(f"# pads not in any candidate (off-board points, pots outside outlines, missed bodies): {free}")
    Path(f"{prefix}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    big = im.resize((w * scale, h * scale), Image.LANCZOS)
    draw = ImageDraw.Draw(big)
    try:
        font = ImageFont.truetype("arialbd.ttf", 6 * scale)
    except OSError:
        font = ImageFont.load_default()
    for i, c in enumerate(cands):
        x0, y0, x1, y1 = (v * scale for v in c["box"])
        draw.rectangle((x0 - 3 * scale, y0 - 3 * scale, x1 + 3 * scale, y1 + 3 * scale), outline=(220, 30, 30), width=2)
        draw.text((x0 + 2, y0 + 1), str(i), fill=(220, 30, 30), font=font, stroke_width=2, stroke_fill="white")
    for p in pads:
        draw.text((p["x"] * scale + p["r"] * scale * 0.5, p["y"] * scale - 4 * scale), str(p["id"]), fill=(0, 70, 200), font=font, stroke_width=2, stroke_fill="white")
    big.save(f"{prefix}.png")
    print(f"{len(cands)} candidates, {len(free)} uncovered non-ground pads -> {prefix}.txt")


if __name__ == "__main__":
    main()
