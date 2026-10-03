"""Correct existing gait recovery and sole contacts without rebuilding artist geometry.
Run on the current authored TP source, passing a separate output .blend after --.
Only Idle/Guard pelvis and Run/Sprint leg/pelvis curves may change.
"""
import math
import sys
import bpy
from mathutils import Quaternion, Vector

rig = bpy.data.objects['SpellbladeRig']
scene = bpy.context.scene
out = sys.argv[sys.argv.index('--') + 1]
if rig.get('ordinary_motion_sole_pass'):
    raise ValueError('This source already contains the ordinary motion sole pass')


def sole(side):
    obj = bpy.data.objects[f'Boot.{side}'].evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.to_mesh()
    z = min((obj.matrix_world @ v.co).z for v in mesh.vertices)
    obj.to_mesh_clear()
    return z


def root_turn(bone, angle):
    # Match the animator's root space rotation, expressed in the current parent's axes.
    parent = bone.parent.matrix.to_quaternion() if bone.parent else Quaternion()
    axis = parent.inverted() @ Vector((1, 0, 0))
    bone.rotation_quaternion = Quaternion(axis, angle) @ bone.rotation_quaternion
    bpy.context.view_layer.update()


for name in ('Idle', 'Guard', 'Run', 'Sprint'):
    action = bpy.data.actions[name]
    rig.animation_data.action = action
    start, end = map(int, action.frame_range)
    gait = name in ('Run', 'Sprint')
    poses = []
    frames = [start + i / 4 for i in range((end - start) * 4 + 1)]
    # Sample the original action before inserting any corrected keys.
    for frame in frames:
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        saved = {b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in rig.pose.bones}
        poses.append(saved)
    for frame, saved in zip(frames, poses):
        scene.frame_set(int(frame), subframe=frame % 1)
        for bone in rig.pose.bones:
            bone.rotation_quaternion, bone.location = saved[bone.name]
        bpy.context.view_layer.update()
        if gait:
            phase = (frame - start) / (end - start)
            for side in ('L', 'R'):
                # The return half gets knee clearance; the support half keeps its authored push.
                swing = (phase + (0 if side == 'R' else .5)) % 1
                flex = math.radians(22 if name == 'Run' else 28) * (math.sin(2 * math.pi * swing) ** 2 if swing < .5 else 0)
                for part, scale in [('thigh', 1), ('shin', -2), ('foot', 1)]:
                    root_turn(rig.pose.bones[f'{part}.{side}'], flex * scale)
        # The boot mesh, including its bevel, owns contact, rather than the ankle joint.
        dz = .002 - min(sole('L'), sole('R'))
        pelvis = rig.pose.bones['pelvis']
        parent = pelvis.parent.matrix.to_3x3() if pelvis.parent else rig.matrix_world.to_3x3()
        pelvis.location += parent.inverted() @ Vector((0, 0, dz))
        pelvis.keyframe_insert('location', frame=frame, group='pelvis')
        if gait:
            for side in ('L', 'R'):
                for part in ('thigh', 'shin', 'foot'):
                    rig.pose.bones[f'{part}.{side}'].keyframe_insert('rotation_quaternion', frame=frame, group=f'{part}.{side}')
    # Dense baked correction curves use linear interpolation, avoiding cubic overshoot between samples.
    bag = action.layers[0].strips[0].channelbag(action.slots[0])
    for curve in bag.fcurves:
        corrected = curve.data_path == 'pose.bones["pelvis"].location' or gait and any(curve.data_path == f'pose.bones["{part}.{side}"].rotation_quaternion' for side in ('L', 'R') for part in ('thigh', 'shin', 'foot'))
        if corrected:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
    print('ORDINARY_MOTION_CORRECTED', name, start, end)
rig['ordinary_motion_sole_pass'] = 1
rig.animation_data.action = bpy.data.actions['Idle']
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
