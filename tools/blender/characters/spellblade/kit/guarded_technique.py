"""Author three defended upper body cuts in the accepted artist source.
Run against the saved source with -- OUTPUT.blend. Only GuardCut actions change.
Coordinates are in the source rig's metres: X right, Y forward, Z up.
"""
import bpy, sys, math
from mathutils import Vector, Quaternion, Matrix

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
out = sys.argv[sys.argv.index('--') + 1]

def assign(action):
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]

def bag(action):
    return action.layers[0].strips[0].channelbag(action.slots[0])

assign(bpy.data.actions['Guard']); scene.frame_set(8); bpy.context.view_layer.update()
upper = [b.name for b in rig.pose.bones if b.name.startswith(('spine','chest','neck','head','clavicle','upper_arm','forearm','hand','finger','thumb','socket'))]
guard = {name:rig.pose.bones[name].matrix_basis.copy() for name in upper}
world = {name:rig.pose.bones[name].matrix.copy() for name in upper}
wrist = world['hand.R'].translation.copy()
sword = bpy.data.objects['HeroSword']
rest_hand = rig.data.bones['hand.R']
tip = max((sword.matrix_world @ v.co for v in sword.data.vertices), key=lambda p: (p-rest_hand.head_local).length)
blade_local = rest_hand.matrix_local.to_3x3().inverted() @ (tip-rest_hand.head_local).normalized()
blade = (world['hand.R'].to_3x3() @ blade_local).normalized()

# Wrist, blade, torso yaw, forward compression and right shoulder response.
# Each strike's contact is the existing 30 fps contact sample, not a new combat clock.
techniques = [
    ('defended forehand',12, [
        (8,(.39,.26,1.76),(-.30,.88,.38),-.04,.01,.02),
        (12,(.20,.46,1.52),(-.58,.79,-.14),.18,.025,-.035),
        (14,(.06,.38,1.43),(-.55,.80,.23),.15,.018,-.025),
    ]),
    ('returning backhand',11.4, [
        (5,(.16,.34,1.65),(-.48,.84,.25),.075,.01,-.02),
        (11.4,(.29,.44,1.60),(.60,.75,.25),-.17,.018,.035),
        (13.4,(.38,.35,1.68),(.40,.80,.42),-.12,.012,.025),
    ]),
    ('descending beat',10.8, [
        (6.8,(.28,.25,1.78),(-.08,.64,.76),-.025,-.015,.015),
        (10.8,(.21,.43,1.48),(-.05,.99,-.10),.035,.055,-.045),
        (12.8,(.24,.42,1.41),(0,.96,.28),.025,.038,-.03),
    ]),
]

def hermite(keys,frame):
    if frame <= keys[0][0]: return keys[0][1]
    if frame >= keys[-1][0]: return keys[-1][1]
    for j in range(len(keys)-1):
        if frame > keys[j+1][0]: continue
        t0,a = keys[j]; t1,b = keys[j+1]; d = t1-t0; u = (frame-t0)/d
        def tangent(k):
            if k in (0,len(keys)-1) or (k == len(keys)-2 and keys[k][1] == keys[-1][1]): return [0]*len(a)
            prev,next = keys[k-1],keys[k+1]
            return [(y-x)/(next[0]-prev[0]) for x,y in zip(prev[1],next[1])]
        va,vb = tangent(j),tangent(j+1)
        return [(2*u**3-3*u*u+1)*x + (u**3-2*u*u+u)*d*vx
                + (-2*u**3+3*u*u)*y + (u**3-u*u)*d*vy for x,y,vx,vy in zip(a,b,va,vb)]

def turn(name,axis,angle):
    b = rig.pose.bones[name]
    b.matrix = Matrix.Translation(b.head) @ Quaternion(Vector(axis),angle).to_matrix().to_4x4() @ Matrix.Translation(-b.head) @ b.matrix
    bpy.context.view_layer.update()

def aim_bone(name,target):
    b = rig.pose.bones[name]; q = b.matrix.to_quaternion()
    direction = (target-b.head).normalized()
    rotation = (q @ Vector((0,1,0))).rotation_difference(direction) @ q
    b.matrix = Matrix.LocRotScale(b.head,rotation,b.matrix.to_scale())
    bpy.context.view_layer.update()

def sword_arm(target,direction):
    shoulder = rig.pose.bones['upper_arm.R'].head.copy()
    delta = target-shoulder; distance = delta.length; along = delta.normalized()
    a = rig.data.bones['upper_arm.R'].length; b = rig.data.bones['forearm.R'].length
    assert abs(a-b)+.01 < distance < a+b-.008, 'Guarded target exceeds the natural arm reach'
    reach = (a*a-b*b+distance*distance)/(2*distance)
    # Keep a bent elbow on the sword side instead of flaring out in an ordinary backswing.
    pole = Vector((.48,.12,1.43))-shoulder
    pole = (pole-along*pole.dot(along)).normalized()
    elbow = shoulder + along*reach + pole*math.sqrt(max(0,a*a-reach*reach))
    aim_bone('upper_arm.R',elbow); aim_bone('forearm.R',target)
    # HeroSword is skinned to hand.R; its physical blade axis differs from the socket axis.
    rotation = blade.rotation_difference(direction.normalized()) @ world['hand.R'].to_quaternion()
    hand = rig.pose.bones['hand.R']
    hand.matrix = Matrix.LocRotScale(hand.head,rotation,world['hand.R'].to_scale())
    bpy.context.view_layer.update()

for i,(label,contact,poses) in enumerate(techniques,1):
    action = bpy.data.actions[f'GuardCut_{i}']; start,end = action.frame_range
    keys = [(start,[*wrist,*blade,0,0,0])]
    keys += [(f,[*hand,*point,yaw,compression,shoulder]) for f,hand,point,yaw,compression,shoulder in poses]
    # Restore the useful defensive line before the chain hands over to its next action.
    keys += [(end-1,[*wrist,*blade,0,0,0]),(end,[*wrist,*blade,0,0,0])]
    for curve in list(bag(action).fcurves):
        if any(curve.data_path.startswith(f'pose.bones["{name}"]') for name in upper): bag(action).fcurves.remove(curve)
    assign(action); previous = {}
    frames = sorted(set([start+n*.5 for n in range(round((end-start)*2)+1)] + [contact]))
    for frame in frames:
        scene.frame_set(int(frame),subframe=frame%1)
        for name in upper: rig.pose.bones[name].matrix_basis = guard[name].copy()
        bpy.context.view_layer.update()
        values = hermite(keys,frame); target = Vector(values[:3]); direction = Vector(values[3:6]); yaw,compression,shoulder = values[6:]
        if start < frame < end-1:
            turn('spine',(0,0,1),yaw*.4); turn('chest',(0,0,1),yaw*.6)
            turn('chest',(1,0,0),compression)
            turn('clavicle.R',(1,0,0),shoulder)
            turn('clavicle.L',(1,0,0),-shoulder*.35)
            turn('head',(0,0,1),-yaw)
            turn('head',(1,0,0),-compression*.65)
            turn('upper_arm.L',(0,0,1),-yaw*.22)
            sword_arm(target,direction)
        for name in upper:
            bone = rig.pose.bones[name]
            q = bone.rotation_quaternion
            if name in previous and q.dot(previous[name]) < 0: q.negate()
            previous[name] = q.copy()
            for prop in ('rotation_quaternion','location','scale'): bone.keyframe_insert(prop,frame=frame,group=name)
    for curve in bag(action).fcurves:
        if any(curve.data_path.startswith(f'pose.bones["{name}"]') for name in upper):
            for key in curve.keyframe_points: key.interpolation = 'LINEAR'
    action.frame_range = (start,end)
    action['guarded_technique'] = label
    print('AUTHORED_GUARDED_TECHNIQUE',action.name,label,start,end)
assign(bpy.data.actions['Idle']); scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=out,copy=True)
