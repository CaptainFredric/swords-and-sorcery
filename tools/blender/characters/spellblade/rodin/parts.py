"""Split the fitted Rodin body into the named parts the game relies on (stage 2 of build_source.py).

The runtime and the validators find parts by name: HeroSword (the sword's finish, its stowed copy on the ballista),
TabardFront and TabardBack (cloth dye, the back banner's emblem), and the helmet, plate and boot pieces (hidden in a
cockpit, where only the gauntlets stay in view). Each face goes to one part:

- HeroSword: faces wholly on the rigid sword.
- TabardBack: the cape, the one surface that hangs free of the body below the shoulders (found by cutting the mesh at
  CAPE_CUT and keeping the cloth component behind the body).
- TabardFront: the front tabard, found the same way below the belt (TABARD_CUT).
- The helmet: everything above HELMET_CUT, and the visor and rim below it inside the helmet's footprint. Visor (its
  glowing glass, from Rodin's emissive map), Crest (the red plume), HelmetJaw (the face guard below the eyes) and
  HelmetShell (the rest).
- Every other face by the bone that carries most of it: Breastplate (pelvis to neck), Pauldron (clavicle), Gauntlet
  (upper arm to hand), Greave (thigh, shin), Boot (foot).

The helmet is made rigid on the head (Rodin had its lower half on the chest, so a turned head sheared the visor), and the
cape and tabard move onto the tabard chains that the runtime's spring cloth drives (Rodin had the cape on the chest, so
a lean swung it out like a plank). Split edges keep one set of weights and Rodin's own normals, so no seam opens.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ARCHIVE_EMISSIVE = "rodin-spellblade-emissive.png"
CAPE_CUT = 1.35          # below this the cape hangs free of the body
TABARD_CUT = 1.0         # below this the front tabard hangs free of the belt
HELMET_CUT = 1.63        # above this the helmet is its own shell
HELMET_FLOOR = 1.555     # its visor and rim reach down to here at the front
HELMET_REACH = (0.18, -0.17)   # its footprint: |x| below the first, y above the second
CREST_FLOOR = 1.75
JAW_TOP = 1.66

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


def classify(faces: Faces, weights: list[dict[str, float]], is_sword: np.ndarray, bone_names: list[str]) -> np.ndarray:
    count = len(faces.verts)
    part = np.array([""] * count, dtype=object)
    sword = is_sword[faces.verts].all(1)
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


def build_parts(rig: bpy.types.Object, fit, archive: Path) -> dict:
    mesh = fit.mesh
    emissive_image = bpy.data.images.load(str(archive / ARCHIVE_EMISSIVE), check_existing=True)
    emissive = _image_pixels(emissive_image)
    bpy.data.images.remove(emissive_image)
    faces = Faces(mesh, fit.posed, emissive)
    bone_names = [b.name for b in rig.data.bones if b.use_deform]
    weights = [dict(w) for w in fit.weights]
    part = classify(faces, weights, fit.is_sword, bone_names)

    # --- weights: the helmet rigid on the head, the cloth on its chains ---------------------------------------
    co = faces.co
    def vertices_of(name):
        return np.unique(faces.verts[part == name])
    helmet_parts = ("Visor", "Crest", "HelmetJaw", "HelmetShell")
    for vertex in np.unique(np.concatenate([vertices_of(p) for p in helmet_parts])):
        weights[vertex] = {"head": 1.0}
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
    report["parts"] = {name: len(obj.data.polygons) for name, obj in objects.items()}
    return report
