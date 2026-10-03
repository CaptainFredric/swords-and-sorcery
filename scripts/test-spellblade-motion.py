"""Sample authored sole contacts and swing clearance with Blender, including between keys."""
from pathlib import Path
import bpy
import sys

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else ROOT / 'tools/blender/characters/spellblade/source/spellblade-third-person.blend'
if '--baseline' in sys.argv:
    import sys as _sys
    _sys.path.insert(0, str(ROOT))
    from tools.blender.characters.spellblade.review.scope_diff import fingerprint
    baseline = sys.argv[sys.argv.index('--baseline') + 1]
    before, after = fingerprint(baseline), fingerprint(str(source))
    allowed = {'action:' + name for name in ('Idle', 'Guard', 'Run', 'Sprint')}
    assert before.keys() == after.keys(), 'Scene data added or removed'
    assert all(before[key] == after[key] for key in before if key not in allowed), 'Geometry, rig, references or protected actions changed'
    def curves(path):
        bpy.ops.wm.open_mainfile(filepath=path)
        result = {}
        for action in bpy.data.actions:
            bag = action.layers[0].strips[0].channelbag(action.slots[0])
            for curve in bag.fcurves:
                result[action.name, curve.data_path, curve.array_index] = [(tuple(k.co), tuple(k.handle_left), tuple(k.handle_right), k.interpolation) for k in curve.keyframe_points]
        return result
    old, new = curves(baseline), curves(str(source))
    assert old.keys() == new.keys(), 'Animation channels added or removed'
    for key in old:
        name, path, index = key
        editable = name in ('Idle', 'Guard', 'Run', 'Sprint') and path == 'pose.bones["pelvis"].location'
        editable |= name in ('Run', 'Sprint') and any(path == f'pose.bones["{part}.{side}"].rotation_quaternion' for side in ('L', 'R') for part in ('thigh', 'shin', 'foot'))
        assert editable or old[key] == new[key], f'Unrelated animation curve changed: {key}'
    print('MOTION_SCOPE_OK geometry, rig, materials, references, protected actions and upper body curves preserved')
bpy.ops.wm.open_mainfile(filepath=str(source))
rig = bpy.data.objects['SpellbladeRig']
scene = bpy.context.scene

def soles(frame):
    scene.frame_set(int(frame), subframe=frame % 1)
    bpy.context.view_layer.update()
    result = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for side in ('L', 'R'):
        obj = bpy.data.objects[f'Boot.{side}'].evaluated_get(graph)
        mesh = obj.to_mesh()
        result[side] = min((obj.matrix_world @ v.co).z for v in mesh.vertices)
        obj.to_mesh_clear()
    return result

for name, end in [('Idle', 60), ('Guard', 56), ('Run', 21), ('Sprint', 17)]:
    action = bpy.data.actions[name]
    assert tuple(action.frame_range) == (1, end), f'{name}: duration changed'
    rig.animation_data.action = action
    for i in range((end - 1) * 4 + 1):
        frame = 1 + i / 4
        low = min(soles(frame).values())
        assert -.004 <= low <= .012, f'{name} frame {frame}: sole contact {low:.4f}'
    if name in ('Run', 'Sprint'):
        for side, phase in [('R', .25), ('L', .75)]:
            height = soles(1 + (end - 1) * phase)[side]
            assert height > .07, f'{name}: returning {side} boot drags at {height:.4f}'
        start, finish = soles(1), soles(end)
        assert all(abs(start[s] - finish[s]) < 1e-5 for s in start), f'{name}: loop seam'
    print('MOTION_CONTACT_OK', name)
print('SPELLBLADE_ORDINARY_MOTION_OK')
