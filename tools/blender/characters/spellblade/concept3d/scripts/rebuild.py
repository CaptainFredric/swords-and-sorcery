"""rebuild.py -- run on a copy of spellblade-third-person.blend.

Replaces the procedural Spellblade body with the concept-generated, concept-painted body and helmet:
  1. imports GenBody/GenHelmet (baked.blend), recentres them between the feet;
  2. moves the rig's rest joints into the new body (limb directions follow the body, roll follows the
     minimal swing so twist is preserved) and compensates every quaternion key so each action produces
     the same world-space bone orientations as before (same poses, same timing, root untouched);
  3. carries the sword and palm rune with their hand bones;
  4. skins the body (bone heat), fixes cloth/helmet weights, splits it into named regions;
  5. deletes the old procedural pieces.
"""
import sys, json, math, bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

SCR = "artifacts/concept3d/"
GEN = SCR + "gen/"
args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
BODY_TRIS, HELM_TRIS = int(args[1]), int(args[2])
SHIFT = Vector((-0.03, -0.12, 0.0))
J = {k: Vector(v) for k, v in json.load(open(GEN + "joints_fit_v2.json")).items()}
MID = 0.03

rig = bpy.data.objects["SpellbladeRig"]
assert rig.matrix_world == Matrix.Identity(4)
arm = rig.data
exp = bpy.data.collections["SpellbladeExport"]

# ---------------------------------------------------------------- 1. import the new meshes
with bpy.data.libraries.load(GEN + "baked.blend", link=False) as (src, dst):
    dst.objects = ["GenBody", "GenHelmet"]
body, helm = dst.objects
for ob in (body, helm):
    exp.objects.link(ob)
    ob.data.transform(Matrix.Translation(SHIFT))
    ob.matrix_world = Matrix.Identity(4)


def decimate(ob, target):
    if len(ob.data.polygons) <= target: return
    m = ob.modifiers.new("Dec", "DECIMATE"); m.ratio = target / len(ob.data.polygons); m.use_collapse_triangulate = True
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=m.name)


decimate(body, BODY_TRIS); decimate(helm, HELM_TRIS)

# painted materials: JPEG textures (packed), lit, with a painted-light emissive share
for ob, tag in ((body, "body"), (helm, "helmet")):
    mat = ob.data.materials[0]
    img = bpy.data.images.load(GEN + f"tex_{tag}.jpg"); img.pack(); img.name = f"Spellblade_{tag}_paint"
    nt = mat.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE"); tex.image = img
    b = nt.nodes["Principled BSDF"]
    nt.links.new(tex.outputs[0], b.inputs["Base Color"]); nt.links.new(tex.outputs[0], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.78; b.inputs["Metallic"].default_value = 0.05
    mat.name = f"Spellblade{tag.capitalize()}Paint"
    for p in ob.data.polygons: p.use_smooth = True

# ---------------------------------------------------------------- 2. new rest joints
S = SHIFT
G = np.array([tuple(v.co) for v in body.data.vertices])


def sheet_y(zlo, zhi, front):
    m = (np.abs(G[:, 0] - (MID + S.x)) < 0.10) & (G[:, 2] > zlo) & (G[:, 2] < zhi)
    return float(np.percentile(G[m, 1], 92 if front else 8))


def P(name): return J[name] + S


new_ht = {
    "pelvis": ((MID, 0.14, 1.03), (MID, 0.14, 1.20)),
    "spine": ((MID, 0.14, 1.20), (MID, 0.14, 1.38)),
    "chest": ((MID, 0.14, 1.38), (MID, 0.14, 1.64)),
    "neck": ((MID, 0.17, 1.64), (MID, 0.17, 1.76)),
    "head": ((MID, 0.17, 1.76), (MID, 0.17, 2.00)),
    "clavicle.R": ((MID + 0.07, 0.14, 1.56), None), "clavicle.L": ((MID - 0.07, 0.14, 1.56), None),
    "tabard_root": ((MID, 0.14, 1.20), (MID, 0.14, 1.09)),
}
new = {}
for k, (h, t) in new_ht.items():
    new[k] = [Vector(h) + S, (Vector(t) + S) if t else None]
new["clavicle.R"][1] = P("shoulder.R"); new["clavicle.L"][1] = P("shoulder.L")
for s in "RL":
    new[f"upper_arm.{s}"] = [P(f"shoulder.{s}"), P(f"elbow.{s}")]
    new[f"forearm.{s}"] = [P(f"elbow.{s}"), P(f"wrist.{s}")]
    new[f"hand.{s}"] = [P(f"wrist.{s}"), P(f"handtip.{s}")]
hip = {"R": Vector((MID + 0.17, 0.10, 1.03)), "L": Vector((MID - 0.17, 0.13, 1.03))}
for s in "RL":
    new[f"thigh.{s}"] = [hip[s] + S, P(f"knee.{s}")]
    new[f"shin.{s}"] = [P(f"knee.{s}"), P(f"ankle.{s}")]
    toe = P(f"ankle.{s}") + Vector((0, 0.30, -0.13))
    new[f"foot.{s}"] = [P(f"ankle.{s}"), toe]
# cloth chains follow the real front tabard and back banner sheets
fy_hi, fy_lo = sheet_y(0.85, 1.10, True), sheet_y(0.45, 0.75, True)
by_hi, by_mid, by_lo = sheet_y(1.10, 1.30, False), sheet_y(0.75, 0.95, False), sheet_y(0.42, 0.60, False)
x0 = MID + S.x
new["tabard_front_01"] = [Vector((x0, fy_hi - 0.03, 1.12)), Vector((x0, (fy_hi + fy_lo) / 2 - 0.03, 0.80))]
new["tabard_front_02"] = [new["tabard_front_01"][1].copy(), Vector((x0, fy_lo - 0.03, 0.48))]
new["tabard_back_01"] = [Vector((x0, by_hi + 0.03, 1.22)), Vector((x0, by_mid + 0.03, 0.84))]
new["tabard_back_02"] = [new["tabard_back_01"][1].copy(), Vector((x0, by_lo + 0.03, 0.44))]
print("SHEETS front", round(fy_hi, 3), round(fy_lo, 3), "back", round(by_hi, 3), round(by_mid, 3), round(by_lo, 3))

old_rest = {b.name: b.matrix_local.copy() for b in arm.bones}

bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.edit_bones
for name, (h, t) in new.items():
    e = eb[name]
    old_dir = (e.tail - e.head).normalized(); old_z = e.z_axis.copy()
    e.head = h; e.tail = t
    swing = old_dir.rotation_difference((t - h).normalized())
    e.align_roll(swing @ old_z)
# sockets keep their exact relation to their hands
bpy.ops.object.mode_set(mode="OBJECT")
new_rest = {b.name: b.matrix_local.copy() for b in arm.bones}
bpy.ops.object.mode_set(mode="EDIT")
for sock, hand in (("socket_sword", "hand.R"), ("socket_sorcery", "hand.L")):
    M = new_rest[hand] @ old_rest[hand].inverted() @ old_rest[sock]
    e = eb[sock]; length = e.length
    e.head = M.translation; e.tail = M.translation + M.to_3x3() @ Vector((0, length, 0))
    e.align_roll(M.to_3x3() @ Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode="OBJECT")
new_rest = {b.name: b.matrix_local.copy() for b in arm.bones}

# ---------------------------------------------------------------- compensate actions (world orientations preserved)
def local_rot(rest, b):
    m = rest[b.name] if b.parent is None else rest[b.parent.name].inverted() @ rest[b.name]
    return m.to_quaternion()


D = {}
for b in arm.bones:
    D[b.name] = local_rot(new_rest, b).inverted() @ local_rot(old_rest, b)
changed = {k: round(math.degrees(q.angle), 2) for k, q in D.items() if q.angle > 1e-5}
print("REST_ROT_CHANGE_DEG", changed)
for act in bpy.data.actions:
    for layer in act.layers:
        for strip in layer.strips:
            for slot in act.slots:
                bag = strip.channelbag(slot)
                if not bag: continue
                groups = {}
                for fc in bag.fcurves:
                    if fc.data_path.endswith("rotation_quaternion"):
                        groups.setdefault(fc.data_path.split('"')[1], [None] * 4)[fc.array_index] = fc
                for bone, fcs in groups.items():
                    q = D.get(bone)
                    if q is None or q.angle < 1e-6: continue
                    if any(f is None for f in fcs): raise RuntimeError(f"{act.name}:{bone} lacks a quaternion channel")
                    frames = [[round(k.co.x, 4) for k in f.keyframe_points] for f in fcs]
                    if any(fr != frames[0] for fr in frames): raise RuntimeError(f"{act.name}:{bone} channels keyed on different frames")
                    Mq = Matrix(((q.w, -q.x, -q.y, -q.z), (q.x, q.w, -q.z, q.y), (q.y, q.z, q.w, -q.x), (q.z, -q.y, q.x, q.w)))  # left-multiply
                    for i in range(len(frames[0])):
                        for attr in ("co", "handle_left", "handle_right"):
                            vec = Vector([getattr(f.keyframe_points[i], attr)[1] for f in fcs])
                            res = Mq @ vec
                            for c, f in enumerate(fcs):
                                p = getattr(f.keyframe_points[i], attr); p[1] = res[c]
                    for f in fcs: f.update()
print("ACTIONS_COMPENSATED")

# ---------------------------------------------------------------- 3. carry kept pieces with their bones
KEEP = {"HeroSword", "SwordGuard", "SwordGemSetting", "SwordGem", "SwordGrip", "SwordPommel", "PalmRune"} | {f"GripWrap.{i}" for i in range(5)}
for ob in list(exp.all_objects):
    if ob.type != "MESH" or ob in (body, helm): continue
    if ob.name not in KEEP:
        bpy.data.objects.remove(ob); continue
    names = [g.name for g in ob.vertex_groups]
    bone = max(names, key=lambda n: sum(g.weight for v in ob.data.vertices for g in v.groups if names[g.group] == n))
    M = new_rest[bone] @ old_rest[bone].inverted()
    ob.data.transform(ob.matrix_world.inverted() @ M @ ob.matrix_world)
    print("CARRIED", ob.name, "with", bone)

# ---------------------------------------------------------------- 4. skin
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
unweighted = sum(1 for v in body.data.vertices if not v.groups)
print("HEAT unweighted verts", unweighted, "of", len(body.data.vertices))
helm.parent = rig
for g in list(helm.vertex_groups): helm.vertex_groups.remove(g)
helm.vertex_groups.new(name="head").add(range(len(helm.data.vertices)), 1.0, "REPLACE")
m = helm.modifiers.new("Armature", "ARMATURE"); m.object = rig

# cloth regions: explicit chain weights; elsewhere no tabard influence
vg = {g.name: g for g in body.vertex_groups}
for n in ("tabard_front_01", "tabard_front_02", "tabard_back_01", "tabard_back_02", "pelvis", "chest", "spine"):
    if n not in vg: vg[n] = body.vertex_groups.new(name=n)
names = {g.index: g.name for g in body.vertex_groups}
fz = lambda z, a, b: max(0.0, min(1.0, (z - a) / (b - a)))
cloth_front = cloth_back = 0
for v in body.data.vertices:
    x, y, z = v.co
    front = abs(x - x0) < 0.19 and y > fy_hi - 0.10 and 0.36 < z < 1.13
    back = abs(x - x0) < 0.26 and y < by_mid + 0.06 and 0.36 < z < 1.70
    if front or back:
        for gi in [g.group for g in v.groups]: body.vertex_groups[gi].remove([v.index])
        if front:
            cloth_front += 1
            t = fz(z, 0.48, 1.12)                    # 1 at the belt, 0 at the hem
            if t > 0.55:
                vg["pelvis"].add([v.index], (t - 0.55) / 0.45, "REPLACE"); vg["tabard_front_01"].add([v.index], 1 - (t - 0.55) / 0.45, "REPLACE")
            else:
                vg["tabard_front_01"].add([v.index], t / 0.55, "REPLACE"); vg["tabard_front_02"].add([v.index], 1 - t / 0.55, "REPLACE")
        else:
            cloth_back += 1
            if z > 1.30: vg["chest"].add([v.index], 1.0, "REPLACE")
            elif z > 1.10:
                t = (z - 1.10) / 0.20; vg["chest"].add([v.index], t, "REPLACE"); vg["tabard_back_01"].add([v.index], 1 - t, "REPLACE")
            elif z > 0.84:
                vg["tabard_back_01"].add([v.index], 1.0, "REPLACE")
            else:
                t = fz(z, 0.44, 0.84); vg["tabard_back_01"].add([v.index], t, "REPLACE"); vg["tabard_back_02"].add([v.index], 1 - t, "REPLACE")
    else:
        for gi in [g.group for g in v.groups if names[g.group].startswith("tabard_")]:
            body.vertex_groups[gi].remove([v.index])
print("CLOTH front", cloth_front, "back", cloth_back)

# collarbones only drive the shoulder zone; lower geometry follows the upper arm instead
for side in "RL":
    cz = new[f"upper_arm.{side}"][0].z - 0.30
    cg, ug = body.vertex_groups.get(f"clavicle.{side}"), body.vertex_groups.get(f"upper_arm.{side}")
    moved = 0
    for v in body.data.vertices:
        if v.co.z >= cz: continue
        w = next((g.weight for g in v.groups if g.group == cg.index), 0.0)
        if w <= 0: continue
        cur = next((g.weight for g in v.groups if g.group == ug.index), 0.0)
        ug.add([v.index], cur + w, "REPLACE"); cg.remove([v.index]); moved += 1
    print("CLAVICLE_FIX", side, moved)
# drop specks (< 50 verts) left by the head cut
bm = bmesh.new(); bm.from_mesh(body.data); seen, isl_all = set(), []
for v in bm.verts:
    if v.index in seen: continue
    st, isl = [v], []; seen.add(v.index)
    while st:
        x = st.pop(); isl.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    isl_all.append(isl)
bmesh.ops.delete(bm, geom=[v for isl in isl_all if len(isl) < 50 for v in isl], context="VERTS")
bm.to_mesh(body.data); bm.free()
print("SPECKS_REMOVED", sum(1 for isl in isl_all if len(isl) < 50))
# normalise, limit to 4 influences
with bpy.context.temp_override(object=body, active_object=body):
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("SAVED", OUT)
