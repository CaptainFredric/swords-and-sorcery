"""sprint.py -- add the Sprint action to the third-person source, derived from Run (concept action sheet: a long,
low, leaning run with the blade carried back).

  * timing: the Run cycle (21 frames) tightens to 17 frames -- a quicker cadence to go with the faster speed
  * strides: every leg key swings 35 % further from the cycle's average pose
  * torso: leans into the sprint; the head comes up to look ahead
  * arms: the spell arm pumps harder; the sword arm carries the blade back, clear of the legs
  * bounce: the pelvis bob grows 40 %, and each key is re-planted so the lower foot touches the ground exactly
    where Run's did
"""
import sys, math, bpy
from mathutils import Quaternion, Vector

OUT = sys.argv[sys.argv.index("--") + 1]
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm = rig.data
sc = bpy.context.scene
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
CYCLE_SCALE = 16 / 20                     # frames 1..21 -> 1..17
STRIDE_GAIN = {"thigh.L": 1.35, "thigh.R": 1.35, "shin.L": 1.3, "shin.R": 1.3, "foot.L": 1.2, "foot.R": 1.2,
               "upper_arm.L": 1.5, "forearm.L": 1.3}
OFFSETS = {  # constant pose change (armature axes, degrees): lean in, look ahead, carry the sword back
    "spine": [(X, -9.0)], "chest": [(X, -8.0)], "neck": [(X, 5.0)], "head": [(X, 9.0)],
    # sword arm swung back with the blade trailing low behind (concept run silhouette)
    "upper_arm.R": [(X, -22.0), (Y, -8.0)], "forearm.R": [(X, 12.0)], "hand.R": [(X, 28.0)],
    "forearm.L": [(X, 22.0)],
}
BOB_GAIN = 1.4


def bag_of(act):
    return act.layers[0].strips[0].channelbag(act.slots[0])


def groups(act):
    out = {}
    for fc in bag_of(act).fcurves:
        if fc.data_path.endswith("rotation_quaternion"):
            out.setdefault(fc.data_path.split('"')[1], [None] * 4)[fc.array_index] = fc
    return out


def local_axis(bone, axis):
    return (arm.bones[bone].matrix_local.to_3x3().inverted() @ Vector(axis)).normalized()


def assign(act):
    ad = rig.animation_data; ad.action = act
    if getattr(ad, "action_slot", None) is None and act.slots: ad.action_slot = act.slots[0]


def ankle_z(frame):
    sc.frame_set(frame); bpy.context.view_layer.update()
    return min((rig.matrix_world @ rig.pose.bones[b].head).z for b in ("foot.L", "foot.R"))


run = bpy.data.actions["Run"]
old = bpy.data.actions.get("Sprint")
if old: bpy.data.actions.remove(old)
assign(run)
run_frames = sorted({round(k.co.x) for fc in bag_of(run).fcurves for k in fc.keyframe_points})
plant = {f: ankle_z(f) for f in run_frames}

sprint = run.copy(); sprint.name = "Sprint"
sprint.use_fake_user = True
bag = bag_of(sprint)

# 1) tighter cycle
for fc in bag.fcurves:
    for k in fc.keyframe_points:
        for attr in ("co", "handle_left", "handle_right"):
            p = getattr(k, attr); p[0] = 1 + (p[0] - 1) * CYCLE_SCALE
    fc.update()
frames = [round(1 + (f - 1) * CYCLE_SCALE) for f in run_frames]
plant = {round(1 + (f - 1) * CYCLE_SCALE): z for f, z in plant.items()}

# 2) longer strides and harder arm pump: scale each key's rotation away from the cycle's mean
for bone, gain in STRIDE_GAIN.items():
    fcs = groups(sprint).get(bone)
    if not fcs: continue
    n = len(fcs[0].keyframe_points)
    keys = [Quaternion([f.keyframe_points[i].co[1] for f in fcs]) for i in range(n)]
    mean = Quaternion((0, 0, 0, 0))
    for q in keys:
        q = q if q.dot(keys[0]) >= 0 else -q
        mean = Quaternion([a + b for a, b in zip(mean, q)])
    mean.normalize()
    for i in range(n):
        for attr in ("co", "handle_left", "handle_right"):
            q = Quaternion([getattr(f.keyframe_points[i], attr)[1] for f in fcs])
            if q.dot(mean) < 0: q = -q
            d = mean.inverted() @ q
            axis, angle = d.to_axis_angle()
            r = mean @ Quaternion(axis, angle * gain)
            for c, f in enumerate(fcs):
                p = getattr(f.keyframe_points[i], attr); p[1] = r[c]
    for f in fcs: f.update()

# 3) constant lean, gaze and sword carry
for bone, rots in OFFSETS.items():
    fcs = groups(sprint).get(bone)
    if not fcs: continue
    d = Quaternion()
    for axis, deg in rots: d = Quaternion(local_axis(bone, axis), math.radians(deg)) @ d
    for i in range(len(fcs[0].keyframe_points)):
        for attr in ("co", "handle_left", "handle_right"):
            q = Quaternion([getattr(f.keyframe_points[i], attr)[1] for f in fcs]); r = d @ q
            for c, f in enumerate(fcs):
                p = getattr(f.keyframe_points[i], attr); p[1] = r[c]
    for f in fcs: f.update()

# 4) bigger bounce, then re-plant every key on Run's ground contact
loc = [None] * 3
for fc in bag.fcurves:
    if fc.data_path == 'pose.bones["pelvis"].location': loc[fc.array_index] = fc
if all(loc):
    ys = [k.co[1] for k in loc[1].keyframe_points]; mid = sum(ys) / len(ys)
    for k in loc[1].keyframe_points:
        for attr in ("co", "handle_left", "handle_right"):
            p = getattr(k, attr); p[1] = mid + (p[1] - mid) * BOB_GAIN
    loc[1].update()
    assign(sprint)
    for f in frames:
        dz = plant[f] - ankle_z(f)
        for k in loc[1].keyframe_points:
            if abs(k.co.x - f) < 1e-3:
                k.co[1] += dz; k.handle_left[1] += dz; k.handle_right[1] += dz
        loc[1].update()

# keep every quaternion curve in one hemisphere (see stance.py)
for fcs in groups(sprint).values():
    if any(f is None for f in fcs): continue
    for i in range(1, len(fcs[0].keyframe_points)):
        q0 = Quaternion([f.keyframe_points[i - 1].co[1] for f in fcs]); q1 = Quaternion([f.keyframe_points[i].co[1] for f in fcs])
        if q0.dot(q1) < 0:
            for f in fcs:
                k = f.keyframe_points[i]; k.co[1] = -k.co[1]; k.handle_left[1] = -k.handle_left[1]; k.handle_right[1] = -k.handle_right[1]
    for f in fcs: f.update()

sprint.frame_range = (1, frames[-1])
# stash it like the other authored clips (a muted NLA track per action is the export source)
ad = rig.animation_data
for tr in [tr for tr in ad.nla_tracks if tr.name == "Sprint__STASH"]: ad.nla_tracks.remove(tr)
track = ad.nla_tracks.new(); track.name = "Sprint__STASH"
strip = track.strips.new("Sprint", 1, sprint)
if hasattr(strip, "action_slot") and sprint.slots: strip.action_slot = sprint.slots[0]
strip.action_frame_start, strip.action_frame_end = sprint.frame_range
track.mute = True
assign(sprint)
err = max(abs(plant[f] - ankle_z(f)) for f in frames)
assign(bpy.data.actions["Idle"]); sc.frame_set(1)
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("SPRINT frames", frames, "ground error %.4f m" % err, "saved", OUT)
