"""Score auto_map.py drafts against the finished maps, each board read without its own glyphs and words.

Usage:
    python -E -P score_automap.py [out_report.tsv] [--only goods,goods] [--jobs N]

Parts are paired by pad set. For each truth part: found (a draft part on the same pads), kind right,
value right (kit_netlist.norm, or the same number: 100n = 0.1uF), pins right (diode a/k, transistor
letters, pot lug order, IC pin numbers). Draft parts on pad sets no truth part has are false parts.
Lines the draft marked "# ?" are counted apart from the sure ones. Prints totals and the commonest
error kinds; the report file has one row per error with the silk reading.
"""

import json
import os
import re
import sys
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")  # one BLAS thread per worker process
sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit_netlist import norm  # noqa: E402
from map_parts import KITS, board_of, parse_map  # noqa: E402

MULT = {"P": 1e-12, "N": 1e-9, "U": 1e-6, "Μ": 1e-6, "M": 1e6, "K": 1e3, "R": 1.0, "": 1.0}


def number(v: str) -> float | None:
    s = norm(v).replace("Μ", "U")
    m = re.fullmatch(r"([ABCWG]?)(\d*\.?\d+)([PNUKMR]?)", s)
    if not m:
        return None
    return float(m.group(2)) * MULT[m.group(3)]


def same_value(a: str, b: str) -> bool:
    if norm(a) == norm(b):
        return True
    na, nb = number(a), number(b)
    return na is not None and nb is not None and abs(na - nb) <= 1e-6 * max(abs(na), abs(nb)) and a[:1].isalpha() == b[:1].isalpha()


def pins_right(t: dict, d: dict) -> bool:
    if t["kind"] in ("R", "C", "L"):
        return True
    if t["kind"] == "POT":
        return [str(x) for x in t["pins"]] == [str(x) for x in d["pins"]]
    if t["kind"] == "IC":
        return all(d["pins"].get(int(k)) == v for k, v in t["pins"].items() if k.isdigit() and isinstance(v, int))
    return all(d["pins"].get(k) == v for k, v in t["pins"].items())


def score_board(goods: str) -> dict:
    from auto_map import draft  # heavy imports in the worker
    from lexicon import Lexicon
    from silk_ocr import Bank

    image, nets = board_of(goods)
    ext = json.loads(nets.read_text(encoding="utf-8"))
    merged = {int(k): v for k, v in ext.get("mergedIds", {}).items()}
    truth_parts, truth_io = [], {}
    for m in sorted((KITS / "maps").glob(f"{goods}*.txt")):
        t = parse_map(m, merged)
        truth_parts += t["parts"]
        truth_io.update(t["io"])
    d = draft(image, nets, Bank.load(), Lexicon(), exclude=goods)
    by_pads = {frozenset(p["pads"]): p for p in d["parts"]}
    truth_sets = {frozenset(p["pads"]) for p in truth_parts}
    rows, c, cal = [], Counter(), []
    for t in truth_parts:
        if t["kind"] == "T" or len(t["pads"]) < 2:
            continue
        c["truth"] += 1
        c[f"truth_{t['kind']}"] += 1
        dp = by_pads.get(frozenset(t["pads"]))
        if dp is None:
            c["missed"] += 1
            c[f"missed_{t['kind']}"] += 1
            rows.append((goods, "missed", t["kind"], t["value"], "", "", ""))
            continue
        tag = "sure" if dp["sure"] else "check"
        c[f"found_{tag}"] += 1
        kind_ok = dp["kind"] == t["kind"]
        val_ok = kind_ok and same_value(t["value"], dp["value"])
        pin_ok = kind_ok and pins_right(t, dp)
        c[f"kind_{tag}"] += kind_ok
        c[f"value_{tag}"] += val_ok
        c[f"pins_{tag}"] += pin_ok
        c[f"value_{t['kind']}"] += val_ok
        c[f"found_{t['kind']}"] += 1
        if t["kind"] == "POT":
            c["pot_label_ok"] += dp.get("label", "") == t["label"].upper()
        if dp.get("read"):
            cal.append((t["kind"], dp["kind"], round(dp["read"]["score"], 3), round(dp["read"]["margin"], 3), dp.get("cost", -1), dp.get("body", -1), int(val_ok), int(pin_ok)))
        silk = dp["read"]["text"] if dp.get("read") else ""
        score = f"{dp['read']['score']:.2f}" if dp.get("read") else ""
        if not kind_ok:
            rows.append((goods, f"kind/{tag}", t["kind"], t["value"], f"{dp['kind']} {dp['value']}", silk, score))
        elif not val_ok:
            rows.append((goods, f"value/{tag}", t["kind"], t["value"], dp["value"], silk, score))
        elif not pin_ok:
            rows.append((goods, f"pins/{tag}", t["kind"], f"{t['value']} {t['pins']}", f"{dp['pins']}", silk, score))
    for p in d["parts"]:
        if frozenset(p["pads"]) not in truth_sets:
            tag = "sure" if p["sure"] else "check"
            c[f"false_{tag}"] += 1
            rows.append((goods, f"false/{tag}", p["kind"], p["value"], str(p["pads"]), p["read"]["text"] if p.get("read") else "", ""))
    for role in ("IN", "OUT", "V9"):
        if truth_io.get(role) and isinstance(truth_io[role][0], int):
            c["io_truth"] += 1
            got = d["io"].get(role)
            c["io_ok"] += got == truth_io[role][0]
            if got is not None and got != truth_io[role][0]:
                rows.append((goods, "io", role, str(truth_io[role][0]), str(got), "", ""))
    for p in d["parts"]:
        if frozenset(p["pads"]) not in truth_sets and p.get("read"):
            cal.append(("-", p["kind"], round(p["read"]["score"], 3), round(p["read"]["margin"], 3), p.get("cost", -1), p.get("body", -1), 0, 0))
    return {"goods": goods, "counts": c, "rows": rows, "cal": cal}


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:.1f}% ({a}/{b})" if b else "-"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]
    jobs, only = 8, None
    if "--jobs" in argv:
        i = argv.index("--jobs")
        jobs = int(argv[i + 1])
        argv = argv[:i] + argv[i + 2 :]
    if "--only" in argv:
        i = argv.index("--only")
        only = argv[i + 1].split(",")
        argv = argv[:i] + argv[i + 2 :]
    goods = sorted({m.stem.split("-")[0] for m in (KITS / "maps").glob("*.txt")})
    if only:
        goods = [g for g in goods if g in only]
    with Pool(jobs) as pool:
        results = pool.map(score_board, goods)
    tot = Counter()
    for r in results:
        tot.update(r["counts"])
    found = tot["found_sure"] + tot["found_check"]
    print(f"boards {len(results)}, truth parts {tot['truth']}, found (same pads) {pct(found, tot['truth'])}, missed {tot['missed']}")
    for tag in ("sure", "check"):
        n = tot[f"found_{tag}"]
        print(f"  {tag:5s} {n:5d}: kind {pct(tot[f'kind_{tag}'], n)}, value {pct(tot[f'value_{tag}'], n)}, pins {pct(tot[f'pins_{tag}'], n)}, false parts {tot[f'false_{tag}']}")
    all_found = tot["found_sure"] + tot["found_check"]
    print(f"  all   {all_found:5d}: value {pct(tot['value_sure'] + tot['value_check'], all_found)}")
    for k in ("R", "C", "D", "Q", "POT", "IC", "L"):
        if tot[f"truth_{k}"]:
            print(f"  {k:3s} truth {tot[f'truth_{k}']:4d} found {pct(tot[f'found_{k}'], tot[f'truth_{k}'])} value {pct(tot[f'value_{k}'], tot[f'found_{k}'])}")
    print(f"  pot labels {pct(tot['pot_label_ok'], tot['found_POT'])}; io pads {pct(tot['io_ok'], tot['io_truth'])}")
    errs = Counter(row[1] + " " + row[2] for r in results for row in r["rows"])
    print("errors:", ", ".join(f"{k} {v}" for k, v in errs.most_common(16)))
    if argv:
        lines = ["goods\terror\tkind\ttruth\tdraft\tsilk\tscore"] + ["\t".join(map(str, row)) for r in results for row in r["rows"]]
        lines += [""] + [f"{r['goods']}\t" + " ".join(f"{k}={v}" for k, v in sorted(r["counts"].items())) for r in results]
        Path(argv[0]).write_text("\n".join(lines) + "\n", encoding="utf-8")
        cal = ["truth\tdraft\tscore\tmargin\tcost\tbody\tvalue_ok\tpins_ok"] + ["\t".join(map(str, row)) for r in results for row in r["cal"]]
        Path(argv[0]).with_suffix(".cal.tsv").write_text("\n".join(cal) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
