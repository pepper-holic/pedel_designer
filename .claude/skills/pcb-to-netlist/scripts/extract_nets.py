"""Find pads and copper nets in a pedalparts board-trace render, and draw a numbered overlay.

Usage:
    python -E -P extract_nets.py <board.jpg> <out_prefix> [scale=3]

Writes <out_prefix>.json  {"pads": [{"id", "x", "y", "r", "ground", "net"}], "nets": {net: [pad ids]}}
and    <out_prefix>.png   the render scaled up, every pad labelled "id" in its net's colour, with the
                          net number beside multi-pad nets, so a reader can map parts to pad ids.

Colour model of these renders (checked on CDOS, Fuzzy Face and the 1K series):
  pad ring      saturated magenta (240, 60..90, 240) around a white drill hole
  ground pad    pale lavender ring with a grey "+": thermal relief into a ground pour that is not
                drawn - every such pad is on the GND net
  top copper    olive / yellow-green (200..230, 200..235, 80..140)
  bottom copper cyan (40..120, 180..230, 200..240)
  silkscreen    black/grey text and outlines, green bars on transistor footprints - not copper
Copper of the two layers only joins at a pad or via (a small pad); crossing is not a connection.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MIN_PAD_PIXELS = 12
# A pad "owns" pixels this far out from its ring: the ring's antialiased edge plus a 1px pot or
# footprint outline usually sit between a pad and the trace that enters it.
NEAR = 3
# Silkscreen (grey outlines, value text) is printed over the copper and cuts traces into pieces; a
# run of silk pixels at most this long that has copper of one layer on both sides is copper too.
SILK_BRIDGE = 4
PAD_MERGE = 0.8


def classify(r: int, g: int, b: int) -> str:
    if r > 170 and b > 170 and g < 96 and abs(r - b) < 50:
        return "pad"
    if r > 170 and b > 170 and 96 <= g < 160 and r - g > 50 and b - g > 50:
        return "gpad"
    if r > 160 and g > 160 and b < 170 and abs(r - g) < 60 and min(r, g) - b > 40:
        return "top"
    if b > 170 and g > 150 and r < 140:
        return "bot"
    hi, lo = max(r, g, b), min(r, g, b)
    # grey/black silkscreen, and silkscreen printed over yellow copper (dark olive: r ~ g > b)
    if hi < 200 and (hi - lo < 40 or (abs(r - g) < 20 and b < r)):
        return "silk"
    if g > 180 and r < 140 and b < 140:  # green footprint outlines (pots, switches, transistor bars)
        return "silk"
    return ""


def components(mask: dict[tuple[int, int], str], kinds: set[str]) -> list[list[tuple[int, int]]]:
    seen: set[tuple[int, int]] = set()
    out = []
    for start, kind in mask.items():
        if kind not in kinds or start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q not in seen and mask.get(q) in kinds:
                        seen.add(q)
                        stack.append(q)
        out.append(comp)
    return out


def bridge(mask: dict[tuple[int, int], str], layer: str, w: int, h: int) -> None:
    """Turn short horizontal/vertical runs of silk that sit between two copper pixels of one layer into
    copper, so a resistor outline or a value printed across a trace no longer splits it."""
    fill = []
    for y in range(h):
        for x in range(w):
            if mask.get((x, y)) != layer and not (mask.get((x, y)) in ("pad", "gpad") and touches(mask, x, y, layer)):
                continue
            for dx, dy in ((1, 0), (0, 1)):
                run = []
                for k in range(1, SILK_BRIDGE + 2):
                    q = (x + dx * k, y + dy * k)
                    kind = mask.get(q)
                    if kind == "silk":
                        run.append(q)
                        continue
                    if kind in (layer, "pad", "gpad") and run:
                        fill.extend(run)
                    break
    for q in fill:
        mask[q] = layer


def touches(mask: dict[tuple[int, int], str], x: int, y: int, layer: str) -> bool:
    """Only pads that already meet this layer's copper start a bridge, so silk between a bare pad
    and an unrelated trace end is not filled in."""
    return any(mask.get((x + dx, y + dy)) == layer for dx in (-3, 0, 3) for dy in (-3, 0, 3))


def merge_pads(pads: list[dict], mask: dict[tuple[int, int], str]) -> list[dict]:
    """A ring broken by silkscreen ("+", a footprint bar) comes out as several arcs: join arcs whose
    centres are closer than their radii."""
    merged: list[dict] = []
    for p in sorted(pads, key=lambda q: -len(q["pixels"])):
        for m in merged:
            if abs(m["x"] - p["x"]) + abs(m["y"] - p["y"]) < PAD_MERGE * (m["r"] + p["r"]) + 2:
                m["pixels"] = m["pixels"] + p["pixels"]
                xs, ys = [q[0] for q in m["pixels"]], [q[1] for q in m["pixels"]]
                m["x"], m["y"] = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
                m["r"] = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
                m["ground"] = sum(1 for q in m["pixels"] if mask[q] == "gpad") > len(m["pixels"]) / 2
                break
        else:
            merged.append(p)
    return merged


def main() -> None:
    src, prefix = Path(sys.argv[1]), sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    mask: dict[tuple[int, int], str] = {}
    for y in range(h):
        for x in range(w):
            k = classify(*px[x, y])
            if k:
                mask[(x, y)] = k

    for layer in ("top", "bot"):
        bridge(mask, layer, w, h)

    pads = []
    for comp in components(mask, {"pad", "gpad"}):
        if len(comp) < MIN_PAD_PIXELS:
            continue
        xs, ys = [p[0] for p in comp], [p[1] for p in comp]
        ground = sum(1 for p in comp if mask[p] == "gpad") > len(comp) / 2
        pads.append({"x": (min(xs) + max(xs)) / 2, "y": (min(ys) + max(ys)) / 2, "r": max(max(xs) - min(xs), max(ys) - min(ys)) / 2, "ground": ground, "pixels": comp})
    pads = merge_pads(pads, mask)
    pads.sort(key=lambda p: (round(p["y"] / 8), p["x"]))
    for i, p in enumerate(pads):
        p["id"] = i

    parent = list(range(len(pads)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        parent[find(a)] = find(b)

    pad_at: dict[tuple[int, int], int] = {}
    for p in pads:
        for (x, y) in p["pixels"]:
            for dx in range(-NEAR, NEAR + 1):
                for dy in range(-NEAR, NEAR + 1):
                    pad_at.setdefault((x + dx, y + dy), p["id"])
    for layer in ("top", "bot"):
        for comp in components(mask, {layer}):
            touched = {pad_at[q] for q in comp if q in pad_at}
            touched_list = sorted(touched)
            for other in touched_list[1:]:
                union(touched_list[0], other)
    grounds = [p["id"] for p in pads if p["ground"]]
    for g in grounds[1:]:
        union(grounds[0], g)

    roots: dict[int, int] = {}
    nets: dict[int, list[int]] = defaultdict(list)
    for p in pads:
        net = roots.setdefault(find(p["id"]), len(roots))
        p["net"] = net
        nets[net].append(p["id"])

    out = {
        "image": str(src),
        "size": [w, h],
        "pads": [{k: p[k] for k in ("id", "x", "y", "r", "ground", "net")} for p in pads],
        "nets": {str(k): v for k, v in sorted(nets.items())},
    }
    Path(f"{prefix}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")

    big = im.resize((w * scale, h * scale), Image.NEAREST)
    draw = ImageDraw.Draw(big)
    try:
        font = ImageFont.truetype("arialbd.ttf", 7 * scale)
    except OSError:
        font = ImageFont.load_default()
    palette = [(220, 20, 60), (0, 90, 200), (0, 140, 70), (200, 100, 0), (120, 40, 180), (0, 150, 160), (160, 120, 0), (90, 90, 90)]
    for p in pads:
        color = (0, 0, 0) if p["ground"] else palette[p["net"] % len(palette)]
        cx, cy = p["x"] * scale, p["y"] * scale
        label = f"{p['id']}" + ("" if len(nets[p["net"]]) == 1 else f"/n{p['net']}")
        draw.text((cx + p["r"] * scale * 0.6, cy - 4 * scale), label, fill=color, font=font, stroke_width=2, stroke_fill=(255, 255, 255))
    big.save(f"{prefix}.png")
    multi = sum(1 for v in nets.values() if len(v) > 1)
    print(f"{len(pads)} pads ({len(grounds)} on the ground pour), {len(nets)} nets ({multi} with 2+ pads)")


if __name__ == "__main__":
    main()
