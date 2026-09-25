"""bake.py -- in head.blend: decimate GenBody/GenHelmet, unwrap, bake the concept views into textures.

Each view is an orthographic projection registered by silhouette (register*.json), weighted by how squarely the
surface faces that view and gated by per-vertex visibility (ray toward the view), so a view only paints what it sees.
"""
import sys, json, math, bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SCR = "artifacts/concept3d/"
MV, GEN = SCR + "mv/", SCR + "gen/"
args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
BODY_FACES, HELM_FACES = int(args[1]), int(args[2])
REG = json.load(open(GEN + "register.json"))
HREG = json.load(open(GEN + "register_helmet.json"))
DIRS = {"front": Vector((0, 1, 0)), "back": Vector((0, -1, 0)), "side": Vector((1, 0, 0))}

body, helm = bpy.data.objects["GenBody"], bpy.data.objects["GenHelmet"]


def decimate(ob, target):
    ratio = min(1.0, target / len(ob.data.polygons))
    m = ob.modifiers.new("Dec", "DECIMATE"); m.ratio = ratio; m.use_collapse_triangulate = True
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=m.name)
    print("DECIMATED", ob.name, len(ob.data.polygons))


for ob, n in ((body, BODY_FACES), (helm, HELM_FACES)):
    decimate(ob, n)

# --- per-vertex visibility toward each view, occluded by both meshes
dg = bpy.context.evaluated_depsgraph_get()
verts, polys = [], []
for ob in (body, helm):
    base = len(verts)
    verts += [ob.matrix_world @ v.co for v in ob.data.vertices]
    polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
scene_bvh = BVHTree.FromPolygons(verts, polys)
for ob in (body, helm):
    me = ob.data
    attr = me.color_attributes.new("Vis", "FLOAT_COLOR", "POINT")
    nm = ob.matrix_world.to_3x3().inverted().transposed()
    for v in me.vertices:
        p = ob.matrix_world @ v.co; n = (nm @ v.normal).normalized()
        vals = []
        for key in ("front", "back", "side"):
            d = DIRS[key]
            hit = scene_bvh.ray_cast(p + n * 0.004 + d * 0.002, d, 4.0)
            vals.append(0.0 if hit[0] is not None else 1.0)
        attr.data[v.index].color = (*vals, 1.0)
    print("VIS", ob.name, "front-visible", round(float(np.mean([c.color[0] for c in attr.data])), 3))

# --- unwrap
for ob in (body, helm):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def projection_material(name, views, fallback=(0.11, 0.11, 0.13)):
    """views: list of (image_file, reg dict, normal axis, normal sign, vis channel or None, weight, left_fill)."""
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    out = N("ShaderNodeOutputMaterial"); em = N("ShaderNodeEmission"); L(em.outputs[0], out.inputs[0])
    geo = N("ShaderNodeNewGeometry")
    pos = N("ShaderNodeSeparateXYZ"); L(geo.outputs["Position"], pos.inputs[0])
    nrm = N("ShaderNodeSeparateXYZ"); L(geo.outputs["Normal"], nrm.inputs[0])
    vis_attr = N("ShaderNodeVertexColor"); vis_attr.layer_name = "Vis"
    vis = N("ShaderNodeSeparateColor"); L(vis_attr.outputs["Color"], vis.inputs[0])

    def math_node(op, a, b=None, c=None):
        m = N("ShaderNodeMath"); m.operation = op
        for i, x in enumerate((a, b, c)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: L(x, m.inputs[i])
        return m.outputs[0]

    col_acc, w_acc = None, None
    for fn, r, nax, nsign, vch, weight, left_fill in views:
        u = math_node("MULTIPLY_ADD", pos.outputs[r["haxis"]], r["a"], r["b"])
        v = math_node("MULTIPLY_ADD", pos.outputs[2], -r["c"], 1.0 - r["d"])
        uv = N("ShaderNodeCombineXYZ"); L(u, uv.inputs[0]); L(v, uv.inputs[1])
        tex = N("ShaderNodeTexImage"); tex.image = bpy.data.images.load(MV + fn, check_existing=True)
        tex.interpolation = "Linear"; tex.extension = "EXTEND"; L(uv.outputs[0], tex.inputs[0])
        facing = math_node("MAXIMUM", math_node("MULTIPLY", nrm.outputs[nax], float(nsign)), 0.0)
        w = math_node("POWER", facing, 3.0)
        if left_fill:   # surfaces facing -X (no concept view) borrow front/back at a low weight
            lf = math_node("MULTIPLY", math_node("MAXIMUM", math_node("MULTIPLY", nrm.outputs[0], -1.0), 0.0), left_fill)
            w = math_node("ADD", w, lf)
        if vch is not None:
            w = math_node("MULTIPLY", w, math_node("MULTIPLY_ADD", vis.outputs[vch], 0.92, 0.08))
        w = math_node("MULTIPLY", w, weight)
        sc = N("ShaderNodeVectorMath"); sc.operation = "SCALE"; L(tex.outputs[0], sc.inputs[0]); L(w, sc.inputs["Scale"])
        if col_acc is None:
            col_acc, w_acc = sc.outputs[0], w
        else:
            ad = N("ShaderNodeVectorMath"); ad.operation = "ADD"; L(col_acc, ad.inputs[0]); L(sc.outputs[0], ad.inputs[1]); col_acc = ad.outputs[0]
            w_acc = math_node("ADD", w_acc, w)
    # fallback colour where no view sees the surface
    fb_w = 0.02
    fb = N("ShaderNodeCombineXYZ"); [setattr(fb.inputs[i], "default_value", fallback[i] * fb_w) for i in range(3)]
    ad = N("ShaderNodeVectorMath"); ad.operation = "ADD"; L(col_acc, ad.inputs[0]); L(fb.outputs[0], ad.inputs[1])
    tot = math_node("ADD", w_acc, fb_w)
    dv = N("ShaderNodeCombineXYZ"); [L(tot, dv.inputs[i]) for i in range(3)]
    div = N("ShaderNodeVectorMath"); div.operation = "DIVIDE"; L(ad.outputs[0], div.inputs[0]); L(dv.outputs[0], div.inputs[1])
    L(div.outputs[0], em.inputs["Color"])
    return mat


body_views = [(REG["front"]["file"], REG["front"], 1, +1, 0, 1.0, 0.35),
              (REG["back"]["file"], REG["back"], 1, -1, 1, 1.0, 0.35),
              (REG["side"]["file"], REG["side"], 0, +1, 2, 0.9, 0.0)]
helm_views = [(HREG["file"], HREG, 1, +1, 0, 2.0, 0.5)] + body_views[1:]

scene = bpy.context.scene
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 1
scene.render.bake.margin = 8
for ob, views, size, tag in ((body, body_views, 2048, "body"), (helm, helm_views, 1024, "helmet")):
    mat = projection_material(f"Proj_{tag}", views)
    ob.data.materials.clear(); ob.data.materials.append(mat)
    img = bpy.data.images.new(f"Spellblade_{tag}", size, size, alpha=False)
    node = mat.node_tree.nodes.new("ShaderNodeTexImage"); node.image = img
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="EMIT")
    img.filepath_raw = GEN + f"tex_{tag}.png"; img.file_format = "PNG"; img.save()
    print("BAKED", tag, img.filepath_raw)
    # final lit material using the baked texture
    fin = bpy.data.materials.new(f"Spellblade_{tag.capitalize()}Paint"); fin.use_nodes = True
    bsdf = fin.node_tree.nodes["Principled BSDF"]
    t = fin.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
    fin.node_tree.links.new(t.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.72; bsdf.inputs["Metallic"].default_value = 0.15
    ob.data.materials.clear(); ob.data.materials.append(fin)
bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
print("SAVED", OUT)
