"""Run in the v4.1 comparison scene in Blender. Retarget the active production rig.
Exports local transforms in the ORIGINAL glTF bone bases, never Blender's imported bases.
The machine source and character mesh remain unchanged. Preview sword is a rigid copy.
"""
import bpy, math, json, hashlib, os, struct
from pathlib import Path
from mathutils import Vector, Matrix

# BIBYE_V41_SOURCE names the extracted source directory beside the working blend.
REPO = Path(__file__).resolve().parents[4]
ARTIFACT = Path(os.environ.get('BIBYE_V41_SOURCE', str(Path(bpy.data.filepath).parent)))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
rig.animation_data_clear()
rig.rotation_mode='XYZ';rig.rotation_euler=(0,0,math.pi);rig.location=(0,1.88,-.05)
for b in rig.pose.bones: b.matrix_basis.identity()
bpy.context.view_layer.update()

def arm(p): return rig.matrix_world.inverted()@Vector((p[0],-p[2],p[1]))
def orient(name,direction):
    b=rig.pose.bones[name];m=b.matrix.copy();q=m.to_quaternion()
    q=(q@Vector((0,1,0))).normalized().rotation_difference(Vector(direction).normalized())@q
    b.matrix=Matrix.LocRotScale(m.translation,q,Vector((1,1,1)))
    bpy.context.view_layer.update()
def aim(name,target): orient(name,Vector(target)-rig.pose.bones[name].head)
def chain(a,b,c,target,pole):
    start=rig.pose.bones[a].head.copy();end=arm(target);hint=arm(pole);axis=(end-start).normalized()
    l1=rig.pose.bones[a].length;l2=rig.pose.bones[b].length;d=min((end-start).length,l1+l2-.001)
    along=(l1*l1-l2*l2+d*d)/(2*d);height=math.sqrt(max(0,l1*l1-along*along))
    bend=hint-start-axis*(hint-start).dot(axis);bend.normalize()
    aim(a,start+axis*along+bend*height);aim(b,end)
for side,sign in [('L',1),('R',-1)]:
    # The locator is on the sole platform. Original boots put the ankle .21m above it.
    chain('thigh.'+side,'shin.'+side,'foot.'+side,[sign*.22,.765,-1.59],[sign*.24,1,-1.15])
    foot=rig.pose.bones['foot.'+side]
    foot.matrix=Matrix.LocRotScale(foot.head,foot.bone.matrix_local.to_quaternion(),Vector((1,1,1)))
    bpy.context.view_layer.update()
    chain('upper_arm.'+side,'forearm.'+side,'hand.'+side,[sign*.28,1.24,-1.58],[sign*.58,1.22,-1.72])
    orient('hand.'+side,arm([sign*.28,1.26,-1.46])-rig.pose.bones['hand.'+side].head)
for name,d in [('tabard_front_01',(0,1,-.25)),('tabard_front_02',(0,1,-1))]: orient(name,d)
# Back cloth hangs outside the backrest instead of passing through its cushion.
back=rig.pose.bones['tabard_back_01'];back.location.y += .055
bpy.context.view_layer.update()
base={b.name:b.matrix_basis.copy() for b in rig.pose.bones}

character_bytes=(REPO/'client/assets/characters/spellblade/spellblade.glb').read_bytes()
src=json.loads(character_bytes[20:20+struct.unpack_from('<I',character_bytes,12)[0]])
parent={c:i for i,n in enumerate(src['nodes']) for c in n.get('children',[])}
rest={}
def world(i):
    if i in rest:return rest[i]
    n=src['nodes'][i];q=n.get('rotation',[0,0,0,1])
    from mathutils import Quaternion
    local=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
    rest[i]=world(parent[i])@local if i in parent else local
    return rest[i]
# Blender's Z up to glTF's Y up.
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
Ci=C.inverted();boneids=src['skins'][0]['joints'];index={n['name']:i for i,n in enumerate(src['nodes'])}
def sample():
    posed={}
    for i in boneids:
        name=src['nodes'][i]['name'];b=rig.pose.bones[name]
        delta=b.matrix@b.bone.matrix_local.inverted()
        posed[i]=C@delta@Ci@world(i)
    result={}
    for i in boneids:
        p=parent.get(i);local=posed[p].inverted()@posed[i] if p in posed else posed[i]
        t,q,scale=local.decompose()
        result[src['nodes'][i]['name']]={'position':list(t),'quaternion':[q.x,q.y,q.z,q.w]}
    return result
poses={'wheel':sample()}
for key,target in [('lever',[ -.16,1.26,-1.54]),('pull',[-.16,1.24,-1.43])]:
    for b in rig.pose.bones:b.matrix_basis=base[b.name]
    bpy.context.view_layer.update()
    chain('upper_arm.R','forearm.R','hand.R',target,[-.56,1.28,-1.78])
    orient('hand.R',arm([target[0],target[1]+.02,target[2]+.12])-rig.pose.bones['hand.R'].head)
    poses[key]=sample()
for b in rig.pose.bones:b.matrix_basis=base[b.name]
bpy.context.view_layer.update()
# Production HeroSword is rigidly weighted to hand.R, NOT socket_sword.
# Render a rigid stowed instance, leaving its ordinary skinned mesh untouched.
sword=next(o for o in scene.objects if o.name=='HeroSword')
anchor=rig.data.bones['socket_sword'].head_local.copy()
longaxis=Vector((-.21388392,-.53408719,-.81792698)).normalized()
rotation=longaxis.rotation_difference(Vector((0,.30,-.954)).normalized())
D=Matrix.Translation(Vector((-.55,2.25,1.27)))@rotation.to_matrix().to_4x4()@Matrix.Translation(-anchor)
preview=scene.objects.get('Operator stowed sword preview')
if not preview:
    preview=bpy.data.objects.new('Operator stowed sword preview',sword.data.copy());scene.collection.objects.link(preview)
preview.matrix_world=D;sword.hide_set(True)
localD=C@rig.matrix_world.inverted()@D@Ci
payload={'characterSha256':hashlib.sha256((REPO/'client/assets/characters/spellblade/spellblade.glb').read_bytes()).hexdigest(),
         'source':'Production rig fitted in Blender to v4.1 cockpit, preserving limb lengths and original glTF bases.',
         'poses':poses,'stowedSwordMatrix':[localD[r][c] for c in range(4) for r in range(4)]}
out=REPO/'client/game/biByeOperatorPoses.mjs'
out.write_text('// Generated by tools/blender/siege/bibyellista/fit-production-operator.py.\nexport const BI_BYE_OPERATOR_POSES = '+json.dumps(payload,separators=(',',':'))+';\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ARTIFACT/'BiBye-production-operator-fit.blend'))
print('Exported production pose file:',out)
