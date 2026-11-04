"""Armour that moves as armour (part of parts.py; the runtime's pauldronFollow.mjs turns the same bones in game).

Rodin's autorig spread each limb's weights in long gradients and tied the head, collar and shoulders together:

- **Pauldrons** (`add_pauldron_bones`, `pauldron_weights`, then segments.py frees them): each pauldron is one plate on a
  bone of its own, which shares its upper arm's rest and parent and turns part of the way with the arm (0.6, rising to
  0.95 for an arm raised overhead), baked into every action by `bake_pauldrons`. Rodin had the left one half on the
  arm and the right one a fifth, so the two moved differently and a raised arm slid out from under its plate.
- **Elbows and knees** (`add_cop_bones`, `share_cops`): each joint has a cop, a bone with its lower limb's rest on its
  upper limb, turned half as far as the lower limb. The part of a vertex's weight its two limb bones share equally
  goes to the cop, so a bending joint holds its depth instead of pinching in (linear skinning averages two bones'
  transforms; half the turn, taken whole, does not). Rodin's gradients stay, so no plate stretches more for it.
  Narrowing the gradients toward rigid plates was tried: the stretch it took off the plates' middles it put, harder,
  on the plates the bands crossed (Rodin's armour has little but plate), so it was dropped.
- **Body against head** (`body_off_head`): nothing but the helmet rides the head; the body's head and neck weights go
  to the chest, so a turned head no longer drags the collar and shoulders.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Quaternion
from mathutils.kdtree import KDTree

# each elbow's and knee's cop: (upper limb, lower limb, cop)
JOINTS = [joint for s in "LR" for joint in ((f"upper_arm.{s}", f"forearm.{s}", f"elbow.{s}"),
                                             (f"thigh.{s}", f"shin.{s}", f"knee.{s}"))]
COP_SHARE = 0.5           # how far a cop turns with the limb below it (client/game/SpellbladeAnimator.mjs: the same)
PAULDRON_REACH = 0.30     # metres from the shoulder joint: nothing further is pauldron
PAULDRON_INNER = -0.12    # metres back along the arm from the shoulder joint (toward the neck): the plate's inner limit
PAULDRON_EDGE = 0.12      # metres from the pauldron's edge with the body over which it eases onto the body's weights
UPPER_ARM_EDGE = 0.06     # below the rim the upper arm becomes wholly the arm's over this much
MIN_WEIGHT = 0.02
HELMET_PARTS = ("Visor", "Crest", "HelmetJaw", "HelmetShell")


def smoothstep(edge0: float, edge1: float, x):
    t = np.clip((np.asarray(x, dtype=float) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _clean(w: dict[str, float]) -> dict[str, float]:
    w = {k: v for k, v in w.items() if v >= MIN_WEIGHT}
    total = sum(w.values()) or 1.0
    return {k: v / total for k, v in w.items()}


def _descendants(rig, name: str) -> set[str]:
    bone = rig.data.bones[name]
    return {name, *(b.name for b in bone.children_recursive)}


def _joint(rig, name: str) -> tuple[np.ndarray, np.ndarray]:
    bone = rig.data.bones[name]
    head = np.array(rig.matrix_world @ bone.head_local)
    tail = np.array(rig.matrix_world @ bone.tail_local)
    return head, (tail - head) / np.linalg.norm(tail - head)


def body_off_head(weights: list[dict[str, float]], is_helmet: np.ndarray) -> int:
    """Head and neck weight off everything but the helmet, onto the chest. Returns the vertices changed."""
    changed = 0
    for vertex, w in enumerate(weights):
        if is_helmet[vertex] or not ({"head", "neck"} & w.keys()):
            continue
        moved = w.pop("head", 0.0) + w.pop("neck", 0.0)
        w["chest"] = w.get("chest", 0.0) + moved
        weights[vertex] = _clean(w)
        changed += 1
    return changed


def add_cop_bones(rig) -> list[str]:
    """Each joint's cop: its child's rest (head, tail and roll) on its parent, deforming."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    made = []
    for parent, child, cop in JOINTS:
        limb = rig.data.edit_bones[child]
        bone = rig.data.edit_bones.new(cop)
        bone.head, bone.tail, bone.roll = limb.head.copy(), limb.tail.copy(), limb.roll
        bone.parent = rig.data.edit_bones[parent]
        bone.use_connect = False
        bone.use_deform = True
        made.append(cop)
    bpy.ops.object.mode_set(mode="OBJECT")
    return made


def share_cops(weights: list[dict[str, float]]) -> dict:
    """At each elbow and knee, the part of a vertex's weight its two limb bones share equally goes to the joint's cop
    (half the joint's turn). Linear skinning averages two bones' transforms, which pulls a bending joint in on itself
    (a knee bent square loses three tenths of its depth); half the turn, taken whole, does not. The gradients Rodin
    painted stay as they are, so no plate stretches more for it."""
    report = {}
    for upper, lower, cop in JOINTS:
        moved = 0
        for vertex, w in enumerate(weights):
            shared = min(w.get(upper, 0.0), w.get(lower, 0.0))
            if shared < MIN_WEIGHT:
                continue
            w = dict(w)
            w[upper] -= shared
            w[lower] -= shared
            w[cop] = w.get(cop, 0.0) + 2 * shared
            weights[vertex] = _clean(w)
            moved += 1
        report[cop] = moved
    return report


def add_pauldron_bones(rig) -> list[str]:
    """A bone for each pauldron: its upper arm's rest (head, tail and roll) on the clavicle, deforming."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    made = []
    for side in "LR":
        arm = rig.data.edit_bones[f"upper_arm.{side}"]
        bone = rig.data.edit_bones.new(f"pauldron.{side}")
        bone.head, bone.tail, bone.roll = arm.head.copy(), arm.tail.copy(), arm.roll
        bone.parent = rig.data.edit_bones[f"clavicle.{side}"]
        bone.use_connect = False
        bone.use_deform = True
        made.append(bone.name)
    bpy.ops.object.mode_set(mode="OBJECT")
    return made


def pauldron_weights(rig, co: np.ndarray, face_verts: np.ndarray, part: np.ndarray,
                     weights: list[dict[str, float]]) -> dict:
    """Each pauldron rigid on its bone, easing onto the body across its edge; the upper arm below its rim the arm's.
    Returns the report, each plate's faces and each rim (along the arm), for the cut that frees it (segments.py)."""
    report, plates, rims = {}, {}, {}
    for side in "LR":
        arm_bones = _descendants(rig, f"upper_arm.{side}")
        head, direction = _joint(rig, f"upper_arm.{side}")
        rel = co - head
        along = rel @ direction
        reach = np.linalg.norm(rel, axis=1)
        share = np.array([sum(v for k, v in w.items() if k in arm_bones) for w in weights])
        # the rim: the first 2 cm slice down the arm whose vertices are mostly the arm's alone
        near = reach < PAULDRON_REACH
        rim = None
        for start in np.arange(0.0, 0.35, 0.02):
            inside = near & (along >= start) & (along < start + 0.02)
            if inside.sum() > 10 and np.median(share[inside]) > 0.85:
                rim = float(start)
                break
        if rim is None:
            raise ValueError(f"no rim found under pauldron.{side}")
        # the pauldron: shoulder and arm faces above the rim, within reach of the joint
        candidate = np.isin(part, (f"Pauldron.{side}", f"Gauntlet.{side}"))
        corners = face_verts[candidate]
        plate_faces = ((along[corners] < rim).all(1) & (along[corners] > PAULDRON_INNER).all(1)
                       & (reach[corners] < PAULDRON_REACH).all(1))
        # (by position: Rodin splits a vertex in two along its UV seams, and both halves must move as one)
        weld = np.unique(np.round(co / 1e-5).astype(np.int64), axis=0, return_inverse=True)[1].ravel()
        on_plate = np.zeros(weld.max() + 1, dtype=bool)
        on_plate[weld[np.unique(corners[plate_faces])]] = True
        # its edge: plate positions shared with any face that is not plate
        other = np.ones(len(face_verts), dtype=bool)
        other[np.where(candidate)[0][plate_faces]] = False
        on_other = np.zeros_like(on_plate)
        on_other[weld[np.unique(face_verts[other])]] = True
        plate, edge = on_plate[weld], (on_plate & on_other)[weld]
        tree = KDTree(int(edge.sum()))
        for i, vertex in enumerate(np.where(edge)[0]):
            tree.insert(tuple(co[vertex]), i)
        tree.balance()
        name = f"pauldron.{side}"
        for vertex in np.where(plate)[0]:
            ease = float(smoothstep(0.0, PAULDRON_EDGE, tree.find(tuple(co[vertex]))[2]))
            # below the rim's own edge the arm keeps the vertex (the plate's lower lip lies on the arm)
            w = {k: v * (1 - ease) for k, v in weights[vertex].items()}
            w[name] = w.get(name, 0.0) + ease
            weights[vertex] = _clean(w)
        # the upper arm below the rim: wholly the arm's
        arm_band = 0
        for vertex in np.where(~plate & (share > 1e-6) & (share < 1 - 1e-6) & near)[0]:
            if along[vertex] < rim:
                continue
            take = float(smoothstep(rim, rim + UPPER_ARM_EDGE, along[vertex]))
            w = weights[vertex]
            mine = share[vertex]
            weights[vertex] = _clean({k: v * ((mine + (1 - mine) * take) / mine if k in arm_bones else (1 - take))
                                      for k, v in w.items()})
            arm_band += 1
        report[side] = {"rim": round(rim, 3), "plateVertices": int(plate.sum()), "edgeVertices": int(edge.sum()),
                        "upperArmBand": arm_band}
        plates[side] = [int(i) for i in np.where(candidate)[0][plate_faces]]
        rims[side] = rim
    return report, plates, rims


# How far each pauldron turns with its arm: kept equal to client/game/pauldronFollow.mjs
PAULDRON_FOLLOW = 0.6
PAULDRON_RAISED_FOLLOW = 0.95
PAULDRON_RAISE = (55.0, 110.0)
LOOP_SEAMS = {"Idle": (1, 60), "Guard": (8, 56), "Run": (1, 21), "Sprint": (1, 17)}   # (first, last frame of the loop)


def pauldron_follow(turn_degrees: float) -> float:
    t = min(1.0, max(0.0, (turn_degrees - PAULDRON_RAISE[0]) / (PAULDRON_RAISE[1] - PAULDRON_RAISE[0])))
    return PAULDRON_FOLLOW + (PAULDRON_RAISED_FOLLOW - PAULDRON_FOLLOW) * t * t * (3 - 2 * t)


def followers() -> list[tuple[str, str, object]]:
    """(bone, the bone it follows, its share of that bone's turn as a function of the turn in degrees)."""
    out = [(f"pauldron.{s}", f"upper_arm.{s}", pauldron_follow) for s in "LR"]
    out += [(cop, lower, lambda turn: COP_SHARE) for _, lower, cop in JOINTS]
    return out


def bake_pauldrons(rig) -> int:
    """Key each pauldron and each cop in every action as the runtime turns it: part of the way from rest to the turn of
    the bone it follows, on every frame and on that bone's own key times (linear between). Returns the keys written."""
    scene = bpy.context.scene
    saved = rig.animation_data.action, scene.frame_current
    written = 0
    follow = [f for f in followers() if f[0] in rig.pose.bones]
    for action in bpy.data.actions:
        rows = []
        times = set(np.arange(action.frame_range[0], action.frame_range[1] + 1e-6, 1.0))
        for _, leader, _ in follow:
            path = f'pose.bones["{leader}"].rotation_quaternion'
            times |= {k.co[0] for fc in action.fcurves if fc.data_path == path for k in fc.keyframe_points}
        rig.animation_data.action = action
        for time in sorted(times):
            scene.frame_set(int(np.floor(time)), subframe=float(time - np.floor(time)))
            rows.append((float(time), {leader: rig.pose.bones[leader].rotation_quaternion.copy() for _, leader, _ in follow}))
        for name, leader, share in follow:
            path = f'pose.bones["{name}"]'
            for fc in [fc for fc in action.fcurves if fc.data_path.startswith(path)]:
                action.fcurves.remove(fc)
            curves = [action.fcurves.new(f"{path}.rotation_quaternion", index=i, action_group=name) for i in range(4)]
            previous = None
            for time, turns in rows:
                arm = turns[leader].normalized()
                if arm.w < 0:
                    arm = -arm
                turn = math.degrees(2 * math.acos(min(1.0, abs(arm.w))))
                q = Quaternion().slerp(arm, share(turn))
                if previous is not None and previous.dot(q) < 0:
                    q = -q
                previous = q
                for i, curve in enumerate(curves):
                    key = curve.keyframe_points.insert(time, q[i], options={"FAST"})
                    key.interpolation = "LINEAR"
                written += 1
            # a loop's seam: the step into it and the step out of it made one (their mean), so the plate loops as
            # smoothly as the bone it follows (the keys are linear, one a frame)
            if action.name in LOOP_SEAMS:
                start, end = LOOP_SEAMS[action.name]
                for curve in curves:
                    keys = {round(k.co[0], 4): k for k in curve.keyframe_points}
                    k0, k1, j1, j0 = (keys.get(float(f)) for f in (start, start + 1, end - 1, end))
                    if None in (k0, k1, j1, j0):
                        continue
                    step = ((k1.co[1] - k0.co[1]) + (j0.co[1] - j1.co[1])) / 2
                    k1.co[1] = k0.co[1] + step
                    j1.co[1] = j0.co[1] - step
            for curve in curves:
                curve.update()
    rig.animation_data.action = saved[0]
    scene.frame_set(saved[1])
    return written
