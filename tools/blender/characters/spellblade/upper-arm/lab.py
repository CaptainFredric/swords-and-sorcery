# Blender arm lab: load the knight, pose it, optionally add the candidate rerebrace, render labelled views.
# blender -b --python lab.py -- <glb> <outprefix> <jobs.json> [candidate.py]
import bpy, sys, json, math, mathutils, os
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out, jobs = argv[0], argv[1], json.load(open(argv[2]))
cand = argv[3] if len(argv) > 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
sc = bpy.context.scene
COLORS = {'Rerebrace': (1.0, 0.2, 0.2), 'Pauldron': (0.2, 0.45, 1.0), 'Gauntlet': (0.95, 0.75, 0.2), 'Breastplate': (0.6, 0.6, 0.6), 'Rerebrace': (1.0, 0.2, 0.2), 'Couter': (0.3, 0.9, 0.3), 'InnerSkeletonCore': (0.25, 0.25, 0.25)}
def colorize(on):
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        key = next((k for k in COLORS if k in o.name), None)
        if on and key:
            m = bpy.data.materials.get('lab_' + key) or bpy.data.materials.new('lab_' + key)
            m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*COLORS[key], 1)
            o['_mats'] = [s.material.name if s.material else '' for s in o.material_slots] if '_mats' not in o else o['_mats']
            for s in o.material_slots: s.material = m
        elif not on and '_mats' in o:
            for s, n in zip(o.material_slots, o['_mats']): s.material = bpy.data.materials.get(n)
if cand:
    exec(open(cand).read(), {'bpy': bpy, 'arm': arm, 'mathutils': mathutils, 'math': math})
if not sc.world: sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True; bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.78, 0.8, 0.82, 1); bg.inputs[1].default_value = 1.2
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.rotation_euler = (0.8, 0.1, 2.4); sun.data.energy = 3.5
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x = sc.render.resolution_y = 600
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
pb = arm.pose.bones
# the clips carry the build's own pauldron keys; the game sets the pauldrons itself every frame, so those keys are muted
for a in bpy.data.actions:
    for fc in getattr(a, 'fcurves', []):
        if 'pauldron.' in fc.data_path: fc.mute = True
    for layer in getattr(a, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                for fc in bag.fcurves:
                    if 'pauldron.' in fc.data_path: fc.mute = True
def bonepos(name): return arm.matrix_world @ pb[name].head
for j in jobs:
    act = j['clip']
    if act == 'rest':
        arm.animation_data_clear() if arm.animation_data else None
        for b in pb: b.matrix_basis.identity()
    else:
        a = bpy.data.actions.get(act); arm.animation_data_create(); arm.animation_data.action = a
        f0, f1 = a.frame_range; sc.frame_set(int(round(f0 + (f1 - f0) * j['frac'])))
    bpy.context.view_layer.update()
    # the game's pauldron rule (client/game/pauldronFollow.mjs, SpellbladeAnimator #followPauldrons): each pauldron shares
    # its upper arm's rest, turned part of the way with it: 0.6, rising to 0.95 as the arm turns 55 -> 110 degrees
    for s in ('L', 'R'):
        ua, pa = pb['upper_arm.' + s], pb.get('pauldron.' + s)
        if not pa: continue
        ua.rotation_mode = pa.rotation_mode = 'QUATERNION'
        q = ua.rotation_quaternion.copy(); turn = math.degrees(2 * math.acos(min(1, abs(q.w))))
        t = max(0, min(1, (turn - 55) / 55)); share = 0.6 + 0.35 * t * t * (3 - 2 * t)
        if os.environ.get('FOLLOW'): fr, fh = json.loads(os.environ['FOLLOW']); share = fr + (fh - fr) * t * t * (3 - 2 * t)
        pa.rotation_quaternion = mathutils.Quaternion().slerp(q, share); pa.location = ua.location
    bpy.context.view_layer.update()
    colorize(j.get('color', False))
    tgt = bpy.context.scene.cursor.location.copy()
    pts = [bonepos(n) for n in j['look']]
    tgt = sum(pts, mathutils.Vector()) / len(pts)
    d = mathutils.Vector(j['dir']).normalized()   # Blender world: x right(char R), -y forward of knight(-Z glTF -> +Y blender?), z up
    cam.location = tgt + d * j['dist']; cam.data.lens = j.get('lens', 50)
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f"{out}-{j['name']}.png"; bpy.ops.render.render(write_still=True)
print('LAB DONE')
