import sys, json, bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
out = sys.argv[sys.argv.index("--") + 1]
gen = bpy.data.objects["GenBody"]; me = gen.data
P = np.array([tuple(v.co) for v in me.vertices])
# --- blade axis from the unmistakable blade points (beyond the right leg)
blade = P[(P[:, 0] > 0.66) & (P[:, 2] < 0.8)]
c = blade.mean(0); _, _, vt = np.linalg.svd(blade - c); ax = vt[0]
if ax[2] > 0: ax = -ax                                   # point from the hilt down to the tip
t = (P - c) @ ax; radial = np.linalg.norm((P - c) - np.outer(t, ax), axis=1)
print("BLADE axis", np.round(ax, 3), "centre", np.round(c, 3), "blade pts", len(blade))
# walk up the axis toward the hilt: the blade cross-section stays narrow until the guard
prof = []
for tt in np.arange(-0.60, 0.50, 0.02):
    m = (np.abs(t - tt) < 0.01) & (radial < 0.25)
    prof.append((round(float(tt), 2), int(m.sum()), round(float(radial[m].max()), 3) if m.any() else 0))
print("PROFILE (t, n, max radial):", prof)
json.dump({"c": c.tolist(), "ax": ax.tolist()}, open(out + ".blade.json", "w"))

kill = (t > -0.46) & (t < 0.52) & (radial < 0.135)
# the stray strand: vertices near the front-view segment with a line-like (sparse) neighbourhood
a2, b2 = np.array([0.816, 0.446]), np.array([0.141, 0.795])
d2 = b2 - a2; L = np.linalg.norm(d2); d2 /= L
xz = P[:, [0, 2]] - a2; s_ = xz @ d2
dist = np.linalg.norm(xz - np.outer(s_, d2), axis=1)
cand = np.where((dist < 0.012) & (s_ > 0) & (s_ < L) & ~kill)[0]
kd = KDTree(len(P))
for i, p in enumerate(P): kd.insert(p, i)
kd.balance()
from mathutils.bvhtree import BVHTree
bvh = BVHTree.FromPolygons([Vector(p) for p in P], [list(f.vertices) for f in me.polygons])
from mathutils.bvhtree import BVHTree
bvh = BVHTree.FromPolygons([Vector(p) for p in P], [list(f.vertices) for f in me.polygons])
thin = []
normals = np.array([tuple(v.normal) for v in me.vertices])
th = []
for i in cand:
    n = Vector(normals[i]); o = Vector(P[i]) - n * 0.0005
    h = bvh.ray_cast(o, -n, 0.2)
    th.append(h[3] if h[0] is not None else 0.2)
th = np.array(th)
print("THICK hist (mm):", np.histogram(th * 1000, bins=[0, 2, 4, 6, 8, 12, 20, 50, 200])[0].tolist())
thin = [i for i, d in zip(cand, th) if d < 0.005]
print("KILL blade", int(kill.sum()), "strand candidates", len(cand), "thin", len(thin))
kill[thin] = True
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(kill)[0]], context="VERTS")
# drop loose bits left behind
seen, islands = set(), []
bm.verts.ensure_lookup_table()
for v in bm.verts:
    if v.index in seen: continue
    st, isl = [v], []; seen.add(v.index)
    while st:
        x = st.pop(); isl.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    islands.append(isl)
islands.sort(key=len, reverse=True)
bmesh.ops.delete(bm, geom=[v for isl in islands[1:] if len(isl) < 0.02 * len(islands[0]) for v in isl], context="VERTS")
print("ISLANDS", [len(i) for i in islands[:6]])
bm.to_mesh(me); bm.free()
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("PREPPED", out, len(me.vertices))
