"""Mirror the accepted left hand into a closed right sword grip, retaining its actual pieces."""
import bpy,bmesh,math,json,sys,argparse,copy
from pathlib import Path
import numpy as np
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,required=True);P.add_argument('--baseline',type=Path,required=True);P.add_argument('--fp-roll',type=float,default=0)
args=P.parse_args(sys.argv[sys.argv.index('--')+1:])
for name in ('spellblade-third-person.blend','spellblade-first-person.blend'):
 if not (args.baseline/name).is_file():raise ValueError('Missing accepted source '+name)
 if (args.out/name).resolve()==(args.baseline/name).resolve():raise ValueError('Keep the accepted input separate from the edited output')
args.out.mkdir(parents=True,exist_ok=True)

def parts(obj,rig,side):
 M=(rig.matrix_world@rig.data.bones['hand.'+side].matrix_local).inverted()@obj.matrix_world
 attr=obj.data.attributes['CanonicalArmPart'];ca=obj.data.color_attributes['ArmorColor'];tags=obj.data.attributes['tag'];edge=obj.data.attributes['edge'];out={}
 for f in obj.data.polygons:
  if not all(any(obj.vertex_groups[g.group].name=='hand.'+side and g.weight>.5 for g in obj.data.vertices[i].groups)for i in f.vertices):continue
  key=attr.data[f.index].value;out.setdefault(key,{'ids':set(),'faces':[]});out[key]['ids'].update(f.vertices);out[key]['faces'].append(f)
 for key,c in out.items():
  ids=sorted(c.pop('ids'));local={i:n for n,i in enumerate(ids)};c['verts']=[M@obj.data.vertices[i].co for i in ids]
  c['faces']=[{'verts':[local[i]for i in f.vertices],'mat':obj.data.materials[f.material_index].name,'tag':tags.data[f.index].value,'edge':edge.data[f.index].value,'colors':[list(ca.data[l].color)for l in f.loop_indices]}for f in c['faces']]
 return out

def center(c):return sum(c['verts'],Vector())/len(c['verts'])

def grip(rig,sword):
 M=(rig.matrix_world@rig.data.bones['hand.R'].matrix_local).inverted()@sword.matrix_world;adj=[set()for v in sword.data.vertices]
 for e in sword.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 seen=set();found=[]
 for vi in range(len(adj)):
  if vi in seen:continue
  seen.add(vi);todo=[vi];ids=[]
  while todo:
   i=todo.pop();ids.append(i)
   for j in adj[i]:
    if j not in seen:seen.add(j);todo.append(j)
  ps=np.array([tuple(M@sword.data.vertices[i].co)for i in ids]);C=ps.mean(0);axes=np.linalg.svd(ps-C)[2];dims=np.ptp((ps-C)@axes.T,axis=0)
  if np.linalg.norm(C)<.15 and .15<dims[0]<.27 and dims[1]<.11:found.append((ps,C,axes))
 assert len(found)==1,'Identify the unchanged physical grip'
 ps,C,axes=found[0];G=Vector(C);g=Vector(axes[0]);sock=rig.data.bones['socket_sword'];want=M.to_3x3()@sword.matrix_world.inverted().to_3x3()@rig.matrix_world.to_3x3()@(sock.tail_local-sock.head_local)
 if g.dot(want)<0:g=-g
 radius=max((Vector(v)-G-g*(Vector(v)-G).dot(g)).length for v in ps)
 return G,g,radius

def cuff_center(obj,rig):
 M=(rig.matrix_world@rig.data.bones['hand.R'].matrix_local).inverted()@obj.matrix_world;role=obj.data.attributes['CanonicalArmPart']
 ids={i for f in obj.data.polygons if role.data[f.index].value==44 for i in f.vertices}
 return sum((M@obj.data.vertices[i].co for i in ids),Vector())/len(ids)

def replace(obj,rig,hand):
 bm=bmesh.new();bm.from_mesh(obj.data);df=bm.verts.layers.deform.verify();vg=obj.vertex_groups['hand.R'].index
 ca=bm.loops.layers.float_color.get('ArmorColor');role=bm.faces.layers.int.get('CanonicalArmPart');tag=bm.faces.layers.int.get('tag');edge=bm.faces.layers.int.get('edge');old=bm.faces.layers.int.get('GauntletPart')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[df].get(vg,0)>.5],context='VERTS')
 H=obj.matrix_world.inverted()@rig.matrix_world@rig.data.bones['hand.R'].matrix_local
 for key,c in hand.items():
  vs=[]
  for p in c['verts']:v=bm.verts.new(H@p);v[df][vg]=1;vs.append(v)
  for p in c['faces']:
   # The anatomical reflection changes winding. Recalculate normals afterward.
   f=bm.faces.new([vs[i]for i in reversed(p['verts'])]);f.material_index=obj.data.materials.find(p['mat']);f[role]=key;f[tag]=p['tag'];f[edge]=p['edge']
   if old:f[old]=999+key
   for l,col in zip(f.loops,reversed(p['colors'])):l[ca]=col
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()

bpy.ops.wm.open_mainfile(filepath=str(args.baseline/'spellblade-third-person.blend'));rig=bpy.data.objects['SpellbladeRig'];left=parts(bpy.data.objects['Gauntlet.L'],rig,'L')
# The accepted dorsal plate defines the source hand's anatomy.
Y=Vector((0,1,0));Ns=center(left[2])-center(left[1]);Ns=(Ns-Y*Ns.dot(Y)).normalized();W=Y.cross(Ns).normalized()
min_n=min(v.dot(Ns)for v in left[1]['verts'])
G,g,r=grip(rig,bpy.data.objects['HeroSword']);wrist=cuff_center(bpy.data.objects['Gauntlet.R'],rig);D=wrist-G;D=(D-g*D.dot(g)).normalized();D=-D;N=-D.cross(g).normalized();s0=(wrist-G).dot(g)
hand=copy.deepcopy(left)
# Mirror the palm and its existing back/wrist/knuckle plates, then shape its
# long axis over the rear quadrant of the real grip instead of inventing a fist block.
for key in range(1,5):
 c=hand[key]
 for i,v in enumerate(c['verts']):
  t=(v.y+.004)/.122;theta=math.radians(-90+90*t);radial=N*math.cos(theta)+D*math.sin(theta)
  radius=r+.009+max(0,v.dot(Ns)-min_n)*.60*max(.15,min(1,t))
  c['verts'][i]=G+g*(v.dot(W)*.88+s0*(1-max(0,min(1,t))))+radial*radius
# Each finger retains the left hand's actual leather core and steel plates.
# Close the three source phalanges as separate pieces, preserving their bevels.
for finger,start in enumerate((5,11,17,23)):
 across=center(left[start]).dot(W)*.88
 for j,(lo,hi) in enumerate(((0,65),(65,130),(130,192))):
  core=left[start+2*j];plate=left[start+2*j+1];C=center(core);cp=center(plate)
  points=np.array([tuple(v-C)for v in core['verts']]);axis=Vector(np.linalg.svd(points)[2][0]);direction=(center(left[start+2*min(2,j+1)])-center(left[start+2*max(0,j-1)]))if j else C-center(left[4])
  if axis.dot(direction)<0:axis=-axis
  normal=cp-C;normal=(normal-axis*normal.dot(axis)).normalized();width=axis.cross(normal).normalized()
  if width.dot(W)<0:width=-width
  lo*= (1,1.02,.96,.90)[finger];hi*= (1,1.02,.96,.90)[finger]
  theta=math.radians((lo+hi)/2+(finger-1.5)*4);R=N*math.cos(theta)+D*math.sin(theta);T=D*math.cos(theta)-N*math.sin(theta)
  span=max((v-C).dot(axis)for v in core['verts'])-min((v-C).dot(axis)for v in core['verts']);length=2*(r+.017)*math.sin(math.radians(hi-lo)/2)-.002
  inner=min((v-C).dot(normal)for v in core['verts']);at=G+g*across+R*(r+.007-inner)
  for key in (start+2*j,start+2*j+1):
   hand[key]['verts']=[at+g*(v-C).dot(width)*.83+T*((v-C).dot(axis)*length/span*(.78 if key%2==0 else 1))+R*(v-C).dot(normal)for v in left[key]['verts']]
# The copied opposing thumb crosses outside the index finger, with a visible
# two segment joint. Its tip bears against the grip's opposite side.
thumb_points=[G+g*.084+(N*.92-D*.39)*(r+.031),G+g*.074+(N*.86+D*.51)*(r+.036),G+g*.039+(N*.35+D*.94)*(r+.037)]
for j,start in enumerate((29,31)):
 core=left[start];plate=left[start+1];C=center(core);normal=(center(plate)-C).normalized();points=np.array([tuple(v-C)for v in core['verts']]);axis=Vector(np.linalg.svd(points)[2][0]);axis=(axis-normal*axis.dot(normal)).normalized();width=axis.cross(normal).normalized();begin,end=thumb_points[j:j+2];tangent=(end-begin).normalized();radial=(begin+end)/2-G;radial=(radial-g*radial.dot(g));radial=(radial-tangent*radial.dot(tangent)).normalized();across=tangent.cross(radial).normalized();span=max((v-C).dot(axis)for v in core['verts'])-min((v-C).dot(axis)for v in core['verts'])
 for key in (start,start+1):hand[key]['verts']=[(begin+end)/2+tangent*((v-C).dot(axis)*(end-begin).length/span)+across*(v-C).dot(width)*.82+radial*(v-C).dot(normal)for v in left[key]['verts']]
replace(bpy.data.objects['Gauntlet.R'],rig,hand);bpy.data.objects['Gauntlet.R']['right_hand_source']='Mirrored accepted left spell hand, closed around actual sword grip'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(args.out/'spellblade-third-person.blend'),copy=True)
# Transfer the same closed construction to FP, using its physical grip and cuff.
bpy.ops.wm.open_mainfile(filepath=str(args.baseline/'spellblade-first-person.blend'));fpRig=bpy.data.objects['SpellbladeFirstPersonRig'];right=bpy.data.objects['Arm.R'];FG,fg,fr=grip(fpRig,bpy.data.objects['HeroSword']);fw=cuff_center(right,fpRig);FD=FG-fw;FD=(FD-fg*FD.dot(fg)).normalized();FN=-FD.cross(fg).normalized();roll=math.radians(args.fp_roll);FD,FN=FD*math.cos(roll)+FN*math.sin(roll),FN*math.cos(roll)-FD*math.sin(roll);scale=fr/r
for c in hand.values():c['verts']=[FG+(fg*(v-G).dot(g)+FD*(v-G).dot(D)+FN*(v-G).dot(N))*scale for v in c['verts']]
replace(right,fpRig,hand);right['right_hand_source']='Actual mirrored and closed TP left-hand construction, fitted to unchanged FP sword grip'
bpy.ops.wm.save_as_mainfile(filepath=str(args.out/'spellblade-first-person.blend'),copy=True)
(args.out/'hand-fit.json').write_text(json.dumps({'tpGrip':list(G),'tpAxis':list(g),'tpRadius':r,'tpWrist':list(wrist),'fpGrip':list(FG),'fpAxis':list(fg),'fpRadius':fr,'fpWrist':list(fw),'scale':scale,'fpRoll':args.fp_roll},indent=2));print('MIRRORED_HAND_SOURCE_OK',args.out)
