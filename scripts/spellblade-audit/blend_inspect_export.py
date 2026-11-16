# Open a Spellblade .blend in real Blender (scripts disabled), report its rig, meshes, weights, Actions and F-curves,
# and export it natively with Blender's glTF exporter (every Action as a clip). Nothing is saved back to the .blend.
#   Blender -b --disable-autoexec file.blend --python blend_inspect_export.py -- out.glb report.json
import bpy, sys, json, hashlib

argv = sys.argv[sys.argv.index('--') + 1:]
out_glb, out_json = argv[0], argv[1]
report = {'file': bpy.data.filepath, 'blender': bpy.app.version_string}
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
report['armatures'] = []
for a in arms:
    bones = a.data.bones
    report['armatures'].append({'name': a.name, 'bones': len(bones), 'roots': [b.name for b in bones if not b.parent],
        'hierarchy': {b.name: (b.parent.name if b.parent else None) for b in bones},
        'deform': sum(1 for b in bones if b.use_deform), 'constraints': {pb.name: [c.type for c in pb.constraints] for pb in a.pose.bones if pb.constraints},
        'action': a.animation_data.action.name if a.animation_data and a.animation_data.action else None,
        'nla_tracks': [t.name for t in a.animation_data.nla_tracks] if a.animation_data else []})
meshes = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    mods = [m.type for m in o.modifiers]
    weights = {}
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight > 1e-4:
                name = o.vertex_groups[g.group].name
                weights[name] = weights.get(name, 0) + 1
    h = hashlib.sha1()
    for v in o.data.vertices: h.update(('%.5f,%.5f,%.5f;' % tuple(v.co)).encode())
    meshes.append({'name': o.name, 'data': o.data.name, 'vertices': len(o.data.vertices), 'polygons': len(o.data.polygons),
                   'modifiers': mods, 'parent': o.parent.name if o.parent else None, 'groups': len(o.vertex_groups),
                   'weighted_groups': len(weights), 'co_sha1': h.hexdigest()[:12]})
report['meshes'] = meshes
acts = []
for act in bpy.data.actions:
    curves = act.fcurves if hasattr(act, 'fcurves') else []
    keys = sum(len(c.keyframe_points) for c in curves)
    acts.append({'name': act.name, 'range': list(act.frame_range), 'fcurves': len(curves), 'keys': keys, 'fake_user': act.use_fake_user, 'users': act.users})
report['actions'] = acts
report['texts'] = [t.name for t in bpy.data.texts]
print('BLEND', json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k != 'armatures'}), 'bones', [a['bones'] for a in report['armatures']])
# native export: every Action as its own animation
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_skins=True, export_def_bones=False, export_force_sampling=True, export_frame_step=1,
                          export_apply=False, export_yup=True, export_extras=False)
report['exported'] = out_glb
json.dump(report, open(out_json, 'w'), indent=1)
print('EXPORTED', out_glb)
