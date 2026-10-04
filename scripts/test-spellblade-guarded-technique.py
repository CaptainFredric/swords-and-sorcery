"""Sample defended strike silhouettes and verify source preservation in Blender.
Usage: blender --background --python-exit-code 1 --python this-file -- BASELINE CANDIDATE
"""
import bpy, sys, math, json

baseline, candidate = sys.argv[sys.argv.index('--') + 1:]
def curves(action):
    return action.layers[0].strips[0].channelbag(action.slots[0]).fcurves

def fingerprint():
    upper = ('spine','chest','neck','head','clavicle','upper_arm','forearm','hand','finger','thumb','socket')
    def lower_curve(curve):
        return not any(curve.data_path.startswith(f'pose.bones["{bone.name}"]') for rig in bpy.data.objects if rig.type == 'ARMATURE'
                       for bone in rig.pose.bones if bone.name.startswith(upper))
    def record(curve):
        return (curve.data_path,curve.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in curve.keyframe_points])
    return {
        'guarded_lower': {a.name:[record(c) for c in curves(a) if lower_curve(c)] for a in bpy.data.actions if a.name.startswith('GuardCut_')},
        'mesh': {o.name: ([tuple(v.co) for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons],
                          [m.name for m in o.data.materials if m], [tuple((g.group,g.weight) for g in v.groups) for v in o.data.vertices],
                          [(layer.name,[tuple(item.uv) for item in layer.data]) for layer in o.data.uv_layers],
                          [(layer.name,layer.domain,[tuple(item.color) for item in layer.data]) for layer in o.data.color_attributes])
                 for o in bpy.data.objects if o.type == 'MESH'},
        'rest': {o.name: [(b.name,b.parent.name if b.parent else None,tuple(b.head_local),tuple(b.tail_local),tuple(tuple(row) for row in b.matrix_local))
                         for b in o.data.bones] for o in bpy.data.objects if o.type == 'ARMATURE'},
        'ordinary': {a.name: [(c.data_path,c.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in c.keyframe_points])
                             for c in curves(a)] for a in bpy.data.actions if not a.name.startswith('GuardCut_')},
    }

bpy.ops.wm.open_mainfile(filepath=baseline); accepted = fingerprint()
bpy.ops.wm.open_mainfile(filepath=candidate); assert fingerprint() == accepted, 'Accepted model, rig or ordinary action changed'
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); scene = bpy.context.scene

def sample(name, frame):
    action = bpy.data.actions[name]; rig.animation_data.action = action; rig.animation_data.action_slot = action.slots[0]
    scene.frame_set(int(frame), subframe=frame % 1); bpy.context.view_layer.update()
    return {b.name:b.matrix.copy() for b in rig.pose.bones}

guard = sample('Guard',8); contacts = [12,11.4,10.8]; report = []
sword = bpy.data.objects['HeroSword']; rest = rig.data.bones['hand.R']
tip = max((sword.matrix_world @ v.co for v in sword.data.vertices),key=lambda p:(p-rest.head_local).length)
blade_local = rest.matrix_local.to_3x3().inverted() @ (tip-rest.head_local).normalized()
for i, contact in enumerate(contacts,1):
    action = bpy.data.actions[f'GuardCut_{i}']
    assert tuple(action.frame_range) == tuple(bpy.data.actions[f'Slash_{i}'].frame_range), 'Authoritative duration changed'
    pose = sample(action.name,contact)
    hand = pose['hand.R'].translation; blade = (pose['hand.R'].to_3x3() @ blade_local).normalized()
    assert abs(hand.x) < .46 and hand.z > pose['chest'].translation.z + .14, 'Contact hand drops outside defended chest line'
    assert blade.y > .65, 'Contact blade abandons the forward defensive space'
    if i == 1: assert blade.x < -.3, 'Forehand must cross inward through center'
    if i == 2: assert blade.x > .3, 'Backhand must return across the upper line'
    if i == 3: assert abs(blade.x) < .2 and blade.y > .8, 'Third cut must have a distinct centered beat'
    body_angle = guard['chest'].to_quaternion().rotation_difference(pose['chest'].to_quaternion()).angle
    assert body_angle > (.10 if i < 3 else .035), 'Torso fails to participate in the cut'
    assert guard['head'].to_quaternion().rotation_difference(pose['head'].to_quaternion()).angle < .15, 'Head stops tracking the opponent'
    report.append({'cut':i,'hand':list(hand),'blade':list(blade),'torsoDegrees':math.degrees(body_angle)})
    for f in action.frame_range:
        end = sample(action.name,f)
        for name in ('upper_arm.R','forearm.R','hand.R','chest','head','hand.L'):
            assert guard[name].to_quaternion().rotation_difference(end[name].to_quaternion()).angle < 1e-4, f'{action.name} endpoint loses Guard: {name}'
    for n in range(89):
        pose = sample(action.name,action.frame_range[0] + (action.frame_range[1] - action.frame_range[0])*n/88)
        assert all(math.isfinite(v) for matrix in pose.values() for row in matrix for v in row), 'Nonfinite authored pose'
        frame = action.frame_range[0] + (action.frame_range[1]-action.frame_range[0])*n/88
        if contact-2 <= frame <= contact+3:
            assert (pose['hand.R'].to_3x3() @ blade_local).normalized().y > .4, 'Active cut leaves useful forward defensive space'
        assert guard['hand.L'].to_quaternion().rotation_difference(pose['hand.L'].to_quaternion()).angle < .6, 'Free gauntlet abandons cover'
        for upper,lower in [('upper_arm.R','forearm.R'),('forearm.R','hand.R')]:
            length = (pose[lower].translation - pose[upper].translation).length
            assert abs(length-rig.data.bones[upper].length) < .001, 'IK stretches an arm segment'
print('GUARDED_TECHNIQUE_OK',json.dumps(report))
