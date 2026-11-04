"""The pauldrons cut free of the collar (part of parts.py).

Each pauldron rides a bone of its own that follows its arm (rigid.py, pauldronFollow.mjs). Joined to the collar, its
edge dragged the collar after it whenever the arm rose, and stretched there. Here that edge is cut (an edge split: the
faces either side keep their own copies of its vertices), so the plate lifts with its arm on its own; its lower rim
stays joined to the arm it rides. A dark padded shoulder under it, on the clavicle, fills what opens.

(Elbows and knees were cut the same way, and measured less stretch, but Rodin's irregular triangles left ragged,
torn-looking edges at every cut. They keep their skin, with cops sharing the bend: rigid.py, share_cops.)
"""
from __future__ import annotations

import math

import bmesh
import numpy as np

FILLER = {"sides": 10, "rings": 6, "shrink": 0.86}       # the padding: its section, and its size against the limb's


def _unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def _bone_axis(rig, name: str):
    bone = rig.data.bones[name]
    head = np.array(rig.matrix_world @ bone.head_local)
    tail = np.array(rig.matrix_world @ bone.tail_local)
    return head, _unit(tail - head)


class Mesh:
    """The unified body as a bmesh with its weights, for cutting and padding."""

    def __init__(self, obj):
        self.obj = obj
        self.bm = bmesh.new()
        self.bm.from_mesh(obj.data)
        self.bm.verts.ensure_lookup_table()
        self.bm.faces.ensure_lookup_table()
        self.deform = self.bm.verts.layers.deform.active
        self.uv = self.bm.loops.layers.uv.active
        self.index = {g.name: g.index for g in obj.vertex_groups}
        self.name = {g.index: g.name for g in obj.vertex_groups}

    def weights(self, v) -> dict[str, float]:
        return {self.name[k]: w for k, w in v[self.deform].items()}

    def rigid(self, v, bone: str) -> None:
        d = v[self.deform]
        for k in list(d.keys()):
            del d[k]
        d[self.index[bone]] = 1.0

    def blend(self, v, bone: str, keep: float) -> None:
        """Wholly `bone`'s, keeping `keep` (0..1) of the vertex's own weights."""
        if keep <= 1e-4:
            return self.rigid(v, bone)
        own = self.weights(v)
        mixed = {b: w * keep for b, w in own.items()}
        mixed[bone] = mixed.get(bone, 0.0) + (1 - keep)
        d = v[self.deform]
        for k in list(d.keys()):
            del d[k]
        for b, w in mixed.items():
            if w > 1e-4:
                d[self.index[b]] = w

    def split(self, edges) -> int:
        edges = list(set(edges))
        if edges:
            bmesh.ops.split_edges(self.bm, edges=edges)
        self.bm.verts.ensure_lookup_table()
        self.bm.faces.ensure_lookup_table()
        self.bm.faces.index_update()
        return len(edges)

    def finish(self) -> None:
        self.bm.to_mesh(self.obj.data)
        self.bm.free()
        self.obj.data.update()


def capsule(m: Mesh, centre, axis, radius: float, half_length: float, bone: str, texel) -> None:
    """A closed, rounded padding along `axis`, wholly on `bone`, every face the padding's texel."""
    a = _unit(axis)
    s = _unit(np.cross(a, (0.0, 0.0, 1.0) if abs(a[2]) < 0.9 else (1.0, 0.0, 0.0)))
    t = np.cross(a, s)
    n, rings = FILLER["sides"], FILLER["rings"]
    angles = [2 * math.pi * (k + 0.5) / n for k in range(n)]
    layers = []
    for i in range(rings):
        u = -1 + 2 * i / (rings - 1)                       # along, -1..1
        r = radius * math.sqrt(max(0.0, 1 - (abs(u) ** 3)))  # (a squarish capsule: full almost to its ends)
        layers.append([m.bm.verts.new(tuple(centre + a * (u * half_length) + (s * math.cos(q) + t * math.sin(q)) * r))
                       for q in angles])
    caps = [m.bm.verts.new(tuple(centre - a * (half_length * 1.05))), m.bm.verts.new(tuple(centre + a * (half_length * 1.05)))]
    made = []
    for lower, upper in zip(layers, layers[1:]):
        for k in range(n):
            j = (k + 1) % n
            made.append(m.bm.faces.new([lower[k], lower[j], upper[j], upper[k]]))
    for k in range(n):
        j = (k + 1) % n
        made.append(m.bm.faces.new([caps[0], layers[0][j], layers[0][k]]))
        made.append(m.bm.faces.new([caps[1], layers[-1][k], layers[-1][j]]))
    bmesh.ops.recalc_face_normals(m.bm, faces=made)
    m.bm.faces.index_update()
    for f in made:
        f.smooth = False
        for loop in f.loops:
            loop[m.uv].uv = texel
        for v in f.verts:
            m.rigid(v, bone)
    m.bm.verts.ensure_lookup_table()
    m.bm.faces.ensure_lookup_table()
    return made


def free_pauldrons(m: Mesh, rig, plate_faces: dict, rims: dict, texel) -> dict:
    """Cut each pauldron from the collar (its rim stays on the arm) and pad the shoulder under it."""
    report = {}
    for side, faces in plate_faces.items():
        bone = f"pauldron.{side}"
        head, direction = _bone_axis(rig, f"upper_arm.{side}")
        plate = {m.bm.faces[i] for i in faces}
        seams = []
        for f in plate:
            for e in f.edges:
                others = [g for g in e.link_faces if g not in plate]
                if not others:
                    continue
                middle = (np.asarray(e.verts[0].co) + np.asarray(e.verts[1].co)) / 2
                if float((middle - head) @ direction) < rims[side] - 0.05:      # the collar side, not the rim
                    seams.append(e)
        cut = m.split(seams)
        # the plate itself: wholly its bone's, but for a band along its rim, which eases onto the arm as before
        for f in plate:
            for v in f.verts:
                if float((np.asarray(v.co) - head) @ direction) < rims[side] - 0.05:
                    m.rigid(v, bone)
        # the shoulder under it: a rounded pad on the clavicle, inside the plate
        across = _unit(np.cross(direction, (0.0, 0.0, 1.0)))
        centre = head - direction * 0.01
        capsule(m, centre, across, 0.085, 0.07, f"clavicle.{side}", texel)
        report[side] = {"cutEdges": cut}
    return report
