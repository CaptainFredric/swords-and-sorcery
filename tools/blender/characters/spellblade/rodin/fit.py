"""Fit Rodin's Spellblade onto the production rig (stage 1 of build_source.py).

The open file is the kit source: it supplies SpellbladeRig, the fifteen actions, the references and the cameras.

- Rodin's mesh (the unrigged file) is turned to face +Y, centred, and scaled so its hips sit at the pelvis height.
- Every mapped bone keeps its production rest orientation and moves its rest head to Rodin's joint. Pose P turns each
  bone onto Rodin's limb. The actions store rotations about those same orientations, so they play the new body as they
  played the kit, at Rodin's proportions.
- The autorigged file's weights carry over by vertex index (both files hold the same mesh) onto production bones.
- The sword is rigid on hand.R. hand.R's pose P lays the kit sword's axis and width, measured in the hand, onto Rodin's
  blade, so every action points Rodin's sword where it pointed the kit's.
- The mesh is unposed from P into the rest by inverting linear blend skinning.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

# Rodin's blade direction in its own file (glTF Y up, imported Z up), a first estimate refined from the blade itself.
RODIN_BLADE_ESTIMATE = (-0.616, -0.633, -0.470)


def _side(name: str, sfx: str) -> str:
    return name.replace("X", "Left" if sfx == "L" else "Right")


# production bone: (Rodin head joint, Rodin joint the bone points to; None keeps its direction; TAIL: a joint's tail)
BONE_MAP = {"pelvis": ("Hips", "Spine"), "spine": ("Spine", "Spine2"), "chest": ("Spine2", "Neck"),
            "neck": ("Neck", "Head"), "head": ("Head", None)}
# Rodin vertex group: production bone shares
WEIGHT_MAP = {"Hips": {"pelvis": 1}, "Spine": {"spine": 1}, "Spine1": {"spine": .5, "chest": .5}, "Spine2": {"chest": 1},
              "Neck": {"neck": 1}, "Head": {"head": 1}}
for _sfx in "LR":
    BONE_MAP.update({
        f"clavicle.{_sfx}": (_side("XShoulder", _sfx), _side("XArm", _sfx)),
        f"upper_arm.{_sfx}": (_side("XArm", _sfx), _side("XForeArm", _sfx)),
        f"forearm.{_sfx}": (_side("XForeArm", _sfx), _side("XHand", _sfx)),
        f"hand.{_sfx}": (_side("XHand", _sfx), _side("XHandMiddle1", _sfx)),
        f"thigh.{_sfx}": (_side("XUpLeg", _sfx), _side("XLeg", _sfx)),
        f"shin.{_sfx}": (_side("XLeg", _sfx), _side("XFoot", _sfx)),
        f"foot.{_sfx}": (_side("XFoot", _sfx), "TAIL:" + _side("XToeBase", _sfx)),
    })
    S = "Left" if _sfx == "L" else "Right"
    WEIGHT_MAP.update({f"{S}Shoulder": {f"clavicle.{_sfx}": 1}, f"{S}Arm": {f"upper_arm.{_sfx}": 1},
                       f"{S}ForeArm": {f"forearm.{_sfx}": 1}, f"{S}Hand": {f"hand.{_sfx}": 1},
                       f"{S}UpLeg": {f"thigh.{_sfx}": 1}, f"{S}Leg": {f"shin.{_sfx}": 1},
                       f"{S}Foot": {f"foot.{_sfx}": 1}, f"{S}ToeBase": {f"foot.{_sfx}": 1}})
    for _finger in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for _k in "1234":
            WEIGHT_MAP[f"{S}Hand{_finger}{_k}"] = {f"hand.{_sfx}": 1}


@dataclass
class Fit:
    mesh: bpy.types.Object          # Rodin's body, unposed into the rest, skinned to the rig
    weights: list[dict[str, float]]  # per vertex, production bones
    is_sword: np.ndarray            # per vertex: rigid on hand.R
    posed: np.ndarray               # per vertex, world position in Rodin's own pose (pose P)
    scale: float
    blade_length: float
    report: dict


def pca(points) -> tuple[np.ndarray, np.ndarray]:
    points = np.asarray(points, dtype=float)
    centre = points.mean(0)
    _, _, vt = np.linalg.svd(points - centre)
    return centre, vt


def _rot_between(u, v) -> Matrix:
    return Vector(u).normalized().rotation_difference(Vector(v).normalized()).to_matrix()


def _import(path: Path) -> set[bpy.types.Object]:
    """Import a GLB into the open file, keeping the scene's settings and dropping any actions it brings."""
    scene = bpy.context.scene
    keep = (scene.frame_start, scene.frame_end, scene.render.fps, scene.render.fps_base)
    actions = set(bpy.data.actions)
    objects = set(bpy.data.objects)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
    bpy.ops.import_scene.gltf(filepath=str(path))
    for action in set(bpy.data.actions) - actions:
        bpy.data.actions.remove(action)
    scene.frame_start, scene.frame_end, scene.render.fps, scene.render.fps_base = keep
    return set(bpy.data.objects) - objects


def _remove(objects) -> None:
    for obj in list(objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)


def kit_sword_in_hand(rig: bpy.types.Object) -> tuple[np.ndarray, np.ndarray]:
    """The kit sword's blade direction and width direction, in hand.R's rest frame."""
    sword = bpy.data.objects["HeroSword"]
    hand = rig.data.bones["hand.R"].matrix_local
    points = np.array([tuple(rig.matrix_world @ sword.matrix_world @ v.co) for v in sword.data.vertices])
    centre, vt = pca(points)
    d = vt[0]
    wrist = np.array(tuple(hand.to_translation()))
    span = (points - centre) @ d
    if np.linalg.norm(centre + d * span.max() - wrist) < np.linalg.norm(centre + d * span.min() - wrist):
        d = -d
    blade = points[((points - wrist) @ d) > 0.35]
    _, vtb = pca(blade)
    w = vtb[1] - np.dot(vtb[1], d) * d
    w /= np.linalg.norm(w)
    rotation = np.array(hand.to_3x3())
    return rotation.T @ d, rotation.T @ w


def _lift_sword_rest(R_old: Matrix, head_rest: Vector, Rp: Matrix, H: Vector, sword_posed: np.ndarray,
                     clearance: float = 0.03) -> tuple[Matrix, float]:
    """The hand's rest turned up about a level axis through the wrist, by the least angle that keeps the whole sword
    `clearance` above the floor at rest."""
    local = np.array(Rp.transposed()) @ (sword_posed - np.array(tuple(H))).T          # sword in the posed hand
    direction = np.array(R_old) @ local.mean(1)
    level = np.cross(direction, (0.0, 0.0, 1.0))
    level /= np.linalg.norm(level)
    for degrees in np.arange(0.0, 60.0, 0.5):
        R = Matrix.Rotation(math.radians(degrees), 3, Vector(tuple(level))) @ R_old
        if (np.array(R) @ local)[2].min() + head_rest.z >= clearance:
            return R, float(degrees)
    raise ValueError("no lift of the sword hand keeps the blade above the floor")


def compensate_rest_rotation(D, bone: str) -> None:
    """Pre-multiply every quaternion key of `bone` by D in every action (exact for keys and handles: a fixed
    quaternion product is linear in the components, and the four channels share their key frames)."""
    M = Matrix(((D.w, -D.x, -D.y, -D.z), (D.x, D.w, -D.z, D.y), (D.y, D.z, D.w, -D.x), (D.z, -D.y, D.x, D.w)))
    path = f'pose.bones["{bone}"].rotation_quaternion'
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if not bag:
                        continue
                    # (a few actions key the hand's location and scale with sampling noise: zero and one to 1e-4)
                    if any(c.data_path in (f'pose.bones["{bone}"].location', f'pose.bones["{bone}"].scale')
                           and any(abs(k.co.y - (0 if c.data_path.endswith("location") else 1)) > 1e-3
                                   for k in c.keyframe_points)
                           for c in bag.fcurves):
                        raise ValueError(f"{action.name} moves or scales {bone}; only its rotation can be compensated")
                    curves = [bag.fcurves.find(path, index=i) for i in range(4)]
                    if not any(curves):
                        continue
                    if not all(curves):
                        raise ValueError(f"{action.name}:{bone} lacks a quaternion channel")
                    frames = [[round(k.co.x, 4) for k in c.keyframe_points] for c in curves]
                    if any(f != frames[0] for f in frames):
                        raise ValueError(f"{action.name}:{bone} channels are keyed on different frames")
                    for i in range(len(frames[0])):
                        for attribute in ("co", "handle_left", "handle_right"):
                            value = M @ Vector([getattr(c.keyframe_points[i], attribute)[1] for c in curves])
                            for k, c in enumerate(curves):
                                getattr(c.keyframe_points[i], attribute)[1] = value[k]
                    for c in curves:
                        c.update()


def fit_rodin(rig: bpy.types.Object, unrigged: Path, autorigged: Path) -> Fit:
    sword_d, sword_w = kit_sword_in_hand(rig)
    export = bpy.data.collections["SpellbladeExport"]
    # the kit's armour goes; its palm rune (the spell hand's accent) stays and moves to Rodin's palm
    _remove([o for o in export.all_objects if o.type == "MESH" and o.name != "PalmRune"])

    # Rodin's textured mesh, then the autorigged file's joints and weights
    new = _import(unrigged)
    mesh = next(o for o in new if o.type == "MESH" and not o.name.startswith("Icosphere"))
    _remove(new - {mesh})
    mesh.name = mesh.data.name = "RodinBody"
    for collection in list(mesh.users_collection):
        collection.objects.unlink(mesh)
    export.objects.link(mesh)
    rigged = _import(autorigged)
    rodin_rig = next(o for o in rigged if o.type == "ARMATURE")
    rodin_mesh = next(o for o in rigged if o.type == "MESH" and not o.name.startswith("Icosphere"))
    joints = {b.name: (rodin_rig.matrix_world @ b.head_local, rodin_rig.matrix_world @ b.tail_local)
              for b in rodin_rig.data.bones}
    a = np.array([tuple(mesh.matrix_world @ v.co) for v in mesh.data.vertices])
    b = np.array([tuple(rodin_mesh.matrix_world @ v.co) for v in rodin_mesh.data.vertices])
    if a.shape != b.shape or float(np.abs(a - b).max()) > 1e-4:
        raise ValueError("Rodin's unrigged and autorigged files no longer share one mesh")
    names = [g.name for g in rodin_mesh.vertex_groups]
    rodin_weights = [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in rodin_mesh.data.vertices]
    rodin_materials = {m for m in rodin_mesh.data.materials if m}
    _remove(rigged)
    for material in rodin_materials:
        if material.users == 0:
            for node in material.node_tree.nodes if material.use_nodes else []:
                if node.type == "TEX_IMAGE" and node.image and node.image.users <= 1:
                    bpy.data.images.remove(node.image)
            bpy.data.materials.remove(material)

    # Rodin faces -Y: turn it to +Y, centre its hips over the pelvis and scale them to the pelvis height
    bones = rig.data.bones
    hips = joints["Hips"][0]
    scale = bones["pelvis"].head_local.z / hips.z
    T = (Matrix.Translation((0, bones["pelvis"].head_local.y, 0)) @ Matrix.Scale(scale, 4)
         @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((-hips.x, -hips.y, 0)))
    mesh.matrix_world = T @ mesh.matrix_world
    bpy.context.view_layer.update()
    J = {k: (T @ h, T @ t) for k, (h, t) in joints.items()}
    posed = np.array([tuple(mesh.matrix_world @ v.co) for v in mesh.data.vertices])

    # the blade: its true axis from its own vertices, starting from the estimate
    grip = np.array(tuple(J["RightHand"][0]))
    axis = np.array(tuple(T.to_3x3() @ Vector(RODIN_BLADE_ESTIMATE)))
    axis /= np.linalg.norm(axis)
    estimate = axis.copy()
    origin = grip.copy()
    for _ in range(4):
        rel = posed - origin
        along = rel @ axis
        off = np.linalg.norm(rel - np.outer(along, axis), axis=1)
        centre, vt = pca(posed[(along > 0.3) & (off < 0.12)])
        axis = vt[0] * np.sign(vt[0] @ axis)
        origin = centre - axis * ((centre - grip) @ axis)
    rel = posed - origin
    along = rel @ axis
    off = np.linalg.norm(rel - np.outer(along, axis), axis=1)
    tip = float(along[off < 0.1].max())
    # the sword (blade, guard, grip) and the fist around it: grown from the blade's core through connected vertices
    # inside a generous cylinder, so the knee it passes in Rodin's pose stays with the leg
    inside = (along > -0.05) & (along <= tip + 0.08) & (off < 0.17)
    weld = np.unique(np.round(posed / 1e-6).astype(np.int64), axis=0, return_inverse=True)[1].ravel()
    edges = np.empty(len(mesh.data.edges) * 2, dtype=int)
    mesh.data.edges.foreach_get("vertices", edges)
    edges = weld[edges.reshape(-1, 2)]
    neighbours = [[] for _ in range(weld.max() + 1)]
    for u, v in edges:
        neighbours[u].append(v)
        neighbours[v].append(u)
    inside_welded = np.zeros(weld.max() + 1, dtype=bool)
    inside_welded[weld[inside]] = True
    reached = np.zeros_like(inside_welded)
    stack = list(np.unique(weld[(along > 0.3) & (off < 0.04)]))
    reached[stack] = True
    while stack:
        u = stack.pop()
        for v in neighbours[u]:
            if inside_welded[v] and not reached[v]:
                reached[v] = True
                stack.append(v)
    is_sword = reached[weld]
    _, vtw = pca(posed[(along > 0.35) & is_sword])
    width = vtw[1] - np.dot(vtw[1], axis) * axis
    width /= np.linalg.norm(width)

    # --- the fit ---------------------------------------------------------------------------------------------
    order: list[str] = []

    def walk(bone):
        order.append(bone.name)
        for child in bone.children:
            walk(child)
    walk(bones["root"])
    old_rest = {b.name: b.matrix_local.copy() for b in bones}
    old_length = {b.name: b.length for b in bones}
    new_rest, pose_world, length = {}, {}, {}
    for name in order:
        bone = bones[name]
        parent = bone.parent.name if bone.parent else None
        R_old = old_rest[name].to_3x3()
        if name in BONE_MAP:
            head_joint, tail_joint = BONE_MAP[name]
            H = J[head_joint][0]
            if tail_joint is None:
                target, L = R_old.col[1], old_length[name] * scale
            elif tail_joint.startswith("TAIL:"):
                target = J[tail_joint[5:]][1] - H
                L = target.length
            else:
                target = J[tail_joint][0] - H
                L = target.length
            natural = _rot_between(R_old.col[1], target) @ R_old
            if name == "hand.R":
                # by the sword: the kit blade's axis and width (in the hand) onto Rodin's. The width's sign is free;
                # take the one nearer the hand's natural turn, so the wrist is not twisted half a turn
                A = np.column_stack([sword_d, sword_w, np.cross(sword_d, sword_w)])
                best = None
                for sign in (1.0, -1.0):
                    B = np.column_stack([axis, sign * width, np.cross(axis, sign * width)])
                    candidate = Matrix((B @ A.T).tolist())
                    twist = (candidate @ natural.transposed()).to_quaternion().angle
                    if best is None or twist < best[0]:
                        best = (twist, candidate)
                hand_twist = math.degrees(best[0])
                Rp = best[1]
                L = old_length[name] * scale
            else:
                Rp = natural
            head_rest = (new_rest[parent] @ pose_world[parent].inverted() @ H) if parent else H
            if name == "hand.R":
                # Rodin's sword is longer than the kit's: at the kit's rest its tip would sink below the floor, which
                # the validators reject. Lift the hand's rest just enough (the actions are compensated below, so
                # every pose still points the sword where it pointed the kit's)
                R_old, rest_lift = _lift_sword_rest(R_old, head_rest, Rp, H, posed[is_sword])
            new_rest[name] = Matrix.Translation(head_rest) @ R_old.to_4x4()
            pose_world[name] = Matrix.Translation(H) @ Rp.to_4x4()
            length[name] = L
        else:
            new_rest[name] = (new_rest[parent] @ old_rest[parent].inverted() @ old_rest[name]) if parent else old_rest[name]
            pose_world[name] = (pose_world[parent] @ new_rest[parent].inverted() @ new_rest[name]) if parent else new_rest[name]
            length[name] = old_length[name] * (scale if parent else 1)

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for edit_bone in rig.data.edit_bones:
        edit_bone.use_connect = False
    for name in order:
        edit_bone = rig.data.edit_bones[name]
        edit_bone.matrix = new_rest[name]
        edit_bone.length = length[name]
    bpy.ops.object.mode_set(mode="POSE")
    # the lifted hand: each action's keys turned back by the lift, so its world orientation is unchanged
    forearm = new_rest["forearm.R"]
    kit_local = forearm.inverted() @ Matrix.Translation(new_rest["hand.R"].translation) @ old_rest["hand.R"].to_3x3().to_4x4()
    new_local = forearm.inverted() @ new_rest["hand.R"]
    compensate_rest_rotation(new_local.to_quaternion().inverted() @ kit_local.to_quaternion(), "hand.R")
    idle = rig.animation_data.action
    rig.animation_data.action = None
    for name in order:
        pose_bone = rig.pose.bones[name]
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.location = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)
        parent = bones[name].parent
        parent_term = (pose_world[parent.name] @ new_rest[parent.name].inverted()) if parent else Matrix.Identity(4)
        pose_bone.rotation_quaternion = ((parent_term @ new_rest[name]).inverted() @ pose_world[name]).to_quaternion()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    fit_error = max((rig.matrix_world @ rig.pose.bones[n].head - pose_world[n].to_translation()).length for n in BONE_MAP)

    # --- weights ------------------------------------------------------------------------------------------------
    weights = []
    for index, source in enumerate(rodin_weights):
        out: dict[str, float] = {}
        for group, value in source.items():
            for target, share in WEIGHT_MAP.get(group, {}).items():
                out[target] = out.get(target, 0.0) + value * share
        if is_sword[index]:
            out = {"hand.R": 1.0}
        total = sum(out.values()) or 1.0
        weights.append({k: v / total for k, v in out.items()})

    # --- unpose into the rest (inverse linear blend skinning) --------------------------------------------------
    M = {n: np.array(rig.matrix_world @ rig.pose.bones[n].matrix @ bones[n].matrix_local.inverted()) for n in order}
    rest = np.empty_like(posed)
    for index, w in enumerate(weights):
        blend = sum(M[k] * v for k, v in w.items())
        rest[index] = (np.linalg.inv(blend) @ np.append(posed[index], 1.0))[:3]
    mesh.matrix_world = Matrix.Identity(4)
    mesh.data.vertices.foreach_set("co", rest.ravel())
    mesh.data.update()
    groups = {n: mesh.vertex_groups.new(name=n) for n in order if bones[n].use_deform}
    for index, w in enumerate(weights):
        for bone_name, value in w.items():
            groups[bone_name].add([index], value, "REPLACE")
    mesh.parent = rig
    modifier = mesh.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig

    # the sword and spell sockets on Rodin's grip and palm, in pose P, then carried into the rest with their hands
    def to_rest(bone_name: str, point) -> Vector:
        return new_rest[bone_name] @ pose_world[bone_name].inverted() @ Vector(tuple(point))
    fist = posed[np.array([w.get("hand.R", 0) > 0.6 for w in weights]) & ~is_sword]
    fist_centre = fist.mean(0)
    sword_socket = origin + axis * ((fist_centre - origin) @ axis)
    palm = posed[np.array([w.get("hand.L", 0) > 0.6 for w in weights])]
    palm_centre, vtp = pca(palm)
    normal = vtp[2] * np.sign(vtp[2][2] or 1.0)            # the open hand's palm faces up
    sorcery_socket = palm_centre + normal * float(((palm - palm_centre) @ normal).max())
    sockets = {"socket_sword": ("hand.R", to_rest("hand.R", sword_socket)),
               "socket_sorcery": ("hand.L", to_rest("hand.L", sorcery_socket))}
    old_sockets = {name: rig.data.bones[name].matrix_local.copy() for name in sockets}
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (_, head) in sockets.items():
        edit_bone = rig.data.edit_bones[name]
        edit_bone.translate(head - edit_bone.head)
    bpy.ops.object.mode_set(mode="OBJECT")
    # the palm rune rides on the spell socket
    rune = bpy.data.objects.get("PalmRune")
    if rune is not None:
        move = rig.data.bones["socket_sorcery"].matrix_local @ old_sockets["socket_sorcery"].inverted()
        rune.data.transform(rune.matrix_world.inverted() @ move @ rune.matrix_world)
        rune.data.update()

    # back to the rest, with the idle playing
    for pose_bone in rig.pose.bones:
        pose_bone.matrix_basis = Matrix.Identity(4)
    rig.animation_data.action = idle
    bpy.context.view_layer.update()

    report = {
        "scale": round(scale, 5),
        "fitErrorMeters": round(fit_error, 6),
        "bladeRefinedDegrees": round(math.degrees(math.acos(min(1.0, abs(float(axis @ estimate))))), 2),
        "handTwistDegrees": round(hand_twist, 2),
        "swordRestLiftDegrees": rest_lift,
        "swordVertices": int(is_sword.sum()),
        "bladeLengthMeters": round(tip, 3),
    }
    return Fit(mesh=mesh, weights=weights, is_sword=is_sword, posed=posed, scale=scale, blade_length=tip, report=report)
