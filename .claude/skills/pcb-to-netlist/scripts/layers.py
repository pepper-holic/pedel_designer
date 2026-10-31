"""Split a pedalparts board render into its copper layers before tracing.

The render paints the top copper (yellow), then the bottom copper (cyan, semi-transparent), then the
silkscreen (dark, semi-transparent) over a white board. One pixel can hold several of these at once:
yellow seen through cyan, yellow or cyan under a value label. Labelling each pixel with one kind cut
traces wherever they ran under another layer. Here every pixel is fitted as a mix of two base colours
(white, yellow, cyan, and yellow-under-cyan), darkened by any silk on top, and gets a yes/no for each
layer separately.

Pixels that are a layer only through a mix (under cyan or under silk) are "weak": they count only where
the layer is at least 3px thick around them, so a tinted 1-2px fringe along a neighbouring trace or a
glyph edge never joins two traces. Pads and green footprint outlines keep the plain colour rules.

Usage (prototype):  python -E -P layers.py <board.jpg> <out_prefix>
writes <out_prefix>_top.png / _bot.png: strong pixels in the layer colour, weak ones that survive in
orange, weak ones dropped in red.
"""

import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_nets import classify  # noqa: E402

DEFAULT_BASES = {"W": (250, 250, 250), "Y": (215, 215, 105), "C": (110, 215, 215), "O": (95, 208, 180)}
MIN_SAMPLES = 30
# Distance (RGB units) from the nearest two-colour mix above which a pixel is none of these mixes.
MAX_RESIDUAL = 28
# A layer's share of the pixel's light needed to call the pixel that layer.
LAYER_SHARE = 0.5
# Brighter than this fraction of the base colour: no silk on top, a "strong" pixel.
UNCOVERED = 0.8
OPEN = np.ones((3, 3), bool)
# A layer's trace is cut by up to this many px of something drawn over it - a silk outline or letter, a
# pad's dark ring, a second cyan trace where two cross over a yellow one. Such gaps are filled; white
# board (the clearance between two traces) never is.
GAP = 4
LINES = (np.ones((1, GAP + 1), bool), np.ones((GAP + 1, 1), bool))
NEAR_WHITE = 200
# Within this many px of a pad ring, silk-darkened tint is not copper (see split()).
PAD_EDGE = 2


def calibrate(rgb: np.ndarray) -> dict[str, np.ndarray]:
    """Base colours of this render: the median of pixels that are clearly each kind."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    picks = {
        "Y": (r > 170) & (g > 170) & (b < 150) & (abs(r - g) < 30),
        "C": (b > 180) & (g > 180) & (r < 140) & (abs(g - b) < 12),
        "O": (g > 180) & (r < 130) & (g - b >= 18) & (g - b <= 60) & (b >= 140),
    }
    bases = {k: np.array(v, float) for k, v in DEFAULT_BASES.items()}
    for k, sel in picks.items():
        if sel.sum() >= MIN_SAMPLES:
            bases[k] = np.median(rgb[sel], axis=0).astype(float)
    return bases


def unmix(rgb: np.ndarray, bases: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per pixel: the best non-negative mix of two bases. Returns (coefficients HxWx4 in W,Y,C,O order,
    residual HxW, brightness relative to the mix's own bases HxW)."""
    names = list(bases)
    p = rgb.reshape(-1, 3).astype(float)
    best_res = np.full(len(p), np.inf)
    best_coef = np.zeros((len(p), len(names)))
    for i, j in combinations(range(len(names)), 2):
        m = np.stack([bases[names[i]], bases[names[j]]], axis=1)
        coef = p @ np.linalg.pinv(m).T
        for a, keep in ((0, 1), (1, 0)):
            neg = coef[:, a] < 0
            v = m[:, keep]
            coef[neg, a] = 0
            coef[neg, keep] = np.clip(p[neg] @ v / (v @ v), 0, None)
        res = np.linalg.norm(p - coef @ m.T, axis=1)
        better = res < best_res
        best_res[better] = res[better]
        best_coef[better] = 0
        best_coef[better, i] = coef[better, 0]
        best_coef[better, j] = coef[better, 1]
    h, w = rgb.shape[:2]
    return best_coef.reshape(h, w, -1), best_res.reshape(h, w), best_coef.sum(axis=1).reshape(h, w)


def split(rgb: np.ndarray) -> dict[str, np.ndarray]:
    """Boolean masks: top/bot (final), top_weak_dropped/bot_weak_dropped (for the review images)."""
    bases = calibrate(rgb)
    coef, res, cover = unmix(rgb, bases)
    norms = np.array([np.linalg.norm(bases[k]) for k in ("W", "Y", "C", "O")])
    light = coef * norms
    total = light.sum(axis=2) + 1e-9
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    # Green footprint bars (between a transistor's legs) fit "yellow under cyan" but are silk.
    footprint = g - np.maximum(r, b) > 60
    fits = (res <= MAX_RESIDUAL) & ~footprint
    drawn = rgb.min(axis=2) < NEAR_WHITE
    # A trace grazing a pad's dark outline tints it; that tint next to the pad is not a joint. A trace that
    # really enters the pad shows inside the ring too, and the gap fill below joins it through the outline.
    pads = (r > 170) & (b > 170) & (g < 160) & (r - g > 50)
    pad_edge = ndimage.binary_dilation(pads, iterations=PAD_EDGE)
    out = {}
    for layer, own in (("top", (1, 3)), ("bot", (2, 3))):
        share = light[..., list(own)].sum(axis=2) / total
        member = fits & (share >= LAYER_SHARE)
        pure = light[..., own[0]] / total >= 1 - (1 - LAYER_SHARE) / 2
        strong = member & pure & (cover >= UNCOVERED)
        member &= ~(pad_edge & (cover < UNCOVERED))
        # Gaps are closed along rows and columns only, between this layer's copper or a pad ring - a trace
        # ending at a pad's dark outline joins the pad. A gap between two pads alone (a footprint bar
        # between transistor legs) is not filled, and a trace grazing a ring diagonally finds no straight gap.
        bridged = np.zeros_like(member)
        for line in LINES:
            bridged |= ndimage.binary_closing(member | pads, line) & ~ndimage.binary_closing(pads, line)
        weak = (member & ~strong) | (bridged & ~member & ~pads & drawn)
        thick = ndimage.binary_opening(strong | weak, OPEN)
        out[layer] = strong | (weak & thick)
        out[f"{layer}_dropped"] = weak & ~thick
        out[f"{layer}_weak"] = weak & thick
    out["tinted"] = (out["top_weak"] | out["bot_weak"]) & (cover < UNCOVERED)
    return out


def label_mask(rgb: np.ndarray) -> tuple[dict[tuple[int, int], str], set[tuple[int, int]]]:
    """The single-label mask extract_nets works on, with copper taken from the layer split: both
    layers -> "both". Pads, green outlines and plain silk keep their colour-rule label. Also returns the
    copper pixels known only from a silk tint, which extract_nets.bridge does not carry on into a pad."""
    layers = split(rgb)
    h, w = rgb.shape[:2]
    ys, xs = np.nonzero(layers["tinted"])
    tinted = set(zip(xs.tolist(), ys.tolist()))
    mask: dict[tuple[int, int], str] = {}
    for y in range(h):
        for x in range(w):
            old = classify(*(int(v) for v in rgb[y, x]))
            if old in ("pad", "gpad"):
                mask[(x, y)] = old
                continue
            t, b = layers["top"][y, x], layers["bot"][y, x]
            kind = "both" if t and b else "top" if t else "bot" if b else ("silk" if old else "")
            if kind:
                mask[(x, y)] = kind
    return mask, tinted


def review_images(rgb: np.ndarray, prefix: str, scale: int = 3) -> None:
    layers = split(rgb)
    for layer, colour in (("top", (200, 190, 0)), ("bot", (0, 170, 210))):
        img = np.full(rgb.shape, 255, np.uint8)
        grey = rgb.mean(axis=2) < 200
        img[grey] = (225, 225, 225)
        img[layers[layer]] = colour
        img[layers[f"{layer}_weak"]] = (255, 140, 0)
        img[layers[f"{layer}_dropped"]] = (230, 0, 0)
        im = Image.fromarray(img)
        im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(f"{prefix}_{layer}.png")


def main() -> None:
    rgb = np.asarray(Image.open(sys.argv[1]).convert("RGB"))
    review_images(rgb, sys.argv[2])
    print("wrote", Path(sys.argv[2] + "_top.png"), Path(sys.argv[2] + "_bot.png"))


if __name__ == "__main__":
    main()
