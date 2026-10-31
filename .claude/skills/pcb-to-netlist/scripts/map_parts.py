"""Part lines of a finished map (kit_netlist.py format) as plain records, and the ways a value is printed.

parse_map(path) -> {"io": {role: [pads]}, "parts": [{kind, value, label, pads, pins, ref}]}
  pads: every pad id the part uses (offboard IN/OUT/V9/GND tokens dropped)
  pins: R/C/L -> [p1, p2]; D -> {a, k}; Q -> {b, c, e} or {g, d, s}; POT -> [lug1, wiper, lug3]
        (offboard lugs kept as the token); IC -> {pin: pad}
silk_variants(kind, value) -> strings the silkscreen may show for that value ("4.7K" -> 4.7K 4K7 4.7k ...).
board_of(goods) -> (render path, nets path) of a committed kit.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
KITS = ROOT / "references" / "pcb-kits"
OFFBOARD = ("IN", "OUT", "V9", "GND")


def board_of(goods: str) -> tuple[Path, Path]:
    nets = KITS / goods / "board0_nets.json"
    image = json.loads(nets.read_text(encoding="utf-8"))["image"].replace("\\", "/").rsplit("/", 1)[-1]
    return KITS / goods / image, nets


def _pad(tok: str, merged: dict[int, int]) -> int | str:
    if tok in OFFBOARD:
        return tok
    p = int(tok)
    return merged.get(p, p)


def parse_map(path: Path, merged: dict[int, int] | None = None) -> dict:
    merged = merged or {}
    io: dict[str, list] = {}
    parts = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        head, *rest = line.split()
        if head == "io":
            for tok in rest:
                role, _, vals = tok.partition("=")
                io[role] = [_pad(v, merged) for v in vals.split(",") if v]
        elif head in ("R", "C", "L") and len(rest) >= 3:
            pins = [_pad(t, merged) for t in rest[1:3]]
            parts.append({"kind": head, "value": rest[0], "label": "", "pins": pins, "ref": rest[3] if len(rest) > 3 else ""})
        elif head in ("D", "Q", "IC") and rest:
            pins = {t.split("=", 1)[0]: _pad(t.split("=", 1)[1], merged) for t in rest[1:] if "=" in t}
            ref = next((t for t in rest[1:] if "=" not in t), "")
            parts.append({"kind": head, "value": rest[0], "label": "", "pins": pins, "ref": ref})
        elif head == "POT" and len(rest) >= 5:
            parts.append({"kind": "POT", "value": rest[0], "label": rest[1], "pins": [_pad(t, merged) for t in rest[2:5]], "ref": rest[5] if len(rest) > 5 else ""})
    for p in parts:
        vals = p["pins"].values() if isinstance(p["pins"], dict) else p["pins"]
        p["pads"] = sorted(v for v in vals if isinstance(v, int))
    return {"io": io, "parts": parts}


def _number(text: str) -> tuple[str, str, str] | None:
    """'4.7K' / '4K7' / '470R' / '22uF' -> (whole, fraction, multiplier letter)."""
    v = text.strip().replace("Ω", "R").replace("µ", "u").replace("μ", "u")
    v = re.sub(r"(?i)f$", "", v)
    m = re.fullmatch(r"(\d*)\.?(\d*)([RKMkmpnuU]?)", v)
    if m and (m.group(1) or m.group(2)):
        return m.group(1), m.group(2), m.group(3)
    m = re.fullmatch(r"(\d+)([RKMkmpnuU])(\d+)", v)
    if m:
        return m.group(1), m.group(3), m.group(2)
    return None


def eia_code(whole: str, frac: str, mul: str) -> str | None:
    """Three-digit ceramic cap code: 100n -> 104, 4.7n -> 472, 220p -> 221."""
    exp = {"p": 0, "n": 3, "u": 6}.get(mul)
    if exp is None or not whole.isdigit():
        return None
    pf = round(float(f"{whole}.{frac or 0}") * 10**exp)
    digits = str(pf)
    if pf < 10 or digits[2:].strip("0"):
        return None
    return digits[:2] + str(len(digits) - 2)


def silk_variants(kind: str, value: str) -> list[str]:
    if kind in ("D", "Q", "IC"):
        return [value.upper()]
    if kind == "POT":
        m = re.fullmatch(r"([ABCWG]?)(.*)", value)
        taper, rest = m.group(1), m.group(2)
        out = [value]
        num = _number(rest)
        if num and num[2]:
            w, f, mul = num
            mm = mul.upper()
            body = f"{w}.{f}{mm}" if f else f"{w}{mm}"
            out += [f"{taper}{body}", f"{body}{taper}" if taper else body, body]
        return list(dict.fromkeys(out))
    num = _number(value)
    if not num:
        return [value]
    w, f, mul = num
    dot = f"{w}.{f}" if f else w
    out = []
    if kind == "R":
        if mul.upper() in ("", "R"):
            out += [f"{dot}R", dot, f"{dot}Ω", f"{w}R{f}" if f else f"{w}R"]
        else:
            mm = mul.upper()
            out += [f"{dot}{mm}", f"{w}{mm}{f}" if f else f"{w}{mm}"]
    else:
        mm = mul.lower() if mul else "u"
        for body in (f"{dot}{mm}", f"{w}{mm}{f}" if f else None):
            if body:
                out += [body, f"{body}F"]
        if mm == "n" and not f and w.isdigit() and int(w) >= 100:
            micro = f"{int(w) / 1000:g}"
            out += [f"{micro}u", f"{micro}uF"] + ([f"{micro[1:]}u", f"{micro[1:]}uF"] if micro.startswith("0.") else [])
        if mm == "u":
            out += [f"{dot}μF", f"{dot}μ"]
        code = eia_code(w, f, mm)
        if code:
            out.append(code)
    return list(dict.fromkeys(o for o in out if o))
