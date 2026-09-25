import sys, math, bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
helm_glb, out = a[0], a[1]
W_TARGET, CHIN_Z, CENTER_Y, CUT_Z = float(a[2]), float(a[3]), float(a[4]), float(a[5])
body = bpy.data.objects["GenBody"]
# 1. cut the generated head above the scarf, inside the head column
bm = bmesh.new(); bm.from_mesh(body.data)
kill = [v for v in bm.verts if v.co.z > CUT_Z and abs(v.co.x) < 0.24 and -0.20 < v.co.y < 0.50]
bmesh.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(body.data); bm.free()
print("HEAD_CUT", len(kill))
# 2. import the close-up helmet, trim its scarf base, turn it to face +Y, scale and seat it
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=helm_glb)
new = [o for o in bpy.data.objects if o not in before]
h = [o for o in new if o.type == "MESH"][0]
for o in new:
    if o is not h: bpy.data.objects.remove(o)
h.data.transform(h.matrix_world); h.matrix_world = Matrix.Identity(4); h.parent = None
h.name = "GenHelmet"; h.data.name = "GenHelmet"
bm = bmesh.new(); bm.from_mesh(h.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.47], context="VERTS")
bm.to_mesh(h.data); bm.free()
P = np.array([tuple(v.co) for v in h.data.vertices])
crown = P[(P[:, 2] > -0.2) & (P[:, 2] < 0.4)]
width = crown[:, 0].max() - crown[:, 0].min()
s = W_TARGET / width
h.data.transform(Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(s, 4))
P = np.array([tuple(v.co) for v in h.data.vertices])
off = Vector((-(P[:, 0].max() + P[:, 0].min()) / 2, CENTER_Y - P[:, 1].max(), CHIN_Z - P[:, 2].min()))   # CENTER_Y = where the face front goes
h.data.transform(Matrix.Translation(off))
import json; json.dump({"scale": s, "off": list(off)}, open(out + ".helmet.json", "w"))
for c in list(h.users_collection): c.objects.unlink(h)
bpy.context.scene.collection.objects.link(h)
P = np.array([tuple(v.co) for v in h.data.vertices])
print("HELMET scale", round(s, 4), "bounds", P.min(0).round(3), P.max(0).round(3), "faces", len(h.data.polygons))
# 3. remove body geometry hidden inside the helmet
from mathutils.bvhtree import BVHTree
hb = BVHTree.FromObject(h, bpy.context.evaluated_depsgraph_get())
bm = bmesh.new(); bm.from_mesh(body.data)
inside = []
for v in bm.verts:
    if v.co.z < 1.60: continue
    loc, nrm, idx, dist = hb.find_nearest(v.co, 0.3)
    if loc is not None and (v.co - loc).dot(nrm) < -0.002: inside.append(v)
bmesh.ops.delete(bm, geom=inside, context="VERTS"); bm.to_mesh(body.data); bm.free()
print("INSIDE_REMOVED", len(inside))
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
