"""Find pads and copper nets in a pedalparts board-trace render, and draw a numbered overlay.

Usage:
    python -E -P extract_nets.py <board.jpg> <out_prefix> [scale=3] [--smd] [--flat] [--previous <nets.json>] [--renumber]

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
# A filled silk blob this size (px) that copper touches in 2+ places is an SMD body; its touch points become pads.
SMD_MIN, SMD_MAX, SMD_MIN_AREA, SMD_FILL = 8, 60, 60, 0.3
# Silkscreen (grey outlines, value text) is printed over the copper and cuts traces into pieces; a
# run of silk pixels at most this long that has copper of one layer on both sides is copper too.
# Silk gaps longer than this (thick board titles) are left open on purpose: every rule tried for
# them also joined unrelated traces along component outlines on the reference boards, and a wrong
# join hides in the netlist while a lone pad is flagged for a human to look at.
SILK_BRIDGE = 4
# Dark pixels that keep a copper tint (silk printed over a trace) are that trace - but only in the
# second, "hint" pass: on the reference boards the tint also runs along the glyphs over a part body
# where two traces pass 1px apart, so taken as fact it shorts feedback caps and pots. The official
# nets ignore it; the hint pass reports which net each lone pad would join, for the reader to confirm.
HINTS = True
SHORT_SILK = 4
# A ground (pour) pad is at least this fraction of the board's median pad radius.
GROUND_MIN_R = 0.6
# Pads come in two shades (pour pads paler) when the largest jump in their mean green is at least this.
SHADE_GAP = 12.0
PAD_KINDS = ("pad", "gpad")
SHADE_MIN_PADS = 3
# A part body is a white area ringed by a silk outline, and on many boards it is painted over the
# bottom-layer copper: a trace that turns a corner under a resistor vanishes there. When exactly two
# traces of one layer poke into such a body (each by a short stub), they are one trace.
BODY_TUNNELS = False
BODY_MIN_AREA = 60
BODY_MAX_AREA = 5000
BODY_MIN_SILK_EDGE = 0.55
STUB_MAX_CONTACT = 14


def classify(r: int, g: int, b: int, tinted: bool = False) -> str:
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
    # The bottom layer is painted over the top one semi-transparently: where a top trace runs under a
    # cyan trace the cyan leans green (b well below g). That pixel is both layers' copper - "both"
    # is treated as top and bottom when components are built - so a top trace crossing under a
    # bottom one is not cut there, while a cyan trace with nothing under it stays plain cyan.
    # (b well above r keeps the anti-aliased edge of a green footprint outline, where r ~ b, out.)
    # Most overlap pixels still have b > 170 and stop at the rule above; layers.py fits them properly.
    if g > 170 and r < 140 and g - b >= 20 and b >= 150 and b - r >= 40:
        return "both"
    hi, lo = max(r, g, b), min(r, g, b)
    # The silkscreen is printed semi-transparent: a grey letter over top copper comes out dark olive
    # (r ~ g, b lower by 20+), over bottom copper dark cyan (b above r by 20+), over bare board plain
    # grey. The tint only exists where copper actually is, so it is that layer's copper - this is what
    # carries a trace through a board title or a value label without joining its neighbours.
    if tinted and hi < 200 and hi >= 50 and abs(r - g) < 25 and r - b >= 20:
        return "top"
    if tinted and hi < 200 and hi >= 50 and b - r >= 20 and g >= r:
        return "bot"
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
    if kinds & {"top", "bot"}:
        kinds = kinds | {"both"}
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


def bridge(mask: dict[tuple[int, int], str], layer: str, w: int, h: int, soft: set[tuple[int, int]] = frozenset()) -> None:
    """Turn short horizontal/vertical runs of silk that sit between two copper pixels of one layer into
    copper, so a resistor outline or a value printed across a trace no longer splits it. `soft` copper
    (seen only as a tint under silk) is not bridged into a pad: a trace grazing a pad's outline tints it."""
    fill: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if mask.get((x, y)) not in (layer, "both", "pad", "gpad"):
                continue
            for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
                run: list[tuple[int, int]] = []
                for k in range(1, SILK_BRIDGE + 2):
                    q = (x + dx * k, y + dy * k)
                    kind = mask.get(q)
                    if kind == "silk":
                        run.append(q)
                        continue
                    to_pad = kind in ("pad", "gpad") or mask.get((x, y)) in ("pad", "gpad")
                    if to_pad and ((x, y) in soft or q in soft):
                        break
                    if kind in (layer, "both", "pad", "gpad") and run and (mask.get((x, y)) in (layer, "both") or kind in (layer, "both")):
                        # Up to 4px: any thin outline or text stroke. Longer (thick title text): only
                        # when the trace runs along this axis on both sides, so a gap along a
                        # component outline next to two unrelated traces is never filled.
                        # A trace of the other layer is never bridged across here: where this layer
                        # really passes under it the render tints the pixels ("both" in classify),
                        # and where it merely ends there (an undrawn via) the two sides are often
                        # different nets that happen to line up - bridging them shorted resistors on
                        # seven reference circuits.
                        straight = trace_end(mask, layer, (x, y), -dx, -dy) and trace_end(mask, layer, q, dx, dy)
                        if len(run) <= SHORT_SILK or straight:
                            fill.extend(run)
                    break
    other = "bot" if layer == "top" else "top"
    for q in fill:
        # Inside the other layer's trace (where this trace passes under it and the overlap goes dark)
        # the filled pixel is both layers' copper; written as this layer alone it would cut the other.
        # The other layer must lie on both sides across one axis: a silk outline crossing a cyan trace
        # that merely runs beside a yellow one touches yellow on one side only, and calling it "both"
        # there joined that yellow trace to another under the cyan (Duel A shorted its 1K R10).
        x, y = q
        inside = any(all(any(mask.get((x + s * dx * k, y + s * dy * k)) in (other, "both") for k in range(1, 4)) for s in (1, -1)) for dx, dy in ((1, 0), (0, 1)))
        mask[q] = "both" if inside else layer


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
    ok = (layer, "both")
    if not all(mask.get((x + dx * i, y + dy * i)) in ok for i in range(0, 4)):
        return False
    px, py = dy, dx
    across = sum(1 for i in (-1, 1) if mask.get((x + px * i + dx * 2, y + py * i + dy * 2)) in ok)
    far = sum(1 for i in (-7, 7) if mask.get((x + px * i + dx * 2, y + py * i + dy * 2)) in ok)
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


def split_ground_pads(pads: list[dict], mask: dict[tuple[int, int], str], rgb) -> None:
    """Decide per board which pads sit on the ground pour. Those are drawn paler than the others and
    carry a grey "+" (a thermal-relief cross) inside the ring. On a board where every pad is the same
    shade there is no pour, and nothing is ground - the pad colour alone proves nothing."""
    for p in pads:
        cx, cy, r = int(round(p["x"])), int(round(p["y"])), max(2, int(p["r"] * 0.45))
        reach = int(p["r"]) + 2
        # A thermal-relief "+" is a horizontal AND a vertical silk stroke through the hole centre;
        # a hole's dark outline ring, or a stray letter, never gives both. Each stroke is 1-2px wide
        # and the centre is known to about a pixel: take the best 3px band within 1px of the centre.
        row = max(sum(1 for x in range(cx - r, cx + r + 1) for dy in (s - 1, s, s + 1) if mask.get((x, cy + dy)) == "silk") for s in (-1, 0, 1))
        col = max(sum(1 for y in range(cy - r, cy + r + 1) for dx in (s - 1, s, s + 1) if mask.get((cx + dx, y)) == "silk") for s in (-1, 0, 1))
        at_centre = any(mask.get((cx + dx, cy + dy)) == "silk" for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        # The crossing must sit inside the ring: magenta on both sides of it along the row and along
        # the column. An electrolytic's or LED's polarity "+" is the same glyph but beside the pad.
        # Looked for beside the strokes (the "+" itself covers the band on the centre row and column).
        off = max(3, int(p["r"] * 0.3))
        ring = lambda dx, dy: all(any(mask.get((cx + dx * k + dy * o, cy + dy * k + dx * o)) in PAD_KINDS for k in range(2, reach)) for o in (-off, off))  # noqa: E731
        # Magenta on at least three sides: one entering trace may cover the band on its side, but a
        # polarity "+" has the pad on one side only (and often a passing trace on another).
        inside = sum(ring(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) >= 3
        p["cross"] = row >= r and col >= r and at_centre and inside
        # Shade of the ring, relative to this board's other pads: the mean green of its pixels (the
        # pale pour pads lean grey). Absolute thresholds fail on renders where every pad is drawn pale.
        p["shade"] = float(sum(int(rgb[y, x, 1]) for x, y in p["pixels"]) / len(p["pixels"]))
    shades = sorted(p["shade"] for p in pads)
    # Two shades: the biggest jump in the sorted shades is wide and leaves at least a few pads on
    # each side (one odd pad - a ring under a trace - must not pass for a cluster).
    gaps = [(b - a, a) for i, (a, b) in enumerate(zip(shades, shades[1:])) if SHADE_MIN_PADS <= i + 1 <= len(shades) - SHADE_MIN_PADS]
    gap, below = max(gaps) if gaps else (0.0, 0.0)
    two_shades = gap >= SHADE_GAP
    radii = sorted(p["r"] for p in pads)
    typical = radii[len(radii) // 2] if radii else 0
    for p in pads:
        # Two shades on the board: ground = the pale (greener) ones with a cross. One shade (small
        # renders): the cross alone marks the pour. A ring fragment well under the usual pad size is
        # never the pour: the "+" of an LED or transistor outline lands on such fragments and pulled
        # whole op-amp stages into ground (Fluffy Fuzz, Wild Jack pad 51).
        full_size = p["r"] >= GROUND_MIN_R * typical
        pale = p["shade"] > below if two_shades else True
        p["ground"] = full_size and p["cross"] and pale




def run(src: Path, prefix: str, scale: int = 3, smd: bool = False, layered: bool = True, previous: Path | None = None, renumber: bool = False) -> dict:
    """Extract pads and nets from one render; write <prefix>.json/.png and return summary counts.
    Copper comes from layers.py (each pixel judged per layer); `layered=False` (--flat) is the older
    one-label-per-pixel reading, kept for comparison."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()

    def build_mask(tinted: bool) -> dict[tuple[int, int], str]:
        soft: set[tuple[int, int]] = set()
        if layered and not tinted:
            import numpy as np
            from layers import label_mask
            m, soft = label_mask(np.asarray(im))
        else:
            m = {}
            for y in range(h):
                for x in range(w):
                    k = classify(*px[x, y], tinted)
                    if k:
                        m[(x, y)] = k
        for layer in ("top", "bot"):
            bridge(m, layer, w, h, soft)
        return m

    mask = build_mask(False)

    from pads import assign_ids, find_pads

    pads = find_pads(mask, w, h)
    import numpy as np

    split_ground_pads(pads, mask, np.asarray(im))
    # Ids follow the previous extraction of this board (by default the json this run overwrites), so
    # a better pad reading never renumbers the pads a map refers to; `renumber` starts from scratch.
    prev_path = previous if previous else Path(f"{prefix}.json")
    prev = json.loads(prev_path.read_text(encoding="utf-8")) if not renumber and prev_path.exists() else None
    lost_ids, merged_ids = assign_ids(pads, prev)
    # SMD parts (a J201 drawn as a filled dark body with three short legs) have no pad rings: the
    # traces just end at the legs. Each spot where copper meets such a filled silk blob becomes a
    # virtual pad, numbered after the real pads so existing ids stay put. Opt-in (--smd): on
    # through-hole boards the same rule hits transistor outlines and pot boxes.
    copper_id: dict[tuple[int, int], int] = {}
    n_copper = 0
    for layer in (("top", "bot") if smd else ()):
        for comp in components(mask, {layer}):
            n_copper += 1
            for q in comp:
                copper_id.setdefault(q, n_copper)
    for comp in (components(mask, {"silk"}) if smd else []):
        xs, ys = [q[0] for q in comp], [q[1] for q in comp]
        bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        if not (SMD_MIN <= bw <= SMD_MAX and SMD_MIN <= bh <= SMD_MAX) or len(comp) < SMD_MIN_AREA or len(comp) / (bw * bh) < SMD_FILL:
            continue
        body = set(comp)
        touch = {(x + dx, y + dy) for (x, y) in comp for dx in (-1, 0, 1) for dy in (-1, 0, 1) if mask.get((x + dx, y + dy)) in ("top", "bot", "both") and (x + dx, y + dy) not in body}
        # One cluster per trace: touch pixels are grouped by the copper component they belong to, so
        # two traces passing the body 1px apart never share a virtual pad.
        by_trace: dict[int, list[tuple[int, int]]] = {}
        for q in touch:
            by_trace.setdefault(copper_id.get(q, -1), []).append(q)
        clusters = [cl for cid, cl in by_trace.items() if cid != -1]
        # Two or more legs on different traces: a toggle's switch bar or a letter beside one trace is not.
        if len({copper_id.get(q) for cl in clusters for q in cl[:1]}) < 2:
            continue
        for cl in clusters:
            cx, cy = sum(q[0] for q in cl) / len(cl), sum(q[1] for q in cl) / len(cl)
            pads.append({"x": cx, "y": cy, "r": 3.0, "ground": False, "pixels": cl, "id": max(p["id"] for p in pads) + 1, "smd": True})

    def connect(cmask: dict[tuple[int, int], str], vias: bool = False) -> tuple[list[int], int]:
        """Union pads that one layer's copper joins; returns the union-find parent list and tunnel count.
        With `vias`, a trace of one layer that dead-ends into a trace of the other layer (a via the render
        does not draw) joins the two as well - hint pass only."""
        mask = cmask
        parent = {p["id"]: p["id"] for p in pads}
        comp_pads: dict[tuple[str, int], set[int]] = {}
        pixel_comp: dict[tuple[int, int], tuple[str, int]] = {}

        def find(a: int) -> int:
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        def union(a: int, b: int) -> None:
            parent[find(a)] = find(b)

        # A pixel can belong to several pads' reach: a copper stub between two pads 3px apart used to be
        # claimed by whichever pad came first, so the stub joined only that pad and the other stayed lone.
        pad_at: dict[tuple[int, int], set[int]] = {}
        for p in pads:
            # Reach grows with the pad: on blurry large renders the ring fades into the trace over several
            # pixels, on crisp small ones a short reach keeps neighbouring pads apart.
            near = max(NEAR, int(p["r"] * 0.3))
            for (x, y) in p["pixels"]:
                for dx in range(-near, near + 1):
                    for dy in range(-near, near + 1):
                        pad_at.setdefault((x + dx, y + dy), set()).add(p["id"])
            # Many renders draw the trace right through the hole: everything inside the ring is the pad's.
            r = int(p["r"])
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if dx * dx + dy * dy <= r * r:
                        pad_at.setdefault((int(p["x"]) + dx, int(p["y"]) + dy), set()).add(p["id"])
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
                for q in comp:
                    if q in pad_at:
                        pads_of[root(i)].update(pad_at[q])
                    if vias:
                        pixel_comp[q] = (layer, root(i))
            for touched in pads_of.values():
                touched_list = sorted(touched)
                for other in touched_list[1:]:
                    union(touched_list[0], other)
            if vias:
                for i in pads_of:
                    comp_pads[(layer, i)] = pads_of[i]
        if vias:
            for (x, y), (layer, ci) in pixel_comp.items():
                if layer != "top":
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if pixel_comp.get(q, ("", 0))[0] != "bot":
                        continue
                    # Dead end: no more top copper beyond the bottom trace along this direction.
                    if any(mask.get((x + dx * k, y + dy * k)) == "top" for k in range(2, 15)):
                        continue
                    a, b = comp_pads.get(("top", ci), set()), comp_pads.get(("bot", pixel_comp[q][1]), set())
                    if a and b:
                        for pa in a:
                            for pb in b:
                                union(pa, pb)
        grounds = [p["id"] for p in pads if p["ground"]]
        for g in grounds[1:]:
            union(grounds[0], g)

        return parent, tunnels

    parent, tunnels = connect(mask)
    grounds = [p["id"] for p in pads if p["ground"]]

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    roots: dict[int, int] = {}
    nets: dict[int, list[int]] = defaultdict(list)
    for p in pads:
        net = roots.setdefault(find(p["id"]), len(roots))
        p["net"] = net
        nets[net].append(p["id"])

    # Lone pads that no copper of either layer touches at all: an unused IC pin, a footprint lug the
    # kit leaves empty, or (big rings) an off-board wiring point. They are "NC" for the map, not
    # broken traces - listed apart so the reader looks only at pads where copper stops short.
    copper = {"top", "bot", "both"}
    unconnected: list[int] = []
    for p in pads:
        if p["ground"] or len(nets[p["net"]]) > 1:
            continue
        reach = max(NEAR, int(p["r"] * 0.3)) + 2
        if not any(mask.get((x + dx, y + dy)) in copper for (x, y) in p["pixels"] for dx in range(-reach, reach + 1, 2) for dy in range(-reach, reach + 1, 2)):
            unconnected.append(p["id"])
    hints: dict[str, list[int]] = {}
    if HINTS:
        tparent, _ = connect(build_mask(True), vias=True)

        def tfind(a: int) -> int:
            while tparent[a] != a:
                a = tparent[a]
            return a

        for p in pads:
            if p["ground"] or len(nets[p["net"]]) > 1:
                continue
            mates = sorted(q["id"] for q in pads if q["id"] != p["id"] and tfind(q["id"]) == tfind(p["id"]))
            if mates:
                hints[str(p["id"])] = mates
    out = {
        "image": str(src),
        "size": [w, h],
        "pads": [{k: p[k] for k in ("id", "x", "y", "r", "ground", "net", "smd") if k in p} for p in pads],
        "nets": {str(k): v for k, v in sorted(nets.items())},
        **({"hints": hints} if hints else {}),
        **({"unconnected": unconnected} if unconnected else {}),
        **({"lostIds": [i for i in lost_ids if i not in merged_ids]} if lost_ids else {}),
        **({"mergedIds": {str(k): v for k, v in merged_ids.items()}} if merged_ids else {}),
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
        "loneNonGroundPads": sum(1 for v in nets.values() if len(v) == 1 and not {p["id"]: p for p in pads}[v[0]]["ground"]),
        "hintedPads": len(hints),
        "unconnectedPads": len(unconnected),
        "bodyTunnels": tunnels,
        "bottomLayerPixels": sum(1 for k in mask.values() if k == "bot"),
        "topLayerPixels": sum(1 for k in mask.values() if k == "top"),
        "size": [w, h],
    }


def main() -> None:
    argv = sys.argv[1:]
    previous = Path(argv[argv.index("--previous") + 1]) if "--previous" in argv else None
    skip = {"--smd", "--flat", "--renumber", "--previous", str(previous)}
    args = [a for a in argv if a not in skip]
    src, prefix = Path(args[0]), args[1]
    scale = int(args[2]) if len(args) > 2 else 3
    st = run(src, prefix, scale, smd="--smd" in argv, layered="--flat" not in argv, previous=previous, renumber="--renumber" in argv)
    print(f"{st['pads']} pads ({st['groundPads']} on the ground pour), {st['nets']} nets ({st['multiPadNets']} with 2+ pads, {st['loneNonGroundPads']} lone)")


if __name__ == "__main__":
    main()
