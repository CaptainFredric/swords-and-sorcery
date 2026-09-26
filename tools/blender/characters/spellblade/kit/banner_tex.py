"""banner_tex.py out.png -- tabard (left half) + back banner (right half) atlas, 1024x1024.
Drawn at physical scale (1000 px/m) then fitted to each half; colours are the albedos that render as the concept's
cloth colours under the game's menu light (see kit.py FRONT)."""
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FRONT = (0.727, 0.671, 0.474)
def s2l(c): c = c / 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def l2s(c): c = min(1.0, max(0.0, c)); return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
def alb(rgb): return tuple(int(round(255 * l2s(s2l(c) / f))) for c, f in zip(rgb, FRONT))
RED, RED_D, CREAM, CREAM_D = alb((104, 44, 48)), alb((78, 32, 36)), alb((172, 136, 114)), alb((140, 108, 92))
SPEC = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None


def panel(W, H, hem, trident, seed):
    """W,H metres; hem: list of (half-width limit, bottom depth) steps from outside in; trident: dict of depths."""
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
    # trident
    tr = Image.new("L", (w, h), 0); td = ImageDraw.Draw(tr)
    cx = w / 2; T = trident
    sw = 0.0075 * k
    td.rectangle((cx - sw, T["tip"] * k + 0.04 * k, cx + sw, T["foot"] * k), fill=255)                         # shaft
    td.polygon([(cx, T["tip"] * k), (cx - 0.030 * k, T["tip"] * k + 0.055 * k), (cx - sw, T["tip"] * k + 0.047 * k),
                (cx + sw, T["tip"] * k + 0.047 * k), (cx + 0.030 * k, T["tip"] * k + 0.055 * k)], fill=255)      # head
    for sgn in (-1, 1):
        bx, by = cx, T["branch"] * k
        ox, oy = cx + sgn * T["span"] * k, T["prong"] * k
        td.line([(bx, by), (ox, oy + 0.02 * k)], fill=255, width=int(2 * sw))
        td.rectangle((min(ox, ox - sgn * 2 * sw), oy, max(ox, ox - sgn * 2 * sw), oy + 0.03 * k), fill=255)
        td.polygon([(ox - sgn * sw, oy - 0.028 * k), (ox + sgn * 0.8 * sw, oy + 0.004 * k), (ox - sgn * 2.8 * sw, oy + 0.004 * k)], fill=255)
    td.polygon([(cx, T["foot"] * k + 0.03 * k), (cx - 0.018 * k, T["foot"] * k - 0.004 * k), (cx + 0.018 * k, T["foot"] * k - 0.004 * k)], fill=255)
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


front_hem = [(0.125, 0.675), (0.083, 0.720), (0.042, 0.765)]
back_hem = [(0.145, 1.02), (0.097, 1.07), (0.048, 1.12)]
fr, _ = panel(0.25, 0.765, front_hem, dict(tip=0.30, branch=0.455, prong=0.395, span=0.048, foot=0.545), 1)
bk, _ = panel(0.29, 1.12, back_hem, dict(tip=0.30, branch=0.50, prong=0.43, span=0.056, foot=0.62), 2)
atlas = Image.new("RGB", (1024, 1024))
atlas.paste(fr.resize((512, 1024), Image.LANCZOS), (0, 0))
atlas.paste(bk.resize((512, 1024), Image.LANCZOS), (512, 0))
atlas.save(sys.argv[1], quality=90)
print("BANNER", sys.argv[1], json.dumps({"front_hem": front_hem, "back_hem": back_hem}))
