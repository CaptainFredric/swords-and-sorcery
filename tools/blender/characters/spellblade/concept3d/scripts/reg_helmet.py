"""Register the helmet close-up image to the untrimmed helmet mesh in its own frame (front = -Y), then convert to world."""
import sys, json, math, bpy
import numpy as np
MV = "artifacts/concept3d/mv/"
a = sys.argv[sys.argv.index("--") + 1:]
glb, out, scale, offx, offz = a[0], a[1], float(a[2]), float(a[3]), float(a[4])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ob = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
P = np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices])
im = bpy.data.images.load(MV + "alpha_helmet_detail.png"); w, h = im.size
M = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1, :, 3] > 0.5
f = 4; Ms = M[::f, ::f]; hh, ww = Ms.shape
Hx = -P[:, 0]            # camera at -Y looking +Y: image right = -X
Z = P[:, 2]; ys, xs = np.nonzero(Ms)
s0 = (ys.max() - ys.min()) / (Z.max() - Z.min())
best = (-1, None)
for s in s0 * np.linspace(0.85, 1.15, 25):
    for du in np.linspace(-0.08, 0.08, 17) * ww:
        for dv in np.linspace(-0.08, 0.08, 17) * hh:
            u = ((Hx - Hx.min()) * s + xs.min() + du).astype(int); v = ((Z.max() - Z) * s + ys.min() + dv).astype(int)
            ok = (u >= 0) & (u < ww) & (v >= 0) & (v < hh)
            S_ = np.zeros_like(Ms); S_[v[ok], u[ok]] = True
            iou = (S_ & Ms).sum() / max(1, (S_ | Ms).sum())
            if iou > best[0]: best = (iou, (s, du, dv))
s, du, dv = best[1]
# image u (0..1) = (-(px) - Hx.min())*s/ww + (xs.min()+du)/ww ; world: wx = -scale*px + offx  => px = (offx - wx)/scale
# => u = ((wx - offx)/scale - Hx.min()) * s/ww + (xs.min()+du)/ww
A = s / ww / scale; B = (-offx / scale - Hx.min()) * s / ww + (xs.min() + du) / ww
# v_top = (Z.max() - pz)*s/hh + (ys.min()+dv)/hh ; pz = (wz - offz)/scale
C = -s / hh / scale; D = (Z.max() + offz / scale) * s / hh + (ys.min() + dv) / hh
json.dump({"file": "helmet_detail.png", "haxis": 0, "a": A, "b": B, "c": C, "d": D, "iou": round(float(best[0]), 3)}, open(out, "w"), indent=1)
print("HREG iou", round(float(best[0]), 3))
