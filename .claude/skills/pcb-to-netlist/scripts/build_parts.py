"""Turn the crawled component pages into references/parts/catalog.json.

Usage:
    python -E -P build_parts.py <parts_root> <categories.tsv> [<deviceModels.ts>]

One entry per product: what kind of part it is (from the shop category), the product name, the
selectable values (the shop sells e.g. "1/4W metal film" as one product with a value option per
resistance), unit price, and - for semiconductors - the part number and whether the app already has
a simulation model for it (when deviceModels.ts is given). Sold-out placeholders are skipped.
"""

import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_kit import split_page, text_of  # noqa: E402

KIND_BY_CATEGORY = {
    "058": "resistor",
    "040": "capacitor",
    "029": "potentiometer",
    "042": "ic",
    "041": "diode",
    "118": "transistor",
    "119": "transistor",
    "016": "semiconductor",
    "048": "led",
    "009": "switch",
    "012": "jack",
    "010": "knob",
    "001": "enclosure",
    "099": "enclosure",
    "067": "wire",
    "014": "accessory",
}
SEMI_KINDS = {"ic", "diode", "transistor", "semiconductor"}
PART_NO = re.compile(r"\b((?:[0-9]?[A-Z]{1,5}[0-9]{2,5}[A-Z0-9]{0,4})|(?:[0-9]N[0-9]{3,4}[A-Z]?))\b")
OPTION = re.compile(r'<option\s+value="\d+\|\|[^"]*\^\|\^([^"]*)"')


def model_keys(path: Path) -> set[str]:
    src = path.read_text(encoding="utf-8")
    keys: set[str] = set()
    for block in re.findall(r"export const \w+_MODELS[^=]*=\s*\{(.*?)\n\};", src, re.S):
        keys.update(re.findall(r'^\s+"?([A-Za-z0-9_-]+)"?:', block, re.M))
    return keys


def part_number(name: str) -> str:
    m = PART_NO.search(name.upper())
    return m.group(1) if m else ""


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    root, cats_file = Path(sys.argv[1]), Path(sys.argv[2])
    keys = model_keys(Path(sys.argv[3])) if len(sys.argv) > 3 else set()

    # A product can sit in several categories (an LED in both "electric parts" and "LED"); keep the
    # most specific one - "016 electric parts" is the catch-all, so it only wins when it is the only one.
    first_cat: dict[str, str] = {}
    for row in cats_file.read_text(encoding="utf-8").splitlines():
        parts = row.split("\t")
        if len(parts) >= 3 and (parts[1] not in first_cat or first_cat[parts[1]] == "016"):
            first_cat[parts[1]] = parts[0]

    catalog = []
    for goods_no, cate in first_cat.items():
        page_path = root / goods_no / "page.html"
        if not page_path.exists():
            continue
        page = page_path.read_text(encoding="utf-8", errors="ignore")
        name, detail = split_page(page, goods_no)
        if name.strip() in ("품절", ""):
            continue
        price_m = re.search(r'name="set_goods_price"\s+value="(\d+)"', page)
        options = [html.unescape(o).strip() for o in OPTION.findall(page)]
        kind = KIND_BY_CATEGORY.get(cate, "other")
        entry = {
            "goodsNo": goods_no,
            "kind": kind,
            "category": cate,
            "name": name,
            "price": int(price_m.group(1)) if price_m else None,
            "options": options,
            "note": " ".join(text_of(detail).splitlines()[1:4])[:200],
            "url": f"https://www.pedalparts.co.kr/goods/goods_view.php?goodsNo={goods_no}",
        }
        if kind in SEMI_KINDS:
            pn = part_number(name)
            entry["partNumber"] = pn
            if keys:
                entry["hasSimModel"] = bool(pn) and any(k.upper() in pn for k in keys if len(k) >= 4)
        catalog.append(entry)

    catalog.sort(key=lambda e: (e["kind"], e["name"]))
    (root / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(catalog)} products: {dict(Counter(e['kind'] for e in catalog))}")
    semis = [e for e in catalog if e["kind"] in SEMI_KINDS and e.get("partNumber")]
    missing = sorted({e["partNumber"] for e in semis if keys and not e.get("hasSimModel")})
    print(f"{len(semis)} semiconductors with a part number; without a simulation model: {len(missing)}")
    print(" ".join(missing))


if __name__ == "__main__":
    main()
