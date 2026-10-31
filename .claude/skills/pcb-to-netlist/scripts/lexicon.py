"""What a silk label can say, by part kind: every spelling mapped to (kind, value as a map writes it).

Resistor and capacitor values come from the E24/E12 series in every way the boards print them
(4.7K 4K7, 100n 100nF 0.1u 104, 22uF 22μF); part numbers, pot labels and odd values come from the
finished maps, each remembered with the boards it came from so a board can be read without its own
words (exclude=goods). Lexicon.by_len[n] -> (strings, kinds, values) for decoding a word of n glyphs.
"""

import re
from pathlib import Path

from map_parts import KITS, eia_code, parse_map, silk_variants

E24 = (10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91)
E12 = (10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82)
COMMON_DIODES = ("1N4148", "1N914", "1N4001", "1N4004", "1N4007", "1N400X", "1N5817", "1N5818", "1N34A", "BAT41", "BAT46", "BAT85", "OA90", "LED")
COMMON_TRANSISTORS = ("2N5088", "2N5089", "2N3904", "2N3906", "BC549C", "BC550C", "BC109", "2N5457", "J201", "MPSA18", "2N7000", "BS170", "2SK30A")
TAPERS = ("A", "B", "C", "W")
POT_STEMS = (1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000)


def _fmt(mant: float) -> str:
    return f"{mant:g}"


def resistor_spellings(ohms: float) -> list[tuple[str, str]]:
    """(silk spelling, map value) for a resistance."""
    if ohms < 1000:
        v = _fmt(ohms)
        return [(f"{v}R", f"{v}R"), (v, f"{v}R"), (f"{v}Ω", f"{v}R")] + ([(v.replace(".", "R"), f"{v}R")] if "." in v else [])
    mul, div = ("K", 1e3) if ohms < 1e6 else ("M", 1e6)
    v = _fmt(ohms / div)
    out = [(f"{v}{mul}", f"{v}{mul}")]
    if "." in v:
        w, f = v.split(".")
        out.append((f"{w}{mul}{f}", f"{v}{mul}"))
    return out


def cap_spellings(pf: float) -> list[tuple[str, str]]:
    if pf < 1000:
        mul, val = "p", pf
    elif pf < 1e6:
        mul, val = "n", pf / 1e3
    else:
        mul, val = "u", pf / 1e6
    v = _fmt(val)
    canon = f"{v}uF" if mul == "u" else f"{v}{mul}"
    out = []
    for body in [f"{v}{mul}"] + ([v.replace(".", mul)] if "." in v else []):
        out += [(body, canon), (f"{body}F", canon)]
    if mul == "u":
        out += [(f"{v}μ", canon), (f"{v}μF", canon)]
    if mul == "n" and val >= 100:
        frac = f"{val / 1000:g}"[1:]
        out += [(f"0{frac}u", canon), (f"{frac}u", canon), (f"0{frac}uF", canon), (f"{frac}uF", canon)]
    w, _, f = v.partition(".")
    code = eia_code(w, f, mul)
    if code:
        out.append((code, canon))
    return out


class Lexicon:
    def __init__(self, maps_dir: Path = KITS / "maps"):
        self.entries: dict[str, list[tuple[str, str, frozenset]]] = {}
        everywhere = frozenset()
        for dec in range(0, 7):
            for m in E24:
                ohms = m * 10 ** (dec - 1)
                for s, v in resistor_spellings(ohms):
                    self._add(s, "R", v, everywhere)
        for dec in range(0, 9):
            for m in E12:
                for s, v in cap_spellings(m * 10 ** (dec - 1)):
                    self._add(s, "C", v, everywhere)
        for d in COMMON_DIODES:
            self._add(d, "D", d, everywhere)
        for q in COMMON_TRANSISTORS:
            self._add(q, "Q", q, everywhere)
        for t in TAPERS:
            for stem in POT_STEMS:
                for s, v in resistor_spellings(stem * 1e3):
                    if not re.search(r"\d[KM]\d", s):
                        self._add(f"{t}{s}", "POTV", f"{t}{v}", everywhere)
                        self._add(f"{s}{t}", "POTV", f"{t}{v}", everywhere)
        seen: dict[tuple[str, str, str], set] = {}
        for path in sorted(maps_dir.glob("*.txt")):
            goods = path.stem.split("-")[0]
            for p in parse_map(path)["parts"]:
                kind = {"POT": "POTV"}.get(p["kind"], p["kind"])
                for s in silk_variants(p["kind"], p["value"]):
                    if kind == "POTV" and not re.search(r"[ABCWG]", s):
                        continue  # a bare value is read as a resistor label; three_lead takes it from there
                    seen.setdefault((s.upper() if kind in ("D", "Q", "IC") else s, kind, p["value"]), set()).add(goods)
                if p["kind"] == "POT" and p["label"]:
                    seen.setdefault((p["label"].upper(), "POTL", p["label"].upper()), set()).add(goods)
        for (s, kind, v), boards in seen.items():
            self._add(s, kind, v, frozenset(boards))

    def _add(self, s: str, kind: str, value: str, boards: frozenset) -> None:
        lst = self.entries.setdefault(s, [])
        for i, (k, v, b) in enumerate(lst):
            if k == kind:
                lst[i] = (k, v, frozenset() if not b or not boards else b | boards)
                return
        lst.append((kind, value, boards))

    def table(self, kinds: set[str], exclude: str | None = None) -> dict[int, list[tuple[str, str, str]]]:
        """Spellings usable for these kinds, grouped by length: [(spelling, kind, value)]."""
        out: dict[int, list] = {}
        for s, lst in self.entries.items():
            for kind, value, boards in lst:
                if kind in kinds and (not boards or boards - {exclude}):
                    out.setdefault(len(s), []).append((s, kind, value))
        return out
