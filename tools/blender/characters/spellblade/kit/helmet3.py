"""helmet3.py -- in baked.blend (generation space, faces +Y): replace GenHelmet with a crisp helm built to the
concept's measured layout. Dimensions come from the concept's front, side and detail views (see helmet2 probes):
half-width 0.129, half-depth 0.152, bottom 1.695, brow at 62% of the helm, flat top at 2.00, crest to ~2.08.

Objects (all to be weighted to `head` by the rebuild):
  GenHelmJaw    lower helm (face band): dark face plane, steel cheek bevels and sides, vents
  GenHelmShell  crown: overhanging brow ledge, walls, bevelled top edges, flat top
  GenHelmCrest  stepped red crest running back and down the crown
  GenHelmBrass  centred brass beak down the crown front to a point between the glyphs
  GenHelmPanels lit steel panels outside the glyph strokes
  GenVisor      glowing glyphs (inner stroke, top bar outward, tick rising at the outer end)
"""
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, math, bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
SRC = os.environ.get("SPELLBLADE_KIT_BASE", str(WORK / "source_bcc16ef.blend"))
D = dict(yc=0.201, wx=0.1355, dy=0.160, cf=0.19, cb=0.24, zb=1.745, face_frac=0.57, ztop=2.080, wall=0.10,
         ledge=1.08, top_scale=0.64, crown_back=0.050, ledge_fwd=0.016, panel_lift=0.012, crest_hw=0.030, crest_top=2.185, crest_front=0.035, crest_step_y=-0.035,
         crest_step=2.14, crest_tail=1.995, vent_z=0.78, vent_h=0.10, vent_y0=0.20, vent_y1=0.46,
         s_in=0.27, s_out=0.47, bar_lo=0.74, bar_hi=0.83, bar_out=0.80, tick_in=0.66, tick_hi=0.95, s_bot=0.05,
         brass_w=0.42, panel_bright=1.55, grad_lo=0.80, grad_hi=0.96, bevel=0.0035)
for a in args[1:]:
    k, v = a.split("="); D[k] = float(v)
D["zbrow"] = D["zb"] + D["face_frac"] * (D["ztop"] - D["zb"])
D["zwall"] = D["zbrow"] + D["wall"] * (D["ztop"] - D["zbrow"])

NEED = ["DarkSteel", "SteelFacet", "SteelEdge", "SteelShade", "Brass", "BrassEdge", "CrimsonCloth", "ClothLight",
        "ClothShade", "FaceDark", "VisorGlow"]
with bpy.data.libraries.load(SRC, link=False) as (src, dst):
    dst.materials = [n for n in NEED if n in src.materials and n not in bpy.data.materials]
MAT = {n: bpy.data.materials[n] for n in NEED}


def base_color(name):
    node = next(n for n in MAT[name].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    return Vector(node.inputs["Base Color"].default_value[:3])


def make_object(name, bm, face_mats, gradient=True, bright=1.0):
    """face_mats: material name per bm face (in bm.faces order)."""
    slots = sorted(set(face_mats))
    for f, m in zip(bm.faces, face_mats): f.material_index = slots.index(m)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for s in slots: me.materials.append(MAT[s])
    attr = me.color_attributes.new("ArmorColor", "FLOAT_COLOR", "CORNER")
    for p in me.polygons:
        col = base_color(slots[p.material_index]) * bright
        c = p.center
        t = max(0.0, min(1.0, (c.z - D["zb"]) / (D["ztop"] - D["zb"])))
        g = (D["grad_lo"] + (D["grad_hi"] - D["grad_lo"]) * t) if gradient else 1.0
        g *= 0.97 + 0.06 * ((p.index * 7919) % 1000) / 1000.0
        for li in p.loop_indices: attr.data[li].color = (min(1, col.x * g), min(1, col.y * g), min(1, col.z * g), 1.0)
        p.use_smooth = False
    me.color_attributes.active_color = attr
    return ob


def add_bevel(ob, edge_mat):
    """Thin angle-limited bevel whose faces take a lighter edge material: the concept's highlighted plate edges."""
    names = [m.name for m in ob.data.materials]
    if edge_mat not in names: ob.data.materials.append(MAT[edge_mat]); names.append(edge_mat)
    b = ob.modifiers.new("EdgeBevel", "BEVEL"); b.width = D["bevel"]; b.segments = 1
    b.limit_method = "ANGLE"; b.angle_limit = math.radians(30); b.material = names.index(edge_mat); b.harden_normals = False


def octagon(s=1.0, yoff=0.0):
    wx, dy, yc = D["wx"] * s, D["dy"] * s, D["yc"] + yoff
    cf, cb = D["cf"] * D["wx"] * s, D["cb"] * D["wx"] * s
    # counter-clockwise from above, starting at the front-right chamfer
    return [(wx, yc + dy - cf), (wx - cf, yc + dy), (-(wx - cf), yc + dy), (-wx, yc + dy - cf),
            (-wx, yc - dy + cb), (-(wx - cb), yc - dy), (wx - cb, yc - dy), (wx, yc - dy + cb)]


SIDE_NAMES = ["front_chamfer_R", "front", "front_chamfer_L", "side_L", "back_chamfer_L", "back", "back_chamfer_R", "side_R"]


def loft(bm, rings, side_mat, cap_top=None, cap_bottom=None):
    """rings: list of (z, scale[, y offset]). Returns face-material list for faces added (in creation order)."""
    mats = []
    vs = [[bm.verts.new((x, y, r[0])) for x, y in octagon(r[1], r[2] if len(r) > 2 else 0.0)] for r in rings]
    rings = [r[:2] for r in rings]
    for k in range(len(rings) - 1):
        for i in range(8):
            j = (i + 1) % 8
            bm.faces.new((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i])); mats.append(side_mat(k, i))
    if cap_top: bm.faces.new(vs[-1]); mats.append(cap_top)
    if cap_bottom: bm.faces.new(list(reversed(vs[0]))); mats.append(cap_bottom)
    return mats


# ---------------------------------------------------------------- lower helm (face band)
bm = bmesh.new()
def jaw_mat(k, i):
    n = SIDE_NAMES[i]   # edge i..i+1 lies on this side (edges start at the front-right chamfer)
    if n == "front": return "FaceDark"
    if n.startswith("front_chamfer"): return "SteelFacet"
    if n.startswith("back"): return "SteelShade"
    return "SteelFacet"
mats = loft(bm, [(D["zb"], 0.985), (D["zbrow"], 1.0)], jaw_mat, cap_bottom="DarkSteel")
# vents on both side planes
vz0 = D["zb"] + D["vent_z"] * (D["zbrow"] - D["zb"]) - D["vent_h"] * (D["zbrow"] - D["zb"]) / 2
vz1 = vz0 + D["vent_h"] * (D["zbrow"] - D["zb"])
for s in (1, -1):
    x0 = s * D["wx"]; x1 = s * (D["wx"] + 0.007)
    y0 = D["yc"] + D["vent_y0"] * D["dy"]; y1 = D["yc"] + D["vent_y1"] * D["dy"]
    r = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    for v in r:
        v.co = Vector(((x0 + x1) / 2 + (x1 - x0) / 2 * v.co.x * 2, (y0 + y1) / 2 + (y1 - y0) / 2 * v.co.y * 2, (vz0 + vz1) / 2 + (vz1 - vz0) / 2 * v.co.z * 2))
    mats += ["SteelShade"] * 6
jaw = make_object("GenHelmJaw", bm, mats)
add_bevel(jaw, "SteelEdge")

# ---------------------------------------------------------------- crown with overhanging brow ledge
bm = bmesh.new()
L = D["ledge"]; Hc = D["ztop"] - D["zbrow"]; fw, cbk = D["ledge_fwd"], D["crown_back"]
# overhanging brow band pushed forward over the recessed face, then crown planes sloping in to a smaller flat top,
# the front sloping back the most (concept helmet detail)
rings = [(D["zbrow"] - 0.002, 1.0, 0.0), (D["zbrow"] - 0.002, L, fw), (D["zbrow"] + 0.028, L, fw),
         (D["zbrow"] + 0.034, L * 0.985, fw * 0.6), (D["zwall"] + 0.034, L * 0.975, fw * 0.4),
         (D["zbrow"] + 0.60 * Hc, (L + D["top_scale"]) / 2 + 0.035, -cbk * 0.40), (D["ztop"] - 0.010, D["top_scale"] * 1.03, -cbk),
         (D["ztop"], D["top_scale"], -cbk)]
def crown_mat(k, i):
    n = SIDE_NAMES[i]
    if k == 0: return "DarkSteel"          # underside of the ledge
    if k == 1: return "SteelEdge"          # ledge band
    if k == 2: return "SteelShade"         # step in above the band
    if k == 6: return "SteelEdge"          # bevel to the top
    return "SteelShade" if n.startswith("back") else "SteelFacet"
mats = loft(bm, rings, crown_mat, cap_top="SteelFacet")
shell = make_object("GenHelmShell", bm, mats)
add_bevel(shell, "SteelEdge")

# ---------------------------------------------------------------- stepped crest
bm = bmesh.new()
yc, dy = D["yc"], D["dy"]
back_top = yc - dy * D["top_scale"]
prof = [(yc + D["crest_front"], D["ztop"] - 0.002), (yc + D["crest_front"], D["crest_top"]),
        (yc + D["crest_step_y"], D["crest_top"]), (yc + D["crest_step_y"], D["crest_step"]),
        (back_top - cbk - 0.004, D["crest_step"]), (yc - dy * L - 0.006, D["zwall"] + 0.012),
        (yc - dy * L - 0.006, D["crest_tail"]), (yc - dy * L + 0.004, D["crest_tail"]),
        (yc - dy * L + 0.004, D["zwall"]), (back_top - cbk + 0.004, D["ztop"] - 0.002)]
n = len(prof); hw = D["crest_hw"]
R = [bm.verts.new((hw, y, z)) for y, z in prof]; Lf = [bm.verts.new((-hw, y, z)) for y, z in prof]
mats = []
bm.faces.new(R); mats.append("CrimsonCloth"); bm.faces.new(list(reversed(Lf))); mats.append("CrimsonCloth")
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((R[i], Lf[i], Lf[j], R[j])); mats.append("ClothLight" if i in (1, 3) else "ClothShade" if i in (5, 6, 7) else "CrimsonCloth")
crest = make_object("GenHelmCrest", bm, mats, gradient=False)
add_bevel(crest, "ClothLight")

# ---------------------------------------------------------------- conforming details on the helm surface
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
verts, polys = [], []
for ob in (jaw, shell):
    base = len(verts); verts += [ob.matrix_world @ v.co for v in ob.data.vertices]
    polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
bvh = BVHTree.FromPolygons(verts, polys)


def front_point(x, z, lift):
    hit = bvh.ray_cast(Vector((x, 3.0, z)), Vector((0, -1, 0)), 10.0)
    if hit[0] is None: return None
    return hit[0] + Vector((0, 1, 0)) * lift


def slab(bm, x0, x1, z0, z1, lift, depth, res):
    nx = max(1, int(abs(x1 - x0) / res)); nz = max(1, int(abs(z1 - z0) / res))
    grid = {}
    for i in range(nx + 1):
        for k in range(nz + 1):
            pf = front_point(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * k / nz, lift)
            if pf is not None: grid[(i, k)] = (bm.verts.new(pf), bm.verts.new(pf - Vector((0, depth, 0))))
    added = 0
    for i in range(nx):
        for k in range(nz):
            q = [(i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1)]
            if all(g in grid for g in q):
                bm.faces.new([grid[g][0] for g in q]); added += 1
    border = [(i, 0) for i in range(nx + 1)] + [(nx, k) for k in range(1, nz + 1)] + [(i, nz) for i in range(nx - 1, -1, -1)] + [(0, k) for k in range(nz - 1, 0, -1)]
    for a, b in zip(border, border[1:] + border[:1]):
        if a in grid and b in grid:
            bm.faces.new([grid[a][0], grid[b][0], grid[b][1], grid[a][1]]); added += 1
    return added


zb, zw = D["zb"], D["zbrow"]
zf = lambda t: zb + t * (zw - zb)
W = D["wx"]
bm = bmesh.new(); cnt = 0
for s in (1, -1):
    X = lambda t: s * t * W
    for x0, x1, z0, z1 in ((X(D["s_in"]), X(D["s_out"]), zf(D["s_bot"]), zf(D["bar_hi"])),
                           (X(D["s_out"]), X(D["bar_out"]), zf(D["bar_lo"]), zf(D["bar_hi"])),
                           (X(D["tick_in"]), X(D["bar_out"]), zf(D["bar_hi"]), zf(D["tick_hi"]))):
        cnt += slab(bm, min(x0, x1), max(x0, x1), z0, z1, 0.005, 0.006, 0.05)
visor = make_object("GenVisor", bm, ["VisorGlow"] * cnt, gradient=False)
bm = bmesh.new(); cnt = 0
for s in (1, -1):
    X = lambda t: s * t * W
    # raised lit side plates: the dark face sits recessed between them (concept)
    cnt += slab(bm, min(X(D["s_out"] + 0.025), X(0.955)), max(X(D["s_out"] + 0.025), X(0.955)), zf(D["s_bot"]), zf(D["bar_lo"] - 0.025), D["panel_lift"], D["panel_lift"] + 0.004, 0.05)
panels = make_object("GenHelmPanels", bm, ["SteelEdge"] * cnt, gradient=False, bright=D["panel_bright"])
# brass beak: strip on the crown front (vertical wall and top bevel) narrowing to a point between the glyph bars
bm = bmesh.new(); cnt = 0
bw = D["brass_w"] * W
cnt += slab(bm, -bw, bw, zw + 0.002, D["ztop"] - 0.004, 0.005, 0.006, 0.012)
rows = []
steps = 3
for k in range(steps + 1):
    t = k / steps
    z = zw + 0.002 - t * (zw + 0.002 - zf(D["bar_lo"]))
    wk = bw * (1 - t) + 0.003 * t
    pl, pr = front_point(-wk, z, 0.006), front_point(wk, z, 0.006)
    if pl is None or pr is None: continue
    rows.append((bm.verts.new(pl), bm.verts.new(pr), bm.verts.new(pl - Vector((0, 0.006, 0))), bm.verts.new(pr - Vector((0, 0.006, 0)))))
for (a, b, a2, b2), (c, d, c2, d2) in zip(rows, rows[1:]):
    for q in ((a, b, d, c), (a2, c2, d2, b2), (a, c, c2, a2), (b, b2, d2, d)):
        bm.faces.new(q); cnt += 1
brass = make_object("GenHelmBrass", bm, ["Brass"] * cnt, gradient=False)
add_bevel(brass, "BrassEdge")

# ---------------------------------------------------------------- replace the generated helmet
old = bpy.data.objects.get("GenHelmet")
if old: bpy.data.objects.remove(old)
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("HELMET3 brow %.3f wall %.3f" % (zw, D["zwall"]), {o.name: len(o.data.polygons) for o in (jaw, shell, crest, visor, panels, brass)})
