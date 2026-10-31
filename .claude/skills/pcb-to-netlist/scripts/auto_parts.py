"""Footprint geometry for auto_map.py: transistor/pot pad rows, IC pad blocks, IC notch, diode band."""

import itertools

import numpy as np
from scipy import ndimage

Q_PITCH = (2.3, 3.4)      # x pad radius
POT_PITCH = (4.5, 7.5)
IC_PITCH = (2.3, 3.4)
IC_ROW_GAP = (2.3, 3.8)   # x pitch
IC_ROW_LENGTHS = (4, 7, 8)   # DIP-8, -14, -16
ON_SPOT = 0.45            # x pad radius: a pad counts as sitting at an expected position
BAND_INK = 0.3
BAND_CLEAR = 1.25
NOTCH_CLEAR = 1.2


def _xy(p: dict) -> np.ndarray:
    return np.array([p["x"], p["y"]], float)


def find_triples(pads: list[dict], used: set[int], ink: np.ndarray, r: float) -> list[tuple[str, list[int]]]:
    """Three collinear, evenly spaced free pads: ("Q", ids) at transistor pitch, ("POT", ids) at pot pitch.
    Each pad in at most one triple, tightest spacing error first."""
    free = [p for p in pads if p["id"] not in used]
    xy = np.array([_xy(p) for p in free]) if free else np.zeros((0, 2))
    found = []
    for i, mid in enumerate(free):
        d = np.hypot(*(xy - xy[i]).T)
        near = [j for j in np.nonzero((d > Q_PITCH[0] * r) & (d < POT_PITCH[1] * r))[0]]
        for j, k in itertools.combinations(near, 2):
            a, c = xy[j], xy[k]
            if np.hypot(*(a + c - 2 * xy[i])) > ON_SPOT * r:
                continue
            pitch = (d[j] + d[k]) / 2
            kind = "Q" if Q_PITCH[0] * r <= pitch <= Q_PITCH[1] * r else "POT" if POT_PITCH[0] * r <= pitch <= POT_PITCH[1] * r else None
            if kind:
                err = abs(d[j] - d[k]) + np.hypot(*(a + c - 2 * xy[i]))
                ends = sorted((free[j], free[k]), key=lambda p: (p["y"], p["x"]))
                found.append((err, kind, [ends[0]["id"], mid["id"], ends[1]["id"]]))
    out, taken = [], set()
    for err, kind, trio in sorted(found, key=lambda f: f[0]):
        if set(trio) & taken:
            continue
        taken.update(trio)
        out.append((kind, trio))
    return out


def _at(xy: np.ndarray, pt: np.ndarray, tol: float) -> int | None:
    d = np.hypot(*(xy - pt).T)
    i = int(np.argmin(d))
    return i if d[i] <= tol else None


def find_ics(pads: list[dict], r: float) -> list[list[list[int]]]:
    """Every block of two parallel equal rows of 4/7/8 pads at DIP pitch: [[row A ids], [row B ids]], both
    rows in the same direction. Pad rows on these boards often run on past a DIP, so blocks overlap; auto_map
    keeps the ones whose type name is read in the middle."""
    if len(pads) < 8:
        return []
    xy = np.array([_xy(p) for p in pads])
    ids = [p["id"] for p in pads]
    tol = ON_SPOT * r
    out, seen = [], set()
    for i in range(len(pads)):
        for j in range(len(pads)):
            step = xy[j] - xy[i]
            pitch = float(np.hypot(*step))
            if i == j or not (IC_PITCH[0] * r <= pitch <= IC_PITCH[1] * r) or step[0] < -1e-6 or (abs(step[0]) < 1e-6 and step[1] < 0):
                continue
            row = [i, j]
            while (n := _at(xy, xy[row[-1]] + step, tol)) is not None and len(row) < max(IC_ROW_LENGTHS):
                row.append(n)
            u = step / pitch
            normal = np.array([-u[1], u[0]])
            for m in IC_ROW_LENGTHS:
                if len(row) < m:
                    continue
                part = row[:m]
                for sign in (1, -1):
                    for gap in np.arange(IC_ROW_GAP[0], IC_ROW_GAP[1] + 1e-9, 0.05):
                        other = [_at(xy, xy[k] + normal * sign * gap * pitch, tol) for k in part]
                        if all(o is not None for o in other):
                            key = frozenset(ids[k] for k in part + other)
                            if key not in seen:
                                seen.add(key)
                                out.append([[ids[k] for k in part], [ids[k] for k in other]])
                            break
    return out


def _window_ink(ink: np.ndarray, centre: np.ndarray, u: np.ndarray, along: tuple[float, float], across: float) -> float:
    n = np.array([-u[1], u[0]])
    s = np.arange(along[0], along[1], 0.5)
    t = np.arange(-across, across + 1e-9, 0.5)
    ss, tt = np.meshgrid(s, t)
    pts = centre[None, None, :] + ss[..., None] * u + tt[..., None] * n
    vals = ndimage.map_coordinates(ink, [pts[..., 1].ravel(), pts[..., 0].ravel()], order=1, cval=0.0)
    return float(vals.sum())


def ic_pin1(ink: np.ndarray, rows: list[list[int]], by_id: dict) -> tuple[dict[int, int], bool]:
    """Pin number -> pad. The notch end (more silk just beyond the end pads, between the rows) is pin 1's
    end; pin 1's row is on the left with the notch up; numbering runs down that row and back up the other."""
    a, b = [[_xy(by_id[p]) for p in row] for row in rows]
    m = len(a)
    pitch = float(np.hypot(*(a[1] - a[0])))
    u = (a[-1] - a[0]) / np.hypot(*(a[-1] - a[0]))
    end0, end1 = (a[0] + b[0]) / 2, (a[-1] + b[-1]) / 2
    gap = float(np.hypot(*(b[0] - a[0])))
    ink0 = _window_ink(ink, end0, -u, (0.25 * pitch, 1.2 * pitch), 0.3 * gap)
    ink1 = _window_ink(ink, end1, u, (0.25 * pitch, 1.2 * pitch), 0.3 * gap)
    clear = max(ink0, ink1) >= NOTCH_CLEAR * max(min(ink0, ink1), 1e-6)
    rows = [list(rows[0]), list(rows[1])]
    if ink1 > ink0:
        rows = [row[::-1] for row in rows]
        u = -u
        a, b = a[::-1], b[::-1]
    up = -u
    left = np.array([up[1], -up[0]])
    centre = (np.mean(a, axis=0) + np.mean(b, axis=0)) / 2
    first, second = (rows[0], rows[1]) if float((np.mean(a, axis=0) - centre) @ left) > 0 else (rows[1], rows[0])
    pins = {i + 1: first[i] for i in range(m)}
    pins.update({m + 1 + i: second[m - 1 - i] for i in range(m)})
    return pins, clear


def diode_cathode_first(ink: np.ndarray, a: np.ndarray, b: np.ndarray, r: float) -> tuple[bool, bool]:
    """Whether the band (a thick silk bar across the body) sits on the first pad's half; and whether the
    two halves differ clearly."""
    L = float(np.hypot(*(b - a)))
    u = (b - a) / L
    n = np.array([-u[1], u[0]])
    s = np.arange(r + 1, L - r - 1, 1.0)
    if len(s) < 2:
        return True, False
    t = np.arange(-0.9 * r, 0.9 * r + 1e-9, 1.0)
    ss, tt = np.meshgrid(s, t)
    pts = a[None, None, :] + ss[..., None] * u + tt[..., None] * n
    vals = ndimage.map_coordinates(ink, [pts[..., 1].ravel(), pts[..., 0].ravel()], order=1, cval=0.0).reshape(ss.shape)
    frac = (vals > BAND_INK).mean(axis=0)
    thick = np.convolve(frac, np.ones(3), mode="same")
    half = len(thick) // 2
    if half == 0:
        return True, False
    f, g = float(thick[:half].max()), float(thick[half:].max())
    return f >= g, max(f, g) >= BAND_CLEAR * max(min(f, g), 1e-6)


def body_score(outline: np.ndarray, a: np.ndarray, b: np.ndarray, reach: float) -> float:
    """Fraction of the stretch between two pads with an outline on both sides within reach: the long sides
    of a resistor/diode/box-cap body, or the circle round a radial cap or LED."""
    L = float(np.hypot(*(b - a)))
    u = (b - a) / L
    n = np.array([-u[1], u[0]])
    s = np.linspace(0.25 * L, 0.75 * L, 9)
    t = np.arange(1.5, reach + 1e-9, 0.5)
    hits = []
    for sign in (1, -1):
        ss, tt = np.meshgrid(s, sign * t)
        pts = a[None, None, :] + ss[..., None] * u + tt[..., None] * n
        vals = ndimage.map_coordinates(outline, [pts[..., 1].ravel(), pts[..., 0].ravel()], order=0, cval=0).reshape(ss.shape)
        hits.append(vals.max(axis=0) > 0)
    return float((hits[0] & hits[1]).mean())
