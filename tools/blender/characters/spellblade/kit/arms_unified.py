"""Edit the authored TP arm pieces, then graft that construction onto the FP rig.

Blender --background --python this-file -- --out DIRECTORY --third-person-source BASE_TP --first-person-source BASE_FP
Sources, actions, sword and attachment meshes are preserved in the input files.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[5]
P=argparse.ArgumentParser(description=__doc__)
P.add_argument('--out',type=Path,required=True)
P.add_argument('--third-person-source',type=Path,required=True)
P.add_argument('--first-person-source',type=Path,required=True)
args=P.parse_args(sys.argv[sys.argv.index('--')+1:])
args.out.mkdir(parents=True,exist_ok=True)
for src in (args.third_person_source,args.first_person_source):
 if not src.is_file():raise ValueError('Missing baseline source: '+str(src))
 if (args.out/src.name).resolve()==src.resolve():raise ValueError('Keep baseline input and edited output separate')
TAGS=['steel','steel_dark','brass','under','leather','leather_dark','cloth','cloth_dark','cream','face','buckle','banner']

def components(obj):
 adj=[set() for _ in obj.data.vertices]
 for e in obj.data.edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 seen=set();out=[]
 for v in obj.data.vertices:
  if v.index in seen:continue
  todo=[v.index];seen.add(v.index);ids=[]
  while todo:
   i=todo.pop();ids.append(i)
   for j in adj[i]:
    if j not in seen:seen.add(j);todo.append(j)
  out.append(sorted(ids))
 return out

def read(obj,rig):
 me=obj.data;ca=me.color_attributes['ArmorColor'];tag=me.attributes['tag'];edge=me.attributes.get('edge');result=[]
 for ci,ids in enumerate(components(obj)):
  names={obj.vertex_groups[g.group].name for i in ids for g in me.vertices[i].groups if g.weight>.5}
  if len(names)!=1:raise ValueError(('mixed component',obj.name,ci,names))
  bn=names.pop();inv=(rig.matrix_world@rig.data.bones[bn].matrix_local).inverted();lookup={i:n for n,i in enumerate(ids)}
  faces=[p for p in me.polygons if all(i in lookup for i in p.vertices)]
  result.append({'id':ci,'bone':bn,'verts':[list(inv@obj.matrix_world@me.vertices[i].co) for i in ids],
    'faces':[{'verts':[lookup[i]for i in p.vertices],'material':me.materials[p.material_index].name,'tag':tag.data[p.index].value,'edge':edge.data[p.index].value if edge else 0,'colors':[list(ca.data[l].color)for l in p.loop_indices]}for p in faces]})
 return result

def center(c):return sum((Vector(v) for v in c['verts']),Vector())/len(c['verts'])
def apply(c,fn):c['verts']=[list(fn(Vector(v))) for v in c['verts']]

def write(obj,rig,parts,remove_bones):
 bm=bmesh.new();bm.from_mesh(obj.data);df=bm.verts.layers.deform.verify();ca=bm.loops.layers.float_color.get('ArmorColor')
 tag=bm.faces.layers.int.get('tag');edge=bm.faces.layers.int.get('edge');role=bm.faces.layers.int.get('CanonicalArmPart')or bm.faces.layers.int.new('CanonicalArmPart')
 remove={obj.vertex_groups[n].index for n in remove_bones}
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if any(v[df].get(i,0)>.5 for i in remove)],context='VERTS')
 old=bm.faces.layers.int.get('GauntletPart')
 for c in parts:
  if c['bone'] not in remove_bones:continue
  H=obj.matrix_world.inverted()@rig.matrix_world@rig.data.bones[c['bone']].matrix_local;group=obj.vertex_groups[c['bone']].index
  vs=[]
  for xyz in c['verts']:
   v=bm.verts.new(H@Vector(xyz));v[df][group]=1;vs.append(v)
  for p in c['faces']:
   f=bm.faces.new([vs[i]for i in p['verts']]);f.material_index=obj.data.materials.find(p['material']);f[tag]=p['tag'];f[role]=c['id']+1
   if edge:f[edge]=p['edge']
   if old: f[old]=1000+c['id'] if c['bone']=='hand.R' else 0
   for l,col in zip(f.loops,p['colors']):l[ca]=col
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()

def glove_charcoal(c):
 for f in c['faces']:
  f['tag']=TAGS.index('leather_dark');f['material']='KitMatte'
  for col in f['colors']:
   lum=col[0]*.3+col[1]*.5+col[2]*.2
   col[:3]=[lum*.34,lum*.36,lum*.43]

def ridge_cut(c,G,g):
 # Split the existing broad plate across its centre, for a real low-poly crown.
 bm=bmesh.new();ca=bm.loops.layers.float_color.new('ArmorColor');mt=bm.faces.layers.int.new('sourceMaterial');tg=bm.faces.layers.int.new('sourceTag');ed=bm.faces.layers.int.new('sourceEdge')
 vs=[bm.verts.new(Vector(v))for v in c['verts']]
 for p in c['faces']:
  f=bm.faces.new([vs[i]for i in p['verts']]);f[mt]=int(p['material']=='KitMetal');f[tg]=p['tag'];f[ed]=p['edge']
  for l,col in zip(f.loops,p['colors']):l[ca]=col
 bmesh.ops.bisect_plane(bm,geom=[*bm.verts,*bm.edges,*bm.faces],dist=.000001,plane_co=G,plane_no=g,clear_inner=False,clear_outer=False)
 bm.verts.ensure_lookup_table();bm.verts.index_update()
 c['verts']=[list(v.co)for v in bm.verts]
 c['faces']=[{'verts':[v.index for v in f.verts],'material':'KitMetal'if f[mt]else'KitMatte','tag':f[tg],'edge':f[ed],'colors':[list(l[ca])for l in f.loops]}for f in bm.faces]
 bm.free()

def open_cuff(c):
 # Retain the authored outer bevel and rim. Open its two solid end caps and
 # give the remaining armor a six millimetre inner wall in Blender.
 bm=bmesh.new();ca=bm.loops.layers.float_color.new('ArmorColor')
 vs=[bm.verts.new(Vector(v))for v in c['verts']]
 for p in c['faces']:
  f=bm.faces.new([vs[i]for i in p['verts']]);f.material_index=int(p['material']=='KitMetal')
  for l,col in zip(f.loops,p['colors']):l[ca]=col
 bm.normal_update()
 caps=[f for f in bm.faces if abs(f.normal.y)>.95]
 bmesh.ops.delete(bm,geom=caps,context='FACES_ONLY')
 bmesh.ops.solidify(bm,geom=list(bm.faces),thickness=.006)
 bm.verts.ensure_lookup_table();bm.verts.index_update()
 c['verts']=[list(v.co)for v in bm.verts]
 c['faces']=[{'verts':[v.index for v in f.verts],'material':'KitMetal','tag':TAGS.index('brass'),'edge':1,'colors':[list(l[ca])for l in f.loops]}for f in bm.faces]
 bm.free()

def sculpt_open(parts):
 # Keep the actual open TP glove, thumb, fan and curl. Shape the wrist and plate edges.
 palm=parts[0];C=center(palm)
 ridge_cut(palm,C,Vector((1,0,0)))
 ridge_cut(palm,C,Vector((0,1,0)))
 for c in parts[:32]:
  if c['id']==0:
   apply(c,lambda v:Vector((C.x+(v.x-C.x)*( .78 if v.y<C.y else .96),v.y,C.z+(v.z-C.z)*.84+.004*max(0,1-abs((v.x-C.x)/.07)))))
   glove_charcoal(c)
  elif c['id'] in (1,2,3):
   # Dorsal steel follows the same narrower wrist, with a broader knuckle fan.
   cc=center(c);apply(c,lambda v:Vector((cc.x+(v.x-cc.x)*(.90 if v.y<C.y else 1.02),v.y,v.z)))
 for core_i,plate_i in [(4+i*6+j*2,5+i*6+j*2) for i in range(4) for j in range(3)]+[(28,29),(30,31)]:
  core=parts[core_i];plate=parts[plate_i];C0=center(core);C1=center(plate);N=(C1-C0).normalized()
  ps=np.array(core['verts']);axis=Vector(np.linalg.svd(ps-ps.mean(0))[2][0]);axis=(axis-N*axis.dot(N)).normalized();W=N.cross(axis).normalized()
  length=max(abs((Vector(v)-C0).dot(axis))for v in core['verts'])
  for c in (core,plate):
   def shape(v,c=c):
    q=v-C0;along=q.dot(axis);across=q.dot(W);normal=q.dot(N)
    taper=1-.13*max(0,min(1,(along/length+1)/2))
    if c is plate:
     # Enlarge the existing skirt into a shallow faceted wrap, with the original crown retained.
     n0=(C1-C0).dot(N)
     normal=n0+(normal-n0)*1.38-.0018
     across*=1.05
    return C0+axis*along+W*(across*taper)+N*normal
   apply(c,shape)
   if c is core:glove_charcoal(c)
 # Extend the original glove's wrist end through the hollow cuff.
 apply(palm,lambda v:Vector((v.x,v.y-.014*max(0,min(1,(.02-v.y)/.03)),v.z)))
 # Compact the broad palm while retaining the actual open finger construction.
 for c in parts[:32]:
  if c['id']<=3:apply(c,lambda v:Vector((v.x, min(v.y,.02)+.82*max(0,v.y-.02),v.z)))
  elif c['id']<28:apply(c,lambda v:v-Vector((0,.025,0)))
  else:apply(c,lambda v:v-Vector((0,.012,0)))
 # Shape the metacarpal silhouette in the actual palm frame, rather than
 # leaving a rectangular leather box between the cuff and the fingers.
 N=Vector((-.226853713,0,.973928869));Y=Vector((0,1,0));W=Y.cross(N).normalized()
 origin=Vector((.002416162,0,-.010372875))
 for c in parts[:4]:
  for y in (.045,.095):ridge_cut(c,Vector((0,y,0)),Y)
  if c['id']==0:ridge_cut(c,Vector((0,.065,0)),Y)
  def palm_shape(v,c=c):
   q=v-origin;w=q.dot(W);n=q.dot(N);y=v.y
   if y<.045:k=.82+.10*max(0,min(1,(y+.02)/.065))
   elif y<.095:k=.92+.06*(y-.045)/.05
   else:k=.98-.12*max(0,min(1,(y-.095)/.04))
   # A shallow hollow palm and the arched heel create broad readable planes.
   # Keep the centre under the existing PalmRune in the same place.
   cup=.009*min(1,(abs(w)/.065)**2)
   # The pivot is expressed relative to origin, so the existing rune-facing
   # surface remains in place. Retain sleeve volume inside the wrist cuff.
   compression=1-.40*max(0,min(1,(y-.012)/.04))
   n=.0311703+(n-.0311703)*compression
   # Grow the inherited glove into the thumb root. The metal backplate
   # remains separate from this leather web, as on a real plated glove.
   web=.020*max(0,1-abs((y-.068)/.038))*max(0,min(1,-w/.04)) if c['id']==0 else 0
   return origin+W*(w*k-web)+Y*(y-.012*max(0,min(1,(y-.08)/.04)))+N*(n+cup)
  apply(c,palm_shape)
 for finger,start in enumerate((4,10,16,22)):
  pivot=center(parts[start]);pivot.y-=.012
  angle=math.radians((5,8,11,14)[finger]);length=(.99,1.02,.98,.91)[finger]
  for c in parts[start:start+6]:
   def curl(v):
    v=v-Vector((0,.012,0));q=v-pivot;y=q.dot(Y)*length;n=q.dot(N)
    return pivot+W*q.dot(W)+Y*(y*math.cos(angle)-n*math.sin(angle))+N*(y*math.sin(angle)+n*math.cos(angle))
   apply(c,curl)

def grip_info(rig,sword,side='R'):
 inv=(rig.matrix_world@rig.data.bones['hand.'+side].matrix_local).inverted()
 choices=[]
 for ids in components(sword):
  ps=np.array([tuple(inv@sword.matrix_world@sword.data.vertices[i].co)for i in ids]);C=ps.mean(0);axes=np.linalg.svd(ps-C)[2];dims=np.ptp((ps-C)@axes.T,axis=0)
  if np.linalg.norm(C)<.15 and .15<dims[0]<.27 and dims[1]<.11:choices.append((ps,C,axes,dims))
 ps,C,axes,dims=choices[0];G=Vector(C);g=Vector(axes[0]);sock=rig.data.bones['socket_sword'];want=inv.to_3x3()@(sock.tail_local-sock.head_local)
 if g.dot(want)<0:g=-g
 radius=max((Vector(v)-G-g*(Vector(v)-G).dot(g)).length for v in ps)
 return G,g,radius

def right_frame(parts,G,g):
 D=center(parts[4])-center(parts[1]);D=(D-g*D.dot(g)).normalized();N=D.cross(g).normalized()
 if N.dot(center(parts[1])-center(parts[0]))<0:N=-N
 return D,N

def sculpt_fist(parts,G,g,r,D,N):
 def xyz(u,s,n):return G+D*u+g*s+N*n
 for i in (0,1,2):ridge_cut(parts[i],G,g)
 # Reshape actual glove/backplates into a wrist taper and arched knuckle transition.
 for i in range(5):
  c=parts[i]
  def shape(v,i=i):
   q=v-G;u=q.dot(D);s=q.dot(g);n=q.dot(N)
   u=u*(.55 if i==0 else .62)+(.037 if i==0 else .049)
   wrist=max(0,min(1,-u/.047))
   s*=.98-.25*wrist
   s-=.024*wrist
   if i==0:
    contact=math.sqrt(max(0,(r+.005)**2-u*u)) if abs(u)<r+.005 else 0
    n=max(contact,n*.45+.050+.009*max(0,1-(s/.072)**2))
   else:
    n=n*.75+.035+.012*max(0,1-(s/.072)**2)-.014*wrist
   return xyz(u,s,n)
  apply(c,shape)
 for finger,start in enumerate((5,12,19,26)):
  offset=(-.049,-.017,.016,.046)[finger]
  # The four knuckles follow an arc rather than a straight line of identical blocks.
  arc=(.003,.008,.006,-.003)[finger]
  C=center(parts[start]);q=C-G;cu=q.dot(D);cs=q.dot(g);cn=q.dot(N)
  apply(parts[start],lambda v:xyz(.030+arc+(v-C).dot(D)*.9,offset+(v-C).dot(g)*.97,r+.034+(v-C).dot(N)*.88))
  for j,(angle0,angle1) in enumerate(((24,76),(76,129),(129,178))):
   core=parts[start+1+j*2];plate=parts[start+2+j*2];C0=center(core);C1=center(plate)
   srcN=(C1-C0);srcN=(srcN-g*srcN.dot(g)).normalized();srcD=g.cross(srcN).normalized()
   extent=max(abs((Vector(v)-C0).dot(srcD))for v in core['verts'])
   for c in (core,plate):ridge_cut(c,C0,srcD)
   for c in (core,plate):
    def shape(v,c=c):
     q=v-C0;u=q.dot(srcD);across=q.dot(g);n=q.dot(srcN)
     t=max(0,min(1,(u/extent+1)/2))
     theta=math.radians(angle0+(angle1-angle0)*t+(0,-1,1,3)[finger])
     normal=N*math.cos(theta)+D*math.sin(theta)
     taper=1-.12*(j+t)/3
     if c is core:n*=.66
     else:
      relief=(C1-C0).dot(srcN);n=relief*.80+(n-relief)*.96
     return G+g*(offset+across*.84*taper)+normal*(r+.0185+n)+D*arc
    apply(c,shape)
 # Opposing thumb uses the source's two actual plated segments.
 thumb_points=[G+g*.065-D*.024+N*.065,G+g*.046-D*.055+N*.034,G+g*.024-D*.064-N*.004]
 for j,(core_i,plate_i) in enumerate(((33,34),(35,36))):
  core=parts[core_i];plate=parts[plate_i];C0=center(core);C1=center(plate);srcN=(C1-C0).normalized();ps=np.array(core['verts']);srcD=Vector(np.linalg.svd(ps-ps.mean(0))[2][0]);srcD=(srcD-srcN*srcD.dot(srcN)).normalized();srcW=srcN.cross(srcD).normalized()
  begin,end=thumb_points[j:j+2];target=(begin+end)/2;direction=(end-begin).normalized();normal=target-G-g*(target-G).dot(g);normal=(normal-direction*normal.dot(direction)).normalized();across=normal.cross(direction).normalized()
  source_length=max((Vector(v)-C0).dot(srcD)for v in core['verts'])-min((Vector(v)-C0).dot(srcD)for v in core['verts']);length_scale=(end-begin).length/source_length
  for c in (core,plate):
   def shape(v,c=c):
    q=v-C0;n=q.dot(srcN);relief=(C1-C0).dot(srcN)
    n=n*.66 if c is core else relief*.8+(n-relief)*.95
    return target+direction*(q.dot(srcD)*length_scale)+across*(q.dot(srcW)*.90)+normal*n
   apply(c,shape)

def forearm_shape(parts,side):
 for c in parts:
  if c['bone']!='forearm.'+side:continue
  cuff=c['id']==(43 if side=='R'else 38)
  def shape(v):
   t=max(0,min(1,v.y/.28));k=1-.23*t
   v=Vector((v.x*k,v.y,v.z*k))
   if cuff:
    # More restrained gold band and a lowered lip on the palm side.
    v.y=.238+(v.y-.244)*.74
    v.y-=.018*max(0,(v.z/.11))**2
   return v
  apply(c,shape)
  if cuff:open_cuff(c)

bpy.ops.wm.open_mainfile(filepath=str(args.third_person_source))
rig=bpy.data.objects['SpellbladeRig'];right=bpy.data.objects['Gauntlet.R'];left=bpy.data.objects['Gauntlet.L']
R=read(right,rig);L=read(left,rig);G,g,r=grip_info(rig,bpy.data.objects['HeroSword']);D,N=right_frame(R,G,g)
sculpt_fist(R,G,g,r,D,N);sculpt_open(L);forearm_shape(R,'R');forearm_shape(L,'L')
write(right,rig,R,{'hand.R','forearm.R'});write(left,rig,L,{'hand.L','forearm.L'})
for obj in (right,left):obj['arm_design']='Unified authored steel gauntlet, tapered phalanges and fitted brass cuff'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(args.out/'spellblade-third-person.blend'),copy=True)
# TP pieces are now the canonical geometry. Transfer topology, materials and corner colors.
bpy.ops.wm.open_mainfile(filepath=str(args.first_person_source))
rig=bpy.data.objects['SpellbladeFirstPersonRig'];fpR=bpy.data.objects['Arm.R'];fpL=bpy.data.objects['Arm.L']
FG,fg,fr=grip_info(rig,bpy.data.objects['HeroSword'])
inv=rig.data.bones['hand.R'].matrix_local.inverted();fb=rig.data.bones['forearm.R'];a=inv.to_3x3()@(fb.tail_local-fb.head_local);a=(a-fg*a.dot(fg)).normalized();b=fg.cross(a).normalized()
angle=math.radians(45);FD=a*math.cos(angle)+b*math.sin(angle);FN=b*math.cos(angle)-a*math.sin(angle)
scale=fr/r
for c in R:
 if c['bone']=='hand.R':
  apply(c,lambda v:FG+(FD*(v-G).dot(D)+fg*(v-G).dot(g)+FN*(v-G).dot(N))*scale)
  if c['id']==0:
   # FP raised grip bands are larger relative to the shaft. Open only the hidden palm contact cavity.
   def fit_band_cavity(v):
    q=v-FG;u=q.dot(FD);n=q.dot(FN)
    if abs(u)<fr+.012 and n<fr+.010:v+=FN*(fr+.010-n)
    return v
   apply(c,fit_band_cavity)
 elif c['bone']=='forearm.R':
  # Distal extension fits the dedicated FP bone; the cross section is copied at full size.
  rot=Matrix.Rotation(math.radians(15.8),3,'Y')
  apply(c,lambda v:rot@Vector((v.x,v.y+.0201666*max(0,min(1,v.y/.22)),v.z)))
rot=Matrix.Rotation(math.radians(3.261637758),3,'Y')
for c in L:
 if c['bone']=='hand.L':apply(c,lambda v:rot@v)
 elif c['bone']=='forearm.L':
  rotF=Matrix.Rotation(math.radians(15.79866),3,'Y')
  apply(c,lambda v:rotF@Vector((v.x,v.y+.0201666*max(0,min(1,v.y/.22)),v.z)))
write(fpR,rig,R,{'hand.R','forearm.R'});write(fpL,rig,L,{'hand.L','forearm.L'})
for o in(fpR,fpL):o['arm_design']='Actual canonical TP forearm, cuff and gauntlet transferred into dedicated FP rig'
bpy.ops.wm.save_as_mainfile(filepath=str(args.out/'spellblade-first-person.blend'),copy=True)
print('UNIFIED_ARMS_SOURCE_SAVED',args.out,'right hand grip scale',scale,'left hand scale',1.0)
