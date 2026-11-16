# Which bones a Spellblade .blend's armature has, which bones its Actions' F-curves animate, and which its meshes'
# vertex groups weight: the three must agree for the .blend to be the source of a 66-joint model.
#   Blender -b --disable-autoexec file.blend --python blend_bone_audit.py -- out.json
import bpy, sys, json, re

out = sys.argv[sys.argv.index('--') + 1:][0]
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
bones = {a.name: [b.name for b in a.data.bones] for a in arms}
animated = {}
for act in bpy.data.actions:
    names = set()
    curves = act.fcurves if hasattr(act, 'fcurves') else []
    for c in curves:
        m = re.match(r'pose\.bones\["(.+?)"\]', c.data_path)
        if m: names.add(m.group(1))
    # Blender 4.4+ layered actions keep curves in slots/layers/strips/channelbags
    if not curves and hasattr(act, 'layers'):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    for c in bag.fcurves:
                        m = re.match(r'pose\.bones\["(.+?)"\]', c.data_path)
                        if m: names.add(m.group(1))
    animated[act.name] = sorted(names)
groups = {}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    used = set()
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight > 1e-4: used.add(o.vertex_groups[g.group].name)
    groups[o.name] = sorted(used)
    mods = [(m.type, getattr(m, 'object', None) and m.object.name) for m in o.modifiers]
    groups[o.name + '#modifiers'] = mods
all_anim = sorted(set().union(*animated.values())) if animated else []
all_groups = sorted(set().union(*[set(v) for k, v in groups.items() if not k.endswith('#modifiers')]))
arm_bones = set().union(*[set(v) for v in bones.values()]) if bones else set()
report = {
    'armatures': {k: len(v) for k, v in bones.items()},
    'armature_bones': sorted(arm_bones),
    'animated_bones': all_anim,
    'weighted_groups': all_groups,
    'animated_not_in_armature': sorted(set(all_anim) - arm_bones),
    'weighted_not_in_armature': sorted(set(all_groups) - arm_bones),
    'actions': len(animated),
    'actions_curve_bone_counts': {k: len(v) for k, v in animated.items()},
    'mesh_modifiers': {k[:-10]: v for k, v in groups.items() if k.endswith('#modifiers')},
}
json.dump(report, open(out, 'w'), indent=1)
print('AUDIT', json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k not in ('actions_curve_bone_counts', 'mesh_modifiers')}))
