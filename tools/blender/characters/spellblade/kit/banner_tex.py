"""banner_tex.py out.png -- tabard (left half) + back banner (right half) atlas, 1024x1024.
Drawn at physical scale (1000 px/m) then fitted to each half; colours are the albedos that render as the concept's
cloth colours under the game's menu light (see kit.py FRONT)."""
import sys, json, math, re
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

FRONT = (0.727, 0.671, 0.474)
def s2l(c): c = c / 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def l2s(c): c = min(1.0, max(0.0, c)); return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
def alb(rgb): return tuple(int(round(255 * l2s(s2l(c) / f))) for c, f in zip(rgb, FRONT))
RED, RED_D, CREAM, CREAM_D = alb((104, 44, 48)), alb((78, 32, 36)), alb((172, 136, 114)), alb((140, 108, 92))
SPEC = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
MASTER = Path(__file__).resolve().parents[5] / "client/assets/heraldry/grimoirelee.svg"
MARK_BOX = tuple(float(v) for v in ET.parse(MASTER).getroot().attrib["viewBox"].split())


def official_mark(width, height):
    """Rasterize the approved master SVG contours (including all cutouts) without reillustrating."""
    doc = ET.parse(MASTER).getroot()
    path = doc.find(".//{http://www.w3.org/2000/svg}g/{http://www.w3.org/2000/svg}path")
    if path is None:
        raise RuntimeError("Grimoirelee master contour is missing")
    result = Image.new("1", (width, height), 0)
    for subpath in re.findall(r"M([^Z]+)Z", path.attrib["d"]):
        coords = [(int(x), int(y)) for x, y in re.findall(r"(-?\d+),(-?\d+)", subpath)]
        poly = [((x - MARK_BOX[0]) * width / MARK_BOX[2],
                 (y - MARK_BOX[1]) * height / MARK_BOX[3]) for x, y in coords]
        island = Image.new("1", (width, height), 0)
        ImageDraw.Draw(island).polygon(poly, fill=1)
        result = ImageChops.logical_xor(result, island)  # even-odd holes and scratches
    return result



def panel(W, H, hem, trident, seed):
    """W,H metres; hem: list of (half-width limit, bottom depth) steps from outside in; trident: legacy positioning/depth spec."""
    k = 1000.0
    w, h = int(W * k), int(H * k)
    im = Image.new("RGB", (w, h), RED); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed)
    # outline of the stepped hem as a polygon (in px), border band drawn by stroking inside it
    xs = lambda x: (x + W / 2) * k
    poly = [(0, 0), (w, 0)]
    for hw, depth in hem:                # right side going in
        poly += [(xs(hw), depth * k)]
        poly += [(xs(hw), depth * k)]
    right = []
    for i, (hw, depth) in enumerate(hem):
        nxt = hem[i + 1][0] if i + 1 < len(hem) else 0.0
        right += [(xs(hw), depth * k), (xs(nxt), depth * k)]
    left = [(w - x, y) for x, y in reversed(right)]
    outline = [(0, 0), (w, 0)] + right + left
    # border: cream everywhere near the outline except the top edge
    bw = 0.026 * k
    pad = int(bw) + 4
    mk = Image.new("L", (w + 2 * pad, h + 2 * pad), 0); md = ImageDraw.Draw(mk)
    md.polygon([(x + pad, y + pad) for x, y in outline], fill=255)
    ik = mk.filter(ImageFilter.MinFilter(int(bw) * 2 + 1))
    mask = mk.crop((pad, pad, pad + w, pad + h)); inner = ik.crop((pad, pad, pad + w, pad + h))
    border = Image.fromarray((np.asarray(mask) > 0) & ~(np.asarray(inner) > 0))
    arr = np.asarray(im).astype(np.float32)
    bm = np.array(border)
    bm[: int(bw) + 2, :] = False                                   # no border along the top
    bm[: int(bw) + 2, : int(bw)] = True; bm[: int(bw) + 2, w - int(bw):] = True
    arr[bm] = CREAM
    # thin dark line inside the border
    inner2 = ik.filter(ImageFilter.MinFilter(9)).crop((pad, pad, pad + w, pad + h))
    line = np.array((np.asarray(inner) > 0) & ~(np.asarray(inner2) > 0))
    line[: int(bw) + 6, int(bw) + 5: w - int(bw) - 5] = False
    arr[line] = RED_D
    # Grimoirelee comes from the same approved master as menus/world banners.
    # Keep the builder's physical panel scale and its carefully authored stepped border.
    T = trident  # historical panel-position schema; not a trident design any more
    mark_width = int(min((W - 0.08) * k, H * 0.5 * k * (MARK_BOX[2] / MARK_BOX[3])))
    mark_height = int(mark_width * MARK_BOX[3] / MARK_BOX[2])
    mark = official_mark(mark_width, mark_height)
    tr = Image.new("1", (w, h), 0)
    tr.paste(mark, (int((w - mark_width) / 2),
                    int((T["tip"] + T["foot"]) * k / 2 - mark_height / 2)))
    tm = np.asarray(tr) > 0
    arr[tm] = CREAM
    # cloth wear: vertical weave streaks, soft blotches, darker bottom
    streak = rng.normal(0, 1, w); streak = np.convolve(streak, np.ones(5) / 5, "same")
    blot = rng.normal(0, 1, (h // 40 + 2, w // 40 + 2))
    blot = np.asarray(Image.fromarray(((blot - blot.min()) / (np.ptp(blot) + 1e-6) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)) / 255.0 - 0.5
    grain = rng.normal(0, 1, (h, w))
    shade = 1 + 0.035 * streak[None, :] + 0.10 * blot + 0.025 * grain
    shade *= (1 - 0.10 * np.linspace(0, 1, h))[:, None]
    arr = np.clip(arr * shade[..., None], 0, 255)
    return Image.fromarray(arr.astype(np.uint8)), outline


front_hem = [(0.145, 0.675), (0.097, 0.720), (0.048, 0.765)]
back_hem = [(0.180, 0.98), (0.120, 1.06), (0.060, 1.17)]
fr, _ = panel(0.29, 0.765, front_hem, dict(tip=0.30, branch=0.455, prong=0.395, span=0.054, foot=0.545), 1)
bk, _ = panel(0.36, 1.17, back_hem, dict(tip=0.30, branch=0.50, prong=0.43, span=0.068, foot=0.62), 2)
atlas = Image.new("RGB", (1024, 1024))
atlas.paste(fr.resize((512, 1024), Image.LANCZOS), (0, 0))
atlas.paste(bk.resize((512, 1024), Image.LANCZOS), (512, 0))
atlas.save(sys.argv[1], quality=90)
print("BANNER", sys.argv[1], json.dumps({"front_hem": front_hem, "back_hem": back_hem}))
