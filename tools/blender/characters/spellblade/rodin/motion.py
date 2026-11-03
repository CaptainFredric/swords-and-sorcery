"""Fit the kit's actions to Rodin's proportions (stage 3 of build_source.py).

The actions are rotations about the production rest orientations, so they already play the new body. What changes with
Rodin's proportions is where the feet land and where the longer sword reaches:

- Rest: the whole rest skeleton and mesh are lifted so the rest model stands on the floor (the validators measure it).
- Feet: in every standing action, and in Death (which falls back pivoting on its feet), each pelvis height key is
  re-planted so the lower sole touches the floor at that key. The key and both its handles move together, so loop
  seams keep their values and slopes.
- Sword, floor: Rodin's sword reaches 1.36 m from the wrist (the kit's 1.04 m) on a 39 % longer forearm, so the kit's
  poses put it through the floor. Each hand key whose pose sinks the blade turns the grip by the least angle that clears
  it (about the axis that raises the lowest point), and a key is added wherever it still dips between keys.
- Sword, body: wherever the blade still passes through the body or the off hand, the smallest single arm key that
  clears it (searched as the kit's followthrough.py does) is added inside that span. Contact and end frames are not
  keyed there.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

STANDING = ("Idle", "Guard", "Run", "Sprint", "Slash_1", "Slash_2", "Slash_3", "Cast", "Stagger",
            "GuardCut_1", "GuardCut_2", "GuardCut_3")
SOLE = 0.004            # the lower sole's height at each planted key (the motion test allows -0.004..0.012)
REST_FLOOR = 0.002      # the rest model's lowest point
FLOOR = 0.0
SPEED_SLACK = 1.15
FIXED_FRAMES = {"Slash_1": (13, 23), "Slash_2": (12, 23), "Slash_3": (12, 20)}   # contact, end: never re-keyed


def channelbag(action):
    return action.layers[0].strips[0].channelbag(action.slots[0])


def assign(rig, action) -> None:
    data = rig.animation_data
    data.action = action
    if getattr(data, "action_slot", None) is None and action.slots:
        data.action_slot = action.slots[0]


def evaluated(obj, depsgraph) -> np.ndarray:
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    matrix = np.array(ev.matrix_world)
    ev.to_mesh_clear()
    co = co.reshape(-1, 3)
    return co @ matrix[:3, :3].T + matrix[:3, 3]


def tree(objects, depsgraph) -> BVHTree:
    verts, faces = [], []
    for obj in objects:
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        base = len(verts)
        verts.extend(ev.matrix_world @ v.co for v in mesh.vertices)
        faces.extend([base + i for i in p.vertices] for p in mesh.polygons)
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, faces)


def set_frame(frame: float) -> None:
    bpy.context.scene.frame_set(int(math.floor(frame)), subframe=frame - math.floor(frame))
    bpy.context.view_layer.update()


def lift_rest(rig, meshes) -> float:
    """Lift the rest skeleton and every mesh so the rest model's lowest point is REST_FLOOR."""
    low = min(float((np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]))[:, 2].min()) for o in meshes)
    dz = REST_FLOOR - low
    if abs(dz) < 1e-5:
        return 0.0
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        if bone.name != "root":
            bone.translate(Vector((0, 0, dz)))
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes:
        obj.data.transform(Matrix.Translation((0, 0, dz)))
        obj.data.update()
    return dz


def plant(rig, action, low_of) -> dict:
    """Re-plant each pelvis height key so low_of() (the lowest sole, or body) sits at its target at that key."""
    curve = channelbag(action).fcurves.find('pose.bones["pelvis"].location', index=1)
    if curve is None:
        return {"keys": 0}
    up = (rig.matrix_world @ rig.data.bones["pelvis"].matrix_local).to_3x3().col[1].z
    assign(rig, action)
    moves = []
    for key in curve.keyframe_points:
        set_frame(key.co.x)
        low, target = low_of()
        moves.append((key, (target - low) / up))
    for key, dy in moves:
        key.co.y += dy
        key.handle_left.y += dy
        key.handle_right.y += dy
    curve.update()
    shifts = [abs(dy) for _, dy in moves]
    return {"keys": len(moves), "maxShift": round(max(shifts), 4)}


SWINGS = {"Run": (("R", 0.25), ("L", 0.75)), "Sprint": (("R", 0.25), ("L", 0.75))}   # swing foot at mid-swing
SWING_CLEARANCE = 0.076        # the motion test asks more than 0.07


def lift_swing(rig, action, side: str, phase: float, boot) -> dict:
    """Bend the swinging leg's knee a little more at mid-swing, so the boot clears the floor (Rodin's shin is longer
    and his thigh shorter than the kit's, so the same hip and knee angles carry the foot lower)."""
    start, end = action.frame_range
    frame = start + (end - start) * phase
    assign(rig, action)
    set_frame(frame)

    def low():
        return float(evaluated(boot, bpy.context.evaluated_depsgraph_get())[:, 2].min())
    before = low()
    if before >= SWING_CLEARANCE:
        return {"frame": frame, "height": round(before, 3)}
    shin = rig.pose.bones[f"shin.{side}"]
    original = shin.matrix.copy()
    best = None
    for sign in (1.0, -1.0):
        for degrees in range(1, 31):
            axis = (original.to_3x3() @ Vector((1, 0, 0))).normalized()
            turn = (Matrix.Translation(shin.head) @ Quaternion(axis, math.radians(sign * degrees)).to_matrix().to_4x4()
                    @ Matrix.Translation(-shin.head))
            shin.matrix = turn @ original
            bpy.context.view_layer.update()
            ok = low() >= SWING_CLEARANCE
            if ok:
                if best is None or degrees < best[0]:
                    best = (degrees, sign)
                break
    shin.matrix = original
    bpy.context.view_layer.update()
    if best is None:
        return {"frame": frame, "height": round(before, 3), "result": "no knee bend clears it"}
    degrees, sign = best
    axis = (original.to_3x3() @ Vector((1, 0, 0))).normalized()
    shin.matrix = (Matrix.Translation(shin.head) @ Quaternion(axis, math.radians(sign * degrees)).to_matrix().to_4x4()
                   @ Matrix.Translation(-shin.head)) @ original
    bpy.context.view_layer.update()
    shin.keyframe_insert("rotation_quaternion", frame=frame, group=shin.name)
    set_frame(frame)
    return {"frame": frame, "heightBefore": round(before, 3), "height": round(low(), 3), "kneeDegrees": degrees * sign}


AXES = {  # rotations in the character's frame (+X its right, +Y its front, +Z up), through the joint
    "swing the arm out": ("upper_arm.R", Vector((0, 1, 0)), -1.0),
    "raise the arm forward": ("upper_arm.R", Vector((1, 0, 0)), 1.0),
    "swing the arm back": ("upper_arm.R", Vector((1, 0, 0)), -1.0),
    "turn the arm outward": ("upper_arm.R", Vector((0, 0, 1)), 1.0),
    "tip the blade up": ("hand.R", Vector((1, 0, 0)), 1.0),
    "tip the blade out": ("hand.R", Vector((0, 1, 0)), -1.0),
}


class SwordCheck:
    def __init__(self, rig):
        export = bpy.data.collections["SpellbladeExport"]
        self.rig = rig
        self.sword = bpy.data.objects["HeroSword"]
        self.off_hand = bpy.data.objects["Gauntlet.L"]
        self.body = [o for o in export.all_objects if o.type == "MESH"
                     and o.name not in ("HeroSword", "Gauntlet.R", "PalmRune", "TabardFront", "TabardBack")]

    def frame(self, frame: float):
        """(blade in the body or off hand, blade below the floor (m), blade tip)."""
        set_frame(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        sword = tree([self.sword], depsgraph)
        hit = bool(sword.overlap(tree(self.body, depsgraph)))
        points = evaluated(self.sword, depsgraph)
        hand = np.array(tuple(self.rig.matrix_world @ self.rig.pose.bones["hand.R"].head))
        tip = points[np.argmax(np.linalg.norm(points - hand, axis=1))]
        return hit, max(0.0, FLOOR - float(points[:, 2].min())), tip

    def scan(self, action, step: float = 0.5, frames=None):
        assign(self.rig, action)
        start, end = action.frame_range
        frames = list(np.arange(start, end + 1e-6, step)) if frames is None else frames
        out = {f: self.frame(f) for f in frames}
        if action.name.split(".")[0] in AIRBORNE:            # in the air the ground is not under him
            out = {f: (hit, 0.0, tip) for f, (hit, _, tip) in out.items()}
        return out


def key_offset(rig, action, bone, axis_world, sign, frame, degrees) -> None:
    """Key `bone` at `frame`: its evaluated pose turned sign*degrees about axis_world through its joint."""
    assign(rig, action)
    set_frame(frame)
    pose_bone = rig.pose.bones[bone]
    axis = (rig.matrix_world.inverted().to_3x3() @ axis_world).normalized()
    turn = (Matrix.Translation(pose_bone.head) @ Quaternion(axis, math.radians(sign * degrees)).to_matrix().to_4x4()
            @ Matrix.Translation(-pose_bone.head))
    pose_bone.matrix = turn @ pose_bone.matrix
    bpy.context.view_layer.update()
    pose_bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone)


def spans(bad: list[float], gap: float = 2.0) -> list[tuple[float, float]]:
    out = []
    for f in sorted(bad):
        if out and f - out[-1][1] <= gap:
            out[-1] = (out[-1][0], f)
        else:
            out.append((f, f))
    return out


def clear_sword(rig, check: SwordCheck, action) -> list:
    """Add the smallest arm key that clears each span of frames where the blade is in the body or the floor."""
    fixes = []
    start, end = (int(x) for x in action.frame_range)
    fixed = set(FIXED_FRAMES.get(action.name, ())) | {start, end}
    for _ in range(3):
        scan = check.scan(action)
        bad = [f for f, (hit, sink, _) in scan.items() if hit or sink > 0.005]
        if not bad:
            break
        progressed = False
        for lo, hi in spans(bad):
            window = [f for f in scan if lo - 2 <= f <= hi + 2]
            base = sum(1 for f in window if scan[f][0] or scan[f][1] > 0.005)
            tips = [scan[f][2] for f in window]
            step0 = max((np.linalg.norm(b - a) for a, b in zip(tips, tips[1:])), default=0.0)
            mid = int(round((lo + hi) / 2))
            candidates = [k for k in {mid, int(lo), int(math.ceil(hi))} if start < k < end and k not in fixed]
            if not candidates:
                fixes.append({"span": (lo, hi), "result": "only fixed frames; left as authored"})
                continue
            # trials are judged on the span's own frames; the chosen key is then checked over the whole action
            trials = []
            for label, (bone, axis, sign) in AXES.items():
                for k in candidates:
                    for degrees in range(5, 41, 5):
                        trial = action.copy()
                        key_offset(rig, trial, bone, axis, sign, k, degrees)
                        sub = list(check.scan(trial, frames=window).values())
                        bpy.data.actions.remove(trial)
                        hits = sum(1 for h, s, _ in sub if h or s > 0.005)
                        step = max((np.linalg.norm(b[2] - a[2]) for a, b in zip(sub, sub[1:])), default=0.0)
                        if step <= max(step0 * SPEED_SLACK, 0.02):
                            trials.append(((hits, degrees), label, k, degrees))
                        if hits == 0:
                            break
            outside = sum(1 for f, (h, s, _) in scan.items() if f not in window and (h or s > 0.005))
            best = None
            for score, label, k, degrees in sorted(trials)[:6]:
                if score[0] >= base:
                    break
                trial = action.copy()
                key_offset(rig, trial, *AXES[label], k, degrees)
                elsewhere = sum(1 for f, (h, s, _) in check.scan(trial).items() if f not in window and (h or s > 0.005))
                bpy.data.actions.remove(trial)
                if elsewhere <= outside:
                    best = (score, label, k, degrees)
                    break
            assign(rig, action)
            if best is None or best[0][0] >= base:
                fixes.append({"span": (lo, hi), "result": "no smooth improvement; left as authored"})
                continue
            (hits, degrees), label, k, degrees = best
            bone, axis, sign = AXES[label]
            key_offset(rig, action, bone, axis, sign, k, degrees)
            progressed = True
            fixes.append({"span": (lo, hi), "fix": f"{label} {degrees} deg at frame {k}", "frames": f"{base} -> {hits}"})
        if not progressed:
            break
    return fixes


def report_sword(check: "SwordCheck") -> dict:
    out = {}
    for action in bpy.data.actions:
        scan = check.scan(action)
        hits = [f for f, (h, _, _) in scan.items() if h]
        sinks = {f: round(s, 3) for f, (_, s, _) in scan.items() if s > 0.005}
        if hits or sinks:
            out[action.name] = {"body": [float(f) for f in hits], "floorDepth": max(sinks.values()) if sinks else 0,
                                "floorFrames": [float(f) for f in sinks]}
    return out


def post_multiply(action, bone: str, r: Quaternion) -> None:
    """Every quaternion key of `bone` turned by r in the bone's own frame (q -> q r): a fixed change of grip. Linear in
    the components, so keys and handles stay exact and loop seams keep their values and slopes."""
    M = Matrix(((r.w, -r.x, -r.y, -r.z), (r.x, r.w, r.z, -r.y), (r.y, -r.z, r.w, r.x), (r.z, r.y, -r.x, r.w)))
    bag = channelbag(action)
    curves = [bag.fcurves.find(f'pose.bones["{bone}"].rotation_quaternion', index=i) for i in range(4)]
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


class SwordCarry:
    """The rigid sword in hand.R's own frame, evaluated cheaply for a trial grip turn."""

    def __init__(self, rig):
        self.rig = rig
        sword = bpy.data.objects["HeroSword"]
        rest = np.array([tuple(sword.matrix_world @ v.co) for v in sword.data.vertices])
        inverse = np.array(rig.data.bones["hand.R"].matrix_local.inverted())
        self.local = rest @ inverse[:3, :3].T + inverse[:3, 3]
        self.boots = [bpy.data.objects["Boot.L"], bpy.data.objects["Boot.R"]]

    def sample(self, action, airborne: bool, step: float = 0.5):
        assign(self.rig, action)
        start, end = action.frame_range
        out = []
        for frame in np.arange(start, end + 1e-6, step):
            set_frame(float(frame))
            matrix = np.array(self.rig.matrix_world @ self.rig.pose.bones["hand.R"].matrix)
            floor = FLOOR
            if airborne:
                depsgraph = bpy.context.evaluated_depsgraph_get()
                floor = min(float(evaluated(b, depsgraph)[:, 2].min()) for b in self.boots)
            out.append((float(frame), matrix, floor))
        return out

    @staticmethod
    def sink(samples, local, margin: float) -> np.ndarray:
        return np.array([max(0.0, floor + margin - float((local @ m[:3, :3].T + m[:3, 3])[:, 2].min()))
                         for _, m, floor in samples])

    def needed(self, matrix: np.ndarray, floor: float, margin: float, limit: float = 70.0):
        """The least grip turn (about the axis that raises the sword's lowest point) that clears the floor here."""
        R, t = matrix[:3, :3], matrix[:3, 3]
        points = self.local @ R.T + t
        if points[:, 2].min() >= floor + margin - 1e-4:
            return None
        up = R.T @ np.array([0.0, 0.0, 1.0])
        axis = np.cross(self.local[np.argmin(points[:, 2])], up)
        axis /= np.linalg.norm(axis)
        for degrees in np.arange(1.0, limit + 1e-6, 1.0):
            r = np.array(Matrix.Rotation(math.radians(degrees), 3, Vector(tuple(axis))))
            if (self.local @ (R @ r).T + t)[:, 2].min() >= floor + margin:
                break
        return Quaternion(Vector(tuple(axis)), math.radians(degrees))

    def floor_at(self, airborne: bool) -> float:
        if not airborne:
            return FLOOR
        depsgraph = bpy.context.evaluated_depsgraph_get()
        return min(float(evaluated(b, depsgraph)[:, 2].min()) for b in self.boots)

    def lift(self, action, airborne: bool, margin: float = 0.01) -> dict:
        """Turn the grip at each hand key just enough to keep the sword above the floor there, then add a key wherever
        the blade still dips between keys. Keys that clear are left as authored."""
        samples = self.sample(action, airborne)
        before = float(self.sink(samples, self.local, margin).max())
        if before <= 0.005:
            return {}
        bag = channelbag(action)
        curves = [bag.fcurves.find('pose.bones["hand.R"].rotation_quaternion', index=i) for i in range(4)]
        turned = {}
        assign(self.rig, action)
        for i, key in enumerate(curves[0].keyframe_points):
            frame = key.co.x
            set_frame(frame)
            matrix = np.array(self.rig.matrix_world @ self.rig.pose.bones["hand.R"].matrix)
            r = self.needed(matrix, self.floor_at(airborne), margin)
            if r is None:
                continue
            M = Matrix(((r.w, -r.x, -r.y, -r.z), (r.x, r.w, r.z, -r.y), (r.y, -r.z, r.w, r.x), (r.z, r.y, -r.x, r.w)))
            for attribute in ("co", "handle_left", "handle_right"):
                value = M @ Vector([getattr(c.keyframe_points[i], attribute)[1] for c in curves])
                for k, c in enumerate(curves):
                    getattr(c.keyframe_points[i], attribute)[1] = value[k]
            turned[round(frame, 2)] = round(math.degrees(r.angle), 1)
        for c in curves:
            c.update()
        added = {}
        for _ in range(4):
            samples = self.sample(action, airborne)
            depth = self.sink(samples, self.local, margin)
            if depth.max() <= 0.005:
                break
            keyed = {round(k.co.x, 3) for k in curves[0].keyframe_points}
            frames = [s[0] for s in samples]
            for lo, hi in spans([f for f, d in zip(frames, depth) if d > 0.005], gap=1.0):
                worst = max((f for f in frames if lo <= f <= hi), key=lambda f: depth[frames.index(f)])
                frame = float(round(worst))
                if round(frame, 3) in keyed:
                    frame = worst
                set_frame(frame)
                matrix = np.array(self.rig.matrix_world @ self.rig.pose.bones["hand.R"].matrix)
                r = self.needed(matrix, self.floor_at(airborne), margin)
                if r is None:
                    continue
                pose_bone = self.rig.pose.bones["hand.R"]
                pose_bone.rotation_quaternion = pose_bone.rotation_quaternion @ r
                pose_bone.keyframe_insert("rotation_quaternion", frame=frame, group="hand.R")
                added[round(frame, 2)] = round(math.degrees(r.angle), 1)
        after = float(self.sink(self.sample(action, airborne), self.local, margin).max())
        return {"sinkBefore": round(before, 3), "sinkAfter": round(after, 3), "turnedKeys": turned, "addedKeys": added}


AIRBORNE = ("Air",)


def fit_motion(rig, fix: bool = True, search: bool = True) -> dict:
    export = bpy.data.collections["SpellbladeExport"]
    meshes = [o for o in export.all_objects if o.type == "MESH"]
    idle = rig.animation_data.action
    rig.animation_data.action = None
    for pose_bone in rig.pose.bones:
        pose_bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    report = {"restLift": round(lift_rest(rig, meshes), 4)}

    boots = [bpy.data.objects["Boot.L"], bpy.data.objects["Boot.R"]]

    def sole():
        depsgraph = bpy.context.evaluated_depsgraph_get()
        return min(float(evaluated(b, depsgraph)[:, 2].min()) for b in boots), SOLE

    # (Death falls back pivoting on its feet, as the kit authored it)
    report["planted"] = {name: plant(rig, bpy.data.actions[name], sole) for name in (*STANDING, "Death")}
    report["swing"] = {f"{name}.{side}": lift_swing(rig, bpy.data.actions[name], side, phase, bpy.data.objects[f"Boot.{side}"])
                       for name, swings in SWINGS.items() for side, phase in swings}

    if fix:
        carry = SwordCarry(rig)
        report["grip"] = {a.name: carry.lift(a, a.name in AIRBORNE) for a in bpy.data.actions}
    check = SwordCheck(rig)
    report["swordBefore"] = report_sword(check)
    if fix and search:
        report["swordFixes"] = {}
        for name in report["swordBefore"]:
            report["swordFixes"][name] = clear_sword(rig, check, bpy.data.actions[name])
        report["swordAfter"] = report_sword(check)
    assign(rig, idle)
    set_frame(1)
    return report
