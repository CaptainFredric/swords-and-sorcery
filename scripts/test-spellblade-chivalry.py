"""Validate new guarded cut actions and preservation of the accepted source."""
import sys, json, math
from pathlib import Path
import bpy

def bag(action): return action.layers[0].strips[0].channelbag(action.slots[0])
def snapshot():
    return {
        'geometry': {o.name: [[tuple(v.co) for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons], [m.name for m in o.data.materials if m]] for o in bpy.data.objects if o.type == 'MESH'},
        'ordinary': {a.name: [[c.data_path, c.array_index, [[tuple(k.co), tuple(k.handle_left), tuple(k.handle_right), k.interpolation] for k in c.keyframe_points]] for c in bag(a).fcurves] for a in bpy.data.actions if not a.name.startswith('GuardCut_')},
    }
paths=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=paths[0]); accepted=snapshot()
bpy.ops.wm.open_mainfile(filepath=paths[1]); current=snapshot()
assert accepted == current, 'Accepted geometry or ordinary action curves changed'
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');scene=bpy.context.scene
rig.animation_data.action=bpy.data.actions['Guard'];scene.frame_set(8)
guard={b.name:b.matrix.copy() for b in rig.pose.bones}
for i in (1,2,3):
    action=bpy.data.actions[f'GuardCut_{i}'];source=bpy.data.actions[f'Slash_{i}']
    assert tuple(action.frame_range)==tuple(source.frame_range), 'Contact timeline duration changed'
    rig.animation_data.action=action
    for frame in action.frame_range:
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        for name in ('upper_arm.R','forearm.R','hand.R','upper_arm.L','forearm.L','hand.L','chest'):
            assert guard[name].to_quaternion().rotation_difference(rig.pose.bones[name].matrix.to_quaternion()).angle < 1e-4, f'{action.name} must leave and return to Guard: {name}'
    for n in range(89):
        frame=action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*n/88
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        for b in rig.pose.bones:
            assert all(math.isfinite(v) for row in b.matrix for v in row)
        assert guard['hand.L'].to_quaternion().rotation_difference(rig.pose.bones['hand.L'].matrix.to_quaternion()).angle < .6,'Free gauntlet loses the defensive cover'
    print('GUARDED_CUT_OK',action.name,tuple(action.frame_range))
print('CHIVALRY_SOURCE_PRESERVATION_OK')
