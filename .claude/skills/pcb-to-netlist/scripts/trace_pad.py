"""trace_pad.py <goods> <board_n> <out.png> <scale> <start_pad> id id ... [--pad N]

Which pads does the drawn copper reach from one pad? Crops the render around the listed pads (margin --pad px,
default 45), labels copper with layers.label_mask, floods from the start pad through top copper (painted red)
and bottom copper (blue), stepping over silk runs of up to 5px, and lists the pads reached. Run from the repo
root with python -E -P. The flood stays inside the crop, so widen --pad when a trace leaves it. Unlike
extract_nets it does not union ground-flagged pads, which is exactly what makes a false ground pad show up:
the extractor's net says "ground", the flood says the pad only reaches its neighbours."""
import json, sys
from collections import deque
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import layers
g, n, out, sc, start, *ids = sys.argv[1:]
pad = 45
if "--pad" in ids:
    k = ids.index("--pad"); pad = int(ids[k + 1]); ids = ids[:k] + ids[k + 2:]
sc = int(sc); start = int(start); ids = [int(i) for i in ids] + [start]
d = json.load(open(Path("references/pcb-kits", g, f"board{n}_nets.json")))
P = {p["id"]: p for p in d["pads"]}
xs = [P[i]["x"] for i in ids if i in P]; ys = [P[i]["y"] for i in ids if i in P]
im = Image.open(d["image"]).convert("RGB")
x0, y0 = max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad)
x1, y1 = min(im.width, int(max(xs)) + pad), min(im.height, int(max(ys)) + pad)
crop = im.crop((x0, y0, x1, y1)); rgb = np.asarray(crop)
mask, tinted = layers.label_mask(rgb)
w, h = crop.size
def flood(layer):
    ok = {layer, "both", "pad", "gpad"}
    sx, sy = int(P[start]["x"]) - x0, int(P[start]["y"]) - y0
    seen = set(); q = deque()
    # seed: pad ring pixels near the centre
    for dx in range(-14, 15):
        for dy in range(-14, 15):
            p = (sx + dx, sy + dy)
            if mask.get(p) in ("pad", "gpad"): seen.add(p); q.append(p)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or (nx, ny) in seen: continue
            k = mask.get((nx, ny))
            if k in ok:
                seen.add((nx, ny)); q.append((nx, ny))
            elif k == "silk":
                # step over a short silk run in this direction if copper of this layer resumes
                for s in range(2, 6):
                    px, py = x + dx * s, y + dy * s
                    if mask.get((px, py)) in ok:
                        for t in range(1, s + 1):
                            pt = (x + dx * t, y + dy * t)
                            if pt not in seen: seen.add(pt); q.append(pt)
                        break
                    if mask.get((px, py)) != "silk": break
    return seen
top = flood("top"); bot = flood("bot")
big = crop.resize((w * sc, h * sc), Image.LANCZOS)
ov = Image.new("RGBA", big.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
for (x, y) in top: od.rectangle((x * sc, y * sc, x * sc + sc - 1, y * sc + sc - 1), fill=(255, 0, 0, 120))
for (x, y) in bot: od.rectangle((x * sc, y * sc, x * sc + sc - 1, y * sc + sc - 1), fill=(0, 0, 255, 120))
big = Image.alpha_composite(big.convert("RGBA"), ov).convert("RGB")
dr = ImageDraw.Draw(big); f = ImageFont.truetype("arialbd.ttf", 13)
reached = []
for p in d["pads"]:
    if x0 <= p["x"] < x1 and y0 <= p["y"] < y1:
        px, py = int(p["x"]) - x0, int(p["y"]) - y0
        hit = any((px + dx, py + dy) in top or (px + dx, py + dy) in bot for dx in range(-10, 11, 2) for dy in range(-10, 11, 2))
        if hit: reached.append(p["id"])
        col = (200, 0, 0) if hit else (0, 0, 0)
        dr.text((px * sc - 10, py * sc - 8), f'{p["id"]}/{p["net"]}', fill=col, font=f, stroke_width=3, stroke_fill=(255, 255, 255))
big.save(out); print(out, big.size, "from", start, "reached", sorted(reached))
