"""kit.py -- build the Spellblade armour kit on the concept rig (rig space, character faces +Y, +X = its right).

Every piece is a crisp low-poly shell measured from the concept views (see ruler.py/ov.py), rigid to one bone
(cloth: chain weights). Face colours live in the ArmorColor corner attribute, calibrated so front faces under the
game's menu lighting land on the concept's sampled colours; bevel faces are lighter (the concept's lit plate edges).
"""
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, math, json, bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

SCR = str(WORK) + "/"; KITDIR = str(KIT) + "/"
args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
P = dict(bevel=0.006, grad_lo=0.62, grad_z0=0.10, grad_z1=1.45, edge_gain=1.55, brass_edge_gain=1.22, jitter=0.05)
for a in args[1:]:
    k, v = a.split("="); P[k] = float(v)

rig = bpy.data.objects["SpellbladeRig"]; arm = rig.data
exp = bpy.data.collections["SpellbladeExport"]
BONE = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.bones}

# ---------------------------------------------------------------- colours
FRONT = (0.727, 0.671, 0.474)          # game-light radiance / albedo on a front face (calib_light.py)


def s2l(c): c = c / 255.0; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def albedo(srgb): return tuple(min(1.0, s2l(c) / f) for c, f in zip(srgb, FRONT))


TAGS = {  # tag: (material, concept front-face sRGB)
    "steel": ("KitMetal", (108, 100, 110)), "steel_dark": ("KitMetal", (60, 55, 62)), "brass": ("KitMetal", (186, 146, 118)),
    "under": ("KitMatte", (26, 28, 40)), "leather": ("KitMatte", (86, 61, 49)), "leather_dark": ("KitMatte", (58, 42, 36)),
    "cloth": ("KitMatte", (104, 44, 48)), "cloth_dark": ("KitMatte", (70, 28, 32)), "cream": ("KitMatte", (170, 134, 112)),
    "face": ("KitMatte", (10, 14, 20)), "buckle": ("KitMetal", (104, 100, 118)),
}
TAGL = list(TAGS)
EDGE_GAIN = {"steel": P["edge_gain"], "steel_dark": 1.6, "brass": P["brass_edge_gain"], "buckle": 1.4, "cloth": 1.25}
GRAD = {"steel": 1.0, "steel_dark": 0.6, "brass": 0.55, "buckle": 0.5, "under": 0.3, "leather": 0.4, "cloth": 0.4}


def material(name, metal, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "ArmorColor"
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"]); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    m.use_fake_user = True
    return m


MATS = {"KitMetal": material("KitMetal", 0.12, 0.55), "KitMatte": material("KitMatte", 0.0, 0.85)}


# ---------------------------------------------------------------- geometry helpers
class Frame:
    """Bone-aligned frame: a along the bone, f toward the character's front, s = a x f (x>0 outward when m=+1)."""
    def __init__(self, head, tail, front=Vector((0, 1, 0)), m=1):
        self.o = Vector(head); d = Vector(tail) - Vector(head); self.L = d.length; self.a = d.normalized()
        f = Vector(front) - self.a * Vector(front).dot(self.a); self.f = f.normalized()
        self.s = self.a.cross(self.f); self.m = m

    def pt(self, t, x, y):
        return self.o + self.a * t + self.s * (x * self.m) + self.f * y


def bone_frame(name, m=1, front=(0, 1, 0)):
    h, t = BONE[name]; return Frame(h, t, Vector(front), m)


class World:
    """Axis-aligned frame (a = +Z up), x = world X * m, y = world Y."""
    def __init__(self, origin=(0, 0, 0), m=1): self.o = Vector(origin); self.m = m
    def pt(self, t, x, y): return self.o + Vector((x * self.m, y, t))


def octa(hw, hd, c, cy=None, cx=None):
    """chamfered rectangle, CCW looking down the frame axis from its head. c: chamfer."""
    cy = c if cy is None else cy; cx = c if cx is None else cx
    return [(hw, hd - cy), (hw - cx, hd), (-(hw - cx), hd), (-hw, hd - cy), (-hw, -(hd - cy)), (-(hw - cx), -hd),
            (hw - cx, -hd), (hw, -(hd - cy))]


class Piece:
    def __init__(self, name):
        self.name = name; self.bm = bmesh.new()
        self.tag = self.bm.faces.layers.int.new("tag"); self.edge = self.bm.faces.layers.int.new("edge")

    def face(self, verts, tag):
        f = self.bm.faces.new(verts); f[self.tag] = TAGL.index(tag); return f

    def loft(self, fr, rings, cap0=True, cap1=True, tags=None, off=(0.0, 0.0)):
        """rings: [(t, pts, tag)]; the band between ring k and k+1 takes ring k's tag (or tags[k][i] per side)."""
        vs = [[self.bm.verts.new(fr.pt(t, x + off[0], y + off[1])) for x, y in pts] for t, pts, _ in rings]
        for k in range(len(rings) - 1):
            n = len(vs[k])
            for i in range(n):
                j = (i + 1) % n
                tg = tags[k][i] if tags else rings[k][2]
                self.face((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i]), tg)
        if cap0: self.face(list(reversed(vs[0])), rings[0][2])
        if cap1: self.face(vs[-1], rings[-1][2])
        return vs

    def box(self, fr, t0, t1, x0, x1, y0, y1, tag):
        ring = [(x1, y1), (x0, y1), (x0, y0), (x1, y0)]
        return self.loft(fr, [(t0, ring, tag), (t1, ring, tag)])

    def plate(self, fr, t, outline, thick, tag, back_tag=None, side_tag=None):
        """flat polygon (outline in the frame's x,y at axial t .. t+thick) -- a slab across the axis."""
        top = [self.bm.verts.new(fr.pt(t + thick, x, y)) for x, y in outline]
        bot = [self.bm.verts.new(fr.pt(t, x, y)) for x, y in outline]
        self.face(top, tag); self.face(list(reversed(bot)), back_tag or tag)
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n; self.face((bot[i], bot[j], top[j], top[i]), side_tag or tag)

    def bevel(self, width, angle=28.0):
        bm = self.bm
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(angle)]
        if not edges: return
        res = bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type="OFFSET", segments=1, profile=0.5,
                              affect="EDGES", clamp_overlap=True)
        for f in res["faces"]: f[self.edge] = 1

    def build(self, bone=None, weights=None, bevel=None, grad=True):
        if bevel is None: bevel = P["bevel"]
        if bevel > 0: self.bevel(bevel)
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self.name)
        # materials in slot order
        used = sorted({TAGS[TAGL[f[self.tag]]][0] for f in bm.faces})
        for f in bm.faces: f.material_index = used.index(TAGS[TAGL[f[self.tag]]][0])
        cols = []
        rng = np.random.default_rng(abs(hash(self.name)) % 2 ** 32)
        for f in bm.faces:
            tg = TAGL[f[self.tag]]
            c = np.array(albedo(TAGS[tg][1]))
            z = f.calc_center_median().z
            if grad:
                u = min(1.0, max(0.0, (z - P["grad_z0"]) / (P["grad_z1"] - P["grad_z0"])))
                g = P["grad_lo"] + (1 - P["grad_lo"]) * (u * u * (3 - 2 * u))
                c = c * (1 - GRAD.get(tg, 0.5) * (1 - g))
            if f[self.edge]: c = c * EDGE_GAIN.get(tg, 1.15)
            c = c * (1 + P["jitter"] * (rng.random() - 0.5) * 2)
            cols.append(np.clip(c, 0, 1))
        bm.to_mesh(me); bm.free()
        for n in used: me.materials.append(MATS[n])
        attr = me.color_attributes.new("ArmorColor", "FLOAT_COLOR", "CORNER")
        for p, c in zip(me.polygons, cols):
            p.use_smooth = False
            for li in p.loop_indices: attr.data[li].color = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        me.color_attributes.active_color = attr
        ob = bpy.data.objects.new(self.name, me); exp.objects.link(ob)
        ob.parent = rig
        mod = ob.modifiers.new("Armature", "ARMATURE"); mod.object = rig
        if bone:
            ob.vertex_groups.new(name=bone).add(range(len(me.vertices)), 1.0, "REPLACE")
        else:
            groups = {}
            for v in me.vertices:
                for bn, w in weights(v.co).items():
                    if w <= 1e-4: continue
                    if bn not in groups: groups[bn] = ob.vertex_groups.new(name=bn)
                    groups[bn].add([v.index], w, "REPLACE")
        BUILT[self.name] = len(me.polygons)
        return ob


BUILT = {}
exec(open(KITDIR + "kit_pieces.py").read())
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
tris = 0
for ob in exp.all_objects:
    if ob.type == "MESH": tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
print("KIT", OUT, "objects", len(BUILT), "tris(all export, pre-bevel-mod)", tris)
print("KIT_PIECES", BUILT)
