"""Download a pedalparts.co.kr kit page: its title, the parts text, and every image, into one folder.

Usage:
    python -E -P fetch_kit.py <goodsNo> <out_dir>
    python -E -P fetch_kit.py --list <cateCd> [<cateCd> ...]
    python -E -P fetch_kit.py --all <root_dir> <cateCd> [<cateCd> ...] [--no-images]

(-E -P rather than -I: Pillow lives in the user site-packages, which -I would hide; -P still keeps
the data folder and cwd off the import path.)

The first form writes <out_dir>/page.html, <out_dir>/info.txt (title + visible text of the detail
section) and <out_dir>/img_NN.<ext> for every image in the detail section, then prints the image
sizes so the caller knows which ones are worth opening (board renders are usually ~700px wide).
The second form prints "goodsNo<TAB>name" for every product in the given categories.
"""

import html
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.pedalparts.co.kr"
UA = {"User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity"}
IMG_RE = re.compile(r'https?://[^"\'\s>]*?/data/editor/[^"\'\s>]+?\.(?:jpe?g|png|gif)', re.I)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def text_of(fragment: str) -> str:
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", fragment, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def list_category(cate: str) -> list[tuple[str, str]]:
    items: dict[str, str] = {}
    page = 1
    while True:
        s = get(f"{BASE}/goods/goods_list.php?cateCd={cate}&page={page}&pageNum=100").decode("utf-8", "ignore")
        found = 0
        for m in re.finditer(r'goods_view\.php\?goodsNo=(\d+)[^>]*>(.*?)</a>', s, re.S):
            name = text_of(m.group(2)).replace("\n", " ").strip()
            if name and m.group(1) not in items:
                items[m.group(1)] = name
                found += 1
        if found == 0 or page >= 5:
            return list(items.items())
        page += 1


def page_images(page: str) -> list[str]:
    """Editor images in page order. Taken from the whole page (not just the description) so the
    numbering matches folders fetched before the description block was isolated; banners shared by
    every page are filtered later as "shared"."""
    return list(dict.fromkeys(IMG_RE.findall(page)))


def split_page(s: str, goods_no: str) -> tuple[str, str]:
    """Product name (og:title) and the seller-written description block (div.txt-manual)."""
    title_m = re.search(r'og:title" content="([^"]*)"', s)
    title = html.unescape(title_m.group(1)).strip() if title_m else goods_no
    start = s.find('class="txt-manual"')
    if start < 0:
        return title, s
    end_m = re.search(r'DETAIL VIEW|class="(?:goods-view-tab|board_zone)', s[start + 20 :])
    end = start + 20 + end_m.start() if end_m else len(s)
    return title, s[start:end]


def fetch(goods_no: str, out: Path, with_images: bool = True) -> None:
    out.mkdir(parents=True, exist_ok=True)
    s = get(f"{BASE}/goods/goods_view.php?goodsNo={goods_no}").decode("utf-8", "ignore")
    (out / "page.html").write_text(s, encoding="utf-8")
    title, detail = split_page(s, goods_no)
    (out / "info.txt").write_text(f"{title}\n{BASE}/goods/goods_view.php?goodsNo={goods_no}\n\n{text_of(detail)}", encoding="utf-8")

    urls = page_images(s) if with_images else []
    rows = [f"img_{i:02d}.{u.rsplit('.', 1)[-1].lower()}\t{u}\n" for i, u in enumerate(urls)]
    (out / "images.tsv").write_text("".join(rows), encoding="utf-8")
    for i, url in enumerate(urls):
        ext = url.rsplit(".", 1)[-1].lower()
        path = out / f"img_{i:02d}.{ext}"
        try:
            path.write_bytes(get(url))
        except OSError as err:
            print(f"skip {url}: {err}")
            continue
        size = ""
        try:
            from PIL import Image

            with Image.open(path) as im:
                size = f"{im.size[0]}x{im.size[1]}"
        except Exception:  # Pillow missing or unreadable image: size is only a hint
            pass
        print(f"{path.name}\t{size}\t{url}")
    print(f"title: {title}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    with_images = "--no-images" not in args
    args = [a for a in args if a != "--no-images"]
    if len(args) >= 3 and args[0] == "--all":
        root = Path(args[1])
        for cate in args[2:]:
            for goods_no, name in list_category(cate):
                target = root / goods_no
                if (target / "info.txt").exists():
                    continue
                print(f"== {goods_no} {name}")
                try:
                    fetch(goods_no, target, with_images)
                except OSError as err:
                    print(f"failed {goods_no}: {err}")
                time.sleep(0.5)
        return
    if len(args) >= 2 and args[0] == "--list":
        for cate in args[1:]:
            for goods_no, name in list_category(cate):
                print(f"{cate}\t{goods_no}\t{name}")
        return
    if len(args) != 2:
        sys.exit(__doc__)
    fetch(args[0], Path(args[1]))


if __name__ == "__main__":
    main()
