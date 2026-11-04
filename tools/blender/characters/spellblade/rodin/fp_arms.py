"""The first-person arms from the Rodin third-person source (run after build_source.py).

    blender <kit first-person source.blend> --background --factory-startup --python-exit-code 1 \
      --python tools/blender/characters/spellblade/rodin/fp_arms.py -- \
      --third-person <built third-person source.blend> --kit-third-person <kit third-person source.blend> --out <blend>

First person keeps its own arm rig, camera and camera-tuned actions (kit/README.md: seen from the eye, the full body
would drift out of frame and every swing would need retuning). Only the meshes change: Rodin's gauntlets and sword
replace the kit's arms, so both views share one look.

Each vertex is carried from the third-person rest into the first-person rest through the bones that carry it, so
first person is the third-person model drawn at one scale (the kit's: it drew its first-person sword and arms at about
83 % of its third-person ones, so at arm's length from the eye they do not fill the frame):

- sword hand and sword: by the transform that carries the kit's own third-person sword onto its first-person sword
  (fitted on the kit's two meshes: the first-person grip is turned in the hand and the sword drawn at 83 %). Rodin's
  sword sits in its hand as the kit's sat in its hand, so the same transform places it as the kit placed its own;
- left hand: bone to bone, at that same scale, so both hands match;
- upper arm and forearm: bone to bone, at that scale across the bone and stretched along it to the first-person rig's
  lengths (its camera-tuned actions place the hands; the forearm comes out 7 % shorter than a true copy).

Rodin's sword is longer and broader than the kit's, so in Slash_1 and Slash_2 the blade crossed the open off hand.
There the left arm is keyed out of the blade's path by the least turn that clears it (clear_off_hand).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[5]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tools.blender.characters.spellblade.rodin.rigid import bake_pauldrons  # noqa: E402

ARM_BONES = ("upper_arm", "forearm", "hand")
FINGER_BONES = ("finger", "thumb")    # the gauntlets' finger bones (hands.py: finger_<name>_<n>, thumb_<n>), carried as their hand


def _finger(name: str) -> bool:
    return name.split(".")[0].split("_")[0] in FINGER_BONES


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build the Rodin first-person arms")
    parser.add_argument("--third-person", type=Path, required=True)
    parser.add_argument("--kit-third-person", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args(argv)


def sword_in_hand(rig, sword) -> np.ndarray:
    inverse = np.array(rig.data.bones["hand.R"].matrix_local.inverted())
    points = np.array([tuple(sword.matrix_world @ v.co) for v in sword.data.vertices])
    return points @ inverse[:3, :3].T + inverse[:3, 3]


def similarity(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, dict]:
    """The scaled rotation and offset that best carry points a onto points b (Umeyama), as a 4x4."""
    ma, mb = a.mean(0), b.mean(0)
    A, B = a - ma, b - mb
    U, D, Vt = np.linalg.svd(B.T @ A / len(a))
    S = np.eye(3)
    S[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ S @ Vt
    scale = float(np.trace(np.diag(D) @ S) / (A ** 2).sum(1).mean())
    M = np.eye(4)
    M[:3, :3] = scale * R
    M[:3, 3] = mb - scale * R @ ma
    residual = np.linalg.norm(a @ M[:3, :3].T + M[:3, 3] - b, axis=1)
    return M, {"scale": round(scale, 4), "meanResidual": round(float(residual.mean()), 4)}


def _tree(obj) -> BVHTree:
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    tree = BVHTree.FromPolygons([ev.matrix_world @ v.co for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    ev.to_mesh_clear()
    return tree


def _overlaps(rig, action, frames) -> list[float]:
    rig.animation_data.action = action
    sword, arm = bpy.data.objects["HeroSword"], bpy.data.objects["Arm.L"]
    out = []
    for frame in frames:
        bpy.context.scene.frame_set(int(frame), subframe=float(frame) % 1)
        bpy.context.view_layer.update()
        if _tree(sword).overlap(_tree(arm)):
            out.append(float(frame))
    return out


# the off hand's ways out of the blade's path, about its shoulder, in the eye's frame (+X right, +Y ahead, +Z up):
# turning about -X drops the hand, about +Z swings it out to the left
OFF_HAND_MOVES = {"down": Vector((-1, 0, 0)), "down and out": Vector((-1, 0, 1)).normalized(), "out": Vector((0, 0, 1))}
EASE = 3.0          # frames over which the move eases in before the span and out after it


def _ease(frame: float, lo: float, hi: float) -> float:
    if lo <= frame <= hi:
        return 1.0
    t = (frame - (lo - EASE)) / EASE if frame < lo else ((hi + EASE) - frame) / EASE
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def _move_off_hand(rig, action, axis: Vector, degrees: float, lo: float, hi: float) -> None:
    """Turn the left upper arm about its shoulder by `degrees` across [lo, hi], eased in and out, on every key there
    and on keys added at the span's ends and middle. Each new pose is taken from the action as authored."""
    bone = rig.pose.bones["upper_arm.L"]
    bag = action.layers[0].strips[0].channelbag(action.slots[0])
    curves = [bag.fcurves.find('pose.bones["upper_arm.L"].rotation_euler', index=i) for i in range(3)]
    start, end = action.frame_range
    frames = {round(k.co.x, 4) for k in curves[0].keyframe_points if lo - EASE < k.co.x < hi + EASE}
    frames |= {f for f in (lo - EASE, lo, (lo + hi) / 2, hi, hi + EASE) if start <= f <= end}
    rig.animation_data.action = action
    targets = {}
    for frame in sorted(frames):
        weight = _ease(frame, lo, hi)
        if weight <= 0:
            continue
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        before = bone.rotation_euler.copy()
        turn = (Matrix.Translation(bone.head) @ Matrix.Rotation(np.radians(degrees * weight), 4, axis)
                @ Matrix.Translation(-bone.head))
        parent = bone.parent.matrix @ bone.parent.bone.matrix_local.inverted() @ bone.bone.matrix_local
        basis = parent.inverted() @ turn @ bone.matrix
        targets[frame] = basis.to_euler("XYZ", before)
    for frame, euler in targets.items():
        for i, curve in enumerate(curves):
            curve.keyframe_points.insert(frame, euler[i], options={"REPLACE"})
    for curve in curves:
        curve.update()


def clear_off_hand(rig) -> dict:
    """Rodin's sword is longer and broader than the kit's, so in two swings the blade crossed the open off hand. Over
    each span where it does, the left arm drops out of the blade's path by the least turn that clears the span (checked
    at eighth frames), eased in and out, never adding a crossing elsewhere."""
    report = {}
    for action in [a for a in bpy.data.actions if a.name.startswith("Slash_")]:
        start, end = action.frame_range
        everywhere = list(np.arange(start, end + 1e-6, 0.125))
        bad = _overlaps(rig, action, everywhere)
        fixes = []
        while bad:
            # crossings closer than the eases on either side are one span: a move for the first reaches the second
            lo, hi = bad[0], bad[0]
            for f in bad[1:]:
                if f - hi > 2 * EASE:
                    break
                hi = f
            before_elsewhere = len([f for f in bad if f > hi])
            best = None
            for degrees in range(5, 61, 5):
                for label, axis in OFF_HAND_MOVES.items():
                    trial = action.copy()
                    _move_off_hand(rig, trial, axis, degrees, lo, hi)
                    left = _overlaps(rig, trial, everywhere)
                    bpy.data.actions.remove(trial)
                    if not [f for f in left if lo - EASE <= f <= hi + EASE] and len(left) <= before_elsewhere:
                        best = (label, degrees)
                        break
                if best:
                    break
            rig.animation_data.action = action
            if best is None:
                fixes.append({"span": [lo, hi], "result": "no turn of the off hand clears it"})
                break
            label, degrees = best
            _move_off_hand(rig, action, OFF_HAND_MOVES[label], degrees, lo, hi)
            fixes.append({"span": [lo, hi], "fix": f"{label} {degrees} deg"})
            bad = [f for f in _overlaps(rig, action, everywhere) if f > hi + EASE]
        if fixes:
            report[action.name] = fixes
    return report


def main() -> None:
    args = parse_args()
    fp_path = Path(bpy.data.filepath)

    # the kit's two swords, each in its own sword hand: the first-person grip, as the kit drew it
    kit_fp = sword_in_hand(bpy.data.objects["SpellbladeFirstPersonRig"], bpy.data.objects["HeroSword"])
    bpy.ops.wm.open_mainfile(filepath=str(args.kit_third_person))
    kit_tp = sword_in_hand(bpy.data.objects["SpellbladeRig"], bpy.data.objects["HeroSword"])
    if kit_tp.shape != kit_fp.shape:
        raise ValueError("the kit's two swords no longer share one mesh")
    grip, grip_report = similarity(kit_tp, kit_fp)

    # Rodin's third-person rest: its arm bones and sockets
    bpy.ops.wm.open_mainfile(filepath=str(args.third_person))
    tp_rig = bpy.data.objects["SpellbladeRig"]
    tp_rest = {b.name: np.array(b.matrix_local) for b in tp_rig.data.bones}
    tp_length = {b.name: b.length for b in tp_rig.data.bones}
    tp_fingers = [{"name": b.name, "head": np.array(b.head_local), "tail": np.array(b.tail_local),
                   "z": np.array(b.z_axis), "parent": b.parent.name, "connect": b.use_connect}
                  for b in tp_rig.data.bones if _finger(b.name)]
    tp_sockets = {"socket_sword": ("hand.R", np.array(tp_rig.data.bones["socket_sword"].head_local)),
                  "socket_sorcery": ("hand.L", np.array(tp_rig.data.bones["socket_sorcery"].head_local))}
    for name in ("Gauntlet.L", "Gauntlet.R", "HeroSword"):
        if not np.allclose(np.array(bpy.data.objects[name].matrix_world), np.eye(4)):
            raise ValueError(f"{name} is expected at the rig's origin")

    # --- the first-person source -----------------------------------------------------------------------------
    bpy.ops.wm.open_mainfile(filepath=str(fp_path))
    rig = bpy.data.objects["SpellbladeFirstPersonRig"]
    export = bpy.data.collections["SpellbladeFirstPersonExport"]
    for obj in [o for o in export.all_objects if o.type == "MESH" and o.name != "PalmRune"]:
        mesh = obj.data
        bpy.data.objects.remove(obj)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    fp_rest = {b.name: np.array(b.matrix_local) for b in rig.data.bones}
    fp_length = {b.name: b.length for b in rig.data.bones}

    scale = grip_report["scale"]

    def carry(bone: str) -> np.ndarray:
        """Third-person rest to first-person rest, for the vertices this bone carries."""
        if bone == "hand.R":
            return fp_rest[bone] @ grip @ np.linalg.inv(tp_rest[bone])
        along = scale if bone.startswith("hand") else fp_length[bone] / tp_length[bone]
        return fp_rest[bone] @ np.diag([scale, along, scale, 1.0]) @ np.linalg.inv(tp_rest[bone])

    carries = {f"{p}.{s}": carry(f"{p}.{s}") for p in ARM_BONES for s in "LR"}
    # the finger bones, carried with their hand onto the first-person rig (their weights come across unchanged)
    fingers = tp_fingers
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for finger in fingers:
        side = finger["name"].split(".")[1]
        to_fp = carries[f"hand.{side}"]
        carries[finger["name"]] = to_fp
        bone = rig.data.edit_bones.new(finger["name"])
        bone.head = Vector(tuple((to_fp @ np.append(finger["head"], 1.0))[:3]))
        bone.tail = Vector(tuple((to_fp @ np.append(finger["tail"], 1.0))[:3]))
        bone.align_roll(Vector(tuple(to_fp[:3, :3] @ finger["z"])).normalized())
        bone.parent = rig.data.edit_bones[finger["parent"]]
        bone.use_connect = finger["connect"]
        bone.use_deform = True
    # each elbow's cop (rigid.py): the forearm's rest on the upper arm, its vertices carried as the forearm's
    for side in "LR":
        forearm = rig.data.edit_bones[f"forearm.{side}"]
        cop = rig.data.edit_bones.new(f"elbow.{side}")
        cop.head, cop.tail, cop.roll = forearm.head.copy(), forearm.tail.copy(), forearm.roll
        cop.parent = rig.data.edit_bones[f"upper_arm.{side}"]
        cop.use_deform = True
        carries[f"elbow.{side}"] = carries[f"forearm.{side}"]
    bpy.ops.object.mode_set(mode="OBJECT")
    report_fingers = sorted(f["name"] for f in fingers)
    with bpy.data.libraries.load(str(args.third_person), link=False) as (source, target):
        target.meshes = ["Gauntlet.L", "Gauntlet.R", "HeroSword"]
    report = {"grip": grip_report, "fingers": report_fingers}
    for mesh, name in zip(target.meshes, ("Arm.L", "Arm.R", "HeroSword")):
        side = "R" if name != "Arm.L" else "L"
        obj = bpy.data.objects.new(name, mesh)
        mesh.name = name
        export.objects.link(obj)
        groups = [g.name for g in obj.vertex_groups]
        co = np.empty(len(mesh.vertices) * 3)
        mesh.vertices.foreach_get("co", co)
        co = np.c_[co.reshape(-1, 3), np.ones(len(mesh.vertices))]
        out = np.zeros_like(co)
        weights = []
        for i, vertex in enumerate(mesh.vertices):
            w: dict[str, float] = {}
            for g in vertex.groups:
                bone = groups[g.group]
                if bone.split(".")[0] not in ARM_BONES + ("elbow",) and not _finger(bone):   # shoulder, chest: upper arm
                    bone = f"upper_arm.{side}"
                w[bone] = w.get(bone, 0.0) + g.weight
            total = sum(w.values()) or 1.0
            w = {k: v / total for k, v in w.items()}
            weights.append(w)
            out[i] = sum(v * (carries[k] @ co[i]) for k, v in w.items())
        mesh.vertices.foreach_set("co", out[:, :3].ravel())
        mesh.update()
        for group in list(obj.vertex_groups):
            obj.vertex_groups.remove(group)
        made = {}
        for i, w in enumerate(weights):
            for bone, value in w.items():
                if bone not in made:
                    made[bone] = obj.vertex_groups.new(name=bone)
                made[bone].add([i], value, "REPLACE")
        obj.parent = rig
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = rig
        report[name] = {"triangles": len(mesh.polygons), "groups": sorted(made)}

    # the sockets onto Rodin's grip and palm, carried as their hands; the palm rune rides with its socket
    bpy.context.view_layer.objects.active = rig
    old_sorcery = rig.data.bones["socket_sorcery"].matrix_local.copy()
    bpy.ops.object.mode_set(mode="EDIT")
    for socket, (hand, head) in tp_sockets.items():
        bone = rig.data.edit_bones[socket]
        target_head = Vector(tuple((carries[hand] @ np.append(head, 1.0))[:3]))
        bone.translate(target_head - bone.head)
    bpy.ops.object.mode_set(mode="OBJECT")
    rune = bpy.data.objects["PalmRune"]
    move = rig.data.bones["socket_sorcery"].matrix_local @ old_sorcery.inverted()
    rune.data.transform(rune.matrix_world.inverted() @ move @ rune.matrix_world)
    rune.data.update()

    for material in [m for m in bpy.data.materials if m.name in ("KitMetal", "KitMatte", "KitBanner") and m.users == 0]:
        bpy.data.materials.remove(material)
    for image in [i for i in bpy.data.images if i.name in ("KitMetalWear", "KitMatteWear") and i.users == 0]:
        bpy.data.images.remove(image)
    report["offHand"] = clear_off_hand(rig)
    # (the elbows' cops keyed into every first-person action as the runtime turns them: half way with the forearm)
    report["copKeys"] = bake_pauldrons(rig)
    rig.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # (uncompressed: the repository checks that the sources start with the plain BLENDER header)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.out.resolve()), compress=False)
    print("RODIN_FIRST_PERSON", report)


if __name__ == "__main__":
    main()
