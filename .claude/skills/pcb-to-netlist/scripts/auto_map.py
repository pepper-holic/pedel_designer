"""Draft the part lines of a map from a board render and its extraction.

Usage:
    python -E -P auto_map.py <bundle_dir> [out.txt]

Reads the silk text (silk_ocr.py) and decodes every word against what a label can say (lexicon.py),
then places parts by geometry:
  R/C/D/L  a value word between two aligned pads (or next to two close pads: radial caps, LEDs);
           a diode's cathode is the end with the band
  Q        three close collinear pads with a part number nearby; pins from the C/B/E (G/D/S) letters
  POT      three wider-spaced collinear pads with a taper+value label; lug 1 first in the label's
           reading direction, the name from the nearby word
  IC       two parallel rows of 4/7/8 pads; pin 1 at the notch end, pins counter-clockwise
  io       IN / OUT / 9V / GND words next to a pad no part uses
Lines the reader should check are written as "# ? <line>   # why" (commented out); the others are
live with the silk reading and its score after them. Unlabelled outlines from suggest_parts stay as
"# ? ?" candidates. With no out.txt the draft goes to <bundle_dir>/draft.txt.
"""

import itertools
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from auto_parts import body_score, diode_cathode_first, find_ics, find_triples, ic_pin1  # noqa: E402
from lexicon import Lexicon  # noqa: E402
from silk_ocr import Bank, decode, ink_maps, read_candidates  # noqa: E402

MIN_SCORE = 0.62
SURE_SCORE = 0.78
SURE_MARGIN = 0.03
SURE_R_SCORE = 0.95
SURE_BODY = 0.8
AXIAL_DOT = 0.94
IO_WORDS = {"IN": "IN", "INPUT": "IN", "OUT": "OUT", "OUTPUT": "OUT", "9V": "V9", "+9V": "V9", "9V+": "V9", "DC": "V9", "DC9V": "V9", "GND": "GND"}
PIN_SETS = (("c", "b", "e"), ("d", "g", "s"))
OUTLINE_INK = 0.3
PIN_SIM = 0.8
MIN_BODY = 0.5
AXIAL_OFF = 3.0
RADIAL_REACH = 2.2
BODY_ONLY = 0.8


class Board:
    def __init__(self, image: Path, nets: Path, bank: Bank, lex: Lexicon, exclude: str | None = None):
        ext = json.loads(nets.read_text(encoding="utf-8"))
        self.pads = ext["pads"]
        self.by_id = {p["id"]: p for p in self.pads}
        self.rgb = np.asarray(Image.open(image).convert("RGB"))
        self.ink, self.green = ink_maps(self.rgb, self.pads)
        self.r = float(np.median([p["r"] for p in self.pads])) if self.pads else 6.0
        self.bank, self.exclude = bank, exclude
        self.cands = read_candidates(self.rgb, self.pads, bank, exclude)
        self.cache: dict = {}
        self.tables = {name: lex.table(kinds, exclude) for name, kinds in {
            "two": {"R", "C", "D", "L"}, "q": {"Q"}, "potv": {"POTV"}, "potl": {"POTL"}, "ic": {"IC"}}.items()}
        io_tab: dict[int, list] = {}
        for w, v in IO_WORDS.items():
            io_tab.setdefault(len(w), []).append((w, "IO", v))
        self.tables["io"] = io_tab
        everything: dict[int, list] = {}
        for name, tab in self.tables.items():
            for n, rows in tab.items():
                everything.setdefault(n, []).extend(rows)
        self.tables["all"] = everything
        for c in self.cands:
            c["best"] = self.read(c, "all") if len(c["ids"]) > 1 else None
        self.outline = (self.ink > OUTLINE_INK) | (self.green > 0)
        self.used: set[int] = set()
        self.used_words: set[frozenset] = set()

    def read(self, cand: dict, table: str) -> dict | None:
        return decode(cand, self.tables[table], self.bank, self.cache)

    def xy(self, pid: int) -> np.ndarray:
        p = self.by_id[pid]
        return np.array([p["x"], p["y"]], float)


def _sure(rd: dict) -> bool:
    return rd["score"] >= SURE_SCORE and rd["margin"] >= SURE_MARGIN


def _between(b: Board, a: int, c: int) -> bool:
    pa, pc = b.xy(a), b.xy(c)
    d = pc - pa
    L2 = float(d @ d)
    for p in b.pads:
        if p["id"] in (a, c):
            continue
        q = np.array([p["x"], p["y"]])
        t = float((q - pa) @ d) / L2
        if 0 < t < 1 and np.linalg.norm(pa + t * d - q) < p["r"]:
            return True
    return False


def _pair_body(b: Board, i: int, j: int, reach: float | None = None) -> float:
    a, e = b.xy(i), b.xy(j)
    L = float(np.hypot(*(e - a)))
    if reach is None:
        reach = 1.6 * b.r + 2 if L > 5.5 * b.r else max(1.6 * b.r + 2, RADIAL_REACH * L)
    return body_score(b.outline, a, e, reach)


def _two_part(b: Board, i: int, j: int, kind: str, value: str, rd: dict | None, sure: bool) -> dict:
    first, second = sorted((i, j), key=lambda p: (b.by_id[p]["y"], b.by_id[p]["x"]))
    part = {"kind": kind, "value": value, "pads": [first, second], "read": rd, "sure": sure, "pins": [first, second]}
    if kind == "D":
        k_first, clear = diode_cathode_first(b.ink, b.xy(first), b.xy(second), b.r)
        part["pins"] = {"a": second, "k": first} if k_first else {"a": first, "k": second}
        part["sure"] &= clear
    return part


def two_lead(b: Board, near_too: bool) -> list[dict]:
    """Value words placed on the outlined pad pair they label: the word on the line between the pads
    (axial parts, box caps), and with near_too also next to two close pads (radial caps, LEDs)."""
    xy = np.array([[p["x"], p["y"]] for p in b.pads], float)
    ids = [p["id"] for p in b.pads]
    opts = []
    for c in b.cands:
        rd = c["best"]
        if c["green"] or not rd or rd["kind"] not in ("R", "C", "D", "L") or rd["score"] < MIN_SCORE:
            continue
        w = np.array([c["cx"], c["cy"]])
        near = np.nonzero(np.hypot(*(xy - w).T) < 26 * b.r)[0]
        for i, j in itertools.combinations(near, 2):
            a, e = xy[i], xy[j]
            d = e - a
            L = float(np.hypot(*d))
            if L < 1.8 * b.r or L > 30 * b.r:
                continue
            u = d / L
            t = float((w - a) @ u) / L
            off = abs(float(u[0] * (w - a)[1] - u[1] * (w - a)[0]))
            along = abs(u[0]) if c["axis"] == "h" else abs(u[1])
            mid = float(np.hypot(*(w - (a + e) / 2)))
            if along >= AXIAL_DOT and 0.1 <= t <= 0.9 and off <= max(4.0, AXIAL_OFF * rd["cap"]):
                cost = off / max(rd["cap"], 3) + abs(t - 0.5)
                reach = max(1.6 * b.r + 2, 1.2 * (off + rd["cap"]))
            elif near_too and L <= 5.5 * b.r and rd["kind"] in ("C", "D") and mid <= 0.7 * L + 3 * b.r:
                cost = 1.0 + mid / L
                reach = max(1.6 * b.r + 2, RADIAL_REACH * L, 1.2 * (off + rd["cap"]))
            else:
                continue
            opts.append([-rd["score"], cost, ids[i], ids[j], c, rd, reach])
    scored = []
    for o in opts:
        body = _pair_body(b, o[2], o[3], o.pop())
        if body >= MIN_BODY:
            scored.append(o + [body])
    opts = scored
    parts = []
    for _, cost, i, j, c, rd, body in sorted(opts, key=lambda o: (round(o[0], 2), o[1])):
        if i in b.used or j in b.used or c["ids"] in b.used_words or _between(b, i, j):
            continue
        b.used.update((i, j))
        b.used_words.add(c["ids"])
        # Live only where the scored maps say it pays: resistors read cleanly on the axis of an outlined
        # body are right 92% of the time (score_automap.py); caps (82%) and diodes stay for review.
        sure = rd["kind"] == "R" and rd["score"] >= SURE_R_SCORE and cost < 1.0 and body >= SURE_BODY
        part = _two_part(b, i, j, rd["kind"], rd["value"], rd, sure)
        part.update(cost=round(cost, 3), body=round(body, 3))
        parts.append(part)
    return parts


def unlabelled_pairs(b: Board) -> list[dict]:
    """Outlined aligned pad pairs no word labelled: diodes when a band shows, else kind unknown (all "# ?")."""
    free = [p for p in b.pads if p["id"] not in b.used]
    found = []
    for p, q in itertools.combinations(free, 2):
        dx, dy = abs(p["x"] - q["x"]), abs(p["y"] - q["y"])
        L = float(np.hypot(dx, dy))
        if min(dx, dy) > 3 or not (2.2 * b.r <= L <= 14 * b.r) or _between(b, p["id"], q["id"]):
            continue
        body = _pair_body(b, p["id"], q["id"])
        if body >= BODY_ONLY:
            found.append((-body, L, p["id"], q["id"]))
    d_words = [c for c in b.cands if c["best"] and c["best"]["kind"] == "D"]
    parts = []
    for _, L, i, j in sorted(found):
        if i in b.used or j in b.used:
            continue
        b.used.update((i, j))
        _, band = diode_cathode_first(b.ink, b.xy(i), b.xy(j), b.r)
        if band:
            mid = (b.xy(i) + b.xy(j)) / 2
            near = sorted(d_words, key=lambda c: np.hypot(c["cx"] - mid[0], c["cy"] - mid[1]))
            rd = near[0]["best"] if near and np.hypot(near[0]["cx"] - mid[0], near[0]["cy"] - mid[1]) < 20 * b.r else None
            parts.append(_two_part(b, i, j, "D", rd["value"] if rd else "?", rd, False))
        else:
            parts.append(_two_part(b, i, j, "?", "?", None, False))
    return parts


def _words_near(b: Board, pt: np.ndarray, radius: float, green: bool | None = None) -> list[dict]:
    out = []
    for c in b.cands:
        if green is not None and c["green"] != green:
            continue
        d = float(np.hypot(c["cx"] - pt[0], c["cy"] - pt[1]))
        if d <= radius:
            out.append((d, c))
    return [c for _, c in sorted(out, key=lambda t: t[0])]


def _best_word(b: Board, words: list[dict], table: str, min_n: int = 2) -> tuple[dict, dict] | None:
    best = None
    for c in words:
        if c["ids"] in b.used_words:
            continue
        rd = b.read(c, table)
        if rd and rd["n"] >= min_n and rd["score"] >= MIN_SCORE and (best is None or rd["score"] > best[1]["score"]):
            best = (c, rd)
    return best


def transistor_pins(b: Board, trio: list[int]) -> tuple[dict, int]:
    """Pin letters next to each pad: the permutation of C/B/E or D/G/S that the letters agree with best,
    and how many pads have a clear letter of that set beside them."""
    letters, clear = {}, {}
    for pid in trio:
        p = b.by_id[pid]
        sims = {}
        for c in _words_near(b, b.xy(pid), 3.5 * p["r"], green=False):
            if len(c["ids"]) != 1:
                continue
            for rd in c["readings"]:
                top = b.bank.alphabet[int(rd["sims"][0].argmax())]
                for ch in "CBEGDS":
                    if ch in b.bank.alphabet:
                        sim = float(rd["sims"][0, b.bank.alphabet.index(ch)])
                        sims[ch.lower()] = max(sims.get(ch.lower(), -1), sim)
                        if top == ch and sim >= PIN_SIM:
                            clear.setdefault(pid, set()).add(ch.lower())
        letters[pid] = sims
    best = None
    for names in PIN_SETS:
        for perm in itertools.permutations(names):
            s = sum(letters[pid].get(n, 0.0) for pid, n in zip(trio, perm))
            if best is None or s > best[0]:
                best = (s, perm)
    _, perm = best
    n_clear = sum(1 for pid, n in zip(trio, perm) if n in clear.get(pid, ()))
    return {n: pid for n, pid in zip(perm, trio)}, n_clear


def _kind_word(b: Board, words: list[dict], kinds: tuple[str, ...]) -> tuple[dict, dict] | None:
    """Nearest unused word (words come nearest first) whose best reading is one of these kinds."""
    for c in words:
        rd = c["best"]
        if rd and rd["kind"] in kinds and rd["score"] >= MIN_SCORE and c["ids"] not in b.used_words:
            return c, rd
    return None


def three_lead(b: Board, triples: list[tuple[str, list[int]]]) -> list[dict]:
    """Transistors and pots that a part number, pin letters or a pot label vouch for."""
    parts = []
    for kind, trio in triples:
        if set(trio) & b.used:
            continue
        centre = np.mean([b.xy(p) for p in trio], axis=0)
        span = float(np.hypot(*(b.xy(trio[0]) - b.xy(trio[2]))))
        words = _words_near(b, centre, span + 4 * b.r)
        if kind == "Q":
            hit = _kind_word(b, words, ("Q",))
            pins, n_clear = transistor_pins(b, trio)
            pins_ok = n_clear >= 2
            if not hit and not pins_ok:
                continue
            part = {"kind": "Q", "value": hit[1]["value"] if hit else "?", "pads": sorted(trio), "pins": pins, "read": hit[1] if hit else None}
            part["sure"] = bool(hit) and _sure(hit[1]) and pins_ok
            if hit:
                b.used_words.add(hit[0]["ids"])
        else:
            close = _words_near(b, centre, 0.8 * span + 2 * b.r)
            hv = _kind_word(b, close, ("POTV",))
            hl = _kind_word(b, close, ("POTL",))
            if not hv and not hl:
                continue
            for h in (hv, hl):
                if h:
                    b.used_words.add(h[0]["ids"])
            order = list(trio)
            k, mirror = (hv or hl)[1]["k"], (hv or hl)[1]["mirror"]
            ang = k * np.pi / 2
            reading = np.array([np.cos(ang), np.sin(ang)])  # the label's reading direction in the image
            if mirror:
                reading = -reading
            order.sort(key=lambda p: float(b.xy(p) @ reading))
            part = {"kind": "POT", "value": hv[1]["value"] if hv else "?", "label": hl[1]["value"] if hl else "?", "pads": sorted(trio), "pins": order,
                    "read": hv[1] if hv else hl[1], "sure": bool(hv and hl) and _sure(hv[1])}
        b.used.update(trio)
        parts.append(part)
    return parts


def ic_parts(b: Board) -> list[dict]:
    """DIP blocks with a type name read between the rows, best-centred name first."""
    opts = []
    for rows in find_ics(b.pads, b.r):
        pts = np.array([b.xy(p) for row in rows for p in row])
        centre = pts.mean(axis=0)
        length = float(np.hypot(*(b.xy(rows[0][0]) - b.xy(rows[0][-1]))))
        for c in _words_near(b, centre, 0.5 * length + b.r):
            rd = c["best"]
            if rd and rd["kind"] == "IC" and rd["score"] >= MIN_SCORE:
                off = float(np.hypot(c["cx"] - centre[0], c["cy"] - centre[1])) / max(length, 1)
                opts.append((rd["score"] - 0.5 * off, rows, c, rd))
    parts = []
    for _, rows, c, rd in sorted(opts, key=lambda o: -o[0]):
        block = {p for row in rows for p in row}
        if block & b.used or c["ids"] in b.used_words:
            continue
        pins, notch_clear = ic_pin1(b.ink, rows, b.by_id)
        b.used_words.add(c["ids"])
        b.used.update(block)
        parts.append({"kind": "IC", "value": rd["value"], "pads": sorted(block), "pins": pins, "read": rd, "sure": _sure(rd) and notch_clear})
    return parts


def io_line(b: Board) -> dict:
    roles: dict[str, tuple] = {}
    for c in b.cands:
        if c["ids"] in b.used_words or c["green"]:
            continue
        rd = b.read(c, "io")
        if not rd or rd["score"] < 0.7:
            continue
        free = [p for p in b.pads if p["id"] not in b.used]
        if not free:
            break
        d, pad = min((float(np.hypot(p["x"] - c["cx"], p["y"] - c["cy"])), p["id"]) for p in free)
        if d > 7 * b.r:
            continue
        role = rd["value"]
        if role not in roles or rd["score"] > roles[role][0]:
            roles[role] = (rd["score"], pad)
    out = {role: pad for role, (_, pad) in roles.items()}
    gnd = [p["id"] for p in b.pads if p["ground"]]
    if "GND" not in out and gnd:
        out["GND"] = gnd[0]
    return out


def draft(image: Path, nets: Path, bank: Bank, lex: Lexicon, exclude: str | None = None) -> dict:
    b = Board(image, nets, bank, lex, exclude)
    parts = ic_parts(b)
    parts += two_lead(b, False)
    parts += three_lead(b, find_triples(b.pads, b.used, b.ink, b.r))
    parts += two_lead(b, True)
    parts += unlabelled_pairs(b)
    return {"parts": parts, "io": io_line(b)}


def part_line(p: dict) -> str:
    if p["kind"] in ("R", "C", "L", "?"):
        body = f"{p['kind']} {p['value']} {p['pins'][0]} {p['pins'][1]}"
    elif p["kind"] == "POT":
        body = f"POT {p['value']} {p['label']} {' '.join(map(str, p['pins']))}"
    elif p["kind"] == "IC":
        body = f"IC {p['value']} " + " ".join(f"{k}={v}" for k, v in sorted(p["pins"].items()))
    else:
        body = f"{p['kind']} {p['value']} " + " ".join(f"{k}={v}" for k, v in p["pins"].items())
    rd = p.get("read")
    note = f"silk {rd['text']} {rd['score']:.2f}" if rd else "no label read"
    return f"{body}   # {note}" if p["sure"] else f"# ? {body}   # {note}"


def render(d: dict) -> list[str]:
    io = d["io"]
    lines = ["io " + " ".join(f"{k}={io[k]}" for k in ("IN", "OUT", "V9", "GND") if k in io), ""]
    order = {"IC": 0, "Q": 1, "POT": 2, "D": 3, "R": 4, "C": 5, "L": 6}
    for p in sorted(d["parts"], key=lambda p: (order.get(p["kind"], 9), p["pads"][0] if p["pads"] else 0)):
        lines.append(part_line(p))
    return lines


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    bundle = Path(sys.argv[1])
    nets = bundle / "board0_nets.json"
    image = bundle / json.loads(nets.read_text(encoding="utf-8"))["image"].replace("\\", "/").rsplit("/", 1)[-1]
    lines = render(draft(image, nets, Bank.load(), Lexicon()))
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else bundle / "draft.txt"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out}: {sum(1 for ln in lines if ln and not ln.startswith(('#', 'io')))} sure, {sum(1 for ln in lines if ln.startswith('# ?'))} to check")


if __name__ == "__main__":
    main()
