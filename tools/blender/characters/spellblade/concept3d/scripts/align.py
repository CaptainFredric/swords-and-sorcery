"""align.py -- gen.glb out.blend : bring a generated body into the Spellblade source frame for comparison.
Removes small islands, finds the facing by torso mirror symmetry, faces it +Y, scales to the current height,
drops the soles to the current ground. Appends it to the current source as GenBody (not in the export collection)."""
import sys, math, bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
src, out = a[0], a[1]
exp = bpy.data.collections["SpellbladeExport"]
cur = [o for o in exp.all_objects if o.type == "MESH"]
cp = np.array([tuple(o.matrix_world @ v.co) for o in cur for v in o.data.vertices])
ground, top = cp[:, 2].min(), cp[:, 2].max()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
for o in bpy.data.objects:
    if o not in before and o.type != "MESH": bpy.data.objects.remove(o)
ob = new[0]
if len(new) > 1:
    with bpy.context.temp_override(active_object=ob, selected_editable_objects=new): bpy.ops.object.join()
ob.name = "GenBody"; ob.data.name = "GenBody"
ob.data.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4); ob.parent = None
# keep the largest connected piece plus anything big (drop specks)
bm = bmesh.new(); bm.from_mesh(ob.data)
islands, seen = [], set()
for v in bm.verts:
    if v.index in seen: continue
    stack, isl = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop(); isl.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); stack.append(y)
    islands.append(isl)
islands.sort(key=len, reverse=True)
drop = [v for isl in islands[1:] if len(isl) < 0.01 * len(islands[0]) for v in isl]
bmesh.ops.delete(bm, geom=drop, context="VERTS"); bm.to_mesh(ob.data); bm.free()
P = np.array([tuple(v.co) for v in ob.data.vertices])
zmin, zmax = P[:, 2].min(), P[:, 2].max(); H = zmax - zmin
# torso slice: between 45% and 75% of the height, central
sl = P[(P[:, 2] > zmin + 0.45 * H) & (P[:, 2] < zmin + 0.72 * H)]
c = sl[:, :2].mean(0); sl2 = sl[:, :2] - c
sl2 = sl2[np.linalg.norm(sl2, axis=1) < 0.22 * H]
from mathutils.kdtree import KDTree
def asym(theta):
    ct, st = math.cos(theta), math.sin(theta)
    R = sl2 @ np.array([[ct, st], [-st, ct]])
    kd = KDTree(len(R))
    for i, (x, y) in enumerate(R): kd.insert((x, y, 0), i)
    kd.balance()
    idx = np.random.default_rng(0).choice(len(R), min(3000, len(R)), replace=False)
    return float(np.mean([kd.find((-R[i, 0], R[i, 1], 0))[2] for i in idx]))
cands = [math.radians(d) for d in range(-40, 41, 2)]
scores = [asym(t) for t in cands]
best = cands[int(np.argmin(scores))]
print("YAW_SYM_DEG", round(math.degrees(best), 1), "score", round(min(scores), 4), "at0", round(asym(0.0), 4))
# generated meshes face -Y; rotate by the symmetry yaw, then 180 deg so the front faces +Y like the source
R = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Rotation(-best, 4, "Z")
ob.data.transform(R)
P = np.array([tuple(v.co) for v in ob.data.vertices])
s_ = (top - ground) / (P[:, 2].max() - P[:, 2].min())
ob.data.transform(Matrix.Scale(s_, 4))
P = np.array([tuple(v.co) for v in ob.data.vertices])
# centre on the current model's torso (x, y) and put the soles on the current ground
torso = cp[(cp[:, 2] > 1.2) & (cp[:, 2] < 1.6)]
gt = P[(P[:, 2] > 1.2 * (P[:, 2].max() - P[:, 2].min()) / (top - ground) + P[:, 2].min() - 0.0) ]
body_sl = P[(P[:, 2] - P[:, 2].min() > 0.55 * (P[:, 2].max() - P[:, 2].min())) & (P[:, 2] - P[:, 2].min() < 0.75 * (P[:, 2].max() - P[:, 2].min()))]
off = Vector((np.median(torso[:, 0]) - np.median(body_sl[:, 0]), np.median(torso[:, 1]) - np.median(body_sl[:, 1]), ground - P[:, 2].min()))
ob.data.transform(Matrix.Translation(off))
print("SCALE", round(s_, 4), "OFFSET", tuple(round(c, 3) for c in off), "faces", len(ob.data.polygons))
for c_ in list(ob.users_collection): c_.objects.unlink(ob)
bpy.context.scene.collection.objects.link(ob)
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("ALIGNED", out)
