"""Split the fitted Rodin body into the named parts the game relies on (stage 2 of build_source.py).

The runtime and the validators find parts by name: HeroSword (the sword's finish, its stowed copy on the ballista),
TabardFront and TabardBack (cloth dye, the back banner's emblem), and the helmet, plate and boot pieces (hidden in a
cockpit, where only the gauntlets stay in view). Each face goes to one part:

- HeroSword: the sword alone. Rodin fused the fist onto the guard with a stub of leather grip; those stay with the
  gauntlet. Rodin's own blade (a broad flat slab) is then replaced by the forged sword (forge.py) on the same grip
  axis, guard, reach and flat: blade, guard, gem, grip and pommel, so stowed, dropped or cut it is a whole sword.
- TabardBack: the cape, the one surface that hangs free of the body below the shoulders (found by cutting the mesh at
  CAPE_CUT and keeping the cloth component behind the body).
- TabardFront: the front tabard, found the same way below the belt (TABARD_CUT).
- The helmet: everything above HELMET_CUT, and the visor and rim below it inside the helmet's footprint. Visor (its
  glowing glass, from Rodin's emissive map), Crest (the red plume), HelmetJaw (the face guard below the eyes) and
  HelmetShell (the rest).
- Every other face by the bone that carries most of it: Breastplate (pelvis to neck), Pauldron (clavicle), Gauntlet
  (upper arm to hand), Greave (thigh, shin), Boot (foot).

The armour is made rigid (rigid.py): each plate rides the bone that carries it, bending only in a band at each joint;
each pauldron is one plate on a bone of its own that follows its arm part of the way. The helmet is wholly the head's
to its very edge (Rodin had its lower half on the chest, so a turned head sheared the visor and dragged the collar): it
turns over the collar on its own, and a dark gorget under it (add_neck) fills whatever opens between them. The cape and tabard move onto
the tabard chains that the runtime's spring cloth drives (Rodin had the cape on the chest, so a lean swung it out like
a plank), and the cape's chain hangs from the chest, where its top is. Split edges keep one set of weights and Rodin's
own normals, so no seam opens.
"""
from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from tools.blender.characters.spellblade.rodin.hands import build_hands
from tools.blender.characters.spellblade.rodin.forge import check_region_free, forge, swatch_uv
from tools.blender.characters.spellblade.rodin.rigid import (HELMET_PARTS, add_cop_bones, add_pauldron_bones, body_off_head,
                                                             pauldron_weights, share_cops)
from tools.blender.characters.spellblade.rodin.segments import Mesh, free_pauldrons

ARCHIVE_EMISSIVE = "rodin-spellblade-emissive.png"
CAPE_CUT = 1.35          # below this the cape hangs free of the body
TABARD_CUT = 1.0         # below this the front tabard hangs free of the belt
HELMET_CUT = 1.63        # above this the helmet is its own shell
HELMET_FLOOR = 1.555     # its visor and rim reach down to here at the front
HELMET_REACH = (0.18, -0.17)   # its footprint: |x| below the first, y above the second
CREST_FLOOR = 1.75
JAW_TOP = 1.66
LEATHER = 0.2            # mean texel brightness below which a face near the guard is leather, not brass or steel
GRIP_ZONE = 0.065        # metres from the blade's centreline: Rodin's leather grip, fused into the fist

BODY_PARTS = {"pelvis": "Breastplate", "spine": "Breastplate", "chest": "Breastplate", "neck": "Breastplate",
              "head": "HelmetShell"}
for _s in "LR":
    BODY_PARTS.update({f"clavicle.{_s}": f"Pauldron.{_s}", f"upper_arm.{_s}": f"Gauntlet.{_s}",
                       f"forearm.{_s}": f"Gauntlet.{_s}", f"hand.{_s}": f"Gauntlet.{_s}",
                       f"thigh.{_s}": f"Greave.{_s}", f"shin.{_s}": f"Greave.{_s}", f"foot.{_s}": f"Boot.{_s}"})
PART_ORDER = ("HeroSword", "TabardBack", "TabardFront", "Visor", "Crest", "HelmetJaw", "HelmetShell",
              "Pauldron.L", "Pauldron.R", "Gauntlet.L", "Gauntlet.R", "Greave.L", "Greave.R", "Boot.L", "Boot.R",
              "Breastplate")


def smoothstep(edge0: float, edge1: float, x):
    t = np.clip((np.asarray(x, dtype=float) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _image_pixels(image: bpy.types.Image) -> np.ndarray:
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)


def _sample(pixels: np.ndarray, uv: np.ndarray) -> np.ndarray:
    """Nearest texel at Blender UVs (origin bottom left, as the pixel rows are stored)."""
    height, width = pixels.shape[:2]
    x = np.clip((uv[:, 0] % 1.0 * width).astype(int), 0, width - 1)
    y = np.clip((uv[:, 1] % 1.0 * height).astype(int), 0, height - 1)
    return pixels[y, x]


class Faces:
    """Per-face geometry, colour and weights of the fitted body, and its welded face adjacency."""

    def __init__(self, mesh: bpy.types.Object, posed: np.ndarray, emissive: np.ndarray):
        me = mesh.data
        self.co = np.empty((len(me.vertices), 3))
        me.vertices.foreach_get("co", self.co.ravel())
        polys = me.polygons
        if any(p.loop_total != 3 for p in polys):
            raise ValueError("Rodin's body is expected to be triangles")
        self.loops = np.arange(len(me.loops)).reshape(-1, 3)
        loop_vertex = np.empty(len(me.loops), dtype=int)
        me.loops.foreach_get("vertex_index", loop_vertex)
        self.verts = loop_vertex.reshape(-1, 3)
        uv = np.empty(len(me.loops) * 2)
        me.uv_layers.active.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)[self.loops]                       # face, corner, uv
        self.centre = self.co[self.verts].mean(1)
        diffuse = _image_pixels(next(n.image for n in me.materials[0].node_tree.nodes
                                     if n.type == "TEX_IMAGE" and "diffuse" in n.image.name))
        points = [uv.mean(1)] + [(uv.mean(1) * 2 + uv[:, k]) / 3 for k in range(3)]
        self.colour = np.mean([_sample(diffuse, p)[:, :3] for p in points], axis=0)
        self.glow = np.max([_sample(emissive, p)[:, :3].max(1) for p in points], axis=0)
        r, g, b = self.colour.T
        self.red = (r / np.maximum(g, 1e-3) > 1.6) & (r > 0.25)
        # weld by Rodin's original positions (its file splits vertices along seams and creases)
        _, weld = np.unique(np.round(posed / 1e-6).astype(np.int64), axis=0, return_inverse=True)
        welded = weld.ravel()[self.verts]
        by_edge = defaultdict(list)
        for face, (a, b_, c) in enumerate(welded):
            for u, v in ((a, b_), (b_, c), (c, a)):
                by_edge[(min(u, v), max(u, v))].append(face)
        self.adjacent = [[] for _ in range(len(welded))]
        for faces in by_edge.values():
            for i in faces:
                self.adjacent[i].extend(j for j in faces if j != i)

    def components(self, allowed: np.ndarray, seeds: np.ndarray) -> list[np.ndarray]:
        seen = np.zeros(len(allowed), dtype=bool)
        found = []
        for seed in np.where(seeds & allowed)[0]:
            if seen[seed]:
                continue
            stack, members = [seed], []
            seen[seed] = True
            while stack:
                face = stack.pop()
                members.append(face)
                for other in self.adjacent[face]:
                    if allowed[other] and not seen[other]:
                        seen[other] = True
                        stack.append(other)
            found.append(np.array(members))
        return sorted(found, key=len, reverse=True)


def _cloth_component(faces: Faces, cut: float, seeds: np.ndarray, behind: bool) -> np.ndarray:
    """The cloth hanging free below `cut`: the red component that is not the body (the body is the largest)."""
    found = faces.components(faces.centre[:, 2] < cut, seeds)
    for members in found[1:]:
        y = faces.centre[members, 1].mean()
        if len(members) > 200 and faces.red[members].mean() > 0.5 and ((y < 0) if behind else (y > 0)):
            return members
    raise ValueError(f"no free-hanging cloth found below z {cut}")


def _chain_weights(z, top: float, joint: float, bones: tuple[str, str, str]) -> list[dict[str, float]]:
    """Cloth weights down a two-bone chain: the anchor bone above `top`, blending onto the first cloth bone just below
    it, and onto the second around `joint`."""
    anchor, first, second = bones
    attach = smoothstep(top - 0.10, top + 0.02, z)
    lower = 1.0 - smoothstep(joint - 0.10, joint + 0.10, z)
    out = []
    for a, l in zip(attach, lower):
        w = {anchor: a, first: (1 - a) * (1 - l), second: (1 - a) * l}
        out.append({k: v for k, v in w.items() if v > 1e-4})
    return out


def _place_chain(rig, mesh_co: np.ndarray, members: np.ndarray, names: tuple[str, str], top: float, joint: float,
                 hem: float) -> None:
    """Move a cloth chain's heads onto the cloth's own centre line, keeping the kit's rest orientations."""
    def centre_at(z):
        near = mesh_co[members][np.abs(mesh_co[members, 2] - z) < 0.04]
        return Vector((float(near[:, 0].mean()), float(near[:, 1].mean()), z))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    first, second = (rig.data.edit_bones[n] for n in names)
    for bone, start, end in ((first, top, joint), (second, joint, hem)):
        head = centre_at(start) if bone is first else first.tail.copy()
        direction = (bone.tail - bone.head).normalized()
        matrix = bone.matrix.copy()
        matrix.translation = head
        bone.matrix = matrix
        bone.length = abs((end - head.z) / direction.z)
    bpy.ops.object.mode_set(mode="OBJECT")


def hang_from(rig: bpy.types.Object, name: str, parent: str) -> int:
    """Re-parent a bone so its head rides `parent`, keeping its turn in the world at every frame of every action that
    keys it (re-keyed on each frame and on its own key times). Returns the keys written."""
    bones = rig.data.bones
    path = f'pose.bones["{name}"]'
    scene = bpy.context.scene
    saved = rig.animation_data.action, scene.frame_current
    samples = {}
    for action in bpy.data.actions:
        own = [fc for fc in action.fcurves if fc.data_path.startswith(path)]
        if not own:
            continue
        if any(fc.data_path not in (f"{path}.rotation_quaternion", f"{path}.location") for fc in own):
            raise ValueError(f"{action.name} keys {name} other than by quaternion and location")
        start, end = action.frame_range
        times = set(np.arange(start, end + 1e-6, 1.0)) | {k.co[0] for fc in own for k in fc.keyframe_points}
        rig.animation_data.action = action
        rows = []
        for time in sorted(times):
            scene.frame_set(int(np.floor(time)), subframe=float(time - np.floor(time)))
            rows.append((float(time), rig.pose.bones[name].matrix.copy(), rig.pose.bones[parent].matrix.copy()))
        samples[action] = rows
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    edit = rig.data.edit_bones[name]
    edit.use_connect = False
    edit.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    rest = bones[parent].matrix_local.inverted() @ bones[name].matrix_local
    written = 0
    for action, rows in samples.items():
        for fc in [fc for fc in action.fcurves if fc.data_path.startswith(path)]:
            action.fcurves.remove(fc)
        curves = [action.fcurves.new(f"{path}.rotation_quaternion", index=i, action_group=name) for i in range(4)]
        previous = None
        for time, world, carrier in rows:
            turn = ((carrier @ rest).inverted() @ world).to_quaternion()
            if previous is not None and previous.dot(turn) < 0:
                turn = -turn
            previous = turn
            for i, curve in enumerate(curves):
                key = curve.keyframe_points.insert(time, turn[i], options={"FAST"})
                key.interpolation = "LINEAR"
            written += 1
        for curve in curves:
            curve.update()
    rig.pose.bones[name].location = (0.0, 0.0, 0.0)
    rig.animation_data.action = saved[0]
    scene.frame_set(saved[1])
    return written


def sword_landmarks(faces: Faces, posed: np.ndarray, is_sword: np.ndarray, axis: np.ndarray,
                    origin: np.ndarray) -> dict:
    """Along the blade's centreline from the grip: where the crossguard begins (nothing below it is sword), where it
    crosses the centreline (Rodin's leather grip runs from there into the fist) and where the rebuilt grip ends."""
    rel = posed - origin
    along = rel @ axis
    off = np.linalg.norm(rel - np.outer(along, axis), axis=1)
    sword_along, sword_off = along[is_sword], off[is_sword]
    start = sword_along.min()
    slabs = np.arange(start, start + 0.30, 0.01)
    widths = np.array([np.percentile(sword_off[(sword_along >= a) & (sword_along < a + 0.01)], 90)
                       if ((sword_along >= a) & (sword_along < a + 0.01)).sum() > 5 else 0.0 for a in slabs])
    widest = widths.max()
    guard = float(slabs[np.argmax(widths > 0.7 * widest)])           # the crossguard's first slab (a quillon's end)
    face_along, face_off = along[faces.verts].mean(1), off[faces.verts].mean(1)
    leather = faces.colour.mean(1) < LEATHER
    grip = is_sword[faces.verts].all(1) & (face_off < GRIP_ZONE)
    centre = guard
    for slab in np.arange(guard, guard + 0.25, 0.01):
        inside = grip & (face_along >= slab) & (face_along < slab + 0.01)
        if inside.sum() >= 3 and leather[inside].mean() < 0.5:
            centre = float(slab)
            break
    return {"along": along, "off": off, "cut": guard - 0.004, "guardCentre": centre, "gripEnd": centre - GRIP_LENGTH,
            "guardWidth": float(widest)}


def classify(faces: Faces, weights: list[dict[str, float]], is_sword: np.ndarray, bone_names: list[str],
             marks: dict | None = None) -> np.ndarray:
    count = len(faces.verts)
    part = np.array([""] * count, dtype=object)
    sword = is_sword[faces.verts].all(1)
    if marks is not None:
        # the sword alone: its blade and crossguard. The fist stays with the gauntlet, and so do Rodin's leather grip
        # below the guard and the fingers laid over it (dark leather: the sword's brass and steel are never that dark)
        face_along, face_off = marks["along"][faces.verts], marks["off"][faces.verts].mean(1)
        sword &= (face_along > marks["cut"]).all(1)
        sword &= ~((face_off < GRIP_ZONE) & (face_along.max(1) < marks["guardCentre"]))
        sword &= ~((faces.colour.mean(1) < LEATHER) & (face_along.mean(1) < marks["guardCentre"] + 0.02))
        sword[:] = False if not sword.any() else np.isin(np.arange(count), faces.components(sword, sword)[0])
    part[sword] = "HeroSword"

    cape = _cloth_component(faces, CAPE_CUT, faces.red & (faces.centre[:, 1] < -0.15) & (faces.centre[:, 2] < 1.1), True)
    part[cape] = "TabardBack"
    front = _cloth_component(faces, TABARD_CUT, faces.red & (faces.centre[:, 1] > 0.1) & (faces.centre[:, 2] < 0.85)
                             & (np.abs(faces.centre[:, 0]) < 0.2), False)
    part[front] = "TabardFront"

    c = faces.centre
    top = faces.components(c[:, 2] > HELMET_CUT, (c[:, 2] > 1.85) & (np.abs(c[:, 0]) < 0.1))[0]
    helmet = np.zeros(count, dtype=bool)
    helmet[top] = True
    helmet |= ((c[:, 2] > HELMET_FLOOR) & (c[:, 2] <= HELMET_CUT) & (np.abs(c[:, 0]) < HELMET_REACH[0])
               & (c[:, 1] > HELMET_REACH[1]) & ~faces.red)
    helmet &= part == ""
    part[helmet & (faces.glow > 0.3)] = "Visor"
    part[helmet & (part == "") & faces.red & (c[:, 2] > CREST_FLOOR)] = "Crest"
    part[helmet & (part == "") & (c[:, 2] < JAW_TOP) & (c[:, 1] > 0.0)] = "HelmetJaw"
    part[helmet & (part == "")] = "HelmetShell"

    index = {name: i for i, name in enumerate(bone_names)}
    face_weights = np.zeros((count, len(bone_names)))
    for corner in range(3):
        for face, vertex in enumerate(faces.verts[:, corner]):
            for bone, value in weights[vertex].items():
                face_weights[face, index[bone]] += value
    dominant = np.array(bone_names)[face_weights.argmax(1)]
    for face in np.where(part == "")[0]:
        part[face] = BODY_PARTS.get(dominant[face], "Breastplate")
    return part


GRIP_LENGTH = 0.11       # a one-handed grip, a hand's width: in the fist it stays inside the glove


def _texel_of(obj, select) -> tuple[float, float]:
    """The UV at the median of the faces `select(colour, centre)` picks, read from the object's own atlas."""
    me = obj.data
    image = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image.name.endswith("diffuse")) \
        if any(n.type == "TEX_IMAGE" and n.image.name.endswith("diffuse") for n in me.materials[0].node_tree.nodes) else \
        next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    pixels = _image_pixels(image)
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    uv = np.array([uv[p.loop_start:p.loop_start + p.loop_total].mean(0) for p in me.polygons])   # (any face size)
    colour = _sample(pixels, uv)[:, :3]
    centres = np.array([p.center[:] for p in me.polygons])
    chosen = select(colour, centres)
    if not chosen.any():
        raise ValueError(f"no face on {obj.name} to take a texel from")
    picked = uv[chosen]
    lum = colour[chosen].mean(1)
    return tuple(picked[np.argsort(lum)[len(lum) // 2]])


def turn_sword(sword: bpy.types.Object, fit) -> float:
    """Turn the separated sword in the fist about its centreline by fit.sword_spin (its flat where the kit's lay),
    normals with it. Returns the turn in degrees."""
    to_rest = fit.hand_to_rest
    axis = Vector(tuple(to_rest[:3, :3] @ fit.blade_axis)).normalized()
    origin = Vector(tuple(to_rest[:3, :3] @ fit.blade_origin + to_rest[:3, 3]))
    turn = Matrix.Translation(origin) @ Matrix.Rotation(fit.sword_spin, 4, axis) @ Matrix.Translation(-origin)
    me = sword.data
    normals = np.empty(len(me.loops) * 3)
    me.corner_normals.foreach_get("vector", normals)
    normals = normals.reshape(-1, 3) @ np.array(turn.to_3x3()).T
    me.transform(turn)
    me.normals_split_custom_set([tuple(n) for n in normals])
    me.update()
    return round(float(np.degrees(fit.sword_spin)), 2)


NECK_SIDES = 24
NECK_RADIUS = (0.075, 0.135)    # metres: the neck's least and greatest reach from its bone, before its shrink


def _add_faces(obj, build) -> int:
    """Add faces to a part with bmesh (`build(bm, vert, face)`), the new faces flat-shaded and every existing corner
    keeping its normal. `vert(point, weights)` makes a weighted vertex, `face(verts, texel)` a face. Returns faces added."""
    me = obj.data
    old_loops = len(me.loops)
    old_normals = np.empty(old_loops * 3)
    me.corner_normals.foreach_get("vector", old_normals)
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.active
    deform = bm.verts.layers.deform.verify()
    added = []

    def vert(point, weights):
        v = bm.verts.new(tuple(point))
        for bone, value in weights.items():
            group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            v[deform][group.index] = value
        return v

    def face(verts, texel):
        f = bm.faces.new(verts)
        for loop in f.loops:
            loop[uv_layer].uv = texel
        added.append(f)
        return f
    build(bm, vert, face)
    bmesh.ops.recalc_face_normals(bm, faces=added)
    bm.to_mesh(me)
    bm.free()
    normals = np.empty(len(me.loops) * 3)
    me.corner_normals.foreach_get("vector", normals)
    normals = normals.reshape(-1, 3)
    normals[:old_loops] = old_normals.reshape(-1, 3)
    for polygon in me.polygons:
        if polygon.loop_start >= old_loops:
            normals[polygon.loop_start:polygon.loop_start + polygon.loop_total] = polygon.normal[:]
    me.normals_split_custom_set([tuple(n) for n in normals])
    me.update()
    return len(added)


def add_neck(body: bpy.types.Object, helmet: bpy.types.Object, ring: np.ndarray, rig: bpy.types.Object) -> dict:
    """A dark gorget from inside the collar up into the helmet, closed at the top: the neck the free helmet turns on.
    It follows the helmet's opening (`ring`, the vertices the helmet shared with the body) a little inside it, rides the
    chest at the bottom, the neck in the middle and the head inside the helmet."""
    centre = np.array(rig.matrix_world @ rig.data.bones["neck"].head_local)[:2]
    rel = ring[:, :2] - centre
    angle = np.arctan2(rel[:, 1], rel[:, 0])
    radius = np.linalg.norm(rel, axis=1)
    bins = ((angle + np.pi) / (2 * np.pi) * NECK_SIDES).astype(int) % NECK_SIDES
    r = np.full(NECK_SIDES, np.nan)
    z = np.full(NECK_SIDES, np.nan)
    for b in range(NECK_SIDES):
        if (bins == b).any():
            r[b] = np.percentile(radius[bins == b], 25)
            z[b] = np.median(ring[bins == b, 2])
    filled = ~np.isnan(r)
    index = np.arange(NECK_SIDES)
    for values in (r, z):
        values[~filled] = np.interp(index[~filled], index[filled], values[filled], period=NECK_SIDES)
    # (where the helmet's rim rests on a pauldron its shared edge runs far out: the neck stays a neck)
    r = np.clip(r, *NECK_RADIUS)
    angles = (index + 0.5) / NECK_SIDES * 2 * np.pi - np.pi
    bottom, top = float(z.min() - 0.08), float(z.max() + 0.07)
    dark = _texel_of(body, lambda c, p: (c.mean(1) < 0.09) & (p[:, 2] > 1.2))
    rows = [(np.full(NECK_SIDES, bottom), 0.94, {"chest": 1.0}),
            (z - 0.015, 0.90, {"chest": 0.5, "neck": 0.5}),
            (z + 0.03, 0.86, {"neck": 0.4, "head": 0.6}),
            (np.full(NECK_SIDES, top), 0.80, {"head": 1.0})]

    def build(bm, vert, face):
        rings = []
        for heights, shrink, weights in rows:
            rings.append([vert((centre[0] + shrink * r[k] * math.cos(angles[k]),
                                centre[1] + shrink * r[k] * math.sin(angles[k]), heights[k]), weights)
                          for k in range(NECK_SIDES)])
        for lower, upper in zip(rings, rings[1:]):
            for k in range(NECK_SIDES):
                j = (k + 1) % NECK_SIDES
                face([lower[k], lower[j], upper[j], upper[k]], dark)
        cap = vert((centre[0], centre[1], top + 0.02), {"head": 1.0})
        for k in range(NECK_SIDES):
            face([rings[-1][k], rings[-1][(k + 1) % NECK_SIDES], cap], dark)
    added = _add_faces(body, build)
    return {"faces": added, "bottom": round(bottom, 3), "top": round(top, 3),
            "radius": [round(float(r.min()), 3), round(float(r.max()), 3)]}


def forge_sword(sword: bpy.types.Object, fit, marks: dict, others) -> dict:
    """Replace Rodin's sword with the forged one (forge.py) on the same grip axis, guard, reach and flat."""
    to_rest = fit.hand_to_rest
    axis = to_rest[:3, :3] @ fit.blade_axis
    axis = axis / np.linalg.norm(axis)
    origin = to_rest[:3, :3] @ fit.blade_origin + to_rest[:3, 3]
    me = sword.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    along = (co - origin) @ axis
    blade = along > marks["guardCentre"] + 0.15
    across = co[blade] - origin - np.outer(along[blade], axis)
    # the blade's width: the widest way across it (its flat, as turn_sword left it)
    width_dir = np.linalg.svd(across - across.mean(0), full_matrices=False)[2][0]
    old = {"rodinWidth": round(float(2 * np.percentile(np.abs(across @ width_dir), 98)), 3),
           "rodinTriangles": len(me.polygons)}
    uv_sets = []
    for obj in others:
        uv = np.empty(len(obj.data.loops) * 2)
        obj.data.uv_layers.active.data.foreach_get("uv", uv)
        uv_sets.append(uv.reshape(-1, 2))
    if check_region_free(uv_sets):
        raise ValueError("the sword's swatch square in the atlas is no longer free")
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=list(bm.verts), context="VERTS")     # (its layers stay: UVs, weights)
    bm.to_mesh(me)
    bm.free()
    report = {}

    def build(bm, vert, face):
        report.update(forge((lambda p: vert(p, {"hand.R": 1.0}), lambda vs, name: face(vs, swatch_uv(name))),
                            origin, axis, width_dir, marks["guardCentre"], float(along.max())))
    report["triangles"] = _add_faces(sword, build)
    for group in [g for g in sword.vertex_groups if g.name != "hand.R"]:
        sword.vertex_groups.remove(group)
    me.polygons.foreach_set("use_smooth", [False] * len(me.polygons))
    return {**old, **report}


def build_parts(rig: bpy.types.Object, fit, archive: Path) -> dict:
    mesh = fit.mesh
    emissive_image = bpy.data.images.load(str(archive / ARCHIVE_EMISSIVE), check_existing=True)
    emissive = _image_pixels(emissive_image)
    bpy.data.images.remove(emissive_image)
    faces = Faces(mesh, fit.posed, emissive)
    bone_names = [b.name for b in rig.data.bones if b.use_deform]
    weights = [dict(w) for w in fit.weights]
    marks = sword_landmarks(faces, fit.posed, fit.is_sword, fit.blade_axis, fit.blade_origin)
    part = classify(faces, weights, fit.is_sword, bone_names, marks)

    # --- weights: rigid armour (rigid.py), the helmet wholly the head's, the cloth on its chains ----------------
    co = faces.co
    helmet_parts = HELMET_PARTS
    on_helmet = np.isin(part, helmet_parts)
    helmet_vertex = np.zeros(len(co), dtype=bool)
    helmet_vertex[np.unique(faces.verts[on_helmet])] = True
    body_vertex = np.zeros(len(co), dtype=bool)
    body_vertex[np.unique(faces.verts[~on_helmet])] = True
    for vertex in np.where(helmet_vertex & ~body_vertex)[0]:
        weights[vertex] = {"head": 1.0}
    report_rigid = {"bodyOffHead": body_off_head(weights, helmet_vertex & ~body_vertex),
                    "copBones": add_cop_bones(rig),
                    "pauldronBones": add_pauldron_bones(rig)}
    report_rigid["pauldrons"], plate_faces, rims = pauldron_weights(rig, co, faces.verts, part, weights)
    report_rigid["cops"] = share_cops(weights)
    bone_names = [b.name for b in rig.data.bones if b.use_deform]
    neck_ring = co[helmet_vertex & body_vertex]
    cape_faces = np.where(part == "TabardBack")[0]
    front_faces = np.where(part == "TabardFront")[0]
    chains = {
        "TabardBack": (cape_faces, 1.26, ("chest", "tabard_back_01", "tabard_back_02")),
        "TabardFront": (front_faces, 0.94, ("pelvis", "tabard_front_01", "tabard_front_02")),
    }
    report = {}
    for name, (members, top, bones) in chains.items():
        vertices = np.unique(faces.verts[members])
        hem = float(co[vertices, 2].min())
        joint = (top + hem) / 2
        _place_chain(rig, co, vertices, bones[1:], top, joint, hem)
        for vertex, w in zip(vertices, _chain_weights(co[vertices, 2], top, joint, bones)):
            weights[vertex] = w
        report[name] = {"faces": int(len(members)), "top": top, "joint": round(joint, 3), "hem": round(hem, 3)}
    # the cape hangs from the shoulders: its chain rides the chest (the kit hung it from the waist, so a lean tore
    # its top, which is on the chest, away from the chain's swing)
    report["TabardBack"]["hungFromChest"] = hang_from(rig, "tabard_back_01", "chest")
    report["rigid"] = report_rigid

    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)
    groups = {n: mesh.vertex_groups.new(name=n) for n in bone_names}
    for vertex, w in enumerate(weights):
        total = sum(w.values()) or 1.0
        for bone, value in w.items():
            groups[bone].add([int(vertex)], value / total, "REPLACE")

    # --- the pauldrons cut free of the collar, a padded shoulder under each (segments.py) ----------------------
    padding = _texel_of(mesh, lambda c, p: (c.mean(1) > 0.06) & (c.mean(1) < 0.12) & (p[:, 2] > 0.4))
    body = Mesh(mesh)
    before = len(body.bm.faces)
    report["segments"] = {"pauldrons": free_pauldrons(body, rig, plate_faces, rims, padding)}
    # (the padding's new faces belong to the part they pad)
    pad_part = {"clavicle": "Pauldron"}
    added = []
    for f in body.bm.faces[before:]:
        bone = body.name[next(iter(f.verts[0][body.deform].keys()))]
        added.append(f"{pad_part[bone.split('.')[0]]}.{bone.split('.')[1]}")
    body.finish()
    part = np.concatenate([part, np.array(added, dtype=object)])

    # --- split ----------------------------------------------------------------------------------------------
    attribute = mesh.data.attributes.new("rodin_part", "INT", "FACE")
    attribute.data.foreach_set("value", np.array([PART_ORDER.index(p) for p in part], dtype=np.int32))
    objects = {}
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    for index, name in enumerate(PART_ORDER[:-1]):
        before = set(bpy.data.objects)
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(mesh.data)
        layer = bm.faces.layers.int["rodin_part"]
        bm.select_mode = {"FACE"}
        for face in bm.faces:
            face.select_set(False)
        for face in bm.faces:
            if face[layer] == index:
                face.select_set(True)
        bm.select_flush_mode()
        bmesh.update_edit_mesh(mesh.data)
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        made = set(bpy.data.objects) - before
        if len(made) != 1:
            raise ValueError(f"separating {name} made {len(made)} objects")
        obj = made.pop()
        obj.name = obj.data.name = name
        obj.select_set(False)
        objects[name] = obj
    mesh.name = mesh.data.name = PART_ORDER[-1]
    objects[PART_ORDER[-1]] = mesh
    for name, obj in objects.items():
        obj.data.attributes.remove(obj.data.attributes["rodin_part"])
        # (a part keeps only the groups that carry it)
        used = {g.group for v in obj.data.vertices for g in v.groups if g.weight > 0}
        for group in [g for g in obj.vertex_groups if g.index not in used]:
            obj.vertex_groups.remove(group)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.material_slot_remove_unused()
    # the helmet is wholly the head's, to its very edge: it turns over the collar on its own, and the neck under it
    # (a dark gorget from the chest into the helmet) fills whatever opens between them
    for name in helmet_parts:
        obj = objects[name]
        for group in list(obj.vertex_groups):
            obj.vertex_groups.remove(group)
        obj.vertex_groups.new(name="head").add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    report["rigid"]["neck"] = add_neck(objects["Breastplate"], objects["HelmetShell"], neck_ring, rig)
    turned = turn_sword(objects["HeroSword"], fit)
    report["sword"] = forge_sword(objects["HeroSword"], fit, marks,
                                  [obj for name, obj in objects.items() if name != "HeroSword"])
    report["sword"]["turnedDegrees"] = turned
    # the hands, remodelled as articulated gauntlets (hands.py), coloured from Rodin's own gauntlet plates
    gauntlet = objects["Gauntlet.L"]
    grey = lambda c: (c.max(1) - c.min(1)) < 0.07                                    # noqa: E731
    palette = {
        "steelLight": _texel_of(gauntlet, lambda c, p: grey(c) & (c.mean(1) > 0.45) & (c.mean(1) < 0.62)),
        "steel": _texel_of(gauntlet, lambda c, p: grey(c) & (c.mean(1) > 0.32) & (c.mean(1) < 0.42)),
        "steelDark": _texel_of(gauntlet, lambda c, p: grey(c) & (c.mean(1) > 0.2) & (c.mean(1) < 0.28)),
        "glove": _texel_of(gauntlet, lambda c, p: (c.mean(1) > 0.09) & (c.mean(1) < 0.16)),
        "brass": swatch_uv("brass"),
    }
    report["hands"] = build_hands(rig, {"L": gauntlet, "R": objects["Gauntlet.R"]}, objects["HeroSword"], palette,
                                  swatch_uv)
    report["parts"] = {name: len(obj.data.polygons) for name, obj in objects.items()}
    return report
