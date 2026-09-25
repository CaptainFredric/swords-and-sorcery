"""separate.py -- in rebuilt.blend: cut the fused generated body along limb contacts that are not real joints.

1. Label each face with a chain (torso / armR / armL / legR / legL / clothF / clothB) from its vertices'
   weights, then denoise labels by neighbour majority so no stray islands remain.
2. Split the mesh along every boundary between chains, except real joints:
   torso-arm near the shoulder, torso-leg near the hip, torso-cloth where the cloth hangs from the body.
3. Restrict each vertex's weights to the bones its surrounding chains allow; renormalise; orphans copy the
   nearest vertex of the same chain; light smoothing (separated regions no longer share edges).
"""
import sys, bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

SCR = "artifacts/concept3d/"
sys.path.insert(0, SCR)
from smoothw import smooth_weights

out = sys.argv[sys.argv.index("--") + 1]
rig = bpy.data.objects["SpellbladeRig"]
body = bpy.data.objects["GenBody"]
me = body.data
bone_head = {b.name: rig.matrix_world @ b.head_local for b in rig.data.bones}
SHOULDER_Z = {s: bone_head[f"upper_arm.{s}"].z for s in "RL"}
HIP_Z = max(bone_head["thigh.R"].z, bone_head["thigh.L"].z)

TORSO = {"pelvis", "spine", "chest", "neck", "head", "tabard_root"}
CHAIN_BONES = {"torso": TORSO, "clothF": {"tabard_front_01", "tabard_front_02"}, "clothB": {"tabard_back_01", "tabard_back_02"}}
for s in "RL":
    CHAIN_BONES[f"arm{s}"] = {f"clavicle.{s}", f"upper_arm.{s}", f"forearm.{s}", f"hand.{s}"}
    CHAIN_BONES[f"leg{s}"] = {f"thigh.{s}", f"shin.{s}", f"foot.{s}"}
BONE_CHAIN = {b: c for c, bs in CHAIN_BONES.items() for b in bs}
# bones each chain may use (own chain + the junction bones it genuinely connects to)
ALLOW = {c: set(bs) for c, bs in CHAIN_BONES.items()}
ALLOW["torso"] |= {"clavicle.R", "clavicle.L", "thigh.R", "thigh.L"}
for s in "RL":
    ALLOW[f"arm{s}"] |= {"chest", "spine"}
    ALLOW[f"leg{s}"] |= {"pelvis"}
ALLOW["clothF"] |= {"pelvis", "tabard_root", "spine"}
ALLOW["clothB"] |= {"chest", "spine", "tabard_root"}


def allowed_pair(a, b, z):
    if a == b: return True
    p = {a, b}
    if p == {"torso", "armR"}: return z > SHOULDER_Z["R"] - 0.14
    if p == {"torso", "armL"}: return z > SHOULDER_Z["L"] - 0.14
    if p <= {"torso", "legR", "legL"} and "torso" in p: return z > HIP_Z - 0.12
    if p == {"torso", "clothF"}: return z > 0.98
    if p == {"torso", "clothB"}: return z > 1.06
    return False


gname = {g.index: g.name for g in body.vertex_groups}
V = len(me.vertices)
vw = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]


def vchain(w):
    score = {}
    for b, x in w.items():
        c = BONE_CHAIN.get(b)
        if c: score[c] = score.get(c, 0.0) + x
    return max(score, key=score.get) if score else "torso"


vch = [vchain(w) for w in vw]

# ---- 1. face labels, denoised
bm = bmesh.new(); bm.from_mesh(me)
bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
lab = []
for f in bm.faces:
    tally = {}
    for v in f.verts: tally[vch[v.index]] = tally.get(vch[v.index], 0) + 1
    lab.append(max(tally, key=tally.get))
for _ in range(4):
    new = list(lab)
    for f in bm.faces:
        tally = {lab[f.index]: 1.2}
        for e in f.edges:
            for g in e.link_faces:
                if g.index != f.index: tally[lab[g.index]] = tally.get(lab[g.index], 0) + 1
        new[f.index] = max(tally, key=tally.get)
    lab = new
counts = {}
for c in lab: counts[c] = counts.get(c, 0) + 1
print("FACE_CHAINS", counts)

# ---- 2. split along non-joint chain boundaries
cut = []
for e in bm.edges:
    lf = e.link_faces
    if len(lf) != 2: continue
    a, b = lab[lf[0].index], lab[lf[1].index]
    z = (e.verts[0].co.z + e.verts[1].co.z) / 2
    if not allowed_pair(a, b, z): cut.append(e)
face_lab_layer = bm.faces.layers.int.new("chain")
names = sorted(CHAIN_BONES)
for f in bm.faces: f[face_lab_layer] = names.index(lab[f.index])
bmesh.ops.split_edges(bm, edges=cut)
print("CUT_EDGES", len(cut))
bm.to_mesh(me)
# after split_edges vertex indices changed: rebuild per-vertex chains from their faces
bm2 = bmesh.new(); bm2.from_mesh(me); bm2.verts.ensure_lookup_table()
layer = bm2.faces.layers.int.get("chain")
vchains = [sorted({names[f[layer]] for f in v.link_faces}) for v in bm2.verts]
bm2.free(); bm.free()

# ---- 3. restrict weights per vertex
gname = {g.index: g.name for g in body.vertex_groups}
orph = []
for v in me.vertices:
    allowed = set().union(*[ALLOW[c] for c in vchains[v.index]]) if vchains[v.index] else ALLOW["torso"]
    keep = {gname[g.group]: g.weight for g in v.groups if gname[g.group] in allowed and g.weight > 0}
    drop = [g.group for g in v.groups if gname[g.group] not in allowed]
    for gi in drop: body.vertex_groups[gi].remove([v.index])
    tot = sum(keep.values())
    if tot <= 1e-6: orph.append(v.index); continue
    for b, w in keep.items(): body.vertex_groups[b].add([v.index], w / tot, "REPLACE")
if orph:
    by_chain = {}
    for v in me.vertices:
        if v.index in orph or not vchains[v.index]: continue
        by_chain.setdefault(vchains[v.index][0], []).append(v.index)
    trees = {}
    for c, ids in by_chain.items():
        kd = KDTree(len(ids))
        for i, vi in enumerate(ids): kd.insert(me.vertices[vi].co, i)
        kd.balance(); trees[c] = (kd, ids)
    for vi in orph:
        c = vchains[vi][0] if vchains[vi] else "torso"
        kd, ids = trees.get(c, trees["torso"])
        _, i, _ = kd.find(me.vertices[vi].co)
        for g in me.vertices[ids[i]].groups: body.vertex_groups[g.group].add([vi], g.weight, "REPLACE")
print("ORPHANS", len(orph))
smooth_weights(body, iterations=2, factor=0.5, deform_names={b.name for b in rig.data.bones if b.use_deform})
# drop the small loose pieces the cut leaves behind (fused fist bits at the hip, specks inside the helmet)
bm = bmesh.new(); bm.from_mesh(me); seen, isl_all = set(), []
for v in bm.verts:
    if v.index in seen: continue
    st, isl = [v], []; seen.add(v.index)
    while st:
        x = st.pop(); isl.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    isl_all.append(isl)
isl_all.sort(key=len, reverse=True)
loose = [v for isl in isl_all[1:] if len(isl) < 400 for v in isl]
bmesh.ops.delete(bm, geom=loose, context="VERTS"); bm.to_mesh(me); bm.free()
print("LOOSE_REMOVED", len(loose), "verts in", sum(1 for isl in isl_all[1:] if len(isl) < 400), "pieces")
if "chain" in me.attributes: me.attributes.remove(me.attributes["chain"])
for m in bpy.data.materials: m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("SEPARATED", out, "verts", len(me.vertices))
