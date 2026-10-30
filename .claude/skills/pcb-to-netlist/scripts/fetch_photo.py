"""Download a kit's product photo (the finished pedal) when the board's pots carry no silk labels.

Usage:
    python -E -P fetch_photo.py <pcb-kits root> <goodsNo> [<goodsNo> ...]

Reads the saved page.html of each kit, finds the shop's "magnify" product image and saves it as
<root>/<goodsNo>/photo.jpg. The photo shows the knob names in their enclosure order, and angle-pot
boards put the pots in that same order, so BASS/MID/TREBLE or VOLUME/DRIVE can be assigned to the
pad triplets without a label on the board. On demand only - most kits label their pots.
"""

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_kit import get  # noqa: E402

PHOTO_RE = re.compile(r'https?://[^"\'\s>]+/goods/(\d+)/image/magnify/[^"\'\s>]+?\.(?:jpe?g|png)', re.I)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    root = Path(sys.argv[1])
    for goods in sys.argv[2:]:
        page = root / goods / "page.html"
        if not page.exists():
            print(f"{goods}: no page.html (run fetch_kit first)")
            continue
        urls = [m.group(0) for m in PHOTO_RE.finditer(page.read_text(encoding="utf-8", errors="ignore")) if m.group(1) == goods and "/thumb/" not in m.group(0)]
        if not urls:
            print(f"{goods}: no product photo on the page")
            continue
        out = root / goods / "photo.jpg"
        out.write_bytes(get(urls[0]))
        print(f"{goods}: {out} <- {urls[0]}")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
