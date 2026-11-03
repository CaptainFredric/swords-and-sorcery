"""Split the fitted Rodin body into the named parts the game relies on (stage 2 of build_source.py).

The runtime and the validators find parts by name: HeroSword (the sword's finish, its stowed copy on the ballista),
TabardFront and TabardBack (cloth dye, the back banner's emblem), and the helmet, plate and boot pieces (hidden in a
cockpit, where only the gauntlets stay in view). Each face goes to one part:

- HeroSword: the sword alone, its blade and crossguard. Rodin fused the fist onto the guard with a stub of leather
  grip; those stay with the gauntlet, and the sword gets a grip of its own along the blade's centreline, seated in
  the guard, and a pommel (complete_sword), so stowed, dropped or cut it is a whole sword.
- TabardBack: the cape, the one surface that hangs free of the body below the shoulders (found by cutting the mesh at
  CAPE_CUT and keeping the cloth component behind the body).
- TabardFront: the front tabard, found the same way below the belt (TABARD_CUT).
- The helmet: everything above HELMET_CUT, and the visor and rim below it inside the helmet's footprint. Visor (its
  glowing glass, from Rodin's emissive map), Crest (the red plume), HelmetJaw (the face guard below the eyes) and
  HelmetShell (the rest).
- Every other face by the bone that carries most of it: Breastplate (pelvis to neck), Pauldron (clavicle), Gauntlet
  (upper arm to hand), Greave (thigh, shin), Boot (foot).

The helmet is made rigid on the head (Rodin had its lower half on the chest, so a turned head sheared the visor),
easing onto the body's weights across its edge so the pauldrons it touches do not tear. The cape and tabard move onto
the tabard chains that the runtime's spring cloth drives (Rodin had the cape on the chest, so a lean swung it out like
a plank), and the cape's chain hangs from the chest, where its top is. Split edges keep one set of weights and Rodin's
own normals, so no seam opens.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

ARCHIVE_EMISSIVE = "rodin-spellblade-emissive.png"
CAPE_CUT = 1.35          # below this the cape hangs free of the body
TABARD_CUT = 1.0         # below this the front tabard hangs free of the belt
HELMET_CUT = 1.63        # above this the helmet is its own shell
HELMET_FLOOR = 1.555     # its visor and rim reach down to here at the front
HELMET_REACH = (0.18, -0.17)   # its footprint: |x| below the first, y above the second
CREST_FLOOR = 1.75
JAW_TOP = 1.66
HELMET_BLEND = 0.06      # metres either side of the helmet's edge over which it eases from the body onto the head
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


def helmet_weights(faces: Faces, part: np.ndarray, posed: np.ndarray, weights: list[dict[str, float]],
                   helmet_parts: tuple[str, ...]) -> int:
    """The helmet rigid on the head, easing onto the body's own weights across its edge (HELMET_BLEND each side), so
    a turned head neither shears the visor nor tears the pauldrons and collar the helmet touches."""
    weld = np.unique(np.round(posed / 1e-6).astype(np.int64), axis=0, return_inverse=True)[1].ravel()
    on_helmet = np.isin(part, helmet_parts)
    helmet = np.zeros(weld.max() + 1, dtype=bool)
    helmet[weld[np.unique(faces.verts[on_helmet])]] = True
    body = np.zeros_like(helmet)
    body[weld[np.unique(faces.verts[~on_helmet])]] = True
    seam = np.where((helmet & body)[weld])[0]
    tree = KDTree(len(seam))
    for i, vertex in enumerate(seam):
        tree.insert(Vector(tuple(faces.co[vertex])), i)
    tree.balance()
    eased = 0
    for vertex in range(len(weights)):
        inside, outside = helmet[weld[vertex]], body[weld[vertex]]
        distance = tree.find(Vector(tuple(faces.co[vertex])))[2]
        ease = float(smoothstep(0.0, HELMET_BLEND, distance))
        share = 0.5 if (inside and outside) else (0.5 + 0.5 * ease if inside else 0.5 * (1 - ease))
        if share <= 0:
            continue
        blended = {bone: value * (1 - share) for bone, value in weights[vertex].items()}
        blended["head"] = blended.get("head", 0.0) + share
        weights[vertex] = blended
        eased += share < 1
    return eased


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
GRIP_RADIUS = 0.028
POMMEL_RADIUS = 0.044
GRIP_SIDES = 8


def _texel_of(obj, select) -> tuple[float, float]:
    """The UV at the median of the faces `select(colour, centre)` picks, read from the object's own atlas."""
    me = obj.data
    image = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image.name.endswith("diffuse")) \
        if any(n.type == "TEX_IMAGE" and n.image.name.endswith("diffuse") for n in me.materials[0].node_tree.nodes) else \
        next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    pixels = _image_pixels(image)
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 3, 2).mean(1)
    colour = _sample(pixels, uv)[:, :3]
    centres = np.array([p.center[:] for p in me.polygons])
    chosen = select(colour, centres)
    if not chosen.any():
        raise ValueError(f"no face on {obj.name} to take a texel from")
    picked = uv[chosen]
    lum = colour[chosen].mean(1)
    return tuple(picked[np.argsort(lum)[len(lum) // 2]])


def complete_sword(sword: bpy.types.Object, gauntlet: bpy.types.Object, fit, marks: dict) -> dict:
    """The sword as a whole sword: a leather grip from inside the crossguard through the fist, and a brass pommel
    beyond it (the concept's sword has both; Rodin only made the part that showed). Seen in the hand nothing changes;
    stowed on the ballista, cut by Sunder or hidden during the tutorial's draw, the sword is whole."""
    to_rest = fit.hand_to_rest
    axis = to_rest[:3, :3] @ fit.blade_axis
    origin = to_rest[:3, :3] @ fit.blade_origin + to_rest[:3, 3]
    # two directions across the blade, for the grip's octagon
    side = np.cross(axis, (0.0, 0.0, 1.0) if abs(axis[2]) < 0.9 else (1.0, 0.0, 0.0))
    side /= np.linalg.norm(side)
    up = np.cross(axis, side)
    # the grip's leather: the glove's darker brown; the pommel's brass: the crossguard's light tan
    leather = _texel_of(gauntlet, lambda c, p: (c[:, 0] > c[:, 2] + 0.08) & (c.mean(1) > 0.15) & (c.mean(1) < 0.32))
    brass = _texel_of(sword, lambda c, p: (c[:, 0] > c[:, 2] + 0.10) & (c.mean(1) > 0.45))
    top, bottom = marks["guardCentre"] + 0.012, marks["gripEnd"]
    pommel_centre = bottom - POMMEL_RADIUS * 0.8
    bm = bmesh.new()
    bm.from_mesh(sword.data)
    old_loops = len(sword.data.loops)
    uv_layer = bm.loops.layers.uv.active
    deform = bm.verts.layers.deform.verify()
    hand = sword.vertex_groups["hand.R"].index

    def vert(point):
        v = bm.verts.new(tuple(point))
        v[deform][hand] = 1.0
        return v

    added = []

    def face(verts, texel):
        f = bm.faces.new(verts)
        for loop in f.loops:
            loop[uv_layer].uv = texel
        added.append(f)
        return f
    angles = np.linspace(0, 2 * np.pi, GRIP_SIDES, endpoint=False)
    rings = []
    for at in (top, bottom):
        centre = origin + axis * at
        rings.append([vert(centre + GRIP_RADIUS * (np.cos(a) * side + np.sin(a) * up)) for a in angles])
    for i in range(GRIP_SIDES):
        j = (i + 1) % GRIP_SIDES
        face([rings[0][i], rings[1][i], rings[1][j], rings[0][j]], leather)
    face(list(reversed(rings[0])), leather)
    # the pommel: a faceted bead (an octahedron stretched a little along the blade), closing the grip's end
    centre = origin + axis * pommel_centre
    tips = [vert(centre + axis * POMMEL_RADIUS * 0.9), vert(centre - axis * POMMEL_RADIUS * 1.2)]
    belt = [vert(centre + POMMEL_RADIUS * (np.cos(a) * side + np.sin(a) * up)) for a in angles[::2]]
    for i in range(len(belt)):
        j = (i + 1) % len(belt)
        face([tips[0], belt[j], belt[i]], brass)
        face([tips[1], belt[i], belt[j]], brass)
    bmesh.ops.recalc_face_normals(bm, faces=added)
    bm.to_mesh(sword.data)
    bm.free()
    me = sword.data
    # the new faces flat-shaded, as Rodin's facets are; every other corner keeps its normal
    normals = np.empty(len(me.loops) * 3)
    me.corner_normals.foreach_get("vector", normals)
    normals = normals.reshape(-1, 3)
    for polygon in me.polygons:
        if polygon.loop_start >= old_loops:
            normals[polygon.loop_start:polygon.loop_start + polygon.loop_total] = polygon.normal[:]
    me.normals_split_custom_set([tuple(n) for n in normals])
    me.update()
    return {"cut": round(marks["cut"], 3), "guardCentre": round(marks["guardCentre"], 3), "gripEnd": round(marks["gripEnd"], 3),
            "gripLength": round(top - bottom, 3), "guardHalfWidth": round(marks["guardWidth"], 3)}


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

    # --- weights: the helmet rigid on the head, the cloth on its chains ---------------------------------------
    co = faces.co
    helmet_parts = ("Visor", "Crest", "HelmetJaw", "HelmetShell")
    eased = helmet_weights(faces, part, fit.posed, weights, helmet_parts)
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
    report["helmetEasedVertices"] = eased

    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)
    groups = {n: mesh.vertex_groups.new(name=n) for n in bone_names}
    for vertex, w in enumerate(weights):
        total = sum(w.values()) or 1.0
        for bone, value in w.items():
            groups[bone].add([int(vertex)], value / total, "REPLACE")

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
    report["sword"] = complete_sword(objects["HeroSword"], objects["Gauntlet.R"], fit, marks)
    report["parts"] = {name: len(obj.data.polygons) for name, obj in objects.items()}
    return report
