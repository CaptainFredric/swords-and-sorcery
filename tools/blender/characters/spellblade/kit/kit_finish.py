# kit_finish.py -- executed at the end of kit_pieces.py (after merges): wear texture + box UVs + baked occlusion.
import math, random
from mathutils.bvhtree import BVHTree

FIN = dict(uv_scale=0.30, ao_dist=0.075, ao_strength=0.80, ao_min=0.42, ao_rays=20)
for k in list(FIN):
    if k in P: FIN[k] = P[k]
WEAR = {"KitMetal": ("wear_metal.jpg", 1 / 0.795), "KitMatte": ("wear_matte.jpg", 1 / 0.875)}


def wear_material(m, fn):
    nt = m.node_tree
    ca = next(n for n in nt.nodes if n.type == "VERTEX_COLOR") if any(n.type == "VERTEX_COLOR" for n in nt.nodes) else None
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    base = None
    if ca is None:          # banner: texture x ArmorColor (occlusion only)
        base = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
        ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "ArmorColor"
    else:
        img = bpy.data.images.load(SCR + fn); img.pack(); img.name = m.name + "Wear"
        base = nt.nodes.new("ShaderNodeTexImage"); base.image = img
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
    nt.links.new(ca.outputs["Color"], mx.inputs[6]); nt.links.new(base.outputs["Color"], mx.inputs[7])
    nt.links.new(mx.outputs[2], b.inputs["Base Color"])


if not ONLY:
    for mname, (fn, comp) in WEAR.items(): wear_material(MATS[mname], fn)
    if "KitBanner" in MATS: wear_material(MATS["KitBanner"], None)

    GROUP = globals().get("FIN_GROUP") or {"HelmetShell": "head", "HelmetJaw": "head", "Crest": "head", "Breastplate": "torso", "TabardFront": "cloth",
             "TabardBack": "cloth", "Pauldron.R": "shR", "Pauldron.L": "shL", "Gauntlet.R": "armR", "Gauntlet.L": "armL",
             "Greave.R": "legR", "Boot.R": "legR", "Greave.L": "legL", "Boot.L": "legL"}
    OCC = globals().get("FIN_OCC") or {"head": ("head", "torso"), "torso": ("torso", "cloth", "head", "shR", "shL"), "cloth": ("torso", "cloth"),
           "shR": ("shR", "torso", "armR"), "shL": ("shL", "torso", "armL"), "armR": ("armR", "shR"), "armL": ("armL", "shL"),
           "legR": ("legR", "torso", "cloth"), "legL": ("legL", "torso", "cloth")}
    objs = {n: bpy.data.objects[n] for n in GROUP if n in bpy.data.objects}
    geo = {}
    for n, o in objs.items():
        mw = o.matrix_world
        geo[n] = ([mw @ v.co for v in o.data.vertices], [list(p.vertices) for p in o.data.polygons])
    bvh = {}
    for g in set(GROUP.values()):
        V, F = [], []
        for n, gg in GROUP.items():
            if gg != g or n not in geo: continue
            b0 = len(V); V += geo[n][0]; F += [[b0 + i for i in f] for f in geo[n][1]]
        bvh[g] = BVHTree.FromPolygons(V, F) if F else None
    # cosine-weighted hemisphere pattern (z up)
    R = int(FIN["ao_rays"]); pat = []
    for i in range(R):
        u = (i + 0.5) / R; phi = i * 2.399963
        r = math.sqrt(u); pat.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(1 - u)))
    rnd = random.Random(5)
    stats = {}
    for n, o in objs.items():
        me = o.data; mw = o.matrix_world; nm3 = mw.to_3x3()
        attr = me.color_attributes["ArmorColor"]
        occl = [bvh[g] for g in OCC[GROUP[n]] if bvh.get(g)]
        V = geo[n][0]
        tot = 0.0
        for p in me.polygons:
            nrm = (nm3 @ p.normal).normalized()
            cen = mw @ p.center
            t1 = nrm.orthogonal().normalized(); t2 = nrm.cross(t1)
            rot = rnd.uniform(0, 2 * math.pi); c_, s_ = math.cos(rot), math.sin(rot)
            dirs = [(t1 * (x * c_ - y * s_) + t2 * (x * s_ + y * c_) + nrm * z) for x, y, z in pat]
            for li, vi in zip(p.loop_indices, p.vertices):
                org = V[vi] + (cen - V[vi]) * 0.3 + nrm * 0.003
                occ = 0.0
                for d in dirs:
                    best = None
                    for t in occl:
                        hit = t.ray_cast(org, d, FIN["ao_dist"])
                        if hit[0] is not None and (best is None or hit[3] < best): best = hit[3]
                    if best is not None: occ += 1.0 - best / FIN["ao_dist"]
                occ /= len(dirs)
                f = max(FIN["ao_min"], 1.0 - FIN["ao_strength"] * occ)
                c = attr.data[li].color
                attr.data[li].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)
                tot += f
        stats[n] = round(tot / max(1, len(me.loops)), 3)
    print("KIT_AO mean factor", stats)

    # box-projected UVs for the wear texture and colour compensation for its mean
    for o in exp.all_objects:
        if o.type != "MESH": continue
        me = o.data
        names = [m.name if m else "" for m in me.materials]
        if not any(n_ in WEAR for n_ in names): continue
        uvl = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
        for l in list(me.uv_layers):
            if l.name != uvl.name and not o.name.startswith("Tabard"): me.uv_layers.remove(l)
        uvl = me.uv_layers["UVMap"]; uvl.active = True; uvl.active_render = True
        mw = o.matrix_world; nm3 = mw.to_3x3(); sc_ = FIN["uv_scale"]
        attr = me.color_attributes.get("ArmorColor")
        for p in me.polygons:
            mname = names[p.material_index] if p.material_index < len(names) else ""
            if mname not in WEAR: continue
            nrm = nm3 @ p.normal; ax = max(range(3), key=lambda i: abs(nrm[i]))
            a1, a2 = [(1, 2), (0, 2), (0, 1)][ax]
            for li, vi in zip(p.loop_indices, p.vertices):
                co = mw @ me.vertices[vi].co
                uvl.data[li].uv = (co[a1] / sc_, co[a2] / sc_)
                if attr is not None:
                    c = attr.data[li].color; k = WEAR[mname][1]
                    attr.data[li].color = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1.0)
    print("KIT_FINISH done")
