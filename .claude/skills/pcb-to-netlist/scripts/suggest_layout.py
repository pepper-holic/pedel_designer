"""Draft a textbook schematic placement (AT lines) for any kit circuit JSON.

Usage:
    python -E -P suggest_layout.py <circuit.json>  > at_lines.txt

Rules, in order:
  1. Signal spine: cheapest path from "in" to "out" through series parts, strongly preferring to run
     through amplifiers (base->collector, gate->drain, op-amp input->output). Spine parts sit on one
     row (y=SPINE_Y) left to right; a transistor's base is on the row and its collector carries on.
  2. Parts tied to the 9V net stand upright above the node they feed, top lead on the rail (y=RAIL_Y).
  3. Parts tied to ground stand upright below the node they hang from (the app hangs the symbol).
  4. A part whose two nodes are both placed already (feedback, bias, bypass between stages) lies
     flat in a lane under the spine, in the first lane where its span is free.
  5. Anything else grows from a placed node: flat to the right of it if that spot is free, else
     upright below. Leftovers go in a row at the bottom.
Every spot is checked against the boxes of parts already placed and nudged right until free.
The output is a draft: load it, look at it, and move what reads badly (Baxandall stacks, twin-T
networks, switching) by hand. The coordinates use the app's part geometry (2-lead parts 60 long,
BJT pins 30 off centre, pot wiper 30 off its axis), so lines line up on the 10px grid.
"""

import heapq
import json
import sys
from pathlib import Path

RAIL_Y = 160
SPINE_Y = 400
LANE_Y0 = 520
LANE_STEP = 60
STEP = 40  # gap between consecutive spine parts
BOX = {"R": (30, 14), "C": (30, 14), "L": (30, 14), "D": (30, 14), "POT": (34, 34), "Q": (34, 34), "IC": (34, 30)}


class Board:
    def __init__(self) -> None:
        self.boxes: list[tuple[float, float, float, float]] = []

    def free(self, x: float, y: float, kind: str, vertical: bool) -> bool:
        hw, hh = BOX.get(kind, (30, 14))
        if vertical:
            hw, hh = hh, hw
        return all(x + hw + 8 <= a or x - hw - 8 >= c or y + hh + 8 <= b or y - hh - 8 >= d for a, b, c, d in self.boxes)

    def take(self, x: float, y: float, kind: str, vertical: bool) -> None:
        hw, hh = BOX.get(kind, (30, 14))
        if vertical:
            hw, hh = hh, hw
        self.boxes.append((x - hw, y - hh, x + hw, y + hh))

    def nearest(self, x: float, y: float, kind: str, vertical: bool) -> tuple[float, float]:
        """First free spot on rings of growing size around (x, y): right, below, above, left."""
        for r in range(0, 400, 30):
            for dx, dy in ((r, 0), (0, r), (0, -r), (-r, 0), (r, r), (r, -r)):
                if self.free(x + dx, y + dy, kind, vertical):
                    return x + dx, y + dy
        return x, y

    def nudge(self, x: float, y: float, kind: str, vertical: bool, dx: int = 50) -> tuple[float, float]:
        for _ in range(40):
            if self.free(x, y, kind, vertical):
                return x, y
            x += dx
        return x, y


def spine_edges(part: dict) -> list[tuple[str, str, float]]:
    n = part["nodes"]
    k = part["kind"]
    if k in ("R", "C", "L", "D"):
        a, b = (n["a"], n["k"]) if isinstance(n, dict) else n
        return [(a, b, 1.0), (b, a, 1.0)]
    if k == "POT":
        l1, w, l3 = n
        return [(l3, w, 1.0), (l1, w, 1.0)]
    if k == "Q":
        if "g" in n:
            return [(n["g"], n["d"], 0.1), (n["g"], n["s"], 0.3)]
        return [(n["b"], n["c"], 0.1), (n["b"], n["e"], 0.3)]
    if k == "IC":
        out = []
        # LM386: input 3 (or 2), output 5; its pins 1/8 are the gain set, not an op-amp output.
        pinout = (("5", "2", "3"),) if "386" in part.get("part", "") else (("1", "2", "3"), ("7", "6", "5"), ("6", "2", "3"))
        for o, minus, plus in pinout:
            if o in n and plus in n:
                out += [(n[plus], n[o], 0.1), (n[minus], n[o], 0.3)]
        return out
    return []


def find_spine(parts: list[dict]) -> list[tuple[dict, str, str]]:
    adj: dict[str, list[tuple[str, float, dict]]] = {}
    for p in parts:
        for a, b, w in spine_edges(p):
            if "0" in (a, b) or "vcc" in (a, b):
                continue
            adj.setdefault(a, []).append((b, w, p))
    dist = {"in": 0.0}
    prev: dict[str, tuple[str, dict]] = {}
    heap = [(0.0, "in")]
    while heap:
        d, u = heapq.heappop(heap)
        if u == "out":
            break
        if d > dist.get(u, 1e9):
            continue
        for v, w, p in adj.get(u, []):
            if d + w < dist.get(v, 1e9):
                dist[v] = d + w
                prev[v] = (u, p)
                heapq.heappush(heap, (d + w, v))
    path = []
    node = "out"
    while node in prev:
        u, p = prev[node]
        path.append((p, u, node))
        node = u
    return list(reversed(path))


def two(part: dict) -> tuple[str, str]:
    n = part["nodes"]
    return (n["a"], n["k"]) if isinstance(n, dict) else (n[0], n[1])


def main() -> None:
    circuit = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    parts = circuit["parts"]
    board = Board()
    pos: dict[str, tuple[float, float]] = {}
    at: dict[str, str] = {}

    def put(ref: str, x: float, y: float, kind: str, vertical: bool, opt: str = "") -> None:
        x, y = round(x / 10) * 10, round(y / 10) * 10
        board.take(x, y, kind, vertical)
        at[ref] = f"AT {ref} {int(x)} {int(y)}{(' ' + opt) if opt else ''}"

    put("V1", 60, SPINE_Y + 30, "POT", True)
    pos["in"] = (60, SPINE_Y)
    put("VCC", 60, RAIL_Y + 30, "POT", True)
    pos.setdefault("vcc", (60, RAIL_Y))

    # 1. spine
    x = 140
    for part, a, b in find_spine(parts):
        ref, kind = part["ref"], part["kind"]
        if kind in ("R", "C", "L", "D"):
            first = two(part)[0]
            put(ref, x + 30, SPINE_Y, kind, False, "h" if first == a else "h-")
            pos.setdefault(a, (x, SPINE_Y))
            pos[b] = (x + 60, SPINE_Y)
            x += 60 + STEP
        elif kind == "Q":
            n = part["nodes"]
            put(ref, x + 30, SPINE_Y, kind, False)
            pos.setdefault(a, (x, SPINE_Y))
            out = "d" if "g" in n and n.get("d") == b else "c" if n.get("c") == b else "e" if n.get("e") == b else "s"
            pos[b] = (x + 50, SPINE_Y + (-30 if out in ("c", "d") else 30))
            other = {"c": "e", "e": "c", "d": "s", "s": "d"}[out]
            pos.setdefault(n[other], (x + 50, SPINE_Y + (30 if out in ("c", "d") else -30)))
            x += 50 + STEP + 20
        elif kind == "POT":
            l1, w, l3 = part["nodes"]
            put(ref, x + 30, SPINE_Y, kind, False, "r0" if a == l1 else "r180")
            pos.setdefault(a, (x, SPINE_Y))
            pos[w] = (x + 30, SPINE_Y + (-30 if a == l1 else 30))
            far = l3 if a == l1 else l1
            pos.setdefault(far, (x + 60, SPINE_Y))
            x += 60 + STEP
        elif kind == "IC":
            put(f"{ref}A", x + 30, SPINE_Y + 20, kind, False)
            pos.setdefault(a, (x, SPINE_Y))
            pos[b] = (x + 60, SPINE_Y + 20)
            x += 60 + STEP
    placed = set(r.split()[1] for r in at.values())

    def nodes_of(part: dict) -> list[str]:
        n = part["nodes"]
        return list(n.values()) if isinstance(n, dict) else list(n)

    lanes: list[list[tuple[float, float]]] = []
    for _ in range(6):  # repeat: each pass can place parts that hang off what the last pass placed
        for part in parts:
            ref, kind = part["ref"], part["kind"]
            if ref in placed:
                continue
            ns = nodes_of(part)
            if kind in ("Q", "IC") or len(ns) > 3:
                continue
            if kind == "POT":
                l1, w, l3 = ns
                grounded = [n for n in ns if n == "0"]
                live = [n for n in (l3, l1) if n != "0"]
                if len(grounded) >= 2 and live and live[0] in pos:  # rheostat to ground
                    nx, ny = pos[live[0]]
                    px, py = board.nudge(nx, ny + 90, kind, True)
                    put(ref, px, py, kind, True, "r270" if l3 == live[0] else "r90")
                    placed.add(ref)
                    pos.setdefault(w, (px, py))
                    continue
                anchor = next((n for n in (l3, l1, w) if n in pos and n not in ("0", "vcc")), None)
                if anchor is None:
                    continue
                nx, ny = pos[anchor]
                px, py = board.nearest(nx + 60, ny, kind, False)
                put(ref, px, py, kind, False, "r0" if anchor == l1 else "r180")
                placed.add(ref)
                pos.setdefault(l1, (px - 30 if anchor == l1 else px + 30, py))
                pos.setdefault(l3, (px + 30 if anchor == l1 else px - 30, py))
                pos.setdefault(w, (px, py + (-30 if anchor == l1 else 30)))
                continue
            a, b = ns
            first = a
            if "vcc" in (a, b):
                other = b if a == "vcc" else a
                if other not in pos:
                    continue
                nx, _ = pos[other]
                px, py = board.nudge(nx, RAIL_Y + 30, kind, True, 40)
                put(ref, px, py, kind, True, "v" if first == "vcc" else "v-")
                placed.add(ref)
                continue
            if "0" in (a, b):
                other = b if a == "0" else a
                if other not in pos:
                    continue
                nx, ny = pos[other]
                px, py = board.nudge(nx, max(ny, SPINE_Y) + 70, kind, True, 60)
                put(ref, px, py, kind, True, "v" if first == other else "v-")
                placed.add(ref)
                continue
            if a in pos and b in pos:
                x1, x2 = sorted((pos[a][0], pos[b][0]))
                mid = (x1 + x2) / 2
                for i, lane in enumerate(lanes + [[]]):
                    if all(mid + 40 <= s or mid - 40 >= e for s, e in lane):
                        if i == len(lanes):
                            lanes.append([])
                        lanes[i].append((mid - 40, mid + 40))
                        y = LANE_Y0 + i * LANE_STEP
                        break
                left_node = a if pos[a][0] <= pos[b][0] else b
                put(ref, mid, y, kind, False, "h" if first == left_node else "h-")
                placed.add(ref)
                continue
            anchor = a if a in pos else b if b in pos else None
            if anchor is None:
                continue
            free_node = b if anchor == a else a
            nx, ny = pos[anchor]
            if board.free(nx + 60, ny, kind, False):
                put(ref, nx + 60, ny, kind, False, "h" if first == anchor else "h-")
                pos[free_node] = (nx + 90, ny)
            else:
                px, py = board.nearest(nx, ny + 70, kind, True)
                put(ref, px, py, kind, True, "v" if first == anchor else "v-")
                pos[free_node] = (px, py + 30)
            placed.add(ref)

    # transistors / ICs / transformers not on the spine: base or input next to whatever it hangs on
    for part in parts:
        if part["ref"] in placed or part["kind"] not in ("Q", "IC", "T"):
            continue
        n = part["nodes"]
        anchor = next((v for v in n.values() if v in pos and v not in ("0", "vcc")), None)
        ax, ay = pos.get(anchor, (x, SPINE_Y + 200))
        px, py = board.nudge(ax + 60, ay, part["kind"], False)
        put(f"{part['ref']}A" if part["kind"] == "IC" else part["ref"], px, py, part["kind"], False)
        placed.add(part["ref"])

    leftover_x = 140
    for part in parts:
        if part["ref"] in placed:
            continue
        put(part["ref"], leftover_x, LANE_Y0 + 6 * LANE_STEP, part["kind"], False, "h")
        leftover_x += 100
        print(f"# {part['ref']}: no placed neighbour - parked at the bottom", file=sys.stderr)

    ox, _ = pos.get("out", (x, SPINE_Y))
    rx, ry = board.nudge(ox, SPINE_Y + 80, "R", True)
    put("RLOAD", rx, ry, "R", True, "v")
    for line in at.values():
        print(line)


if __name__ == "__main__":
    main()
