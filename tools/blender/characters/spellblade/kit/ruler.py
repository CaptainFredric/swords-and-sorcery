"""ruler.py view out.png [x0 y0 x1 y1 in rig metres (horizontal axis, z)] [scale]
Crops a registered concept view and draws a rig-space grid: thin lines every 2 cm, labelled lines every 10 cm.
Horizontal axis: front/back -> rig x, side -> rig y. Vertical: z."""
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, json
from PIL import Image, ImageDraw, ImageFont
view, out = sys.argv[1], sys.argv[2]
h0, z0, h1, z1 = [float(t) for t in sys.argv[3:7]]
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 4.0
r = json.load(open(C3D / "data" / "register.json"))[view]
im = Image.open(C3D / "inputs" / r["file"]).convert("RGB"); W, H = im.size
G = {"front": 0.03, "back": 0.03, "side": 0.12}[view]          # rig -> generation offset on the horizontal axis
def px(h, z):
    return ((r["a"] * (h + G) + r["b"]) * W, (r["c"] * z + r["d"]) * H)
ua, va = px(h0, z1); ub, vb = px(h1, z0)
L, R = min(ua, ub), max(ua, ub); T, B = min(va, vb), max(va, vb)
crop = im.crop((int(L), int(T), int(R) + 1, int(B) + 1)).resize((int((R - L) * scale), int((B - T) * scale)), Image.LANCZOS)
d = ImageDraw.Draw(crop)
try: font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 13)
except Exception: font = ImageFont.load_default()
def to_c(h, z):
    x, y = px(h, z); return ((x - int(L)) * scale, (y - int(T)) * scale)
import math
def frange(a, b, s):
    k = math.ceil(min(a, b) / s - 1e-9); out = []
    while k * s <= max(a, b) + 1e-9: out.append(round(k * s, 4)); k += 1
    return out
for h in frange(h0, h1, 0.02):
    major = abs(h / 0.1 - round(h / 0.1)) < 1e-6
    x, _ = to_c(h, z0)
    d.line([(x, 0), (x, crop.size[1])], fill=(0, 255, 255) if major else (0, 120, 140), width=1)
    if major: d.text((x + 2, 2), f"{h:+.1f}", fill=(0, 255, 255), font=font)
for z in frange(z0, z1, 0.02):
    major = abs(z / 0.1 - round(z / 0.1)) < 1e-6
    _, y = to_c(h0, z)
    d.line([(0, y), (crop.size[0], y)], fill=(255, 220, 0) if major else (130, 110, 0), width=1)
    if major: d.text((2, y + 1), f"{z:.1f}", fill=(255, 220, 0), font=font)
crop.save(out)
print("RULER", out, crop.size, "h to the right is", "+" if r["a"] > 0 else "-")
