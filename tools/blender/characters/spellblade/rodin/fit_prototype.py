"""Fit Rodin's Spellblade onto the game's 27-bone rig (production rest orientations, Rodin's proportions), so the
production clips play it unchanged. Saves a .blend for rendering and export."""
import bpy, sys, math, numpy as np
from mathutils import Vector, Matrix, Quaternion
a = sys.argv[sys.argv.index("--")+1:]
PROD, RA, RB, OUT = a[0], a[1], a[2], a[3]

def pca(P):
    P = np.asarray(P); c = P.mean(0); _, _, vt = np.linalg.svd(P - c); return c, vt

# --- production rig and its clips ------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=PROD)
rig = bpy.data.objects['SpellbladeRig']
sword = bpy.data.objects['HeroSword']
hand_rest = rig.data.bones['hand.R'].matrix_local.copy()
SV = np.array([tuple(rig.matrix_world @ v.co) for v in sword.data.vertices])
c, vt = pca(SV); d = vt[0]
hh = np.array(tuple(hand_rest.to_translation()))
proj = (SV - c) @ d
if np.linalg.norm(c + d * proj.max() - hh) < np.linalg.norm(c + d * proj.min() - hh): d = -d
far = SV[((SV - hh) @ d) > 0.35]                    # the blade, beyond the guard
_, vtb = pca(far); w = vtb[1] - np.dot(vtb[1], d) * d; w /= np.linalg.norm(w)
R_hand = np.array(hand_rest.to_3x3())
sword_d_loc, sword_w_loc = R_hand.T @ d, R_hand.T @ w
for o in list(bpy.data.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o)
actions = {act.name: act for act in bpy.data.actions}

# --- Rodin: the posed mesh (file a), its skeleton and weights (file b) -----------------------------------------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=RA)
mesh = next(o for o in set(bpy.data.objects) - before if o.type == 'MESH' and not o.name.startswith('Icosphere'))
mesh.name = 'RodinSpellblade'
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=RB)
new = set(bpy.data.objects) - before
rarm = next(o for o in new if o.type == 'ARMATURE'); rmesh = next(o for o in new if o.type == 'MESH' and not o.name.startswith('Icosphere'))
J = {b.name: (rarm.matrix_world @ b.head_local, rarm.matrix_world @ b.tail_local) for b in rarm.data.bones}
# weights by vertex index (same mesh, same order: checked against file a's positions)
dg = bpy.context.evaluated_depsgraph_get()
ev = rmesh.evaluated_get(dg); em = ev.to_mesh()
pa = np.array([tuple(mesh.matrix_world @ v.co) for v in mesh.data.vertices])
pb = np.array([tuple(ev.matrix_world @ v.co) for v in em.vertices]); ev.to_mesh_clear()
print('vertex order check: max distance a vs b', float(np.abs(pa - pb).max()))
names = [g.name for g in rmesh.vertex_groups]
RW = [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in rmesh.data.vertices]

# --- the transform: Rodin faces -Y; the game +Y. Turn, centre the hips over the rig's pelvis, scale hips to its height
hips = J['Hips'][0]; s = rig.data.bones['pelvis'].head_local.z / hips.z
T = Matrix.Translation((0, rig.data.bones['pelvis'].head_local.y, 0)) @ Matrix.Scale(s, 4) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((-hips.x, -hips.y, 0))
mesh.matrix_world = T @ mesh.matrix_world
bpy.context.view_layer.update()
Jt = {k: (T @ h, T @ t) for k, (h, t) in J.items()}
blade = np.array(tuple(T.to_3x3() @ Vector((-0.616, -0.633, -0.470)))); blade /= np.linalg.norm(blade)
P_world = np.array([tuple(mesh.matrix_world @ v.co) for v in mesh.data.vertices])
print('scale', round(s, 4), 'height now', round(float(P_world[:, 2].max() - P_world[:, 2].min()), 3))
# Rodin's blade width axis, from its blade verts (beyond the hand)
rh = np.array(tuple(Jt['RightHand'][0]))
bl = P_world[((P_world - rh) @ blade) > 0.35]
_, vtr = pca(bl); rw = vtr[1] - np.dot(vtr[1], blade) * blade; rw /= np.linalg.norm(rw)

for o in list(new):
    bpy.data.objects.remove(o)

# --- the fit ------------------------------------------------------------------------------------------------------
side = lambda k, sfx: k.replace('X', 'Left' if sfx == 'L' else 'Right')
MAP = {'pelvis': ('Hips', 'Spine'), 'spine': ('Spine', 'Spine2'), 'chest': ('Spine2', 'Neck'), 'neck': ('Neck', 'Head'),
       'head': ('Head', None)}
for sfx in 'LR':
    MAP.update({f'clavicle.{sfx}': (side('XShoulder', sfx), side('XArm', sfx)), f'upper_arm.{sfx}': (side('XArm', sfx), side('XForeArm', sfx)),
                f'forearm.{sfx}': (side('XForeArm', sfx), side('XHand', sfx)), f'hand.{sfx}': (side('XHand', sfx), side('XHandMiddle1', sfx)),
                f'thigh.{sfx}': (side('XUpLeg', sfx), side('XLeg', sfx)), f'shin.{sfx}': (side('XLeg', sfx), side('XFoot', sfx)),
                f'foot.{sfx}': (side('XFoot', sfx), 'TAIL:' + side('XToeBase', sfx))})

def rot_between(u, v):
    u, v = Vector(u).normalized(), Vector(v).normalized()
    return u.rotation_difference(v).to_matrix()

bones = rig.data.bones
order = []
def walk(b):
    order.append(b.name); [walk(c) for c in b.children]
walk(bones['root'])
old_rest = {b.name: b.matrix_local.copy() for b in bones}
old_len = {b.name: b.length for b in bones}
new_rest, pose_w, length = {}, {}, {}
for name in order:
    b = bones[name]; p = b.parent.name if b.parent else None
    R_old = old_rest[name].to_3x3()
    if name in MAP:
        hj, tj = MAP[name]
        H = Jt[hj][0]
        if tj is None: tgt, L = R_old.col[1], old_len[name] * s
        elif tj.startswith('TAIL:'): tgt = Jt[tj[5:]][1] - H; L = tgt.length
        else: tgt = Jt[tj][0] - H; L = tgt.length
        if name == 'hand.R':      # by the sword: production's blade axis and width (in the hand) onto Rodin's
            A = np.column_stack([sword_d_loc, sword_w_loc, np.cross(sword_d_loc, sword_w_loc)])
            B = np.column_stack([blade, rw, np.cross(blade, rw)])
            Rp = Matrix((B @ A.T).tolist()); L = old_len[name] * s
        else:
            Rp = rot_between(R_old.col[1], tgt) @ R_old
        if p:
            head_rest = new_rest[p] @ pose_w[p].inverted() @ H
        else:
            head_rest = H
        new_rest[name] = Matrix.Translation(head_rest) @ R_old.to_4x4()
        pose_w[name] = Matrix.Translation(H) @ Rp.to_4x4()
        length[name] = L
    else:
        new_rest[name] = (new_rest[p] @ old_rest[p].inverted() @ old_rest[name]) if p else old_rest[name]
        pose_w[name] = (pose_w[p] @ new_rest[p].inverted() @ new_rest[name]) if p else new_rest[name]
        length[name] = old_len[name] * (s if p else 1)

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for eb in rig.data.edit_bones: eb.use_connect = False
for name in order:
    eb = rig.data.edit_bones[name]; eb.matrix = new_rest[name]; eb.length = length[name]
bpy.ops.object.mode_set(mode='POSE')
rig.animation_data.action = None
for name in order:
    pb = rig.pose.bones[name]; pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    p = bones[name].parent
    parent_term = (pose_w[p.name] @ new_rest[p.name].inverted()) if p else Matrix.Identity(4)
    basis = (parent_term @ new_rest[name]).inverted() @ pose_w[name]
    pb.rotation_quaternion = basis.to_quaternion()
bpy.ops.object.mode_set(mode='OBJECT'); bpy.context.view_layer.update()
err = max((rig.matrix_world @ rig.pose.bones[n].head - pose_w[n].to_translation()).length for n in MAP)
print('fit: max posed joint error (m)', round(err, 5))

# --- weights, then the mesh unposed into the rest (inverse linear blend skinning) ---------------------------------
WMAP = {'Hips': {'pelvis': 1}, 'Spine': {'spine': 1}, 'Spine1': {'spine': .5, 'chest': .5}, 'Spine2': {'chest': 1}, 'Neck': {'neck': 1}, 'Head': {'head': 1}}
for sfx, S_ in (('L', 'Left'), ('R', 'Right')):
    WMAP.update({f'{S_}Shoulder': {f'clavicle.{sfx}': 1}, f'{S_}Arm': {f'upper_arm.{sfx}': 1}, f'{S_}ForeArm': {f'forearm.{sfx}': 1},
                 f'{S_}Hand': {f'hand.{sfx}': 1}, f'{S_}UpLeg': {f'thigh.{sfx}': 1}, f'{S_}Leg': {f'shin.{sfx}': 1},
                 f'{S_}Foot': {f'foot.{sfx}': 1}, f'{S_}ToeBase': {f'foot.{sfx}': 1}})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for k in '123': WMAP[f'{S_}Hand{f}{k}'] = {f'hand.{sfx}': 1}
groups = {n: mesh.vertex_groups.new(name=n) for n in order}
# the sword is rigid: everything along Rodin's blade from just behind the grip to the tip (the blade's width), and the
# crossguard and fist around the grip, follows the sword hand alone
grip = np.array(tuple(Jt['RightHand'][0]))
ax, origin = blade.copy(), grip.copy()
for _ in range(3):   # the blade's true axis, from the blade's own vertices
    rel = P_world - origin; t_ax = rel @ ax; perp = np.linalg.norm(rel - np.outer(t_ax, ax), axis=1)
    core = P_world[(t_ax > 0.3) & (perp < 0.12)]
    c_, vt_ = pca(core); ax = vt_[0] * np.sign(vt_[0] @ ax); origin = c_ - ax * ((c_ - grip) @ ax)
rel = P_world - origin; t_ax = rel @ ax; perp = np.linalg.norm(rel - np.outer(t_ax, ax), axis=1)
tip_t = t_ax[perp < 0.1].max()
radius = np.where(t_ax > 0.6, 0.11, 0.08)
is_sword = ((t_ax > 0.12) & (t_ax <= tip_t + 0.03) & (perp < radius)) | ((t_ax > -0.05) & (t_ax <= 0.12) & (perp < 0.16))
print('blade axis refined: angle from first estimate (deg)', round(float(np.degrees(np.arccos(min(1, abs(ax @ blade))))), 2))
print('sword vertices locked to hand.R:', int(is_sword.sum()), 'blade length (m)', round(float(tip_t), 3))
VW = []
for vi, src in enumerate(RW):
    out = {}
    for g, wv in src.items():
        for tgt_, f in WMAP.get(g, {}).items(): out[tgt_] = out.get(tgt_, 0) + wv * f
    if is_sword[vi]: out = {'hand.R': 1.0}
    tot = sum(out.values()) or 1
    out = {k: v / tot for k, v in out.items()}
    VW.append(out)
    for k, v in out.items(): groups[k].add([vi], v, 'REPLACE')
Mj = {n: np.array(rig.matrix_world @ rig.pose.bones[n].matrix @ rig.data.bones[n].matrix_local.inverted()) for n in order}
inv_obj = np.array(mesh.matrix_world.inverted())
rest = np.zeros_like(P_world)
for vi, out in enumerate(VW):
    M = sum(Mj[k] * v for k, v in out.items())
    rest[vi] = (np.linalg.inv(M) @ np.append(P_world[vi], 1))[:3]
mesh.matrix_world = Matrix.Identity(4)
for vi, v in enumerate(mesh.data.vertices): v.co = rest[vi]
mesh.parent = rig
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); em = ev.to_mesh()
back = np.array([tuple(ev.matrix_world @ v.co) for v in em.vertices]); ev.to_mesh_clear()
print('unpose round trip: max error (m)', float(np.abs(back - P_world).max()))
rig['rodin_pose'] = {n: list(rig.pose.bones[n].rotation_quaternion) for n in order}
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('FIT_OK', OUT, 'actions', sorted(actions))
