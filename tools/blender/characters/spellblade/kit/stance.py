"""stance.py -- run on the built kit (third person) or first-person source: the ready stance and living holds.

Third person (the concept's front view stands in an athletic ready stance, knees bent and slightly out):
  * every standing action (Idle, Guard, Cast, Stagger, Slash_1-3) gets the same leg offset -- hips flexed, knees
    bent, knees slightly out, feet kept at their original orientation -- and the pelvis is lowered per key so the
    lower foot stays exactly where it was on the ground. Timing, contact frames and the upper body are untouched.
  * Idle becomes a slow 2 s breathing loop: chest and shoulders rise and fall, a little extra knee give with the
    pelvis re-planted, the sword arm and the spell arm sway gently.
  * Guard's hold (frames 8..) becomes a 1.6 s loop: the guard stays up but breathes and the sword shifts slightly;
    the runtime plays frames 8..56 on a loop instead of freezing frame 8.
First person (KIT_MODE=fp): Guard gets the same kind of hold loop on the view-model arms.
"""
import os, sys, math, bpy
from mathutils import Quaternion, Vector

OUT = sys.argv[sys.argv.index("--") + 1]
MODE = os.environ.get("KIT_MODE", "tp")
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm = rig.data
sc = bpy.context.scene
GUARD_HOLD = (8, 56)          # frames; the runtime loops Guard over this span
IDLE_LOOP = (1, 61)


def bag_of(act):
    return act.layers[0].strips[0].channelbag(act.slots[0])


def quat_curves(bag, bone):
    fcs = [None] * 4
    for fc in bag.fcurves:
        if fc.data_path == f'pose.bones["{bone}"].rotation_quaternion': fcs[fc.array_index] = fc
    return fcs if all(fcs) else None


def loc_curves(bag, bone):
    fcs = [None] * 3
    for fc in bag.fcurves:
        if fc.data_path == f'pose.bones["{bone}"].location': fcs[fc.array_index] = fc
    return fcs if all(fcs) else None


def local_axis(bone, axis):
    return (arm.bones[bone].matrix_local.to_3x3().inverted() @ Vector(axis)).normalized()


def premul_keys(fcs, d):
    """left-multiply every quaternion key (value and both handles) of a bone by d."""
    n = len(fcs[0].keyframe_points)
    for i in range(n):
        for attr in ("co", "handle_left", "handle_right"):
            q = Quaternion([getattr(f.keyframe_points[i], attr)[1] for f in fcs])
            r = d @ q
            for c, f in enumerate(fcs):
                p = getattr(f.keyframe_points[i], attr); p[1] = r[c]
    for f in fcs: f.update()


def assign(act):
    ad = rig.animation_data; ad.action = act
    if getattr(ad, "action_slot", None) is None and act.slots: ad.action_slot = act.slots[0]


def ankle_z(frame):
    sc.frame_set(frame); bpy.context.view_layer.update()
    return min((rig.matrix_world @ rig.pose.bones[b].head).z for b in ("foot.L", "foot.R"))


def replant(act, frames, target):
    """shift the pelvis location keys so the lower ankle is at target[frame] on each frame."""
    lf = loc_curves(bag_of(act), "pelvis")
    if lf is None: return
    for f in frames:
        dz = target[f] - ankle_z(f)
        for kp in lf[1].keyframe_points:                    # pelvis local Y is world up
            if abs(kp.co.x - f) < 1e-3:
                kp.co[1] += dz; kp.handle_left[1] += dz; kp.handle_right[1] += dz
        lf[1].update()


def key_frames(act):
    return sorted({round(k.co.x) for fc in bag_of(act).fcurves for k in fc.keyframe_points})


# ------------------------------------------------------------------ helpers for the living loops
def pose_loop(act, base_frame, frames, offsets, plant=True):
    """key `frames` of act as the pose at base_frame plus offsets(phase) (phase in [0,1) over the loop).
    offsets(phase) -> {bone: [(world_axis, degrees), ...]}; the pelvis is re-planted to the base ankle height."""
    assign(act)
    sc.frame_set(base_frame); bpy.context.view_layer.update()
    base = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in rig.pose.bones}
    z0 = ankle_z(base_frame) if plant else 0.0
    span = frames[-1] - frames[0]
    touched = set()
    for f in frames:
        ph = (f - frames[0]) / span
        for b, (q, l) in base.items():
            pb = rig.pose.bones[b]; pb.rotation_quaternion = q.copy(); pb.location = l.copy()
        for b, rots in offsets(ph).items():
            pb = rig.pose.bones[b]; d = Quaternion()
            for axis, deg in rots:
                d = Quaternion(local_axis(b, axis), math.radians(deg)) @ d
            pb.rotation_quaternion = d @ pb.rotation_quaternion
            touched.add(b)
        bpy.context.view_layer.update()
        if plant and "pelvis" in rig.pose.bones:
            pel = rig.pose.bones["pelvis"]
            now = min((rig.matrix_world @ rig.pose.bones[x].head).z for x in ("foot.L", "foot.R"))
            pel.location.y += z0 - now
            bpy.context.view_layer.update()
        for b in touched | ({"pelvis"} if plant else set()):
            pb = rig.pose.bones[b]
            pb.keyframe_insert("rotation_quaternion", frame=f, group=b)
            if b == "pelvis": pb.keyframe_insert("location", frame=f, group=b)


def wave(ph, lag=0.0):
    return math.sin(2 * math.pi * (ph - lag))


def bob(ph, lag=0.0):
    return 0.5 - 0.5 * math.cos(2 * math.pi * (ph - lag))


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)


def make_compatible(act):
    """keep every bone's quaternion keys in one hemisphere (q and -q are the same rotation). Blender plays opposite-
    signed neighbours fine, but the glTF export then pairs flipped keys with unflipped tangents and the game snaps
    the bone for a frame (the Run and Dash thigh). Flipping a key with its handles keeps the rotation it shows."""
    flipped = 0
    groups = {}
    for fc in bag_of(act).fcurves:
        if fc.data_path.endswith("rotation_quaternion"):
            groups.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for fcs in groups.values():
        if any(f is None for f in fcs): continue
        n = len(fcs[0].keyframe_points)
        for i in range(1, n):
            q0 = Quaternion([f.keyframe_points[i - 1].co[1] for f in fcs])
            q1 = Quaternion([f.keyframe_points[i].co[1] for f in fcs])
            if q0.dot(q1) < 0:
                for f in fcs:
                    k = f.keyframe_points[i]
                    k.co[1] = -k.co[1]; k.handle_left[1] = -k.handle_left[1]; k.handle_right[1] = -k.handle_right[1]
                flipped += 1
        for f in fcs: f.update()
    return flipped


for a in bpy.data.actions:
    n = make_compatible(a)
    if n: print("STANCE hemisphere-fixed", a.name, n, "keys")

if MODE == "tp":
    # ---------------------------------------------------------------- ready stance on every standing action
    FLEX, KNEE_OUT = 13.0, 6.0
    READY = {"upper_arm.R": [(X, 10.0)], "forearm.R": [(X, 30.0)]}
    INTERIOR = {"Slash_1": 0.35, "Slash_2": 0.35, "Slash_3": 0.25, "Cast": 0.6, "Stagger": 0.6}
    LEG = {"thigh.R": [(X, FLEX), (Y, -KNEE_OUT)], "shin.R": [(X, -2 * FLEX), (Y, KNEE_OUT)], "foot.R": [(X, FLEX)],
           "thigh.L": [(X, FLEX), (Y, KNEE_OUT)], "shin.L": [(X, -2 * FLEX), (Y, -KNEE_OUT)], "foot.L": [(X, FLEX)]}
    for name in ("Idle", "Guard", "Cast", "Stagger", "Slash_1", "Slash_2", "Slash_3"):
        act = bpy.data.actions[name]; assign(act)
        frames = key_frames(act)
        target = {f: ankle_z(f) for f in frames}
        bag = bag_of(act)
        # attacks and reactions already lunge and crouch mid-action: there the extra bend is eased off, so a lunge
        # keeps its height and the blade keeps its path; the start and end keys take the full stance
        inner = INTERIOR.get(name, 1.0)
        for b, rots in LEG.items():
            fcs = quat_curves(bag, b)
            if fcs is None: continue
            for i in range(len(fcs[0].keyframe_points)):
                fr = round(fcs[0].keyframe_points[i].co.x)
                w = 1.0 if fr in (frames[0], frames[-1]) else inner
                d = Quaternion()
                for axis, deg in rots: d = Quaternion(local_axis(b, axis), math.radians(deg * w)) @ d
                for attr in ("co", "handle_left", "handle_right"):
                    q = Quaternion([getattr(f.keyframe_points[i], attr)[1] for f in fcs]); r = d @ q
                    for c, f in enumerate(fcs):
                        pnt = getattr(f.keyframe_points[i], attr); pnt[1] = r[c]
            for f in fcs: f.update()
        # the neutral start and end keys take Idle's ready hold (elbow bent, blade forward-down), so every action
        # leaves and returns to the same pose the idle shows and the cross-fades have nothing to jump across
        ends = {k for k in (frames[0], frames[-1]) if name != "Guard" or k == frames[0]}
        for b, rots in READY.items():
            fcs = quat_curves(bag, b)
            if fcs is None: continue
            d = Quaternion()
            for axis, deg in rots: d = Quaternion(local_axis(b, axis), math.radians(deg)) @ d
            for i in range(len(fcs[0].keyframe_points)):
                if round(fcs[0].keyframe_points[i].co.x) not in ends: continue
                for attr in ("co", "handle_left", "handle_right"):
                    q = Quaternion([getattr(f.keyframe_points[i], attr)[1] for f in fcs]); r = d @ q
                    for c, f in enumerate(fcs):
                        pnt = getattr(f.keyframe_points[i], attr); pnt[1] = r[c]
            for f in fcs: f.update()
        replant(act, frames, target)
        drop = sum(target[f] - ankle_z(f) for f in frames) / len(frames)
        print("STANCE", name, "keys", len(frames), "residual ankle error %.4f m" % abs(drop))

    # ---------------------------------------------------------------- Idle: slow breathing loop
    idle = bpy.data.actions["Idle"]
    def idle_off(ph):
        br = bob(ph)
        return {"spine": [(X, 0.8 * br)], "chest": [(X, -1.6 * br)], "neck": [(X, 0.9 * br)], "head": [(X, 0.6 * wave(ph, 0.1))],
                "clavicle.R": [(Y, -1.2 * br)], "clavicle.L": [(Y, 1.2 * br)],
                # ready hold (concept side view): elbow bent, the blade angled forward-down in front of the feet
                "upper_arm.R": [(X, 2.2 * wave(ph, 0.15)), (Y, -1.0 * br)], "forearm.R": [(X, 1.8 * wave(ph, 0.25))],
                "upper_arm.L": [(X, -2.0 * wave(ph, 0.2)), (Y, 1.0 * br)], "forearm.L": [(X, 2.4 * wave(ph, 0.3))],
                "thigh.R": [(X, 1.2 * br)], "shin.R": [(X, -2.4 * br)], "foot.R": [(X, 1.2 * br)],
                "thigh.L": [(X, 1.2 * br)], "shin.L": [(X, -2.4 * br)], "foot.L": [(X, 1.2 * br)]}
    for fc in bag_of(idle).fcurves:                      # the old mid-loop breath key would fight the new loop
        for kp in [k for k in fc.keyframe_points if 1.5 < k.co.x < IDLE_LOOP[1] - 1.5]:
            fc.keyframe_points.remove(kp)
    frames = list(range(IDLE_LOOP[0], IDLE_LOOP[1], 6)) + [IDLE_LOOP[1] - 1]
    pose_loop(idle, 1, frames, idle_off)
    idle.frame_range = (IDLE_LOOP[0], IDLE_LOOP[1] - 1)
    print("IDLE_LOOP", frames)

    # ---------------------------------------------------------------- Guard: breathing hold, frames 8..56
    guard = bpy.data.actions["Guard"]
    def guard_off(ph):
        br = bob(ph)
        return {"spine": [(X, 1.0 * br)], "chest": [(X, -1.8 * br), (Z, 1.2 * wave(ph))], "head": [(X, 0.8 * wave(ph, 0.1))],
                "upper_arm.R": [(X, 2.5 * wave(ph, 0.12)), (Y, 1.5 * br)], "forearm.R": [(X, -2.5 * wave(ph, 0.22))],
                "hand.R": [(Z, 2.0 * wave(ph, 0.3))],
                "upper_arm.L": [(X, 2.0 * wave(ph, 0.18))], "forearm.L": [(X, -2.0 * wave(ph, 0.28))],
                "thigh.R": [(X, 1.4 * br)], "shin.R": [(X, -2.8 * br)], "foot.R": [(X, 1.4 * br)],
                "thigh.L": [(X, 1.4 * br)], "shin.L": [(X, -2.8 * br)], "foot.L": [(X, 1.4 * br)]}
    # remove the old frozen end key(s) after the hold start, then key the loop
    for fc in bag_of(guard).fcurves:
        for kp in [k for k in fc.keyframe_points if k.co.x > GUARD_HOLD[0] + 0.5]:
            fc.keyframe_points.remove(kp)
    frames = list(range(GUARD_HOLD[0], GUARD_HOLD[1] + 1, 6))
    pose_loop(guard, GUARD_HOLD[0], frames, guard_off)
    guard.frame_range = (1, GUARD_HOLD[1])
    print("GUARD_LOOP", frames)
else:
    guard = bpy.data.actions["Guard"]
    def fp_guard_off(ph):
        return {"upper_arm.R": [(X, 1.8 * wave(ph, 0.1)), (Z, 1.2 * bob(ph))], "forearm.R": [(X, -2.0 * wave(ph, 0.2))],
                "hand.R": [(Y, 1.6 * wave(ph, 0.3))],
                "upper_arm.L": [(X, 1.5 * wave(ph, 0.15))], "forearm.L": [(X, -1.5 * wave(ph, 0.25))]}
    for fc in bag_of(guard).fcurves:
        for kp in [k for k in fc.keyframe_points if k.co.x > GUARD_HOLD[0] + 0.5]:
            fc.keyframe_points.remove(kp)
    frames = list(range(GUARD_HOLD[0], GUARD_HOLD[1] + 1, 6))
    pose_loop(guard, GUARD_HOLD[0], frames, fp_guard_off, plant=False)
    guard.frame_range = (1, GUARD_HOLD[1])
    print("FP_GUARD_LOOP", frames)

assign(bpy.data.actions["Idle"]); sc.frame_set(1)
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("STANCE_SAVED", OUT)
