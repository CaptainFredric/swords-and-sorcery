"""register.py -- out.json : fit each concept view to GenBody by silhouette IoU (uniform scale + offset).
Mapping per view: u = a*h + b (h = world axis to image-right), v_top_down = c*z + d."""
import sys, json, bpy
import numpy as np
MV = "artifacts/concept3d/mv/"
out = sys.argv[sys.argv.index("--") + 1]
gen = bpy.data.objects["GenBody"]
G = np.array([tuple(gen.matrix_world @ v.co) for v in gen.data.vertices])

def shift(m, dy, dx):
    r = np.zeros_like(m); h, w = m.shape
    r[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
    return r
def erode(m, k):
    r = m.copy()
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1): r &= shift(m, dy, dx)
    return r
def dilate(m, k):
    r = m.copy()
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1): r |= shift(m, dy, dx)
    return r

def image_mask(fn):
    im = bpy.data.images.load(MV + fn.replace("clean_", "alpha_")); w, h = im.size
    px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1]
    return px[..., 3] > 0.5, w, h

VIEWS = {"front": ("clean_front.png", 0, -1), "back": ("clean_back.png", 0, +1), "side": ("clean_side.png", 1, +1)}
res = {}
for name, (fn, hax, hs) in VIEWS.items():
    M, w, h = image_mask(fn)
    # downsample for speed
    f = 2; Ms = M[::f, ::f]; hh, ww = Ms.shape
    Hw = G[:, hax] * hs; Z = G[:, 2]
    # initial guess from bounding boxes
    ys, xs = np.nonzero(Ms)
    s0 = (ys.max() - ys.min()) / (Z.max() - Z.min())
    best = (-1, None)
    for s in s0 * np.linspace(0.8, 1.2, 33):
        for du in np.linspace(-0.08, 0.08, 17) * ww:
            for dv in np.linspace(-0.06, 0.06, 13) * hh:
                u = (Hw - Hw.min()) * s + xs.min() + du
                v = (Z.max() - Z) * s + ys.min() + dv
                ui, vi = u.astype(int), v.astype(int)
                ok = (ui >= 0) & (ui < ww) & (vi >= 0) & (vi < hh)
                S_ = np.zeros_like(Ms); S_[vi[ok], ui[ok]] = True
                S_ = dilate(S_, 1)
                inter = (S_ & Ms).sum(); uni = (S_ | Ms).sum()
                iou = inter / max(1, uni)
                if iou > best[0]: best = (iou, (s, du, dv))
    s, du, dv = best[1]
    # u_px = (hs*x - min) * s + xs.min() + du  (in downsampled px) -> normalised UV (0..1, v bottom-up for Blender)
    a = hs * s / ww; b = (-Hw.min() * s + xs.min() + du) / ww
    c = -s / hh; d = (Z.max() * s + ys.min() + dv) / hh      # top-down v
    res[name] = {"file": fn, "haxis": hax, "a": a, "b": b, "c": c, "d": d, "iou": round(float(best[0]), 3)}
    print("REG", name, "iou", round(float(best[0]), 3), "scale", round(s / s0, 3))
json.dump(res, open(out, "w"), indent=1)

# debug overlays: image mask in red, mesh silhouette in green
for name, r in res.items():
    M, w, h = image_mask(r["file"])
    hax = r["haxis"]
    u = (G[:, hax] * r["a"] + r["b"]) * w; v = (G[:, 2] * r["c"] + r["d"]) * h
    ui, vi = u.astype(int), v.astype(int); ok = (ui >= 0) & (ui < w) & (vi >= 0) & (vi < h)
    Sm = np.zeros_like(M); Sm[vi[ok], ui[ok]] = True
    img = np.zeros((h, w, 4), np.float32); img[..., 3] = 1
    img[M, 0] = 0.9; img[Sm, 1] = 0.9
    o = bpy.data.images.new(name, w, h); o.pixels = img[::-1].ravel()
    o.filepath_raw = out.replace(".json", f"_{name}.png"); o.file_format = "PNG"; o.save()
