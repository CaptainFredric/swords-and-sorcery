"""split.py -- split GenBody/GenHelmet (in rebuilt.blend) into named regions; the result is a normal Spellblade source."""
import sys, bpy, bmesh
import numpy as np
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
rig = bpy.data.objects["SpellbladeRig"]
exp = bpy.data.collections["SpellbladeExport"]
body, helm = bpy.data.objects["GenBody"], bpy.data.objects["GenHelmet"]
shoulder_z = {s: (rig.matrix_world @ rig.data.bones[f"upper_arm.{s}"].head_local).z for s in "RL"}

REGION = {"pelvis": "Belt", "spine": "Breastplate", "chest": "Breastplate", "neck": "Collar", "head": "Collar",
          "tabard_root": "Belt", "tabard_front_01": "TabardFront", "tabard_front_02": "TabardFront",
          "tabard_back_01": "TabardBack", "tabard_back_02": "TabardBack"}
for s in "RL":
    REGION.update({f"clavicle.{s}": f"Pauldron.{s}", f"upper_arm.{s}": f"UpperArm.{s}", f"forearm.{s}": f"Vambrace.{s}",
                   f"hand.{s}": f"Gauntlet.{s}", f"thigh.{s}": f"Cuisse.{s}", f"shin.{s}": f"Greave.{s}", f"foot.{s}": f"Boot.{s}"})


def lock_normals(ob):
    me = ob.data
    for a in [a for a in me.color_attributes if a.name != "ArmorColor"]: me.color_attributes.remove(a)
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set_from_vertices([tuple(v.normal) for v in me.vertices])


def separate(ob, labels):
    """labels: region name per face. Splits ob into one object per region (vertex groups, modifiers, normals kept)."""
    pieces = {}
    for name in sorted(set(labels)):
        dup = ob.copy(); dup.data = ob.data.copy(); dup.name = name; dup.data.name = name
        exp.objects.link(dup)
        bm = bmesh.new(); bm.from_mesh(dup.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if labels[f.index] != name], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(dup.data); bm.free()
        pieces[name] = dup
    bpy.data.objects.remove(ob)
    return pieces


# ---- body: dominant bone per face
lock_normals(body)
names = {g.index: g.name for g in body.vertex_groups}
vbone = []
for v in body.data.vertices:
    best = max(v.groups, key=lambda g: g.weight) if v.groups else None
    vbone.append(names[best.group] if best else "chest")
labels = []
for p in body.data.polygons:
    tally = {}
    for vi in p.vertices: tally[vbone[vi]] = tally.get(vbone[vi], 0) + 1
    bone = max(tally, key=tally.get)
    region = REGION.get(bone, "Breastplate")
    c = body.matrix_world @ p.center
    for s in "RL":   # the pauldron shell reaches below the clavicle onto the upper arm
        if region == f"UpperArm.{s}" and c.z > shoulder_z[s] - 0.10: region = f"Pauldron.{s}"
    labels.append(region)
body_pieces = separate(body, labels)

# ---- helmet: visor glow faces (cyan in the painted texture), crest, jaw, shell
lock_normals(helm)
img = next(n for n in helm.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE").image
w, h = img.size
px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
uv = helm.data.uv_layers.active.data
top = max((helm.matrix_world @ v.co).z for v in helm.data.vertices)
labels = []
for p in helm.data.polygons:
    li = list(p.loop_indices)
    u = np.mean([uv[i].uv[0] for i in li]); v = np.mean([uv[i].uv[1] for i in li])
    r, g, b = px[min(h - 1, int(v * h)), min(w - 1, int(u * w))]
    c = helm.matrix_world @ p.center
    if b - r > 0.10 and g - r > 0.04 and max(r, g, b) > 0.45: labels.append("Visor")
    elif c.z > top - 0.075 and abs(c.x) < 0.06: labels.append("Crest")
    elif c.z < 1.78: labels.append("HelmetJaw")
    else: labels.append("HelmetShell")
helm_pieces = separate(helm, labels)
visor = helm_pieces["Visor"]
glow = bpy.data.materials["VisorGlow"]
visor.data.materials.clear(); visor.data.materials.append(glow)
for p in visor.data.polygons: p.material_index = 0

pieces = {**body_pieces, **helm_pieces}
counts = {k: len(v.data.polygons) for k, v in sorted(pieces.items())}
print("PIECES", counts)
for k, v in sorted(pieces.items()):
    zs = [(v.matrix_world @ q.co).z for q in v.data.vertices]
    print("ZRANGE", k, round(min(zs), 3), round(max(zs), 3))
for req in ("HelmetShell", "HelmetJaw", "Visor", "Crest", "Breastplate", "Pauldron.L", "Pauldron.R", "Gauntlet.L", "Gauntlet.R",
            "Greave.L", "Greave.R", "Boot.L", "Boot.R", "TabardFront", "TabardBack", "HeroSword"):
    ob = bpy.data.objects.get(req)
    assert ob is not None and len(ob.data.polygons) > 0, f"missing or empty required piece {req}"
tris = 0
for ob in exp.all_objects:
    if ob.type == "MESH":
        ob.data.calc_loop_triangles(); tris += len(ob.data.loop_triangles)
print("TRIANGLES", tris)
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("SAVED", out)
