"""followthrough.py -- run on the built third-person kit (kit.blend): keep the sword out of the legs and the floor in
the slash follow-through, without making the motion any faster.

The slash actions key the contact frame, one follow-through key and the end frame; interpolating to the end pose
swings the blade low across the front of the legs and below the floor. This adds a single offset key (or two) on
the right arm inside the follow-through and lets the action's own curves interpolate it, so the path bends smoothly
around the legs. It searches the bone and axis (swing the upper arm out, raise it forward, pitch the wrist), the
key frame(s) and the angle, and keeps the smallest correction that
  * leaves no sword/body or sword/floor contact in the window (or the fewest), and
  * never moves the blade tip faster per frame than the original motion does (within 15 %).
Contact frames, end frames and every other bone are untouched.
"""
import sys, math, bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

OUT = sys.argv[sys.argv.index("--") + 1]
WINDOWS = {"Slash_1": (13, 23), "Slash_2": (12, 23), "Slash_3": (12, 20)}     # (contact, end) frames
FLOOR = 0.0          # the blade may touch the floor, not pass through it
SPEED_SLACK = 1.15
rig = bpy.data.objects["SpellbladeRig"]
col = bpy.data.collections["SpellbladeExport"]
SWORD = bpy.data.objects["HeroSword"]
BODY = [o for o in col.all_objects if o.type == "MESH" and o.name not in ("HeroSword", "Gauntlet.R")]
sc = bpy.context.scene
W2A = rig.matrix_world.inverted().to_3x3()


def mesh_world(o, dg):
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    V = [ev.matrix_world @ v.co for v in me.vertices]; F = [list(p.vertices) for p in me.polygons]
    ev.to_mesh_clear(); return V, F


def body_tree(dg):
    V, F = [], []
    for o in BODY:
        v, f = mesh_world(o, dg); b = len(V); V += v; F += [[b + i for i in p] for p in f]
    return BVHTree.FromPolygons(V, F)


def evaluate(frames):
    """per frame: (contact?, blade tip position) with the current action."""
    out = {}
    for f in frames:
        sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        V, F = mesh_world(SWORD, dg)
        hand = rig.matrix_world @ rig.pose.bones["hand.R"].head
        tip = max(V, key=lambda p: (p - hand).length)
        hit = bool(BVHTree.FromPolygons(V, F).overlap(body_tree(dg))) or min(p.z for p in V) < FLOOR
        out[f] = (hit, tip.copy())
    return out


def max_step(ev, frames):
    return max((ev[b][1] - ev[a][1]).length for a, b in zip(frames, frames[1:]))


def assign(action):
    ad = rig.animation_data; ad.action = action
    if getattr(ad, "action_slot", None) is None and getattr(action, "slots", None):
        ad.action_slot = action.slots[0]


AXES = {  # rotations in the character's frame (+X its right, +Y its front, +Z up), through the joint
    "swing the arm out": ("upper_arm.R", Vector((0, 1, 0)), -1.0),
    "raise the arm forward": ("upper_arm.R", Vector((1, 0, 0)), 1.0),
    "swing the arm back": ("upper_arm.R", Vector((1, 0, 0)), -1.0),
    "turn the arm outward": ("upper_arm.R", Vector((0, 0, 1)), 1.0),
    "tip the blade forward": ("hand.R", Vector((1, 0, 0)), 1.0),
}


def key_offset(action, bone, axis_world, sign, frame, deg):
    """insert a key on `bone` at `frame`: its currently evaluated pose rotated by sign*deg about axis_world
    through the joint."""
    assign(action); sc.frame_set(frame); bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    axis = (W2A @ axis_world).normalized()
    R = Matrix.Translation(pb.head) @ Quaternion(axis, math.radians(sign * deg)).to_matrix().to_4x4() @ Matrix.Translation(-pb.head)
    pb.matrix = R @ pb.matrix; bpy.context.view_layer.update()
    pb.keyframe_insert("rotation_quaternion", frame=frame, group=bone)


report = {}
JOBS = [(name, contact, end, "follow-through") for name, (contact, end) in WINDOWS.items()] + \
       [(name, 1, contact, "windup") for name, (contact, end) in WINDOWS.items()]
for name, contact, end, phase in JOBS:
    orig = bpy.data.actions[name]; assign(orig)
    frames = list(range(contact, end + 1))
    ev0 = evaluate(frames); hits0 = sum(h for h, _ in ev0.values()); step0 = max_step(ev0, frames)
    print("FT", name, phase, "original contacts", hits0, "max tip step %.2f m" % step0)
    if hits0 == 0:
        report[(name, phase)] = "clear"; continue
    inner = frames[1:-1]
    bad_frames = [f for f in inner if ev0[f][0]]
    if not bad_frames:                     # only the contact/end frames touch: those poses are not edited here
        print("FT", name, phase, "contacts only on fixed frames; left as authored"); report[(name, phase)] = "fixed-frames"; continue
    mid = int(round(0.5 * (min(bad_frames) + max(bad_frames))))
    key_sets = sorted({(mid,), (mid - 1,), (mid + 1,), (min(bad_frames), max(bad_frames)), (mid - 1, mid + 1)}, key=len)
    key_sets = [ks for ks in key_sets if all(contact < k < end for k in ks)]
    best = None
    for label, (bone, axis_world, sign) in AXES.items():
        for ks in key_sets:
            for deg in range(6, 55, 6):
                trial = orig.copy()
                for k in ks: key_offset(trial, bone, axis_world, sign, k, deg)
                assign(trial); ev = evaluate(frames)
                hits = sum(h for h, _ in ev.values()); step = max_step(ev, frames)
                ok_speed = step <= step0 * SPEED_SLACK
                score = (hits, 0 if ok_speed else 1, deg * len(ks))
                if ok_speed and (best is None or score < best[0]):
                    best = (score, label, ks, deg, step)
                bpy.data.actions.remove(trial)
                if hits == 0 and ok_speed: break          # smallest angle for this bone/keys found
    assign(orig)
    if best is None or best[0][0] >= hits0:
        print("FT", name, phase, "no smooth improvement; left as authored"); report[(name, phase)] = "unchanged"; continue
    (hits, _, _), label, ks, deg, step = best
    for k in ks:
        bone, axis_world, sign = AXES[label]
        key_offset(orig, bone, axis_world, sign, k, deg)
    assign(orig)
    left = [f for f, (h, _) in evaluate(frames).items() if h]
    print("FT", name, phase, "->", label, "keys", ks, "%d deg" % deg, "contacts %d -> %d" % (hits0, hits), "max tip step %.2f -> %.2f m" % (step0, step),
          "remaining", left)
    report[(name, phase)] = (label, ks, deg, hits0, hits)

assign(bpy.data.actions["Idle"]); sc.frame_set(1)
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("FOLLOWTHROUGH_SAVED", OUT, report)
