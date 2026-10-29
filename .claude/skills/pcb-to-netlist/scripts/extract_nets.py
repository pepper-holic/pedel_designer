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
# Silk gaps longer than this (thick board titles) are left open on purpose: every rule tried for
# them also joined unrelated traces along component outlines on the reference boards, and a wrong
# join hides in the netlist while a lone pad is flagged for a human to look at.
SILK_BRIDGE = 4
SHORT_SILK = 4
PAD_MERGE = 0.8
# A part body is a white area ringed by a silk outline, and on many boards it is painted over the
# bottom-layer copper: a trace that turns a corner under a resistor vanishes there. When exactly two
# traces of one layer poke into such a body (each by a short stub), they are one trace.
BODY_TUNNELS = False
BODY_MIN_AREA = 60
BODY_MAX_AREA = 5000
BODY_MIN_SILK_EDGE = 0.55
STUB_MAX_CONTACT = 14


def classify(r: int, g: int, b: int) -> str:
    # Both pad shades are magenta; which of them means "ground pour" is decided per board later
    # (split_ground_pads), because small renders draw every pad in the duller shade.
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
    # Silk seen through a semi-transparent trace (dark cyan or dark olive), and the muddy
    # anti-aliased edge where a trace meets an outline: not board (white), so a trace may cross it.
    if hi < 215 and lo < 180:
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
            if mask.get((x, y)) not in (layer, "pad", "gpad"):
                continue
            for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
                run = []
                for k in range(1, SILK_BRIDGE + 2):
                    q = (x + dx * k, y + dy * k)
                    kind = mask.get(q)
                    if kind == "silk":
                        run.append(q)
                        continue
                    if kind in (layer, "pad", "gpad") and run and (mask.get((x, y)) == layer or kind == layer):
                        # Up to 4px: any thin outline or text stroke. Longer (thick title text): only
                        # when the trace runs along this axis on both sides, so a gap along a
                        # component outline next to two unrelated traces is never filled.
                        straight = trace_end(mask, layer, (x, y), -dx, -dy) and trace_end(mask, layer, q, dx, dy)
                        if len(run) <= SHORT_SILK or straight:
                            fill.extend(run)
                    break
    for q in fill:
        mask[q] = layer


def enclosed_regions(mask: dict[tuple[int, int], str], w: int, h: int) -> list[list[tuple[int, int]]]:
    """White areas not connected to the board edge: part bodies, pad holes, letter counters."""
    outside: set[tuple[int, int]] = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    stack = [q for q in stack if q not in mask]
    outside.update(stack)
    while stack:
        x, y = stack.pop()
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= q[0] < w and 0 <= q[1] < h and q not in mask and q not in outside:
                outside.add(q)
                stack.append(q)
    seen: set[tuple[int, int]] = set()
    regions = []
    for y in range(h):
        for x in range(w):
            if (x, y) in mask or (x, y) in outside or (x, y) in seen:
                continue
            comp, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                comp.append((a, b))
                for q in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= q[0] < w and 0 <= q[1] < h and q not in mask and q not in outside and q not in seen:
                        seen.add(q)
                        stack.append(q)
            if BODY_MIN_AREA <= len(comp) <= BODY_MAX_AREA:
                regions.append(comp)
    return regions


def body_tunnels(mask: dict[tuple[int, int], str], layer_comps: list[list[tuple[int, int]]], pad_zone: set[tuple[int, int]], pad_centres: list[tuple[float, float]], w: int, h: int) -> list[tuple[int, int]]:
    """Pairs of same-layer trace pieces that meet only inside one silk-outlined body. Copper next to
    a pad does not count: that is a part's own lead arriving at its pad beside its body, not a trace
    passing underneath it."""
    comp_of = {q: i for i, comp in enumerate(layer_comps) for q in comp}
    pairs = []
    for region in enclosed_regions(mask, w, h):
        xs, ys = [q[0] for q in region], [q[1] for q in region]
        # An outline with pads inside it (electrolytic cap circle, transistor, IC) is a part's own
        # footprint: its leads meet copper inside it, which says nothing about traces passing under.
        if any(min(xs) - 2 <= px <= max(xs) + 2 and min(ys) - 2 <= py <= max(ys) + 2 for px, py in pad_centres):
            continue
        rset = set(region)
        edge = [(x + dx, y + dy) for x, y in region for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, y + dy) not in rset]
        if not edge:
            continue
        silk = sum(1 for q in edge if mask.get(q) == "silk")
        if silk / len(edge) < BODY_MIN_SILK_EDGE:
            continue
        contact: dict[int, int] = {}
        for x, y in edge:
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    q = (x + dx, y + dy)
                    c = comp_of.get(q)
                    if c is not None and q not in pad_zone:
                        contact[c] = contact.get(c, 0) + 1
                        break
        stubs = [c for c, n in contact.items() if n <= STUB_MAX_CONTACT * 3]
        if len(contact) == 2 and len(stubs) == 2:
            pairs.append((stubs[0], stubs[1]))
    return pairs


def trace_end(mask: dict[tuple[int, int], str], layer: str, at: tuple[int, int], dx: int, dy: int) -> bool:
    """Copper at `at` is the end of a trace that continues in direction (dx, dy): copper for the next
    4 steps along it, and copper on both sides across it (a trace is several pixels wide), but NOT
    copper far across (that would be a wide fill or a trace running the other way)."""
    x, y = at
    if not all(mask.get((x + dx * i, y + dy * i)) == layer for i in range(0, 4)):
        return False
    px, py = dy, dx
    across = sum(1 for i in (-1, 1) if mask.get((x + px * i + dx * 2, y + py * i + dy * 2)) == layer)
    far = sum(1 for i in (-7, 7) if mask.get((x + px * i + dx * 2, y + py * i + dy * 2)) == layer)
    return across == 2 and far < 2


def runs_along(mask: dict[tuple[int, int], str], layer: str, at: tuple[int, int], dx: int, dy: int) -> bool:
    """Copper at `at` belongs to a trace running along (dx, dy): copper there and one step further,
    and narrow across - a trace crossing at right angles is copper far to both sides."""
    x, y = at
    if mask.get(at) != layer or mask.get((x + dx, y + dy)) != layer and mask.get((x - dx, y - dy)) != layer:
        return False
    px, py = dy, dx
    return not (mask.get((x + px * 6, y + py * 6)) == layer and mask.get((x - px * 6, y - py * 6)) == layer)


def touches(mask: dict[tuple[int, int], str], x: int, y: int, layer: str) -> bool:
    """Only pads that already meet this layer's copper start a bridge, so silk between a bare pad
    and an unrelated trace end is not filled in."""
    return any(mask.get((x + dx, y + dy)) == layer for dx in (-3, 0, 3) for dy in (-3, 0, 3))


def split_ground_pads(pads: list[dict], mask: dict[tuple[int, int], str]) -> None:
    """Decide per board which pads sit on the ground pour. Those are drawn paler than the others and
    carry a grey "+" (a thermal-relief cross) inside the ring. On a board where every pad is the same
    shade there is no pour, and nothing is ground - the pad colour alone proves nothing."""
    for p in pads:
        xs, ys = [q[0] for q in p["pixels"]], [q[1] for q in p["pixels"]]
        cx, cy, r = int(round(p["x"])), int(round(p["y"])), max(2, int(p["r"] * 0.45))
        # A thermal-relief "+" is a horizontal AND a vertical silk stroke through the hole centre;
        # a hole's dark outline ring, or a stray letter, never gives both.
        row = sum(1 for x in range(cx - r, cx + r + 1) for dy in (-1, 0, 1) if mask.get((x, cy + dy)) == "silk")
        col = sum(1 for y in range(cy - r, cy + r + 1) for dx in (-1, 0, 1) if mask.get((cx + dx, y)) == "silk")
        p["paleFraction"] = sum(1 for q in p["pixels"] if mask[q] == "gpad") / len(p["pixels"])
        p["cross"] = row >= r and col >= r and mask.get((cx, cy)) == "silk"
    pale = [p for p in pads if p["paleFraction"] > 0.5]
    two_shades = 0 < len(pale) < len(pads)
    for p in pads:
        # Two shades on the board: ground = the pale ones with a cross. One shade (small renders):
        # the cross alone marks the pour.
        p["ground"] = p["cross"] and (p["paleFraction"] > 0.5 if two_shades else True)


def merge_pads(pads: list[dict], mask: dict[tuple[int, int], str]) -> list[dict]:
    """A ring broken by silkscreen ("+", a footprint bar) comes out as several arcs: join arcs whose
    centres are closer than their radii."""
    merged: list[dict] = []
    for p in sorted(pads, key=lambda q: -len(q["pixels"])):
        for m in merged:
            # Arcs of one ring: centres close, or their bounding boxes overlap (a ring cut in two
            # by a trace through its middle gives two half-rings whose centres sit a radius apart).
            close = abs(m["x"] - p["x"]) + abs(m["y"] - p["y"]) < PAD_MERGE * (m["r"] + p["r"]) + 2
            boxes_touch = abs(m["x"] - p["x"]) <= m["r"] + p["r"] - 2 and abs(m["y"] - p["y"]) <= m["r"] + p["r"] - 2 and max(m["r"], p["r"]) < 16
            if close or boxes_touch:
                m["pixels"] = m["pixels"] + p["pixels"]
                xs, ys = [q[0] for q in m["pixels"]], [q[1] for q in m["pixels"]]
                m["x"], m["y"] = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
                m["r"] = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
                m["ground"] = sum(1 for q in m["pixels"] if mask[q] == "gpad") > len(m["pixels"]) / 2
                break
        else:
            merged.append(p)
    return merged


def run(src: Path, prefix: str, scale: int = 3) -> dict:
    """Extract pads and nets from one render; write <prefix>.json/.png and return summary counts."""
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
    split_ground_pads(pads, mask)
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
        # Reach grows with the pad: on blurry large renders the ring fades into the trace over several
        # pixels, on crisp small ones a short reach keeps neighbouring pads apart.
        near = max(NEAR, int(p["r"] * 0.3))
        for (x, y) in p["pixels"]:
            for dx in range(-near, near + 1):
                for dy in range(-near, near + 1):
                    pad_at.setdefault((x + dx, y + dy), p["id"])
        # Many renders draw the trace right through the hole: everything inside the ring is the pad's.
        r = int(p["r"])
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r:
                    pad_at.setdefault((int(p["x"]) + dx, int(p["y"]) + dy), p["id"])
    pad_zone = {(x + dx, y + dy) for p in pads for (x, y) in p["pixels"] for dx in range(-8, 9, 2) for dy in range(-8, 9, 2)}
    tunnels = 0
    for layer in ("top", "bot"):
        comps = components(mask, {layer})
        joined = list(range(len(comps)))

        def root(i: int) -> int:
            while joined[i] != i:
                i = joined[i]
            return i

        # body_tunnels() is kept for reference but not used: on Green Giant it joined a collector and
        # a base trace that both run along the 2.2M body. A wrong join hides in the netlist; a lone
        # pad is flagged for a reader - so traces vanishing under bodies are left to the reader (JUMP).
        for a, b in ([] if not BODY_TUNNELS else body_tunnels(mask, comps, pad_zone, [(p["x"], p["y"]) for p in pads], w, h)):
            if root(a) != root(b):
                joined[root(a)] = root(b)
                tunnels += 1
        pads_of: dict[int, set[int]] = defaultdict(set)
        for i, comp in enumerate(comps):
            pads_of[root(i)].update(pad_at[q] for q in comp if q in pad_at)
        for touched in pads_of.values():
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
    return {
        "pads": len(pads),
        "groundPads": len(grounds),
        "nets": len(nets),
        "multiPadNets": sum(1 for v in nets.values() if len(v) > 1),
        "loneNonGroundPads": sum(1 for v in nets.values() if len(v) == 1 and not pads[v[0]]["ground"]),
        "bodyTunnels": tunnels,
        "bottomLayerPixels": sum(1 for k in mask.values() if k == "bot"),
        "topLayerPixels": sum(1 for k in mask.values() if k == "top"),
        "size": [w, h],
    }


def main() -> None:
    src, prefix = Path(sys.argv[1]), sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    st = run(src, prefix, scale)
    print(f"{st['pads']} pads ({st['groundPads']} on the ground pour), {st['nets']} nets ({st['multiPadNets']} with 2+ pads, {st['loneNonGroundPads']} lone)")


if __name__ == "__main__":
    main()
