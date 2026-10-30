"""Score suggest_parts.py against finished maps: how many real 2-/3-lead parts it proposed exactly.

Usage:
    python -E -P score_suggest.py <map.txt> <suggest.txt>
"""

import sys
from pathlib import Path


def parts_of_map(path: Path) -> list[frozenset[int]]:
    out = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        head, *rest = line.split()
        if head in ("R", "C", "L"):
            out.append(frozenset(int(t) for t in rest[1:3]))
        elif head in ("D", "Q", "IC"):
            out.append(frozenset(int(t.split("=")[1]) for t in rest[1:] if "=" in t and t.split("=")[1].isdigit()))
        elif head == "POT":
            out.append(frozenset(int(t) for t in rest[2:5] if t.isdigit()))
    return out


def main() -> None:
    truth = parts_of_map(Path(sys.argv[1]))
    sugg = []
    for raw in Path(sys.argv[2]).read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].split()
        if len(line) >= 3:
            sugg.append(frozenset(int(t) for t in line[2:] if t.isdigit()))
    hit = sum(1 for t in truth if t in sugg)
    wrong = sum(1 for s in sugg if s not in truth)
    print(f"parts {len(truth)}, proposed {len(sugg)}, exact {hit} ({100 * hit // max(len(truth), 1)}%), wrong {wrong}")


if __name__ == "__main__":
    main()
