"""rig2.py -- run on the procedural source (source_main.blend): move the rig's rest joints to it/joints_concept.json
(rig space) and compensate every quaternion key so each action keeps its world-space bone orientations; carry the
sword and palm rune with their hands; delete every other mesh (the kit replaces them)."""
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, json, math, bpy
from mathutils import Vector, Matrix, Quaternion

OUT = sys.argv[sys.argv.index("--") + 1]
J = {k: (Vector(h), Vector(t)) for k, (h, t) in json.load(open(WORK / "joints_concept.json")).items()}
rig = bpy.data.objects["SpellbladeRig"]
assert rig.matrix_world == Matrix.Identity(4)
arm = rig.data
exp = bpy.data.collections["SpellbladeExport"]
old_rest = {b.name: b.matrix_local.copy() for b in arm.bones}

bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.edit_bones
for name, (h, t) in J.items():
    e = eb[name]
    old_dir = (e.tail - e.head).normalized(); old_z = e.z_axis.copy()
    e.head = h; e.tail = t
    e.align_roll(old_dir.rotation_difference((t - h).normalized()) @ old_z)
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


def local_rot(rest, b):
    m = rest[b.name] if b.parent is None else rest[b.parent.name].inverted() @ rest[b.name]
    return m.to_quaternion()


D = {b.name: Quaternion() if b.name.startswith("tabard_") else local_rot(new_rest, b).inverted() @ local_rot(old_rest, b)
     for b in arm.bones}
print("REST_ROT_CHANGE_DEG", {k: round(math.degrees(q.angle), 1) for k, q in D.items() if q.angle > 1e-5})
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
                    Mq = Matrix(((q.w, -q.x, -q.y, -q.z), (q.x, q.w, -q.z, q.y), (q.y, q.z, q.w, -q.x), (q.z, -q.y, q.x, q.w)))
                    for i in range(len(frames[0])):
                        for attr in ("co", "handle_left", "handle_right"):
                            vec = Vector([getattr(f.keyframe_points[i], attr)[1] for f in fcs])
                            res = Mq @ vec
                            for c, f in enumerate(fcs):
                                p = getattr(f.keyframe_points[i], attr); p[1] = res[c]
                    for f in fcs: f.update()
print("ACTIONS_COMPENSATED")

KEEP = {"HeroSword", "SwordGuard", "SwordGemSetting", "SwordGem", "SwordGrip", "SwordPommel", "PalmRune"} | {f"GripWrap.{i}" for i in range(5)}
for ob in list(exp.all_objects):
    if ob.type != "MESH": continue
    if ob.name not in KEEP:
        bpy.data.objects.remove(ob); continue
    names = [g.name for g in ob.vertex_groups]
    bone = max(names, key=lambda n: sum(g.weight for v in ob.data.vertices for g in v.groups if names[g.group] == n))
    M = new_rest[bone] @ old_rest[bone].inverted()
    ob.data.transform(ob.matrix_world.inverted() @ M @ ob.matrix_world)
    print("CARRIED", ob.name, "with", bone)
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("RIG2 SAVED", OUT)
