"""Read the silkscreen text of a pedalparts board render with glyph templates learnt from finished maps.

Usage:
    python -E -P silk_ocr.py <board.jpg> <nets.json> [out.txt]

The render draws labels in one of a few small vector fonts, 5-15 px tall, at 0/90/180/270 degrees
(pot labels on some boards in green and mirrored). Ink is the silk's coverage from layers.unmix, so a
letter over copper reads the same as one over bare board. Ink pixels form glyph components; glyphs
that sit side by side along a row (or a column, for turned text) form candidate words. Each word is
turned upright in every orientation its axis allows, each glyph is cut out at a size set by the
word's cap height and compared with the template bank (silk_glyphs.npz, built by silk_train.py);
the best-scoring set of words that do not share glyphs is kept.

A word is {text, conf (worst glyph similarity, 0..1), cx, cy, box, axis h|v, k (quarter turns used),
mirror, green, h (cap height px)}.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from layers import calibrate, unmix  # noqa: E402

BANK_PATH = Path(__file__).resolve().parents[4] / "references" / "pcb-kits" / "silk_glyphs.npz"
INK_MIN = 0.16
GREEN_MIN = 70
PAD_CLEAR = 2.5
RIM_SHARE = 0.5
MAX_GLYPH = 40
MAX_GLYPH_PIXELS = 500
CIRCLE_TOL = 1.6
CIRCLE_SHARE = 0.5
CIRCLE_R = (6, 90)
# Neighbouring glyphs of one word: overlap across the reading axis, gap along it (both x the glyph size).
LINK_OVERLAP = 0.5
LINK_GAP = 0.75
DOT = 3
GRID_H, GRID_W = 18, 12
CANVAS_TOP, CANVAS_BOTTOM, CANVAS_HALF_W = 0.15, 1.3, 0.5
SPLIT_WIDTH = 1.25
MAX_WORD = 12
MIN_GLYPH_SIM = 0.35
SIM_BATCH = 512


def ink_maps(rgb: np.ndarray, pads: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Silk coverage (0..1) and green-outline strength (0..1); pad rings and their dark edge cleared."""
    _, _, cover = unmix(rgb, calibrate(rgb))
    ink = np.clip(1 - cover, 0, 1)
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    magenta = (r - g > 40) & (b - g > 40)  # pads and their anti-aliased edge, whatever the brightness
    green = np.clip((g - np.maximum(r, b) - GREEN_MIN) / 120.0 + 0.35, 0, 1) * (g - np.maximum(r, b) > GREEN_MIN)
    ink[magenta | (green > 0)] = 0
    yy, xx = np.mgrid[: rgb.shape[0], : rgb.shape[1]]
    for p in pads:
        rad = p["r"] + PAD_CLEAR
        x0, x1 = int(max(0, p["x"] - rad - 1)), int(min(rgb.shape[1], p["x"] + rad + 2))
        y0, y1 = int(max(0, p["y"] - rad - 1)), int(min(rgb.shape[0], p["y"] + rad + 2))
        d2 = (xx[y0:y1, x0:x1] - p["x"]) ** 2 + (yy[y0:y1, x0:x1] - p["y"]) ** 2
        ring = (d2 <= rad * rad) & (d2 >= (p["r"] - 1) ** 2)
        green[y0:y1, x0:x1][d2 <= rad * rad] = 0
        # Pads drawn with a dark rim: clear the rim. Plain pads: keep the ink, it is a label crossing the pad.
        if ring.any() and (ink[y0:y1, x0:x1][ring] > INK_MIN).mean() > RIM_SHARE:
            ink[y0:y1, x0:x1][ring] = 0
    return ink, green


def _peel(mask: np.ndarray) -> np.ndarray:
    """A round outline (electrolytic, LED) with its label touching it: drop the circle, keep the letters.
    Anything else comes back empty (an outline, dropped whole)."""
    ys, xs = np.nonzero(mask)
    keep = np.ones(len(xs), bool)
    for _ in range(4):
        A = np.column_stack([xs[keep], ys[keep], np.ones(keep.sum())])
        sol, *_ = np.linalg.lstsq(A, xs[keep] ** 2 + ys[keep] ** 2, rcond=None)
        cx, cy = sol[0] / 2, sol[1] / 2
        rad = np.sqrt(max(sol[2] + cx * cx + cy * cy, 0))
        keep = np.abs(np.hypot(xs - cx, ys - cy) - rad) <= CIRCLE_TOL
        if keep.sum() < 12:
            return np.zeros_like(mask)
    if keep.mean() < CIRCLE_SHARE or not CIRCLE_R[0] <= rad <= CIRCLE_R[1]:
        return np.zeros_like(mask)
    rest = mask.copy()
    rest[ys[keep], xs[keep]] = False
    return rest


def glyphs(ink: np.ndarray, green: bool) -> tuple[np.ndarray, list[dict]]:
    """Label image and glyph-sized ink components. Too-big components (outlines, often with a label
    touching them) are peeled and their leftovers relabelled; plain outline pieces are dropped."""
    lab, n = ndimage.label(ink > (0.3 if green else INK_MIN), structure=np.ones((3, 3), bool))
    out = []
    pieces = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        npx = int((lab[sl] == i).sum())
        if max(h, w) > MAX_GLYPH or npx > MAX_GLYPH_PIXELS:
            if not green:
                own = lab[sl] == i
                left = _peel(own)
                lab[sl][own & ~left] = 0
                sub, k = ndimage.label(left, structure=np.ones((3, 3), bool))
                for j, ssl in enumerate(ndimage.find_objects(sub), 1):
                    n += 1
                    lab[sl][sub == j] = n
                    pieces.append((n, (slice(sl[0].start + ssl[0].start, sl[0].start + ssl[0].stop), slice(sl[1].start + ssl[1].start, sl[1].start + ssl[1].stop))))
            continue
        pieces.append((i, sl))
    for i, sl in pieces:
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        npx = int((lab[sl] == i).sum())
        if max(h, w) > MAX_GLYPH or npx > MAX_GLYPH_PIXELS or npx < 2:
            continue
        if max(h, w) >= 12 and min(h, w) <= 2 and max(h, w) > 6 * min(h, w):
            continue  # a straight outline piece
        out.append({"id": i, "x0": sl[1].start, "y0": sl[0].start, "x1": sl[1].stop - 1, "y1": sl[0].stop - 1, "w": w, "h": h, "green": green})
    return lab, out


def _groups(gl: list[dict], axis: str) -> list[list[int]]:
    """Union of glyphs linked along rows (axis h) or columns (axis v)."""
    a0, a1, c0, c1, size = ("x0", "x1", "y0", "y1", "h") if axis == "h" else ("y0", "y1", "x0", "x1", "w")
    parent = list(range(len(gl)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(len(gl)), key=lambda i: gl[i][a0])
    for ii, i in enumerate(order):
        p = gl[i]
        for j in order[ii + 1 :]:
            q = gl[j]
            big = max(p[size], q[size])
            if q[a0] - p[a1] - 1 > LINK_GAP * big:
                break
            ov = min(p[c1], q[c1]) - max(p[c0], q[c0]) + 1
            small = min(p[c1] - p[c0], q[c1] - q[c0]) + 1
            dot = max(p["w"], p["h"]) <= DOT or max(q["w"], q["h"]) <= DOT
            sized = big <= 3.5 * min(p[size], q[size]) + 3 or (dot and q[a0] - p[a1] - 1 <= 0.5 * big)
            if ov >= LINK_OVERLAP * small and q[a0] - p[a1] - 1 >= -1 and sized:
                parent[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for i in range(len(gl)):
        groups.setdefault(find(i), []).append(i)
    return [g for g in groups.values() if len(g) <= MAX_WORD]


def _upright(ink: np.ndarray, lab: np.ndarray, members: list[dict], k: int, mirror: bool):
    """Crop of the word turned upright: (ink crop, list of per-glyph masks) in reading order."""
    x0 = max(0, min(g["x0"] for g in members) - 1)
    y0 = max(0, min(g["y0"] for g in members) - 1)
    x1 = min(ink.shape[1], max(g["x1"] for g in members) + 2)
    y1 = min(ink.shape[0], max(g["y1"] for g in members) + 2)
    crop = ink[y0:y1, x0:x1]
    sub = lab[y0:y1, x0:x1]
    masks = [sub == g["id"] for g in members]
    crop = np.rot90(crop, k)
    masks = [np.rot90(m, k) for m in masks]
    if mirror:
        crop = crop[:, ::-1]
        masks = [m[:, ::-1] for m in masks]
    boxes = []
    for m in masks:
        ys, xs = np.nonzero(m)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max()))
    order = sorted(range(len(masks)), key=lambda i: (boxes[i][0] + boxes[i][2]) / 2)
    return crop, [masks[i] for i in order], [boxes[i] for i in order]


def _line(boxes: list[tuple]) -> tuple[float, float]:
    """Top and cap height of the word's text line (from its tall glyphs)."""
    hs = np.array([b[3] - b[1] + 1 for b in boxes], float)
    tall = hs >= 0.7 * hs.max()
    tops = np.array([b[1] for b in boxes], float)[tall]
    bots = np.array([b[3] for b in boxes], float)[tall]
    return float(np.median(tops)), float(np.median(bots) - np.median(tops) + 1)


def _vec(crop: np.ndarray, mask: np.ndarray, cx: float, top: float, cap: float) -> np.ndarray:
    img = crop * ndimage.binary_dilation(mask)
    rows = np.linspace(top - CANVAS_TOP * cap, top + CANVAS_BOTTOM * cap, GRID_H)
    cols = np.linspace(cx - CANVAS_HALF_W * cap, cx + CANVAS_HALF_W * cap, GRID_W)
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    v = ndimage.map_coordinates(img, [rr.ravel(), cc.ravel()], order=1, cval=0.0)
    v = v - v.mean()
    n = np.linalg.norm(v)
    return v / n if n > 1e-6 else v


def _split(mask: np.ndarray, box: tuple, cap: float, crop: np.ndarray) -> list[tuple[np.ndarray, tuple]]:
    """Cut a glyph component that is two or three characters touching at their weakest columns."""
    w = box[2] - box[0] + 1
    parts = int(round(w / (0.72 * cap)))
    if w < SPLIT_WIDTH * cap or parts < 2:
        return [(mask, box)]
    prof = (crop * mask).sum(axis=0)
    cuts = []
    for k in range(1, parts):
        guess = box[0] + w * k / parts
        lo, hi = int(guess - 0.2 * cap), int(guess + 0.2 * cap) + 1
        lo, hi = max(lo, box[0] + 1), min(hi, box[2])
        if hi <= lo:
            return [(mask, box)]
        cuts.append(lo + int(np.argmin(prof[lo:hi])))
    out, edges = [], [box[0]] + cuts + [box[2] + 1]
    for a, b in zip(edges, edges[1:]):
        m = mask.copy()
        m[:, :a] = False
        m[:, b:] = False
        ys, xs = np.nonzero(m)
        if len(xs):
            out.append((m, (xs.min(), ys.min(), xs.max(), ys.max())))
    return out


def word_vectors(ink: np.ndarray, lab: np.ndarray, members: list[dict], k: int, mirror: bool, split: bool = True) -> tuple[np.ndarray, float]:
    """Normalised glyph images of a word read in one orientation, in reading order, and its cap height."""
    crop, masks, boxes = _upright(ink, lab, members, k, mirror)
    top, cap = _line(boxes)
    pieces = []
    for m, b in zip(masks, boxes):
        pieces += _split(m, b, cap, crop) if split else [(m, b)]
    return np.stack([_vec(crop, m, (b[0] + b[2]) / 2, top, cap) for m, b in pieces]), cap


class Bank:
    """Glyph templates: every labelled glyph image, tagged with its character and board (nearest-neighbour)."""

    def __init__(self, vecs: np.ndarray, chars: list[str], boards: list[str]):
        order = np.argsort(np.array(chars), kind="stable")
        self.vecs = vecs[order].astype(np.float32)
        self.chars = [chars[i] for i in order]
        self.boards = np.array([boards[i] for i in order])
        self.alphabet = sorted(set(self.chars))
        self.starts = np.searchsorted(np.array(self.chars), self.alphabet)

    @classmethod
    def load(cls, path: Path = BANK_PATH) -> "Bank":
        if not path.exists():
            sys.exit(f"{path.name} missing: build it with  python -E -P silk_train.py")
        d = np.load(path, allow_pickle=False)
        v = d["vecs"].astype(np.float32)
        v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
        return cls(v, [str(c) for c in d["chars"]], [str(b) for b in d["boards"]])

    def save(self, path: Path = BANK_PATH) -> None:
        q = np.clip(np.round(self.vecs * 127 / max(float(np.abs(self.vecs).max()), 1e-9)), -127, 127).astype(np.int8)
        np.savez_compressed(path, vecs=q, chars=np.array(self.chars), boards=self.boards)

    def similarities(self, vecs: np.ndarray, exclude: str | None = None) -> np.ndarray:
        """Glyph x alphabet: best similarity to any template of each character."""
        vecs = vecs.astype(np.float32)
        sims = vecs @ self.vecs.T
        if exclude is not None:
            sims[:, self.boards == exclude] = -1
        return np.maximum.reduceat(sims, self.starts, axis=1)

    def match(self, vecs: np.ndarray, exclude: str | None = None) -> tuple[list[str], np.ndarray, np.ndarray]:
        """Best character, its similarity and the runner-up character's similarity for each glyph."""
        per_char = self.similarities(vecs, exclude)
        top2 = np.sort(per_char, axis=1)[:, -2:]
        return [self.alphabet[i] for i in per_char.argmax(axis=1)], top2[:, 1], top2[:, 0]

    def index(self, text: str) -> np.ndarray | None:
        """Alphabet positions of a string's characters, None if one is not in the bank."""
        try:
            return np.array([self.alphabet.index(c) for c in text])
        except ValueError:
            return None


def orientations(axis: str, n: int, green: bool) -> list[tuple[int, bool]]:
    ks = (0, 2) if axis == "h" else (1, 3)
    if n == 1:
        ks = (0, 1, 2, 3)
    return [(k, m) for k in ks for m in ((False, True) if green else (False,))]


def candidate_words(rgb: np.ndarray, pads: list[dict]) -> list[tuple]:
    """(ink, label image, members, axis) for every grey and green glyph group, rows and columns."""
    ink, green = ink_maps(rgb, pads)
    out = []
    for plane, is_green in ((ink, False), (green, True)):
        lab, gl = glyphs(plane, is_green)
        seen: set[tuple] = set()
        for axis in ("h", "v"):
            for grp in _groups(gl, axis):
                key = tuple(sorted(grp))
                if len(grp) == 1 and key in seen:
                    continue
                seen.add(key)
                out.append((plane, lab, [gl[i] for i in grp], "h" if len(grp) == 1 else axis))
    return out


def read_candidates(rgb: np.ndarray, pads: list[dict], bank: Bank, exclude: str | None = None) -> list[dict]:
    """Every candidate word with its glyph-by-character similarities in each orientation it may read."""
    out, chunks = [], []
    for plane, lab, members, axis in candidate_words(rgb, pads):
        is_green = members[0]["green"]
        readings = []
        for k, mirror in orientations(axis, len(members), is_green):
            vecs, cap = word_vectors(plane, lab, members, k, mirror)
            readings.append({"k": k, "mirror": mirror, "cap": cap, "n": len(vecs)})
            chunks.append(vecs)
        x0, y0 = min(g["x0"] for g in members), min(g["y0"] for g in members)
        x1, y1 = max(g["x1"] for g in members), max(g["y1"] for g in members)
        out.append({"cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "box": (int(x0), int(y0), int(x1), int(y1)), "axis": axis,
                    "green": is_green, "ids": frozenset((is_green, g["id"]) for g in members), "readings": readings})
    allv = np.concatenate(chunks) if chunks else np.zeros((0, GRID_H * GRID_W))
    sims = np.concatenate([bank.similarities(allv[i : i + SIM_BATCH], exclude) for i in range(0, len(allv), SIM_BATCH)]) if len(allv) else allv
    at = 0
    for c in out:
        for rd in c["readings"]:
            rd["sims"] = sims[at : at + rd["n"]]
            at += rd["n"]
    return out


def free_text(cand: dict, bank: Bank) -> dict:
    """Best unconstrained reading of a candidate: {text, score, conf, k, mirror}."""
    best = None
    for rd in cand["readings"]:
        sims = rd["sims"]
        top = sims.max(axis=1)
        score = float(np.sum(top - MIN_GLYPH_SIM))
        if best is None or score > best["score"]:
            best = {"text": "".join(bank.alphabet[i] for i in sims.argmax(axis=1)), "score": score, "conf": float(top.min()), "k": rd["k"], "mirror": rd["mirror"], "cap": rd["cap"]}
    return best


def decode(cand: dict, table: dict[int, list[tuple]], bank: Bank, index_cache: dict) -> dict | None:
    """Best lexicon entry for a candidate: {text, kind, value, score (mean glyph similarity), conf
    (worst glyph), margin (to the best entry with another value), k, mirror, cap}."""
    found = []
    for rd in cand["readings"]:
        sims = rd["sims"]
        n = len(sims)
        key = (id(table), n)
        if key not in index_cache:
            keep = [(r, bank.index(r[0])) for r in table.get(n, [])]
            keep = [(r, ix) for r, ix in keep if ix is not None]
            index_cache[key] = ([r for r, _ in keep], np.stack([ix for _, ix in keep]) if keep else None)
        entries, ix = index_cache[key]
        if ix is None:
            continue
        per = sims[np.arange(n)[None, :], ix]
        mean = per.mean(axis=1)
        for j in np.argsort(-mean)[:4]:
            found.append((float(mean[j]), entries[j], float(per[j].min()), rd))
    if not found:
        return None
    found.sort(key=lambda f: -f[0])
    score, (text, kind, value), conf, rd = found[0]
    other = next((f[0] for f in found[1:] if f[1][2] != value), 0.0)
    return {"text": text, "kind": kind, "value": value, "score": score, "conf": conf, "margin": score - other,
            "k": rd["k"], "mirror": rd["mirror"], "cap": rd["cap"], "n": len(rd["sims"])}


def read_board(rgb: np.ndarray, pads: list[dict], bank: Bank, exclude: str | None = None) -> list[dict]:
    """All words on the board, best free reading each, non-overlapping."""
    cands = []
    for c in read_candidates(rgb, pads, bank, exclude):
        r = free_text(c, bank)
        cands.append({**{k: v for k, v in c.items() if k != "readings"}, **r})
    taken: set = set()
    words = []
    for c in sorted(cands, key=lambda c: -c["score"]):
        if c["score"] <= 0 or c["ids"] & taken:
            continue
        taken |= c["ids"]
        words.append({k: v for k, v in c.items() if k != "ids"})
    return words


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    board, nets = Path(sys.argv[1]), Path(sys.argv[2])
    pads = json.loads(nets.read_text(encoding="utf-8"))["pads"]
    rgb = np.asarray(Image.open(board).convert("RGB"))
    words = read_board(rgb, pads, Bank.load())
    lines = [f"{w['text']}\t{w['conf']:.2f}\t{w['box']}\t{w['axis']}{w['k']}{'m' if w['mirror'] else ''}" for w in sorted(words, key=lambda w: (w["cy"] // 10, w["cx"]))]
    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text("\n".join(lines) + "\n", encoding="utf-8")
    else:
        print("\n".join(lines))


if __name__ == "__main__":
    main()
