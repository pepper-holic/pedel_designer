"""Pads of a pedalparts board render: one pad per ring centre, ids kept stable between extractions.

A through-hole pad is a magenta ring (or a square with a hole) of a radius between 5 and 24px. Ring
centres are found by matching annuli of every radius against the magenta mask: a ring scores near 1
at its own centre and its own radius, a ring cut into arcs by its trace or by a thermal "+" still
scores above half, and the midpoint between two neighbouring pads scores low because the annulus
there runs through their holes. Two pads 8px apart give two peaks, so they never merge into one
(the Fluffy Fuzz LED pads did under the old blob grouping). Magenta that no ring claims falls back
to the old blob grouping.

Pad ids used to be the sort order of the pads found, so any change to how pads are found renumbered
every pad after it and broke the hand-written maps. `assign_ids` reuses the ids of a previous
extraction for pads at the same place and gives new pads the ids after them.
"""

import math
import numpy as np
from scipy import ndimage
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree

MIN_PAD_PIXELS = 12
# A magenta blob with no ring centre is a pad only if it is at least this big (half-extent, px).
BLOB_MIN_R = 3.0
PAD_MERGE = 0.8
# Two pad pieces whose boxes overlap by at least this many px are arcs of one ring (merge_blobs).
BOX_OVERLAP = 2
# Ring radii tried (px), the annulus around each, and the coverage a centre must reach.
RADII = range(5, 25)
ANNULUS_IN, ANNULUS_OUT = 2, 1
RING_SCORE = 0.4
# Round the annulus (ARC_SAMPLES angles) a ring is magenta on this share, with no gap longer than this share.
ARC_SAMPLES, ARC_COVERED, ARC_MAX_GAP = 72, 0.7, 0.22
# Magenta unbroken for this share of the radius past the band, on more than ARC_OUTSIDE_MAX of the angles: not a ring.
THICK_BEYOND, ARC_OUTSIDE_MAX = 0.5, 0.25
# A weaker peak this close (in radii of the stronger one) to a stronger peak is the same ring.
PEAK_SUPPRESS = 1.1
# Magenta this far from a ring centre (in ring radii, plus px) is that ring.
RING_REACH_FACTOR, RING_REACH_PLUS = 1.35, 2.0
# A previous pad within this distance (px, or half its radius) of a new one is the same pad.
ID_MATCH_MIN = 3.0
PAD_KINDS = ("pad", "gpad")


def _magenta(mask: dict[tuple[int, int], str], w: int, h: int) -> np.ndarray:
    m = np.zeros((h, w), bool)
    for (x, y), k in mask.items():
        if k in PAD_KINDS:
            m[y, x] = True
    return m


def _kernels(r: int) -> tuple[np.ndarray, np.ndarray]:
    """The annulus of radius r and the disc inside it (the hole), both normalised."""
    size = 2 * (r + ANNULUS_OUT) + 1
    yy, xx = np.mgrid[:size, :size] - (r + ANNULUS_OUT)
    d = np.hypot(xx, yy)
    ring = ((d >= r - ANNULUS_IN) & (d <= r + ANNULUS_OUT)).astype(float)
    disc = (d < r - ANNULUS_IN - 1).astype(float)
    return ring / ring.sum(), disc / max(disc.sum(), 1)


def find_rings(magenta: np.ndarray) -> list[dict]:
    """Ring centres as {x, y, r, score}: peaks of (annulus coverage - hole coverage) over all radii.
    The hole term keeps solid magenta (a square pad's body, a wide ring's band) from scoring as rings."""
    m = magenta.astype(float)
    best = np.zeros(m.shape)
    best_r = np.zeros(m.shape, int)
    for r in RADII:
        ring, disc = _kernels(r)
        resp = fftconvolve(m, ring, mode="same") - fftconvolve(m, disc, mode="same")
        better = resp > best
        best[better] = resp[better]
        best_r[better] = r
    peaks = (best >= RING_SCORE) & (best == ndimage.maximum_filter(best, size=5))
    ys, xs = np.nonzero(peaks)
    cands = sorted(((best[y, x], x, y, int(best_r[y, x])) for y, x in zip(ys, xs)), reverse=True)
    rings: list[dict] = []
    for score, x, y, r in cands:
        if any(math.hypot(o["x"] - x, o["y"] - y) < PEAK_SUPPRESS * max(o["r"], r) for o in rings):
            continue
        covered, gap, outside = _ring_arcs(magenta, x, y, r)
        if covered < ARC_COVERED or gap > ARC_MAX_GAP or outside > ARC_OUTSIDE_MAX:
            continue
        rings.append({"x": float(x), "y": float(y), "r": float(r), "score": float(score)})
    return rings


def _ring_arcs(magenta: np.ndarray, x: int, y: int, r: int) -> tuple[float, float, float]:
    """Going round the annulus: the share of angles where its band is magenta, the longest run of
    angles where it is not (as a share of the circle), and the share of angles with magenta just
    outside the band. A ring is magenta nearly all the way round, its trace or a thermal "+" opens only
    short gaps, and outside its band lies board or copper. An annulus through the middle of four pads
    (or grazing one neighbour) is magenta in separate arcs with long gaps, and the pads' bands continue
    outside it."""
    h, w = magenta.shape

    def magenta_at(k: int, radii: range) -> bool:
        a = 2 * math.pi * k / ARC_SAMPLES
        for rr in radii:
            px, py = int(round(x + rr * math.cos(a))), int(round(y + rr * math.sin(a)))
            if 0 <= px < w and 0 <= py < h and magenta[py, px]:
                return True
        return False

    band = range(r - ANNULUS_IN, r + ANNULUS_OUT + 1)
    # "Thick": magenta without a break for half a radius past the band. A ring's band ends within a
    # few px and the next pad begins only after a gap; a ray from the middle of four pads crosses
    # their bands obliquely and stays in magenta much longer.
    beyond = range(r + ANNULUS_OUT + 1, r + ANNULUS_OUT + 1 + max(3, round(THICK_BEYOND * r)))
    on = np.array([magenta_at(k, band) for k in range(ARC_SAMPLES)])
    outside = sum(all(magenta_at(k, range(rr, rr + 1)) for rr in beyond) for k in range(ARC_SAMPLES)) / ARC_SAMPLES
    if on.all():
        return 1.0, 0.0, outside
    gap = run = 0
    for v in np.concatenate([on, on]):
        run = 0 if v else run + 1
        gap = max(gap, run)
    return float(on.mean()), min(gap, ARC_SAMPLES) / ARC_SAMPLES, outside


def _blobs(cells: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    seen: set[tuple[int, int]] = set()
    out = []
    for start in cells:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in cells and q not in seen:
                        seen.add(q)
                        stack.append(q)
        out.append(comp)
    return out


def _pad(pixels: list[tuple[int, int]], centre: tuple[float, float] | None = None) -> dict:
    xs, ys = [q[0] for q in pixels], [q[1] for q in pixels]
    cx, cy = centre if centre else ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    return {"x": cx, "y": cy, "r": max(max(xs) - min(xs), max(ys) - min(ys)) / 2, "ground": False, "pixels": pixels}


def merge_blobs(pads: list[dict]) -> list[dict]:
    """Old grouping for magenta without a ring centre: arcs whose centres are closer than their
    radii, or whose boxes overlap, are one ring."""
    merged: list[dict] = []
    for p in sorted(pads, key=lambda q: -len(q["pixels"])):
        for m in merged:
            close = abs(m["x"] - p["x"]) + abs(m["y"] - p["y"]) < PAD_MERGE * (m["r"] + p["r"]) + 2
            boxes_touch = abs(m["x"] - p["x"]) <= m["r"] + p["r"] - BOX_OVERLAP and abs(m["y"] - p["y"]) <= m["r"] + p["r"] - BOX_OVERLAP and max(m["r"], p["r"]) < 16
            if close or boxes_touch:
                m.update(_pad(m["pixels"] + p["pixels"]))
                break
        else:
            merged.append(p)
    return merged


def find_pads(mask: dict[tuple[int, int], str], w: int, h: int) -> list[dict]:
    """Pads as dicts {x, y, r, ground(False), pixels}; ids are not assigned here."""
    magenta = _magenta(mask, w, h)
    rings = find_rings(magenta)
    ys, xs = np.nonzero(magenta)
    cells = list(zip(xs.tolist(), ys.tolist()))
    claimed: dict[int, list[tuple[int, int]]] = {i: [] for i in range(len(rings))}
    leftover: set[tuple[int, int]] = set()
    if rings and cells:
        tree = cKDTree([(rg["x"], rg["y"]) for rg in rings])
        dist, idx = tree.query(cells)
        reach = np.array([RING_REACH_FACTOR * rg["r"] + RING_REACH_PLUS for rg in rings])
        for cell, d, i in zip(cells, dist, idx):
            if d <= reach[i]:
                claimed[i].append(cell)
            else:
                leftover.add(cell)
    else:
        leftover = set(cells)
    pads = [_pad(px, (rings[i]["x"], rings[i]["y"])) for i, px in claimed.items() if len(px) >= MIN_PAD_PIXELS]
    blobs = [b for b in (_pad(comp) for comp in _blobs(leftover) if len(comp) >= MIN_PAD_PIXELS) if b["r"] >= BLOB_MIN_R]
    kept = [b for b in blobs if not any(math.hypot(b["x"] - p["x"], b["y"] - p["y"]) <= p["r"] + b["r"] for p in pads)]
    return pads + merge_blobs(kept)


def assign_ids(pads: list[dict], previous: dict | None) -> tuple[list[int], dict[int, int]]:
    """Give each pad an id: the previous extraction's id for a pad at the same place, new ids after the
    old ones for the rest. Returns the previous ids that found no pad (left as gaps) and, for those that
    lie inside a new pad (arcs of a ring the old reading counted apart), which pad absorbed them -
    kit_netlist resolves a map's reference to such an id to that pad."""
    if not previous:
        pads.sort(key=lambda p: (round(p["y"] / 8), p["x"]))
        for i, p in enumerate(pads):
            p["id"] = i
        return [], {}
    old = [q for q in previous["pads"] if not q.get("smd")]
    pairs = sorted((math.hypot(q["x"] - p["x"], q["y"] - p["y"]), oi, ni) for oi, q in enumerate(old) for ni, p in enumerate(pads))
    taken_old: set[int] = set()
    taken_new: set[int] = set()
    for d, oi, ni in pairs:
        if oi in taken_old or ni in taken_new or d > max(ID_MATCH_MIN, old[oi]["r"] * 0.5):
            continue
        pads[ni]["id"] = old[oi]["id"]
        taken_old.add(oi)
        taken_new.add(ni)
    # A ring that the old reading had as several arcs (a transistor outline's cut-up pad) keeps the id
    # of its largest old piece, so a map's pin reference survives; the other pieces' ids are lost.
    for ni, p in enumerate(pads):
        if "id" in p:
            continue
        inside = [oi for oi, q in enumerate(old) if oi not in taken_old and math.hypot(q["x"] - p["x"], q["y"] - p["y"]) <= p["r"]]
        if inside:
            oi = max(inside, key=lambda i: old[i]["r"])
            p["id"] = old[oi]["id"]
            taken_old.add(oi)
    next_id = max((q["id"] for q in old), default=-1) + 1
    for p in sorted((p for p in pads if "id" not in p), key=lambda p: (round(p["y"] / 8), p["x"])):
        p["id"] = next_id
        next_id += 1
    pads.sort(key=lambda p: p["id"])
    lost = [old[oi]["id"] for oi in range(len(old)) if oi not in taken_old]
    merged: dict[int, int] = {}
    for oi in range(len(old)):
        if oi in taken_old:
            continue
        q = old[oi]
        host = [p for p in pads if math.hypot(q["x"] - p["x"], q["y"] - p["y"]) <= p["r"] + q["r"]]
        if host:
            merged[q["id"]] = min(host, key=lambda p: math.hypot(q["x"] - p["x"], q["y"] - p["y"]))["id"]
    return lost, merged
