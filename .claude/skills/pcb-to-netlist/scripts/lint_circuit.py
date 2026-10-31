"""Structural lint of kit circuit JSONs: shapes a misread map leaves behind that the converter and tests let through.

Usage:
    python -E -P lint_circuit.py <circuit.json ...> [--maps <dir>] [--markdown]

Warnings (code: what it means):
    floating      a node group with no DC path to a rail that only capacitors touch (the converter's 1G leakage
                  makes it solve; a group holding a pot or resistor - a tone pot between two caps - is a legitimate
                  leakage target and is not reported)
    one-lead      a net only one part touches (a single lead, or a trimmer's wiper and lug with nothing else)
    short         a two-lead part with both leads on one net, a transistor with collector and emitter on one net
    pot           a pot whose wiper is tied to both end lugs, or whose two end lugs are tied together
    opamp-rail    an op-amp input wired straight to ground or a supply rail (unused channels are skipped)
    opamp-bias    an op-amp input with no DC path to a rail (sits on capacitors only)
    drivers       an op-amp output on the same net as another op-amp output or a transistor emitter/source
    opamp-fb      an op-amp channel whose output does not come back to its - input through <= 3 passive parts
    base-bias     a transistor base/gate with no DC path to a rail other than through the transistor itself
    bom           the map's BOM line and its part lines disagree in a value's count
    map-json      the circuit JSON and its map disagree in parts (JSON built from an older map)
    stage         a STAGE outside the vocabulary (stage_vocab.py), a stage naming no such part, a part in no stage
                  or in two

Not repeated here (tests/solver/kit-circuits.test.ts covers them): DC convergence, collectors between the rails,
signal reaching the output, hand placement, pots loading as knobs. kit_netlist.py's pad checks need the board
extraction and stay there. Exit status 1 when anything is reported.
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from kit_netlist import CHARGE_PUMPS, norm  # noqa: E402
from stage_vocab import DEFAULT_MAPS, stage_problem  # noqa: E402

PART_MODELS = HERE.parents[3] / "apps" / "web" / "src" / "core" / "library" / "kits" / "partModels.ts"
FIXED = ("0", "vcc", "in", "out")  # V1 drives in, RLOAD ties out to ground
FEEDBACK_DEPTH = 3
PASSIVE = ("R", "C", "L", "POT", "D")
STD_PINOUT = {
    1: [("6", "2", "3")],
    2: [("1", "2", "3"), ("7", "6", "5")],
    4: [("1", "2", "3"), ("7", "6", "5"), ("8", "9", "10"), ("14", "13", "12")],
}
SPECIAL_PINOUT = {"TA7136": [("6", "3", "2")], "LM386": [("5", "2", "3")], "JRC386": [("5", "2", "3")]}
V_MINUS = {1: "4", 2: "4", 4: "11"}


def is_lm386(part: str) -> bool:
    """LM386 inputs sit on internal 50K to ground and its gain network is inside: one input grounded is the norm."""
    return "386" in part


def opamp_table() -> list[tuple[str, int]]:
    """(part prefix, channels) from partModels.ts OPAMPS, so the lint follows the app's own table."""
    text = PART_MODELS.read_text(encoding="utf-8")
    return [(m.group(1), int(m.group(2))) for m in re.finditer(r'\["(\w+)", \w+, ([124])', text)]


OPAMPS = opamp_table()


def channels_of(part: str) -> list[tuple[str, str, str]]:
    """(out, in-, in+) package pins of each channel, [] for a part that is not an op-amp."""
    key = part.upper().replace(" ", "")
    for prefix, pins in SPECIAL_PINOUT.items():
        if key.startswith(prefix) or (prefix == "LM386" and "386" in key):
            return pins
    hit = next((n for prefix, n in OPAMPS if key.startswith(prefix)), None)
    return STD_PINOUT[hit] if hit else []


def is_pump(part: str) -> bool:
    return any(part.upper().replace(" ", "").startswith(p) for p in CHARGE_PUMPS)


def leads(p: dict) -> list[tuple[str, str]]:
    """(pin, net) of every lead of a part."""
    nodes = p["nodes"]
    if isinstance(nodes, dict):
        return list(nodes.items())
    return [(str(i + 1), n) for i, n in enumerate(nodes)]


class Union:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, n: str) -> str:
        self.parent.setdefault(n, n)
        while self.parent[n] != n:
            self.parent[n] = self.parent[self.parent[n]]
            n = self.parent[n]
        return n

    def join(self, nets: list[str]) -> None:
        for n in nets[1:]:
            self.parent[self.find(n)] = self.find(nets[0])


def dc_union(parts: list[dict], rails: set[str], skip: str | None = None) -> Union:
    """Nets tied at DC: resistive parts join their leads, op-amp outputs count as driven (joined to ground),
    transistors join all their leads (except `skip`), capacitors and op-amp inputs join nothing."""
    u = Union()
    u.join(sorted(rails))
    for p in parts:
        kind, nets = p["kind"], dict(leads(p))
        if kind in ("R", "L", "POT", "D") or (kind == "Q" and p["ref"] != skip):
            u.join(list(nets.values()))
        elif kind == "T":
            u.join([nets[k] for k in ("p1", "pct", "p2") if k in nets])
            u.join([nets[k] for k in ("s1", "sct", "s2") if k in nets])
        elif kind == "IC" and not is_pump(p.get("part", "")):
            for out, _, _ in channels_of(p.get("part", "")):
                if out in nets:
                    u.join(["0", nets[out]])
        for n in nets.values():
            u.find(n)
    return u


def lint_nets(c: dict, rails: set[str]) -> list[tuple[str, str]]:
    parts = c["parts"]
    out: list[tuple[str, str]] = []
    terms: dict[str, list[str]] = defaultdict(list)
    for p in parts:
        for pin, net in leads(p):
            terms[net].append(f"{p['ref']}.{pin}" if p["kind"] in ("Q", "D", "IC", "T", "POT") else p["ref"])
    pump_nets = {n for p in parts if p["kind"] == "IC" and is_pump(p.get("part", "")) for _, n in leads(p)}
    ics = {p["ref"] for p in parts if p["kind"] == "IC"}
    for net, ts in sorted(terms.items()):
        owners = {t.split(".")[0] for t in ts}
        # one IC on several pins is an unused channel wired as a follower, not a dangling net
        if len(owners) == 1 and not (len(ts) > 1 and owners <= ics) and net not in rails | pump_nets:
            out.append(("one-lead", f"net {net} reaches one part only: {', '.join(ts)}"))

    for p in parts:
        nets = dict(leads(p))
        if p["kind"] in ("R", "C", "L", "D") and len(set(nets.values())) == 1:
            out.append(("short", f"{p['ref']}: both leads on net {next(iter(nets.values()))}"))
        elif p["kind"] == "Q" and len({nets.get(k) for k in ("c", "e", "d", "s")} - {None}) == 1:
            out.append(("short", f"{p['ref']}: collector and emitter (drain and source) on one net"))
        if p["kind"] == "POT":
            a, w, b = p["nodes"]
            if a == w == b:
                out.append(("pot", f"{p['ref']}: wiper and both lugs on one net {a}"))
            elif a == b:
                out.append(("pot", f"{p['ref']}: both end lugs on net {a} (wiper {w})"))

    u = dc_union(parts, rails)
    grounded = u.find("0")
    islands: dict[str, set[str]] = defaultdict(set)
    for net in terms:
        if u.find(net) != grounded:
            islands[u.find(net)].add(net)
    opamp_inputs = {(p["ref"], pin): nets[pin] for p in parts if p["kind"] == "IC" and not is_lm386(p.get("part", ""))
                    for nets in [dict(leads(p))] for _, m, q in channels_of(p.get("part", "")) for pin in (m, q) if pin in nets}
    for nets in islands.values():
        touching = [t for n in nets for t in terms[n]]
        ins = sorted(f"{ref}.{pin}" for (ref, pin), n in opamp_inputs.items() if n in nets)
        if ins:
            out.append(("opamp-bias", f"{', '.join(ins)}: no DC path to a rail (nets {', '.join(sorted(nets))})"))
        elif all("." not in t and t.startswith("C") for t in touching):
            out.append(("floating", f"nets {', '.join(sorted(nets))} reach no rail and touch only capacitors: {', '.join(touching)}"))

    for p in parts:
        if p["kind"] != "Q":
            continue
        nets = dict(leads(p))
        base = nets.get("b") or nets.get("g")
        uq = dc_union(parts, rails, skip=p["ref"])
        if base and uq.find(base) != uq.find("0"):
            out.append(("base-bias", f"{p['ref']}: base/gate net {base} has no DC path to a rail but through {p['ref']}"))
    return out + lint_opamps(parts, rails, terms) + lint_drivers(parts)


def lint_drivers(parts: list[dict]) -> list[tuple[str, str]]:
    """Two low-impedance outputs fighting on one net: usually a JUMP or merge across a stage boundary."""
    drivers: dict[str, list[str]] = defaultdict(list)
    for p in parts:
        nets = dict(leads(p))
        if p["kind"] == "IC" and not is_pump(p.get("part", "")):
            for o, _, _ in channels_of(p.get("part", "")):
                if o in nets:
                    drivers[nets[o]].append(f"{p['ref']}.{o}")
        elif p["kind"] == "Q":
            for pin in ("e", "s"):
                if pin in nets:
                    drivers[nets[pin]].append(f"{p['ref']}.{pin}")
    out = []
    for net, ds in sorted(drivers.items()):
        if len(ds) > 1 and any(d.split(".")[1].isdigit() for d in ds) and net != "0":
            out.append(("drivers", f"net {net} driven by {', '.join(ds)}"))
    return out


def lint_opamps(parts: list[dict], rails: set[str], terms: dict[str, list[str]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    adj: dict[str, list[tuple[str, str]]] = defaultdict(list)  # net -> (part ref, other net)
    for p in parts:
        if p["kind"] not in PASSIVE:
            continue
        ns = [n for _, n in leads(p)]
        for a in ns:
            adj[a].extend((p["ref"], b) for b in ns if b != a)
    for p in parts:
        if p["kind"] != "IC" or is_lm386(p.get("part", "")):
            continue
        nets = dict(leads(p))
        chans = channels_of(p.get("part", ""))
        # ground is a rail for an input only on a single supply; with a negative rail it is the signal reference
        vminus = nets.get("4" if p["part"].upper().startswith("TA7136") else V_MINUS.get(len(chans), "4"))
        hard = rails - ({"0"} if vminus != "0" else set()) - {"in", "out"}
        for i, (o, m, q) in enumerate(chans):
            if o not in nets:
                continue
            tag = f"{p['ref']}{'ABCD'[i]}" if len(chans) > 1 else p["ref"]
            on, mn, pn = nets[o], nets.get(m), nets.get(q)
            if all(t.startswith(f"{p['ref']}.") for t in terms[on]):
                continue  # unused channel: its output goes nowhere else
            for pin, n in (("-", mn), ("+", pn)):
                if n in hard:
                    out.append(("opamp-rail", f"{tag} {pin} input wired to rail {n}"))
            if mn is None or mn == on or mn in rails:
                continue
            if not reaches(adj, mn, on, rails):
                out.append(("opamp-fb", f"{tag}: output {on} does not return to - input {mn} within {FEEDBACK_DEPTH} parts"))
    return out


def reaches(adj: dict[str, list[tuple[str, str]]], start: str, goal: str, rails: set[str]) -> bool:
    frontier, seen = {start}, {start}
    for _ in range(FEEDBACK_DEPTH):
        nxt = set()
        for n in frontier:
            for _, b in adj[n]:
                if b == goal:
                    return True
                if b not in seen and b not in rails:
                    seen.add(b)
                    nxt.add(b)
        frontier = nxt
    return False


def map_index(maps_dir: Path) -> dict[str, Path]:
    found = {}
    for path in maps_dir.glob("*.txt"):
        m = re.search(r"^id (\S+)", path.read_text(encoding="utf-8"), re.M)
        if m:
            found[m.group(1)] = path
    return found


def map_parts(path: Path) -> tuple[Counter, Counter]:
    """(BOM line counts, part line counts) of a map, values normalised as kit_netlist compares them."""
    bom: Counter = Counter()
    have: Counter = Counter()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        head, *rest = line.split()
        if head == "BOM":
            for tok in rest:
                m = re.fullmatch(r"(.+?)(?:x(\d+))?", tok)
                bom[norm(m.group(1))] += int(m.group(2) or 1)
        elif head in ("R", "C", "L", "D", "Q", "POT", "IC", "T") and rest:
            have[norm(rest[0])] += 1
    return bom, have


def lint_map(c: dict, path: Path | None) -> list[tuple[str, str]]:
    if path is None:
        return [("map-json", "no map with this id")]
    bom, have = map_parts(path)
    out = []
    if bom:
        for key in sorted(set(bom) | set(have)):
            if bom[key] != have[key]:
                out.append(("bom", f"{key}: parts list {bom[key]}, map {have[key]}"))
    in_json = Counter(norm(p.get("value") or p.get("part") or "") for p in c["parts"])
    pump = any(p["kind"] == "IC" and is_pump(p.get("part", "")) for p in c["parts"])
    for key in sorted(set(have) | set(in_json)):
        gap = have[key] - in_json[key]
        if gap and not (pump and gap > 0 and re.fullmatch(r"[\d.]+[PNU]", key)):
            out.append(("map-json", f"{key}: map {have[key]}, JSON {in_json[key]}"))
    return out


def lint_stages(c: dict) -> list[tuple[str, str]]:
    stages = c.get("stages") or []
    if not stages:
        return []
    out = []
    refs = {p["ref"] for p in c["parts"]}
    pump = any(p["kind"] == "IC" and is_pump(p.get("part", "")) for p in c["parts"])
    where: dict[str, list[str]] = defaultdict(list)
    for st in stages:
        why = stage_problem(st["category"], st["label"])
        if why:
            out.append(("stage", f"{st['id']}: {why}"))
        for r in st["parts"]:
            where[r].append(st["id"])
            if r not in refs and not (pump and r.startswith("C")):  # charge-pump caps are dropped from the JSON
                out.append(("stage", f"{st['id']}: no part {r}"))
    for r in sorted(refs):
        if len(where[r]) != 1:
            out.append(("stage", f"{r} in {len(where[r])} stages {where[r]}"))
    return out


def lint(c: dict, path: Path | None) -> list[tuple[str, str]]:
    rails = set(FIXED) | {r["net"] for r in c.get("rails", [])}
    return lint_nets(c, rails) + lint_map(c, path) + lint_stages(c)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    maps_dir = DEFAULT_MAPS
    if "--maps" in args:
        i = args.index("--maps")
        maps_dir = Path(args[i + 1])
        del args[i:i + 2]
    markdown = "--markdown" in args
    files = [Path(a) for a in args if a != "--markdown"]
    if not files:
        sys.exit(__doc__)
    index = map_index(maps_dir)
    tally: Counter = Counter()
    for f in sorted(files):
        c = json.loads(f.read_text(encoding="utf-8"))
        warns = lint(c, index.get(c["id"]))
        tally.update(code for code, _ in warns)
        if not warns:
            continue
        if markdown:
            print(f"\n### {c['kitName']} (`{c['id']}`, {c['goodsNo']})\n")
            print("\n".join(f"- `{code}` {msg}" for code, msg in warns))
        else:
            print("\n".join(f"{c['id']}: {code}: {msg}" for code, msg in warns))
    print(f"\n{sum(tally.values())} warnings in {len(files)} circuits: " + ", ".join(f"{k} {n}" for k, n in tally.most_common()))
    sys.exit(1 if tally else 0)


if __name__ == "__main__":
    main()
