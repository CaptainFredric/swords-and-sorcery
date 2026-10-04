"""Focused Guard seam and ordinary second-strike offhand corrections on saved artist sources."""
import bpy,sys,math
from mathutils import Quaternion,Vector
from mathutils.bvhtree import BVHTree
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
scene=bpy.context.scene
out=sys.argv[sys.argv.index('--')+1]
action=bpy.data.actions['Guard']
bag=action.layers[0].strips[0].channelbag(action.slots[0])
for curve in bag.fcurves:
    keys=list(curve.keyframe_points)
    first=next((k for k in keys if abs(k.co.x-8)<1e-4),None)
    last=next((k for k in keys if abs(k.co.x-56)<1e-4),None)
    if not first or not last:continue
    interior=[k for k in keys if 8<k.co.x<56]
    if not interior:continue
    next_key,prev_key=interior[0],interior[-1]
    slope=(next_key.co.y-prev_key.co.y)/((next_key.co.x-8)+(56-prev_key.co.x))
    # Preserve the raise into frame 8. Only the outgoing hold and incoming end tangents become periodic.
    for key in interior:
        if key.interpolation=='LINEAR':
            key.interpolation='BEZIER';key.handle_left_type='AUTO';key.handle_right_type='AUTO'
    first.interpolation='BEZIER'
    first.handle_right_type='FREE';last.handle_left_type='FREE'
    dx=(next_key.co.x-8)/3;first.handle_right=(8+dx,first.co.y+slope*dx)
    dx=(56-prev_key.co.x)/3;last.handle_left=(56-dx,last.co.y-slope*dx)
    curve.update()
print('GUARD_PERIODIC_TANGENTS_AUTHORED')
if bpy.data.objects.get('Arm.L'):
    original=bpy.data.actions['Slash_2'];rig.animation_data.action=original
    bone=rig.pose.bones['upper_arm.L']
    def tree(obj):
        obj=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh()
        result=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons]);obj.to_mesh_clear();return result
    frames=[1+i/4 for i in range(89)]
    samples=[]
    for frame in frames:
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update();samples.append(bone.rotation_euler.copy())
    # Move the free arm back while the early backhand passes, retaining original contacts, endpoints and right arm.
    chosen=None
    for axis in [(1,0,0),(0,1,0),(0,0,1)]:
        for degrees in [12,-12,20,-20,30,-30,40,-40]:
            candidate=original.copy();rig.animation_data.action=candidate
            for frame,rotation in zip(frames,samples):
                scene.frame_set(int(frame),subframe=frame%1);bone.rotation_euler=rotation
                amount=math.sin(math.pi*(frame-1)/11)**2 if frame<12 else 0
                parent=bone.parent.matrix.to_quaternion()
                turn=Quaternion(parent.inverted()@Vector(axis),math.radians(degrees)*amount)
                bone.rotation_euler=(turn@bone.rotation_euler.to_quaternion()).to_euler(bone.rotation_euler.order)
                bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name)
            cb=candidate.layers[0].strips[0].channelbag(candidate.slots[0])
            for c in cb.fcurves:
                if c.data_path=='pose.bones["upper_arm.L"].rotation_euler':
                    for k in c.keyframe_points:k.interpolation='LINEAR'
            hits=0
            for frame in frames:
                scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
                hits+=bool(tree(bpy.data.objects['HeroSword']).overlap(tree(bpy.data.objects['Arm.L'])))
            print('OFFHAND_CANDIDATE',axis,degrees,hits)
            if hits==0:chosen=candidate;break
            rig.animation_data.action=original;bpy.data.actions.remove(candidate)
        if chosen:break
    assert chosen,'No anatomically bounded offhand correction clears the blade'
    name=original.name;bpy.data.actions.remove(original);chosen.name=name;chosen.use_fake_user=True
    print('SECOND_STRIKE_OFFHAND_AUTHORED')
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=out,copy=True)
