"""Transfer accepted TP hand components into the dedicated FP rig, with physical grip adaptation.
Run on PR162 FP baseline in Blender: -- --reference-json INSPECTION.json --out CANDIDATE.blend --iteration 1|2|3
The reference is produced by scripts/inspect-spellblade-gauntlet-parity.py. Source hashes are checked.
"""
import argparse,sys,json,hashlib,math
from pathlib import Path
import bpy,bmesh
from mathutils import Vector

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference-json',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--iteration',type=int,choices=(1,2,3),default=1)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);data=json.loads(args.reference_json.read_text());tp=data['third_person'];fp=data['first_person']
if hashlib.sha256(Path(tp['path']).read_bytes()).hexdigest()!=tp['sha256']:raise ValueError('TP reference bytes have changed; inspect again')
if hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()!=fp['sha256']:raise ValueError('Open the inspected PR162 FP baseline')
if args.out.resolve()==Path(bpy.data.filepath).resolve():raise ValueError('Keep source baseline and candidate separate')
arm=bpy.data.objects['Arm.R'];rig=bpy.data.objects['SpellbladeFirstPersonRig'];H=rig.matrix_world@rig.data.bones['hand.R'].matrix_local
mesh_inv=arm.matrix_world.inverted();hand_index=arm.vertex_groups['hand.R'].index
T={c['component_index']:c for c in tp['components']if c['group']=='hand.R'}
tg=Vector(tp['hand_frame']['grip_axis_toward_guard_hand_local']);tG=Vector(tp['hand_frame']['grip_center_hand_local'])
td=Vector(T[4]['center'])-Vector(T[1]['center']);td=(td-tg*td.dot(tg)).normalized();tn=td.cross(tg).normalized()
if tn.dot(Vector(T[1]['center'])-Vector(T[0]['center']))<0:tn=-tn
G=Vector(fp['hand_frame']['grip_center_hand_local']);g=Vector(fp['hand_frame']['grip_axis_toward_guard_hand_local']);a=Vector(fp['hand_frame']['forearm_projection_axis_a_hand_local']);b=Vector(fp['hand_frame']['dorsal_axis_b_hand_local']);radius=fp['hand_frame']['grip_radius']
# Gameplay eye in hand space sees the prior dorsal frame almost edge on.
# Align only the transferred armor frame; the rig, sword roll and camera remain fixed.
if args.iteration>=2:
 angle=math.radians(45);old_a=a.copy();old_b=b.copy();a=old_a*math.cos(angle)+old_b*math.sin(angle);b=old_b*math.cos(angle)-old_a*math.sin(angle)
bm=bmesh.new();bm.from_mesh(arm.data);df=bm.verts.layers.deform.active;ca=bm.loops.layers.float_color.get('ArmorColor');part=bm.faces.layers.int.get('GauntletPart');tag=bm.faces.layers.int.get('tag');edge=bm.faces.layers.int.get('edge')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[df].get(hand_index,0)>.5],context='VERTS')
receipt=[]
def graft(ci,transform):
 c=T[ci];verts=[]
 for xyz in c['vertices_bone_local']:
  v=bm.verts.new(mesh_inv@H@transform(Vector(xyz)));v[df][hand_index]=1;verts.append(v)
 for original in c['faces']:
  face=bm.faces.new([verts[i]for i in original['vertices']]);face.material_index=arm.data.materials.find(original['material']);face.smooth=original['smooth'];face[part]=1000+ci
  if tag and original['tag'] is not None:face[tag]=['steel','steel_dark','brass','under','leather','leather_dark','cloth','cloth_dark','cream','face','buckle','banner'].index(original['tag'])
  if edge and original['edge']is not None:face[edge]=original['edge']
  for loop,color in zip(face.loops,original['colors']):loop[ca]=color
 receipt.append({'tpComponent':ci,'piece':c['semantic_piece'],'vertices':len(verts),'faces':len(c['faces']),'topologyAndCornerColors':'copied'})
def coords(v):
 q=v-tG;return q.dot(td),q.dot(tg),q.dot(tn)
def xyz(u,s,n):return G+a*u+g*s+b*n
# Two actual back plates, brass edge and knuckle bar. Rear length fits the preserved narrower FP cuff.
for ci in range(5):
 def map_shell(v,ci=ci):
  u,s,n=coords(v);u=u*(.68 if args.iteration==1 else .59)+.022;s*=.85;n=n*.60+.042
  if ci==0:n=max(radius+.004,n) # adapt hidden palm underside to physical FP handle
  if args.iteration>=2 and ci==2:n+=.004
  return xyz(u,s,n)
 graft(ci,map_shell)
# Reuse each short beveled TP core and separate steel scale. Refit curl without a new finger architecture.
for finger,start in enumerate((5,12,19,26)):
 offset=(-.045,-.015,.015,.045)[finger]
 # Accepted knuckle caps stay organized on their existing bar.
 # Across coordinate is the handle axis, measured directly from the source center.
 cap_center=Vector(T[start]['center']);cap_s=(cap_center-tG).dot(tg)
 graft(start,lambda v,cap_s=cap_s,offset=offset:xyz(coords(v)[0]*.68+.027,offset+(coords(v)[1]-cap_s)*.75,coords(v)[2]*.6+.035))
 for segment,angle in enumerate((50,108,157)):
  core=start+1+segment*2;scale=core+1;c0=Vector(T[core]['center']);c1=Vector(T[scale]['center']);normal=c1-c0;normal=(normal-tg*normal.dot(tg)).normalized();direction=tg.cross(normal).normalized()
  theta=math.radians(angle);N=b*math.cos(theta)+a*math.sin(theta);D=a*math.cos(theta)-b*math.sin(theta);W=g
  # Raised handle bands extend about 2.8 mm beyond the plain handle.
  target=G+g*offset+N*(radius+(.0135 if args.iteration==3 else .012))
  length_scale=1.10 if args.iteration==1 else 1.02
  width_scale=.75 if args.iteration==1 else .69
  depth_scale=.60
  def map_piece(v,c0=c0,c1=c1,normal=normal,direction=direction,N=N,D=D,W=W,target=target,core=core,scale=scale):
   q=v-c0;d=q.dot(direction);w=q.dot(tg);n=q.dot(normal)
   # Preserve scale thickness and relief while thinning only the underlying core.
   if n>(c1-c0).dot(normal)*.6:n=(c1-c0).dot(normal)*.6+(n-(c1-c0).dot(normal))*.86
   else:n*=depth_scale
   if args.iteration>=2:
    extent=max(abs((Vector(p)-c0).dot(direction))for p in T[core]['vertices_bone_local']);taper=1-.15*max(0,min(1,(d/extent+1)/2));w*=taper
   return target+D*(d*length_scale)+W*(w*width_scale)+N*n
  # The scale retains its actual copied relief independently from the dark core.
  def map_core(v):
   q=v-c0;d=q.dot(direction);w=q.dot(tg)
   if args.iteration>=2:
    extent=max(abs((Vector(p)-c0).dot(direction))for p in T[core]['vertices_bone_local']);w*=1-.15*max(0,min(1,(d/extent+1)/2))
   return target+D*(d*length_scale)+W*(w*width_scale)+N*(q.dot(normal)*depth_scale)
  graft(core,map_core);graft(scale,map_piece)
# Thumb components are copied and opposed across the guard side, with their own diagonal axes.
for core,scale,angle,s in((33,34,-38,.064),(35,36,-82,.032)):
 c0=Vector(T[core]['center']);c1=Vector(T[scale]['center']);normal=(c1-c0).normalized();direction=Vector(T[core]['pca_axes'][0]);direction=(direction-normal*direction.dot(normal)).normalized();width=normal.cross(direction).normalized()
 theta=math.radians(angle);N=b*math.cos(theta)+a*math.sin(theta);tangent=a*math.cos(theta)-b*math.sin(theta);D=(-g*.65-tangent*.76).normalized() if args.iteration==3 else (-g*.76+tangent*.65).normalized();W=N.cross(D).normalized();target=G+g*s+N*(radius+.013)
 def map_thumb(v,c0=c0,c1=c1,normal=normal,direction=direction,width=width,N=N,D=D,W=W,target=target):
  q=v-c0;d=q.dot(direction);w=q.dot(width);n=q.dot(normal);relief=(c1-c0).dot(normal)
  if n>relief*.6:n=relief*.6+(n-relief)*.86
  else:n*=.60
  return target+D*(d*.88)+W*(w*.80)+N*n
 graft(core,map_thumb);graft(scale,map_thumb)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(arm.data);bm.free();arm.data.update()
arm['gauntlet_parity']=args.iteration;arm['gauntlet_parity_reference_sha256']=tp['sha256'];arm['gauntlet_design']='Transferred TP steel plates, knuckle bar/caps, 12 separate finger cores/scales and opposing thumb; only grip placement and local fit adapted.'
bpy.context.preferences.filepaths.save_version=0;args.out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(args.out.resolve()),copy=True)
args.out.with_suffix('.transfer.json').write_text(json.dumps({'iteration':args.iteration,'referenceSourceSha256':tp['sha256'],'baselineSourceSha256':fp['sha256'],'copiedComponents':receipt,'changedRig':False,'changedActions':False},indent=2)+'\n')
print('GAUNTLET_PARITY_TRANSFER',args.iteration,len(receipt),'components')
