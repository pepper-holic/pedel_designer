"""STAGE vocabulary of the kit maps: tally what the maps use, and list lines outside the fixed vocabulary.

Usage:
    python -E -P stage_vocab.py report [maps_dir]   # category counts, custom label prefixes
    python -E -P stage_vocab.py check [maps_dir]    # one line per STAGE line outside the vocabulary (exit 1 if any)

"STAGE <id> <category> <label>": category is one of CATEGORIES. A custom stage's label starts with one of
CUSTOM_PREFIXES followed by a space and free text (or the prefix alone), so stages of different kits compare:
    bias      Vref / 4.5V divider or a collector load shared by more than one stage
    control   a pot network standing on its own between stages (GAIN, VOLUME, TIGHT, mode toggle)
    feedback  a feedback path spanning stages (Q2 emitter -> Q1 base)
    filter    a filter between stages that is not the tone control (low-pass, inter-stage, state-variable)
    mix       a blend or summing node of two paths
    octave    phase splitter / rectifier of an octave-up
    osc       an oscillator section
"""

import sys
from collections import Counter
from pathlib import Path

CATEGORIES = ("input", "buffer", "gain", "clipping", "tone", "output", "power", "custom")
CUSTOM_PREFIXES = ("bias", "control", "feedback", "filter", "mix", "octave", "osc")
DEFAULT_MAPS = Path(__file__).resolve().parents[4] / "references" / "pcb-kits" / "maps"


def stage_problem(category: str, label: str) -> str | None:
    """Why a stage's category/label is outside the vocabulary, or None."""
    if category not in CATEGORIES:
        return f"category '{category}' not in {'/'.join(CATEGORIES)}"
    if category == "custom" and label.split(" ", 1)[0] not in CUSTOM_PREFIXES:
        return f"custom label '{label}' does not start with {'/'.join(CUSTOM_PREFIXES)}"
    return None


def stage_lines(maps_dir: Path):
    """(map name, line number, id, category, label) of every STAGE line."""
    for path in sorted(maps_dir.glob("*.txt")):
        for no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.split("#", 1)[0].strip()
            if not line.startswith("STAGE "):
                continue
            _, sid, category, *label = line.split()
            yield path.name, no, sid, category, " ".join(label)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("report", "check"):
        sys.exit(__doc__)
    maps_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_MAPS
    rows = list(stage_lines(maps_dir))
    if sys.argv[1] == "report":
        print(f"{len(rows)} STAGE lines in {len({r[0] for r in rows})} maps")
        for category, n in Counter(r[3] for r in rows).most_common():
            print(f"  {category:10s} {n}")
        prefixes = Counter(r[4].split(" ", 1)[0] for r in rows if r[3] == "custom")
        print("custom label prefixes: " + ", ".join(f"{p} {n}" for p, n in prefixes.most_common()))
        return
    bad = [(name, no, why) for name, no, _, category, label in rows if (why := stage_problem(category, label))]
    for name, no, why in bad:
        print(f"{name}:{no}: {why}")
    print(f"{len(bad)} STAGE lines outside the vocabulary")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
