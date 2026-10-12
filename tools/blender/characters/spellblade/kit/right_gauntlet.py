"""Rebuild only the first person right hand as editable articulated armor.
Run on the accepted first person source in Blender with a separate output .blend after --.
The forearm, left arm, sword, rigid rig, materials and authored actions are preserved.
"""
import sys, math
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector

rig=bpy.data.objects['SpellbladeFirstPersonRig'];arm=bpy.data.objects['Arm.R'];sword=bpy.data.objects['HeroSword']
if arm.get('concept_right_gauntlet'):raise ValueError('Open the accepted baseline before applying this source edit')
hand=rig.matrix_world@rig.data.bones['hand.R'].matrix_local;inv=hand.inverted()
# The joined sword contains a physical handle, guard, blade and pommel. Identify its compact handle.
adj=[set()for v in sword.data.vertices]
for e in sword.data.edges:
 l,r=e.vertices;adj[l].add(r);adj[r].add(l)
seen=set();handles=[]
for v in sword.data.vertices:
 if v.index in seen:continue
 todo=[v.index];seen.add(v.index);ids=[]
 while todo:
  i=todo.pop();ids.append(i)
  for j in adj[i]:
   if j not in seen:seen.add(j);todo.append(j)
 points=np.array([tuple(inv@sword.matrix_world@sword.data.vertices[i].co)for i in ids]);center=points.mean(0);axis=np.linalg.svd(points-center)[2][0];length=np.ptp((points-center)@axis)
 if np.linalg.norm(center)<.15 and .15<length<.26:handles.append((center,axis,points))
if len(handles)!=1:raise ValueError('Expected one physical sword handle')
center,axis,points=handles[0];G=Vector(center);g=Vector(axis)
# Point along the handle toward its guard, away from the pommel.
if g.dot(Vector((0,1,0)))<0:g=-g
radius=max((Vector(p)-G-g*(Vector(p)-G).dot(g)).length for p in points)
# Preserve the established dorsal orientation. Its broad plate pair supplies the wrist-to-knuckle direction.
verts=[v for v in arm.data.vertices if any(arm.vertex_groups[w.group].name=='hand.R'and w.weight>.5 for w in v.groups)]
positions=np.array([tuple(inv@arm.matrix_world@v.co)for v in verts]);_,_,axes=np.linalg.svd(positions-positions.mean(0))
forearm=rig.data.bones['forearm.R'];foreline=inv.to_3x3()@(rig.matrix_world.to_3x3()@(forearm.tail_local-forearm.head_local))
a=foreline-g*foreline.dot(g);a.normalize()
# The actual kit dorsal surface faces the eye through positive hand-local Z.
b=g.cross(a).normalized()
if b.z<0:a=-a;b=-b
print('GAUNTLET_FRAME',tuple(G),tuple(a),tuple(b),tuple(g),radius)

bm=bmesh.new();bm.from_mesh(arm.data);bm.verts.ensure_lookup_table()
df=bm.verts.layers.deform.active;color=bm.loops.layers.float_color.get('ArmorColor');part=bm.faces.layers.int.new('GauntletPart')
hand_group=arm.vertex_groups['hand.R'].index
old=[v for v in bm.verts if v[df].get(hand_group,0)>.5]
bmesh.ops.delete(bm,geom=old,context='VERTS')
mesh_inv=arm.matrix_world.inverted();metal=arm.data.materials.find('KitMetal');matte=arm.data.materials.find('KitMatte')
PALETTE={'steel':(108,100,110),'dark':(60,55,62),'joint':(26,28,40),'brass':(186,146,118)}
def albedo(tag,gain=1):
 def linear(v):
  v=v/255;return v/12.92 if v<=.04045 else((v+.055)/1.055)**2.4
 return tuple(min(1,linear(v)/f*gain)for v,f in zip(PALETTE[tag],(.727,.671,.474)))+(1,)
def point(u,s,v):return G+a*u+g*s+b*v
def vert(p):
 v=bm.verts.new(mesh_inv@hand@p);v[df][hand_group]=1;return v
def face(vs,tag,role,gain=1):
 f=bm.faces.new(vs);f.material_index=matte if tag=='joint'else metal;f[part]=role
 for loop in f.loops:loop[color]=albedo(tag,gain)
 return f
# Eight corners give broad faces and a single chamfer, instead of smoothing the silhouette away.
def octagon(width,depth,chamfer):
 return[(width,depth-chamfer),(width-chamfer,depth),(-width+chamfer,depth),(-width,depth-chamfer),(-width,-depth+chamfer),(-width+chamfer,-depth),(width-chamfer,-depth),(width,-depth+chamfer)]
def loft(rings,tags,role,bevel_edges=True):
 rows=[[vert(p)for p in ring]for ring in rings]
 for n in range(len(rows)-1):
  for k in range(8):
   tag=tags[n][k]if isinstance(tags[n],list)else tags[n]
   face([rows[n][k],rows[n][(k+1)%8],rows[n+1][(k+1)%8],rows[n+1][k]],tag,role,1.22 if bevel_edges and k%2==0 else 1)
 face(list(reversed(rows[0])),'dark',role);face(rows[-1],tags[-1][0]if isinstance(tags[-1],list)else tags[-1],role)

wrist=Vector((0,0,0));wr=wrist-G;wu,ws,wv=(wr.dot(axis)for axis in(a,g,b))
# One tapered, vaulted hand shell. The lower face rises over the physical grip rather than passing through it.
profile=[(wu,ws,wv,.056,.043),( -.046,-.022,.021,.060,.023),(-.034,-.006,.035,.062,.021),(-.020,0,.049,.063,.011),(.011,0,.050,.061,.010)]
# Keep every lower surface outside the measured grip's conservative radial envelope.
safe=radius+.005
profile=[(u,s,max(v,math.sqrt(max(0,safe*safe-u*u))+d)if abs(u)<safe else v,w,d)for u,s,v,w,d in profile]
rings=[[point(u,s+dx,v+dz)for dx,dz in octagon(w,d,.006)]for u,s,v,w,d in profile]
loft(rings,[['steel','steel','steel','dark','dark','dark','dark','steel']]*len(profile),2)
# A small nested steel wrist lame follows the source cuff. It is structural armor, with no extra gold trim.
profile2=[(wu-.010,ws,wv+.007,.054,.033),(wu-.001,ws+.004,wv+.012,.056,.035)]
loft([[point(u,s+dx,v+dz)for dx,dz in octagon(w,d,.006)]for u,s,v,w,d in profile2],['dark','steel'],1)

R=radius+.018
# Four separate plated fingers. Every phalanx follows an arc around the actual handle; joint gaps stay visible.
# The cross section's inner flat remains outside the physical grip even between ring samples.
for index,offset in enumerate((-.0465,-.0155,.0155,.0465)):
 for segment,(start,end)in enumerate(((8,77),(81,150),(154,224))):
  rr=R+(.002 if segment==0 else 0);width=.0134 if segment==0 else .0126;depth=.0105
  rings=[]
  for theta in (start,(start+end)/2,end):
   theta=math.radians(theta);normal=b*math.cos(theta)+a*math.sin(theta);c=G+g*offset+normal*rr
   rings.append([c+g*x+normal*y for x,y in octagon(width,depth,.003)])
  # Broad knuckle caps sit in line with the phalanges rather than as studs on a separate bar.
  tag='steel'if segment==0 else'dark'
  loft(rings,[['dark',tag,tag,tag,'dark','dark','dark','dark']]*3,100+index*10+segment)
# Opposing thumb, on the guard side. A shaped web meets the dorsal plate; two plates curl onto the handle.
for segment,(start,end,s0,s1)in enumerate(((-55,-9,.060,.071),(-5,37,.071,.079))):
 rings=[]
 for t in (0,.5,1):
  theta=math.radians(start+(end-start)*t);normal=b*math.cos(theta)+a*math.sin(theta);c=G+g*(s0+(s1-s0)*t)+normal*(R+.001)
  rings.append([c+g*x+normal*y for x,y in octagon(.013,.011,.003)])
 loft(rings,[['dark','steel','steel','dark','dark','dark','dark','dark']]*3,200+segment)

bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(arm.data);bm.free();arm.data.update()
arm['concept_right_gauntlet']=True
arm['gauntlet_grip_radius']=radius
arm['gauntlet_design']='Vaulted back, nested wrist, four separated three-piece fingers and opposing two-piece thumb. GauntletPart face attribute identifies editable armor regions.'
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
if out==Path(bpy.data.filepath).resolve():raise ValueError('Use a separate candidate output, preserving the accepted source')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out),copy=True)
print('GAUNTLET_SOURCE_WRITTEN',out)
