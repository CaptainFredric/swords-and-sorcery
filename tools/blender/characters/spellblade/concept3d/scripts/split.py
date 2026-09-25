"""split.py -- split GenBody/GenHelmet (in rebuilt.blend) into named regions; the result is a normal Spellblade source."""
import sys, bpy, bmesh
sys.path.insert(0, "artifacts/concept3d/")
from smoothw import smooth_weights
import numpy as np
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
CLEAN = "--clean" in sys.argv
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

# each piece listens only to its own chain (plus the junction bones it legitimately blends with)
TORSO = {"pelvis", "spine", "chest", "neck", "head", "tabard_root"}
ALLOW = {"Belt": TORSO | {"thigh.R", "thigh.L"}, "Breastplate": TORSO | {"clavicle.R", "clavicle.L"}, "Collar": TORSO,
         "TabardFront": {"pelvis", "tabard_root", "tabard_front_01", "tabard_front_02"},
         "TabardBack": {"chest", "spine", "tabard_root", "tabard_back_01", "tabard_back_02"}}
for s_ in "RL":
    arm_ = {f"clavicle.{s_}", f"upper_arm.{s_}", f"forearm.{s_}", f"hand.{s_}"}
    leg_ = {f"thigh.{s_}", f"shin.{s_}", f"foot.{s_}"}
    ALLOW.update({f"Pauldron.{s_}": arm_ | {"chest"}, f"UpperArm.{s_}": arm_, f"Vambrace.{s_}": arm_, f"Gauntlet.{s_}": arm_,
                  f"Cuisse.{s_}": leg_ | {"pelvis"}, f"Greave.{s_}": leg_, f"Boot.{s_}": leg_})
for name, ob in (body_pieces.items() if CLEAN else []):
    allowed = ALLOW.get(name)
    if not allowed: continue
    gname = {g.index: g.name for g in ob.vertex_groups}
    stripped = 0
    orphans = []
    for v in ob.data.vertices:
        keep = [(g.group, g.weight) for g in v.groups if gname[g.group] in allowed and g.weight > 0]
        drop = [g.group for g in v.groups if gname[g.group] not in allowed]
        for gi in drop: ob.vertex_groups[gi].remove([v.index]); stripped += 1
        tot = sum(w for _, w in keep)
        if tot <= 1e-6:
            orphans.append(v.index)
        else:
            for gi, w in keep: ob.vertex_groups[gi].add([v.index], w / tot, "REPLACE")
    if orphans:   # copy weights from the nearest vertex that kept valid weights
        from mathutils.kdtree import KDTree
        valid = [v for v in ob.data.vertices if v.index not in set(orphans) and any(g.weight > 0 for g in v.groups)]
        kd = KDTree(len(valid))
        for i, v in enumerate(valid): kd.insert(v.co, i)
        kd.balance()
        for vi in orphans:
            _, i, _ = kd.find(ob.data.vertices[vi].co)
            for g in valid[i].groups: ob.vertex_groups[g.group].add([vi], g.weight, "REPLACE")
    print("CHAIN_CLEAN", name, "stripped", stripped, "orphans", len(orphans))
for name, ob in (body_pieces.items() if CLEAN else []):
    if name not in ALLOW: continue
    smooth_weights(ob, iterations=2, factor=0.5, deform_names=ALLOW[name])
print("PIECES_SMOOTHED")
# cloth pieces: weights purely from height along their chains (same scheme as the rebuild)
def _fz(z, a, b): return max(0.0, min(1.0, (z - a) / (b - a)))
def cloth_weights(z, front):
    if front:
        t = _fz(z, 0.48, 1.12)
        if t > 0.55: u = (t - 0.55) / 0.45; return {"pelvis": u, "tabard_front_01": 1 - u}
        u = t / 0.55; return {"tabard_front_01": u, "tabard_front_02": 1 - u}
    if z > 1.10: u = _fz(z, 1.10, 1.30); return {"chest": u, "tabard_back_01": 1 - u}
    if z > 0.84: return {"tabard_back_01": 1.0}
    u = _fz(z, 0.40, 0.84); return {"tabard_back_01": u, "tabard_back_02": 1 - u}
for name, front in ((("TabardFront", True), ("TabardBack", False)) if CLEAN else ()):
    ob = body_pieces.get(name)
    if ob is None: continue
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    groups = {}
    for v in ob.data.vertices:
        z = (ob.matrix_world @ v.co).z
        for bone, w in cloth_weights(z, front).items():
            if w <= 1e-4: continue
            g = groups.get(bone) or ob.vertex_groups.new(name=bone); groups[bone] = g
            g.add([v.index], w, "REPLACE")
print("CLOTH_REWEIGHTED")
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
