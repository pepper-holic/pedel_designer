"""Build the silk glyph bank (silk_glyphs.npz) from the finished maps and their renders.

Usage:
    python -E -P silk_train.py [maps_dir] [--report out.txt]

Every part of a finished map says what its label reads (R 100K -> "100K", POT B100K BASS -> "B100K" and
"BASS", Q 2N5088 c=.. -> "2N5088" plus the C/B/E letters at its pads, io IN=.. -> "IN"). The nearest
candidate word with as many glyphs as one of the ways that value is printed (map_parts.silk_variants)
is taken as that label. Which way round the word reads (0/180 degrees, 90/270 for turned text,
mirrored for green pot labels) and which spelling it is are settled by a few rounds of agreement with
the averaged glyphs; labels that never agree are dropped. The bank keeps every labelled glyph with its
board, so a board can be read with its own glyphs left out (score_automap.py). It is derived data
(references/pcb-kits/silk_glyphs.npz, not committed): rebuild it after adding maps.
"""

import json
import pickle
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from map_parts import KITS, board_of, parse_map, silk_variants  # noqa: E402
from silk_ocr import Bank, candidate_words, orientations, word_vectors  # noqa: E402

IO_WORDS = {"IN": ["IN", "INPUT"], "OUT": ["OUT", "OUTPUT"], "V9": ["9V", "DC", "+9V", "9V+", "DC9V"], "GND": ["GND"]}
ROUNDS = 5
MIN_AGREE = 0.55
NEAR_WORDS = 3


def _targets(truth: dict, pos: dict) -> list[tuple[list[str], tuple[float, float], float, bool]]:
    """(spellings, anchor point, search radius, may be green) for every label the map implies."""
    out = []
    for p in truth["parts"]:
        pts = [pos[i] for i in p["pads"] if i in pos]
        if not pts:
            continue
        cx, cy = np.mean([q[0] for q in pts]), np.mean([q[1] for q in pts])
        span = max(max(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a in pts for b in pts), 12.0)
        r = np.mean([q[2] for q in pts])
        if p["kind"] in ("R", "C", "L", "D"):
            out.append((silk_variants(p["kind"], p["value"]), (cx, cy), 0.8 * span + 3 * r, False))
        elif p["kind"] in ("Q", "IC"):
            out.append((silk_variants(p["kind"], p["value"]), (cx, cy), span + 4 * r, False))
            if p["kind"] == "Q":
                for pin, pad in p["pins"].items():
                    if pad in pos:
                        out.append(([pin.upper()], pos[pad][:2], 3.2 * r, False))
        elif p["kind"] == "POT":
            out.append((silk_variants("POT", p["value"]), (cx, cy), span + 4 * r, True))
            if p["label"]:
                out.append(([p["label"].upper()], (cx, cy), span + 4 * r, True))
    for role, pads in truth["io"].items():
        if role in IO_WORDS and pads and isinstance(pads[0], int) and pads[0] in pos:
            out.append((IO_WORDS[role], pos[pads[0]][:2], 6 * pos[pads[0]][2], False))
    return out


def collect(map_path: Path) -> list[dict]:
    """Label samples of one board: candidate word + spellings + its vectors in each orientation."""
    goods = map_path.stem.split("-")[0]
    image, nets = board_of(goods)
    ext = json.loads(nets.read_text(encoding="utf-8"))
    merged = {int(k): v for k, v in ext.get("mergedIds", {}).items()}
    pos = {p["id"]: (p["x"], p["y"], p["r"]) for p in ext["pads"]}
    truth = parse_map(map_path, merged)
    rgb = np.asarray(Image.open(image).convert("RGB"))
    cands = []
    for plane, lab, members, axis in candidate_words(rgb, ext["pads"]):
        nat = 0 if axis == "h" else 1
        vecs, _ = word_vectors(plane, lab, members, nat, False)
        cx = (min(g["x0"] for g in members) + max(g["x1"] for g in members)) / 2
        cy = (min(g["y0"] for g in members) + max(g["y1"] for g in members)) / 2
        cands.append((plane, lab, members, axis, len(vecs), cx, cy))
    samples = []
    for spell, (ax, ay), rad, green_ok in _targets(truth, pos):
        lens = {len(t) for t in spell}
        near = []
        for plane, lab, members, axis, n, cx, cy in cands:
            d = ((cx - ax) ** 2 + (cy - ay) ** 2) ** 0.5
            if n in lens and d <= rad and (green_ok or not members[0]["green"]):
                near.append((d, plane, lab, members, axis, n))
        opts = []
        for rank, (_, plane, lab, members, axis, n) in enumerate(sorted(near, key=lambda c: c[0])[:NEAR_WORDS]):
            for k, mirror in orientations(axis, len(members), members[0]["green"]):
                vecs, _ = word_vectors(plane, lab, members, k, mirror)
                if len(vecs) == n:
                    natural = rank == 0 and not mirror and k == (0 if axis == "h" else 1)
                    opts.append({"vecs": vecs, "spell": [t for t in spell if len(t) == n], "natural": natural, "orient": (k, mirror)})
        if opts:
            samples.append({"board": goods, "opts": opts})
    return samples


def protos(samples: list[dict]) -> dict[str, np.ndarray]:
    acc: dict[str, list] = {}
    for s in samples:
        if s.get("pick") is None:
            continue
        o, sp = s["pick"]
        for ch, v in zip(sp, s["opts"][o]["vecs"]):
            acc.setdefault(ch, []).append(v)
    out = {}
    for ch, vs in acc.items():
        m = np.mean(vs, axis=0)
        out[ch] = m / max(np.linalg.norm(m), 1e-9)
    return out


def agree(vecs: np.ndarray, spell: str, pro: dict[str, np.ndarray]) -> float:
    return float(np.mean([float(v @ pro[c]) if c in pro else 0.0 for c, v in zip(spell, vecs)]))


def fit(samples: list[dict]) -> None:
    """Pick each label's word, orientation and spelling by agreement with the averaged glyphs; the
    first round trusts the nearest word read the natural way when its spelling is unambiguous."""
    for s in samples:
        nat = [i for i, o in enumerate(s["opts"]) if o["natural"] and len(o["spell"]) == 1 and len(o["spell"][0]) > 1]
        s["pick"] = (nat[0], s["opts"][nat[0]]["spell"][0]) if nat else None
    for _ in range(ROUNDS):
        pro = protos(samples)
        for s in samples:
            a, i, sp = max((agree(o["vecs"], sp, pro), i, sp) for i, o in enumerate(s["opts"]) for sp in o["spell"])
            s["agree"] = a
            s["pick"] = (i, sp) if a >= MIN_AGREE else None


def build(samples: list[dict]) -> Bank:
    vecs, chars, boards = [], [], []
    for s in samples:
        if s.get("pick") is None:
            continue
        o, sp = s["pick"]
        for ch, v in zip(sp, s["opts"][o]["vecs"]):
            vecs.append(v)
            chars.append(ch)
            boards.append(s["board"])
    return Bank(np.stack(vecs), chars, boards)


def evaluate(samples: list[dict], bank: Bank) -> None:
    """Glyph and word accuracy of the kept labels, each read without its own board's templates."""
    chars = words = n_words = 0
    n_chars = 0
    confusions: Counter = Counter()
    for s in samples:
        if not s.get("pick"):
            continue
        o, sp = s["pick"]
        got, _, _ = bank.match(s["opts"][o]["vecs"], exclude=s["board"])
        hits = [a == b for a, b in zip(got, sp)]
        chars += sum(hits)
        n_chars += len(sp)
        words += all(hits)
        n_words += 1
        confusions.update(f"{b}>{a}" for a, b in zip(got, sp) if a != b)
    print(f"leave-one-board-out: glyphs {chars}/{n_chars} = {100 * chars / max(n_chars, 1):.1f}%, words {words}/{n_words} = {100 * words / max(n_words, 1):.1f}%")
    print("commonest confusions (truth>read):", ", ".join(f"{k} {v}" for k, v in confusions.most_common(15)))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]
    report = None
    if "--report" in argv:
        i = argv.index("--report")
        report = Path(argv[i + 1])
        argv = argv[:i] + argv[i + 2 :]
    args = [a for a in argv if not a.startswith("--")]
    if "--cache" in argv:
        args.remove(argv[argv.index("--cache") + 1])
    maps = Path(args[0]) if args else KITS / "maps"
    cache = Path(argv[argv.index("--cache") + 1]) if "--cache" in argv else None
    if cache and cache.exists():
        samples = pickle.loads(cache.read_bytes())
    else:
        samples = []
        for m in sorted(maps.glob("*.txt")):
            try:
                samples += collect(m)
            except (OSError, ValueError, KeyError) as e:
                print(f"{m.name}: skipped ({e})")
        if cache:
            cache.write_bytes(pickle.dumps(samples))
    fit(samples)
    bank = build(samples)
    bank.save()
    kept = sum(1 for s in samples if s.get("pick"))
    print(f"{len(samples)} label words, {kept} kept; bank {len(bank.chars)} glyph templates, alphabet {''.join(bank.alphabet)}")
    evaluate(samples, bank)
    if report:
        rows = []
        for s in samples:
            spells = "|".join(dict.fromkeys(t for o in s["opts"] for t in o["spell"]))
            pick = f"{s['pick'][1]}\t{s['opts'][s['pick'][0]]['orient']}" if s.get("pick") else "-\t"
            rows.append(f"{s['board']}\t{spells}\t{s.get('agree', 0):.2f}\t{pick}")
        report.write_text("\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
