"""Add defensive one handed cuts to the accepted source, preserving every ordinary action and mesh.
Run with a separate output .blend after --. Original contact frames and durations are retained.
"""
import bpy, sys, math
from mathutils import Quaternion
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
scene=bpy.context.scene
out=sys.argv[sys.argv.index('--')+1]
assert not bpy.data.actions.get('GuardCut_1'), 'Guarded cuts already authored'
def bag(a):return a.layers[0].strips[0].channelbag(a.slots[0])
def pose():
    return {b.name:(b.rotation_quaternion.copy() if b.rotation_mode=='QUATERNION' else b.rotation_euler.to_quaternion(),b.location.copy(),b.scale.copy()) for b in rig.pose.bones}
def assign(a):
    rig.animation_data.action=a
    if a.slots:rig.animation_data.action_slot=a.slots[0]
assign(bpy.data.actions['Guard']);scene.frame_set(8);bpy.context.view_layer.update();guard=pose()
for i in (1,2,3):
    source=bpy.data.actions[f'Slash_{i}'];assign(source)
    start,end=source.frame_range
    frames=[start+n*.5 for n in range(round((end-start)*2)+1)]
    original=[]
    for f in frames:
        scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update();original.append(pose())
    action=source.copy();action.name=f'GuardCut_{i}';action.use_fake_user=True;assign(action)
    # Rewrite upper body curves only; locomotion continues to own the original pelvis/legs.
    names=[b.name for b in rig.pose.bones if b.name.startswith(('spine','chest','neck','head','clavicle','upper_arm','forearm','hand','finger','thumb','socket'))]
    for curve in list(bag(action).fcurves):
        if any(curve.data_path.startswith(f'pose.bones["{name}"]') for name in names):bag(action).fcurves.remove(curve)
    previous={}
    for f,saved in zip(frames,original):
        scene.frame_set(int(f),subframe=f%1)
        # Rise into a compact cut and return along the same braced posture. No new contact delay.
        phase=(f-start)/(end-start)
        excursion=math.sin(math.pi*phase)**2
        for name in names:
            b=rig.pose.bones[name];q,l,s=saved[name];gq,gl,gs=guard[name]
            if name.endswith('.L') or name=='socket_sorcery': weight=1-.04*excursion
            elif name.startswith(('spine','chest','neck','head','clavicle')):weight=1-.5*excursion
            else:weight=1-.88*excursion
            q=q.slerp(gq,weight)
            if name in previous and q.dot(previous[name])<0:q.negate()
            previous[name]=q.copy()
            if b.rotation_mode=='QUATERNION':b.rotation_quaternion=q;path='rotation_quaternion'
            else:b.rotation_euler=q.to_euler(b.rotation_mode,b.rotation_euler);path='rotation_euler'
            b.location=l.lerp(gl,weight);b.scale=s.lerp(gs,weight)
            for prop in (path,'location','scale'):b.keyframe_insert(prop,frame=f,group=name)
    for curve in bag(action).fcurves:
        if any(curve.data_path.startswith(f'pose.bones["{name}"]') for name in names):
            for key in curve.keyframe_points:key.interpolation='LINEAR'
    action.frame_range=(start,end)
    print('AUTHORED_GUARDED_CUT',action.name,start,end)
assign(bpy.data.actions['Idle']);scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=out,copy=True)
