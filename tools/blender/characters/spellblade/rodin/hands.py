"""The Spellblade's hands, remodelled as articulated plate gauntlets (part of parts.py; fp_arms.py carries them).

Rodin's hands were lumps: the spell hand one frozen cup, and the sword hand a fist sculpted round the guard, beside the
grip rather than round it. The rig had one bone per hand, so no finger could move. Both are cut away at the wrist and
rebuilt, to the concept's weapon sheet:

- every finger is three overlapping ridged steel lames, wrapped well round its sides, over a brown leather glove (it
  shows on the palm side and between them), each lame rigid on a bone of its own
  (`finger_<index|middle|ring|little>_<1|2|3>.<side>` and `thumb_<1|2|3>.<side>`). Each bone's +x turn curls it
  toward the palm;
- the back of the hand is one ridged plate with a raised knuckle guard studded with brass bosses (gadlings), on the
  hand bone, with a padded heel under it;
- a flared, brass-rimmed cuff on the forearm covers the cut, as a gauntlet's cuff covers the vambrace.

The sword hand is built round the sword's real grip (forge.py), where the forearm meets it: the palm against the grip
on the elbow's side, the knuckles over it, the four fingers wrapped round its far side from the guard down, and the
thumb, from the blade's side, locked over them. The spell hand is open and cupped, its fingers splayed a little.
client/game/spellHand.mjs turns the fingers in game.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

FINGERS = ("index", "middle", "ring", "little")
HAND_PARTS = ("hand", "finger", "thumb")          # (bone-name prefixes that make up a hand)

# metres
LAME = {"width": 0.035, "height": 0.04}       # a finger's lames: chunky plate, not a painted glove
THUMB = {"width": 0.038, "height": 0.043}
SPELL = {  # the open spell hand, in its hand bone's frame (y along the hand, palm toward +z, thumb toward -x)
    "palm": (0.12, 0.134, 0.054),            # length, width, height of the back plate
    "lengths": (0.05, 0.036, 0.031),
    "curls": (0.22, 0.3, 0.24),              # radians at each joint: a relaxed cup
    "spread": 0.075,                         # radians between neighbouring fingers
    "scale": {"index": 1.0, "middle": 1.07, "ring": 1.0, "little": 0.85},
    "thumbBase": (-0.05, 0.035, 0.012), "thumbDirection": (-0.72, 0.6, 0.32), "thumbBack": (-0.25, 0.0, -1.0),
    "thumbLengths": (0.044, 0.034, 0.029), "thumbCurls": (0.15, 0.32, 0.26),
}
FIST = {  # the sword hand, in the grip's frame: along the grip (toward the blade), toward the fist from the elbow
    # (u), and toward the back of the hand (w); the grip's axis at u = w = 0
    "ring": 0.047,                           # the finger lames' centreline about the grip (grip radius + half a lame)
    "angles": (74.0, 8.0, -58.0, -122.0),    # degrees in the (u, w) plane: knuckle, then each joint, to the tip
    "pitch": 0.0305,                         # metres between fingers along the grip
    "wrist": (-0.075, 0.016),                # (u, w): the heel of the back plate
    "palmHeight": 0.048,
    "heel": ((-0.072, -0.002), (-0.03, -0.03)),   # the padded heel under the grip
    "thumb": ((-0.045, -0.03), (-0.008, -0.066), (0.032, -0.062), (0.056, -0.036)),
}
OVERLAP = 0.22                                   # each lame reaches back over the one before by this share of its length
CUFF = {"length": 0.065, "flare": 1.1, "sides": 10, "cover": 0.012}
CUT = 0.062                                      # the sword hand: forearm faces within this of the grip go (metres, u)


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def rot(axis, angle: float) -> np.ndarray:
    x, y, z = unit(axis)
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    return np.array([[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
                     [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
                     [t * x * z - s * y, t * y * z + s * x, t * z * z + c]])


class Builder:
    """Faces added to a part with bmesh, each vertex wholly on one bone, each face one atlas texel, flat-shaded."""

    def __init__(self, obj, palette: dict):
        self.obj, self.palette = obj, palette
        me = obj.data
        self.old_loops = len(me.loops)
        self.old_normals = np.empty(self.old_loops * 3)
        me.corner_normals.foreach_get("vector", self.old_normals)
        self.bm = bmesh.new()
        self.bm.from_mesh(me)
        self.uv = self.bm.loops.layers.uv.active
        self.deform = self.bm.verts.layers.deform.verify()
        self.added = []

    def vert(self, point, bone: str):
        v = self.bm.verts.new(tuple(float(c) for c in point))
        group = self.obj.vertex_groups.get(bone) or self.obj.vertex_groups.new(name=bone)
        v[self.deform][group.index] = 1.0
        return v

    def face(self, verts, colour: str):
        f = self.bm.faces.new(verts)
        for loop in f.loops:
            loop[self.uv].uv = self.palette[colour]
        self.added.append(f)

    def finish(self) -> int:
        bmesh.ops.recalc_face_normals(self.bm, faces=self.added)
        self.bm.to_mesh(self.obj.data)
        self.bm.free()
        me = self.obj.data
        normals = np.empty(len(me.loops) * 3)
        me.corner_normals.foreach_get("vector", normals)
        normals = normals.reshape(-1, 3)
        normals[:self.old_loops] = self.old_normals.reshape(-1, 3)
        for polygon in me.polygons:
            if polygon.loop_start >= self.old_loops:
                normals[polygon.loop_start:polygon.loop_start + polygon.loop_total] = polygon.normal[:]
        me.normals_split_custom_set([tuple(n) for n in normals])
        me.update()
        return len(self.added)


def lame(b: Builder, start, direction, up, length: float, width: float, height: float, bone: str,
         tip: bool = False, back: float = 0.0, taper: float = 0.92, glove: bool = False):
    """One plate: a ridged section along `direction` (steel toward `up` and down its sides, glove below), from `back` behind `start`
    to `length` beyond it, narrowing by `taper`; a chamfered point at a fingertip. `glove`: all glove (a padded heel)."""
    d = unit(direction)
    u = unit(np.asarray(up, float) - d * (np.asarray(up, float) @ d))
    s = np.cross(d, u)
    # (a forged plate: a raised ridge down its back, its two faces lit differently, its sides wrapping right round
    # the finger's lower corners, so from the palm (where first person sees the magic hand at rest, palm up to show its
    # rune) each finger is plate framing a narrow strip of the glove's leather; a padded heel is all glove)
    section = [(0.52, 0.05), (0.36, 0.42), (0.0, 0.6), (-0.36, 0.42), (-0.52, 0.05), (-0.46, -0.36), (-0.22, -0.5),
               (0.22, -0.5), (0.46, -0.36)]
    tones = ["glove"] * len(section) if glove else \
        ["steel", "steelLight", "steel", "steelDark", "steelDark", "steelDark", "glove", "steelDark", "steel"]
    n = len(section)
    start = np.asarray(start, float)

    def ring(at, scale):
        return [b.vert(start + d * at + s * (x * width * scale) + u * (y * height * scale), bone) for x, y in section]
    near, far = ring(-back, 1.0), ring(length, taper)
    for k in range(n):
        j = (k + 1) % n
        b.face([near[k], near[j], far[j], far[k]], tones[k])
    b.face(list(reversed(near)), "glove")
    if tip:
        point = b.vert(start + d * (length + height * 0.32) + u * (height * 0.1), bone)
        for k in range(n):
            b.face([far[k], far[(k + 1) % n], point], tones[k])
    else:
        b.face(far, "steelDark")


def stud(b: Builder, centre, up, toward, size: float, bone: str, tone: str = "brassLight"):
    """A square pyramid boss (a gadling) standing `size` high on `up` at `centre`, its base turned to `toward`."""
    u = unit(up)
    x = unit(np.asarray(toward, float) - u * (np.asarray(toward, float) @ u))
    y = np.cross(u, x)
    c = np.asarray(centre, float)
    base = [b.vert(c + (x * dx + y * dy) * size * 0.55, bone) for dx, dy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    apex = b.vert(c + u * size, bone)
    for k in range(4):
        b.face([base[k], base[(k + 1) % 4], apex], tone if k % 2 else "brass")
    b.face(list(reversed(base)), "brassDark")


def finger(b: Builder, name: str, side: str, points, ups, width: float, height: float, parent: str) -> list:
    """A finger along `points` (four: knuckle, two joints, tip), each lame's back toward its `ups`; returns its bones."""
    bones = []
    for k in range(3):
        head, tail = np.asarray(points[k], float), np.asarray(points[k + 1], float)
        length = float(np.linalg.norm(tail - head))
        bone = f"{name}_{k + 1}.{side}"
        lame(b, head, tail - head, ups[k], length, width * (1 - 0.04 * k), height * (1 - 0.05 * k), bone,
             tip=k == 2, back=OVERLAP * length)
        bones.append((bone, head, tail, ups[k], parent))
        parent = bone
    return bones


def curled(knuckle, direction, up, lengths, curls):
    """Points and backs along a finger curling toward the palm (away from `up`) by `curls` at its joints."""
    d, u = unit(direction), unit(up)
    axis = np.cross(u, d)
    point, points, ups = np.asarray(knuckle, float), [np.asarray(knuckle, float)], []
    for curl, length in zip(curls, lengths):
        r = rot(axis, curl)
        d, u = r @ d, r @ u
        point = point + d * length
        points.append(point)
        ups.append(u)
    return points, ups


def spell_hand(b: Builder, rig, side: str) -> list:
    m = np.array(rig.matrix_world @ rig.data.bones[f"hand.{side}"].matrix_local)
    R, o = m[:3, :3], m[:3, 3]
    world = lambda p: R @ np.asarray(p, float) + o        # noqa: E731
    vec = lambda v: unit(R @ np.asarray(v, float))        # noqa: E731
    along, back, across = vec((0, 1, 0)), vec((0, 0, -1)), vec((-1, 0, 0))   # across: from little toward index
    hand = f"hand.{side}"
    length, width, height = SPELL["palm"]
    lame(b, o, along, back, length, width, height, hand, back=0.014, taper=1.0)
    lame(b, o + along * (length - 0.018) + back * (height * 0.2), along, back, 0.03, width * 1.04, height * 0.7, hand)
    lame(b, o + along * 0.01 - back * (height * 0.35), along, back, length * 0.7, width * 0.9, height * 0.5, hand,
         glove=True)
    bones = []
    knuckles = o + along * (length - 0.006)
    for i in range(4):
        stud(b, o + along * (length - 0.003) + across * ((1.5 - i) * (width / 4)) + back * (height * 0.48), back, along,
             0.014, hand)
    for i, name in enumerate(FINGERS):
        offset = (1.5 - i) * (width / 4)
        d = rot(back, -SPELL["spread"] * (1.5 - i)) @ along
        scale = SPELL["scale"][name]
        points, ups = curled(knuckles + across * offset, d, back, [l * scale for l in SPELL["lengths"]], SPELL["curls"])
        bones += finger(b, f"finger_{name}", side, points, ups, LAME["width"], LAME["height"], hand)
    points, ups = curled(world(SPELL["thumbBase"]), vec(SPELL["thumbDirection"]), vec(SPELL["thumbBack"]),
                         SPELL["thumbLengths"], SPELL["thumbCurls"])
    bones += finger(b, "thumb", side, points, ups, THUMB["width"], THUMB["height"], hand)
    return bones


def grip_frame(sword, swatch) -> dict:
    """The sword's grip: its centre and axis (toward the blade), and the span of its leather, in world space."""
    me = sword.data
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)

    def points(name):
        target = np.array(swatch(name))
        return np.array([tuple(sword.matrix_world @ me.vertices[v].co) for p in me.polygons
                         if np.allclose(uv[p.loop_start], target, atol=1e-4) for v in p.vertices])
    leather = points("leather")
    centre = leather.mean(0)
    axis = np.linalg.svd(leather - centre)[2][0]
    if (points("steel").mean(0) - centre) @ axis < 0:
        axis = -axis
    along = (leather - centre) @ axis
    return {"centre": centre, "axis": axis, "span": (float(along.min()), float(along.max()))}


def sword_hand(b: Builder, rig, side: str, grip: dict) -> tuple[list, dict]:
    a = unit(grip["axis"])
    elbow = np.array(rig.matrix_world @ rig.data.bones[f"forearm.{side}"].head_local)
    wrist = np.array(rig.matrix_world @ rig.data.bones[f"forearm.{side}"].tail_local)
    fd = unit(wrist - elbow)
    F = unit(fd - a * (fd @ a))                    # toward the fist from the elbow's side
    W = unit(np.cross(F, a))                       # the back of a right hand
    if side == "L":
        W = -W
    c = np.asarray(grip["centre"], float)
    at = lambda along, u, w: c + a * along + F * u + W * w    # noqa: E731
    hand = f"hand.{side}"
    span = grip["span"]
    top = span[1] - 0.004                          # the index finger's edge, just below the guard's collar
    alongs = [top - FIST["pitch"] * (i + 0.5) for i in range(4)]
    middle = sum(alongs) / 4
    width = FIST["pitch"] * 4 + 0.006
    # the back of the hand, from the wrist over the grip to the knuckles, and its knuckle guard
    knuckle_u, knuckle_w = FIST["ring"] * math.cos(math.radians(FIST["angles"][0])), \
        FIST["ring"] * math.sin(math.radians(FIST["angles"][0]))
    heel = at(middle, *FIST["wrist"])
    knuckle = at(middle, knuckle_u, knuckle_w)
    d = unit(knuckle - heel)
    up = unit(np.cross(d, a)) if np.cross(d, a) @ W > 0 else -unit(np.cross(d, a))
    length = float(np.linalg.norm(knuckle - heel))
    lame(b, heel, d, up, length + 0.01, width * 0.86, FIST["palmHeight"], hand, back=0.012, taper=1.16)
    lame(b, heel + d * (length - 0.012) + up * (FIST["palmHeight"] * 0.2), d, up, 0.028, width * 1.03,
         FIST["palmHeight"] * 0.7, hand)
    for i in range(4):
        stud(b, at(alongs[i], knuckle_u, knuckle_w) + up * (FIST["palmHeight"] * 0.5), up, d, 0.013, hand)
    h0, h1 = (at(middle, *p) for p in FIST["heel"])
    lame(b, h0, h1 - h0, -F, float(np.linalg.norm(h1 - h0)), width * 0.95, 0.036, hand, glove=True)
    bones = []
    for i, name in enumerate(FINGERS):
        points, ups = [], []
        for k, angle in enumerate(FIST["angles"]):
            r = math.radians(angle)
            points.append(at(alongs[i], FIST["ring"] * math.cos(r), FIST["ring"] * math.sin(r)))
        for k in range(3):
            mid = math.radians((FIST["angles"][k] + FIST["angles"][k + 1]) / 2)
            ups.append(F * math.cos(mid) + W * math.sin(mid))
        bones += finger(b, f"finger_{name}", side, points, ups, LAME["width"], LAME["height"], hand)
    thumb_along = alongs[0] + 0.006
    points = [at(thumb_along, *p) for p in FIST["thumb"]]
    ups = []
    for k in range(3):
        mid = (np.array(FIST["thumb"][k]) + np.array(FIST["thumb"][k + 1])) / 2
        ups.append(unit(F * mid[0] + W * mid[1]))
    bones += finger(b, "thumb", side, points, ups, THUMB["width"], THUMB["height"], hand)
    return bones, {"a": a, "F": F, "W": W, "centre": c}


def cuff(b: Builder, centre, toward_elbow, radius: float, side: str):
    """A flared cuff from just over the cut back along the vambrace, its far rim brass, riding the forearm."""
    d = unit(toward_elbow)
    s = unit(np.cross(d, (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)))
    t = np.cross(d, s)
    bone = f"forearm.{side}"
    n = CUFF["sides"]
    angles = [2 * math.pi * (k + 0.5) / n for k in range(n)]
    centre = np.asarray(centre, float)

    def ring(at, r):
        return [b.vert(centre + d * at + (s * math.cos(q) + t * math.sin(q)) * r, bone) for q in angles]
    rings = [ring(-CUFF["cover"], radius * 0.96), ring(CUFF["length"] * 0.78, radius * CUFF["flare"]),
             ring(CUFF["length"], radius * CUFF["flare"] * 1.05)]
    for lower, upper, tone in ((rings[0], rings[1], "steel"), (rings[1], rings[2], "brass")):
        for k in range(n):
            j = (k + 1) % n
            b.face([lower[k], lower[j], upper[j], upper[k]],
                   tone if tone == "brass" else ("steel" if k % 2 else "steelLight"))


def _hand_share(obj, side: str) -> np.ndarray:
    names = {g.index: g.name for g in obj.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if names[g.group].endswith(f".{side}")
                         and names[g.group].split(".")[0].split("_")[0] in HAND_PARTS) for v in obj.data.vertices])


def cut(obj, doomed_vertex: np.ndarray) -> int:
    """Delete every face most of whose corners are doomed (and what is left loose), keeping the rest's normals."""
    me = obj.data
    normals = np.empty(len(me.loops) * 3)
    me.corner_normals.foreach_get("vector", normals)
    normals = normals.reshape(-1, 3)
    keep_faces = [p.index for p in me.polygons if doomed_vertex[list(p.vertices)].mean() < 0.5]
    kept_normals = np.concatenate([normals[me.polygons[i].loop_start:me.polygons[i].loop_start
                                           + me.polygons[i].loop_total] for i in keep_faces])
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    keep = set(keep_faces)
    removed = [f for f in bm.faces if f.index not in keep]
    bmesh.ops.delete(bm, geom=removed, context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    me.normals_split_custom_set([tuple(n) for n in kept_normals])
    me.update()
    return len(removed)


def _ring_near(obj, centre, axis, behind: float, ahead: float, bone: str, share: float = 60) -> tuple[np.ndarray, float]:
    """The forearm's own surface just behind the cut: its middle (moved onto the cut's plane) and how far it lies from
    it (p60: past the vambrace's own plates), to seat and size the cuff."""
    names = {g.index: g.name for g in obj.vertex_groups}
    pts = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices
                    if any(names[g.group] == bone and g.weight > 0.5 for g in v.groups)])
    along = (pts - centre) @ axis
    near = pts[(along > behind) & (along < ahead)]
    middle = near.mean(0)
    middle = middle - axis * ((middle - centre) @ axis)
    rel = near - middle
    radial = np.linalg.norm(rel - np.outer(rel @ axis, axis), axis=1)
    return middle, float(np.percentile(radial, share))


def make_bones(rig, bones) -> None:
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    edit = rig.data.edit_bones
    for name, head, tail, up, parent in bones:
        bone = edit.new(name)
        bone.head, bone.tail = Vector(tuple(head)), Vector(tuple(tail))
        bone.align_roll(Vector(tuple(-unit(up))))          # (local z toward the palm: +x closes)
        bone.parent = edit[parent]
        bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")


def build_hands(rig, gauntlets: dict, sword, palette: dict, swatch) -> dict:
    """Cut away Rodin's hands and build both gauntlets (see the module notes)."""
    report = {}
    bones = []
    # the spell hand: everything Rodin had on the hand goes; the new hand and its cuff from the wrist
    left = gauntlets["L"]
    report["L"] = {"cutFaces": cut(left, _hand_share(left, "L") >= 0.5)}
    b = Builder(left, palette)
    bones += spell_hand(b, rig, "L")
    wrist = np.array(rig.matrix_world @ rig.data.bones["forearm.L"].tail_local)
    elbow = np.array(rig.matrix_world @ rig.data.bones["forearm.L"].head_local)
    toward = unit(elbow - wrist)
    seat, radius = _ring_near(left, wrist, toward, 0.0, 0.06, "forearm.L")
    cuff(b, seat, toward, radius + 0.006, "L")
    report["L"]["faces"] = b.finish()
    report["L"]["cuffRadius"] = round(radius, 3)
    # the sword hand: Rodin's hand, and the forearm's last few centimetres inside the new fist, go
    right = gauntlets["R"]
    grip = grip_frame(sword, swatch)
    a = unit(grip["axis"])
    elbow = np.array(rig.matrix_world @ rig.data.bones["forearm.R"].head_local)
    co = np.array([tuple(right.matrix_world @ v.co) for v in right.data.vertices])
    fd = unit(np.array(rig.matrix_world @ rig.data.bones["forearm.R"].tail_local) - elbow)
    F = unit(fd - a * (fd @ a))
    u = (co - grip["centre"]) @ F
    doomed = (_hand_share(right, "R") >= 0.5) | (u > -CUT)
    report["R"] = {"cutFaces": cut(right, doomed)}
    b = Builder(right, palette)
    fist, frame = sword_hand(b, rig, "R", grip)
    bones += fist
    toward = unit(elbow - (grip["centre"] - F * CUT))
    end = grip["centre"] - F * CUT
    # (the sword arm's vambrace carries proud plates near the wrist: its cuff is sized to the arm itself, not them,
    # or seen from behind it hides the fist)
    seat, radius = _ring_near(right, end, toward, 0.0, 0.06, "forearm.R", share=35)
    cuff(b, seat, toward, radius + 0.004, "R")
    report["R"]["faces"] = b.finish()
    report["R"]["cuffRadius"] = round(radius, 3)
    make_bones(rig, bones)
    report["bones"] = len(bones)
    return report
