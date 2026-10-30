"""Turn a hand-written part map plus extract_nets.py output into a kit circuit JSON for the app.

Usage:
    python -E -P kit_netlist.py <map.txt> <nets.json> <out.json>

The map names each part and the pads (ids from the extract_nets overlay) its leads sit on:

    id pp-cdos                          # circuit id in the app
    goods 186788082                     # pedalparts goodsNo
    name CDOS                           # kit name as sold
    motif Colorsound Overdriver         # the pedal it reproduces
    type overdrive                      # family, as in index.json
    desc 2N5088 직결 2단 + 박산달 톤 ...   # one-line Korean summary of the topology
    io IN=8 OUT=82 V9=5 GND=4           # pads of the off-board wiring points
    R 100K 9 10                         # resistor: value, pad, pad [ref]
    C 220n 21 33                        # capacitor (polarity not needed)
    L 500mH 3 4                         # inductor
    D 1N4148 a=12 k=13                  # diode: anode, cathode [ref]
    Q 2N5088 b=51 c=42 e=59 [Q1]        # BJT / JFET (g= d= s=)
    POT B100K BASS 27 26 25             # pot: value+taper, label, lug1, wiper, lug3
    IC TL072 1=40 2=41 3=42 4=0 5=.. 8=..   # 8-pin op-amp package, pin=pad
    STAGE pre gain 프리앰프 (Q1·Q2)       # following parts belong to this functional stage
    JUMP 12 30                          # wire link on the board (merges the two nets)
    NC 61                               # pad deliberately unused (silences the check)

STAGE lines group the parts after them into the schematic's functional blocks, in signal order:
"STAGE <id> <category> <label>", category one of input buffer gain clipping fuzz tone output power
custom (use custom for feedback/bias networks and controls that are their own stage). The app lays
blocks out left to right in this order, so a kit reads input -> preamp -> controls -> clipper ->
output instead of as a grid. Every part should sit in a stage once any STAGE is used.

BOM lists the kit's parts list for an automatic count check, values or part numbers with an
optional xN count: "BOM 1M 150Kx2 220nx2 2N5088x3 B100Kx2".

AT places a part on the schematic by hand: "AT <ref> <x> <y> [h|v|h-|v-|r0|r90|r180|r270] [m]",
x/y in canvas pixels (grid 10; 2-terminal parts are 60 long, a BJT's pins sit 30 off its centre).
h keeps the first-listed lead left, v puts it on top, h-/v- the other way; m mirrors (a pot's wiper
down instead of up). V1 (audio input), VCC (9V source) and RLOAD (amp input) can be placed too.
Once any AT is given every part should have one: the app then pins each part where it is put and
only hangs ground symbols and reroutes the wires - use it when the automatic layout comes out
tangled (multi-transistor stages, Baxandall tone stacks).

Lines starting with "#" are comments. The script names nets (in, out, vcc, 0, then n1, n2 ... in
order of first use), checks every multi-pad net and every non-ground pad is used, and prints what
it could not reconcile so the reader can look again at the board.
"""

import json
import re
import sys
from pathlib import Path

META_KEYS = ("id", "goods", "name", "motif", "type", "desc", "image")
IO_NET = {"IN": "in", "OUT": "out", "V9": "vcc", "GND": "0"}


def used_offboard(raw_parts: list[dict], sentinel: int) -> set[str]:
    """Names of off-board points some part line uses ("OUT" when a pot wiper is written as OUT)."""
    names = {-1: "IN", -2: "OUT", -3: "V9", -4: "GND"}
    hit = set()
    for rp in raw_parts:
        pads = rp["pads"].values() if isinstance(rp["pads"], dict) else rp["pads"]
        if sentinel in pads:
            hit.add(names[sentinel])
    return hit


def norm(value: str) -> str:
    """Compare parts-list and board values loosely: 4.7K = 4K7 = 4.7k, 22uF = 22u, 470R = 470."""
    v = value.strip().upper().replace("Ω", "").replace("OHM", "")
    v = re.sub(r"F$", "", v)
    # "4K7"-style infix values have one or two digits after the letter; "2N5088" is a part number.
    m = re.fullmatch(r"(\d+)([PNUMRK])(\d{1,2})", v)
    if m:
        v = f"{m.group(1)}.{m.group(3)}{m.group(2)}"
    return re.sub(r"R$", "", v)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    map_path, nets_path, out_path = (Path(a) for a in sys.argv[1:4])
    extraction = json.loads(nets_path.read_text(encoding="utf-8"))
    pad_net = {p["id"]: p["net"] for p in extraction["pads"]}
    ground_pads = {p["id"] for p in extraction["pads"] if p["ground"]}

    parent: dict[int, int] = {}

    def find(n: int) -> int:
        parent.setdefault(n, n)
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    meta: dict[str, str] = {}
    io: dict[str, int] = {}
    raw_parts: list[dict] = []
    used_pads: set[int] = set()
    counters: dict[str, int] = {}
    stages: list[dict] = []
    layout: dict[str, dict] = {}
    bom: dict[str, int] = {}

    # Off-board points: a pot or jack wired straight to a part leg without a board pad (e.g. a level
    # pot whose wiper goes directly to the output jack). Written as IN/OUT/V9/GND in place of a pad.
    offboard = {"IN": -1, "OUT": -2, "V9": -3, "GND": -4}
    for k, v in offboard.items():
        pad_net[v] = f"offboard-{k}"

    def pad(token: str) -> int:
        if token in offboard:
            return offboard[token]
        p = int(token)
        if p not in pad_net:
            sys.exit(f"pad {p} does not exist in {nets_path.name}")
        used_pads.add(p)
        return p

    def auto_ref(prefix: str, given: str | None) -> str:
        if given:
            return given
        counters[prefix] = counters.get(prefix, 0) + 1
        return f"{prefix}{counters[prefix]}"

    for line_no, raw in enumerate(map_path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split("#", 1)[0].strip() if not raw.lstrip().startswith("desc") else raw.strip()
        if not line:
            continue
        head, *rest = line.split()
        if head in META_KEYS:
            meta[head] = line[len(head) :].strip()
        elif head == "io":
            for tok in rest:
                k, v = tok.split("=")
                io[k] = pad(v)
        elif head in ("R", "C", "L"):
            value, a, b, *ref = rest
            raw_parts.append({"ref": auto_ref(head, ref[0] if ref else None), "kind": head, "value": value, "pads": [pad(a), pad(b)]})
        elif head == "D":
            part, *pins = rest
            kv = dict(t.split("=") for t in pins if "=" in t)
            ref = next((t for t in pins if "=" not in t), None)
            raw_parts.append({"ref": auto_ref("D", ref), "kind": "D", "part": part, "pads": {"a": pad(kv["a"]), "k": pad(kv["k"])}})
        elif head == "Q":
            part, *pins = rest
            kv = dict(t.split("=") for t in pins if "=" in t)
            ref = next((t for t in pins if "=" not in t), None)
            raw_parts.append({"ref": auto_ref("Q", ref), "kind": "Q", "part": part, "pads": {k: pad(v) for k, v in kv.items()}})
        elif head == "POT":
            value, label, l1, w, l3 = rest
            raw_parts.append({"ref": label, "kind": "POT", "value": value, "pads": [pad(l1), pad(w), pad(l3)]})
        elif head == "IC":
            part, *pins = rest
            kv = dict(t.split("=") for t in pins if "=" in t)
            ref = next((t for t in pins if "=" not in t), None)
            raw_parts.append({"ref": auto_ref("U", ref), "kind": "IC", "part": part, "pads": {k: pad(v) for k, v in kv.items()}})
        elif head == "STAGE":
            sid, category, *label = rest
            stages.append({"id": sid, "category": category, "label": " ".join(label), "parts": []})
        elif head == "BOM":
            for tok in rest:
                m = re.fullmatch(r"(.+?)(?:x(\d+))?", tok)
                bom[norm(m.group(1))] = bom.get(norm(m.group(1)), 0) + int(m.group(2) or 1)
        elif head == "AT":
            ref, x, y, *opts = rest
            rot = {"h": 0, "v": 90, "h-": 180, "v-": 270, "r0": 0, "r90": 90, "r180": 180, "r270": 270}
            spot = {"x": int(x), "y": int(y)}
            for o in opts:
                if o in rot:
                    spot["rotation"] = rot[o]
                elif o == "m":
                    spot["mirror"] = True
                else:
                    sys.exit(f"{map_path.name}:{line_no}: unknown AT option '{o}'")
            layout[ref] = spot
        elif head == "JUMP":
            a, b = pad(rest[0]), pad(rest[1])
            parent[find(pad_net[a])] = find(pad_net[b])
        elif head == "NC":
            for t in rest:
                pad(t)
        else:
            sys.exit(f"{map_path.name}:{line_no}: unknown line '{raw}'")
        if stages and raw_parts and head in ("R", "C", "L", "D", "Q", "POT", "IC") and raw_parts[-1]["ref"] not in stages[-1]["parts"]:
            stages[-1]["parts"].append(raw_parts[-1]["ref"])

    for k in ("IN", "OUT", "V9", "GND"):
        if k not in io:
            if k in used_offboard(raw_parts, offboard[k]):
                io[k] = offboard[k]
                continue
            sys.exit(f"io {k}= missing")
        # An off-board point used on a part line is the same net as the board pad of that role.
        parent[find(pad_net[offboard[k]])] = find(pad_net[io[k]])

    names: dict[int, str] = {}
    for k, p in io.items():
        names[find(pad_net[p])] = IO_NET[k]
    for g in ground_pads:
        names.setdefault(find(pad_net[g]), "0")
    counter = 0

    def net_of(p: int) -> str:
        nonlocal counter
        root = find(pad_net[p])
        if root not in names:
            counter += 1
            names[root] = f"n{counter}"
        return names[root]

    parts = []
    terminals: dict[str, list[str]] = {}
    for rp in raw_parts:
        pads = rp.pop("pads")
        if isinstance(pads, dict):
            nodes = {k: net_of(v) for k, v in pads.items()}
            for k, n in nodes.items():
                terminals.setdefault(n, []).append(f"{rp['ref']}.{k}")
        else:
            nodes = [net_of(v) for v in pads]
            for i, n in enumerate(nodes):
                terminals.setdefault(n, []).append(f"{rp['ref']}.{i + 1}")
        parts.append({**rp, "nodes": nodes})

    problems = []
    for net, terms in sorted(terminals.items()):
        if len(terms) == 1 and net not in ("in", "out", "vcc", "0"):
            problems.append(f"net {net} has one lead only: {terms[0]}")
    for p in extraction["pads"]:
        if p["id"] in used_pads or p["ground"]:
            continue
        siblings = [q for q in extraction["nets"][str(p["net"])] if q != p["id"]]
        problems.append(f"pad {p['id']} unused (net with pads {siblings})" if siblings else f"pad {p['id']} unused (isolated)")

    if stages:
        staged = {r for st in stages for r in st["parts"]}
        for p in parts:
            if p["ref"] not in staged:
                problems.append(f"{p['ref']} is in no STAGE")
    if layout:
        refs = {p["ref"] for p in parts} | {"V1", "VCC", "RLOAD"}
        for ref in sorted(refs - set(layout)):
            if not any(p["ref"] == ref and p["kind"] == "IC" for p in parts):
                problems.append(f"{ref} has no AT")
        for ref in sorted(set(layout) - refs):
            if not re.fullmatch(r"(U\d+)[AB]", ref):
                problems.append(f"AT {ref}: no such part")
    if bom:
        have: dict[str, int] = {}
        for p in parts:
            key = norm(p.get("value") or p.get("part") or "")
            have[key] = have.get(key, 0) + 1
        for key in sorted(set(bom) | set(have)):
            if bom.get(key, 0) != have.get(key, 0):
                problems.append(f"BOM {key}: parts list {bom.get(key, 0)}, board {have.get(key, 0)}")

    kinds: dict[str, int] = {}
    for p in parts:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    circuit = {
        "id": meta.get("id", map_path.stem),
        "goodsNo": meta.get("goods", ""),
        "kitName": meta.get("name", ""),
        "motif": meta.get("motif", ""),
        "type": meta.get("type", "unknown"),
        "description": meta.get("desc", ""),
        "supply": 9,
        "parts": parts,
        **({"stages": stages} if stages else {}),
        **({"layout": layout} if layout else {}),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(circuit, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{circuit['id']}: {len(parts)} parts {kinds}, {len(set(terminals))} nets -> {out_path}")
    for msg in problems:
        print("  check:", msg)


if __name__ == "__main__":
    main()
