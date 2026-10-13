import bpy,json,numpy as np,hashlib,argparse,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Read only TP/FP component and grip correspondence')
parser.add_argument('--first-person',type=Path,default=root/'tools/blender/characters/spellblade/source/spellblade-first-person.blend')
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);out=args.out
tag_names=['steel','steel_dark','brass','under','leather','leather_dark','cloth','cloth_dark','cream','face','buckle','banner']

def components(obj):
 adj=[set()for v in obj.data.vertices]
 for e in obj.data.edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 result=[];seen=set()
 for v in obj.data.vertices:
  if v.index in seen:continue
  todo=[v.index];seen.add(v.index);ids=[]
  while todo:
   i=todo.pop();ids.append(i)
   for j in adj[i]:
    if j not in seen:seen.add(j);todo.append(j)
  result.append(sorted(ids))
 return result

def inspect(path,rig_name,arm_name):
 bpy.ops.wm.open_mainfile(filepath=str(path))
 rig=bpy.data.objects[rig_name];arm=bpy.data.objects[arm_name];sword=bpy.data.objects['HeroSword']
 report={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rig':rig_name,'arm':arm_name,'materials':[m.name for m in arm.data.materials],'attributes':[(a.name,a.domain,a.data_type)for a in arm.data.attributes],'components':[],'bone_matrices':{b.name:[list(row)for row in rig.matrix_world@b.matrix_local]for b in rig.data.bones if b.name in ['upper_arm.R','forearm.R','hand.R','socket_sword']},'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'length':b.length,'parent':b.parent.name if b.parent else None}for b in rig.data.bones if b.name in ['upper_arm.R','forearm.R','hand.R','socket_sword']},'hand_frame':{},'sword_components':[],'group_stats':{}}
 me=arm.data;ca=me.color_attributes['ArmorColor'];tag=me.attributes.get('tag');edge=me.attributes.get('edge');part=me.attributes.get('GauntletPart')
 def infer_color(p):
  c=np.array(ca.data[p.loop_start].color[:3]);fr=np.array((.727,.671,.474));palette={'steel':(108,100,110),'steel_dark':(60,55,62),'brass':(186,146,118),'under':(26,28,40),'leather_dark':(58,42,36)}
  def linear(v):
   v=v/255;return v/12.92 if v<=.04045 else((v+.055)/1.055)**2.4
  basis={key:np.array([linear(v)for v in rgb])/fr for key,rgb in palette.items()}
  choices=[(float(np.linalg.norm(c-vector*gain)),key)for key,vector in basis.items()for gain in(1,1.22)]
  return min(choices)[1]
 invH=(rig.matrix_world@rig.data.bones['hand.R'].matrix_local).inverted()
 for ci,ids in enumerate(components(arm)):
  groups=sorted({arm.vertex_groups[g.group].name for i in ids for g in me.vertices[i].groups if g.weight>.5})
  if not any(g in groups for g in ['hand.R','forearm.R','upper_arm.R']):continue
  bone=groups[0]if len(groups)==1 else 'hand.R'
  inv=(rig.matrix_world@rig.data.bones[bone].matrix_local).inverted()
  ps=np.array([tuple(inv@arm.matrix_world@me.vertices[i].co)for i in ids]);center=ps.mean(0);axes=np.linalg.svd(ps-center)[2]
  idset=set(ids);faces=[p for p in me.polygons if all(i in idset for i in p.vertices)]
  tags={};materials={};area=0
  lookup={i:n for n,i in enumerate(ids)}
  for p in faces:
   area+=p.area
   t=tag_names[tag.data[p.index].value]if tag and 0<=tag.data[p.index].value<len(tag_names)else None
   if part and part.data[p.index].value>0:t=infer_color(p)
   if t:tags[t]=tags.get(t,0)+p.area
   m=me.materials[p.material_index].name;materials[m]=materials.get(m,0)+p.area
  entry={'component_index':ci,'group':bone,'vertex_indices':ids,'vertices_bone_local':ps.tolist(),'vertex_weights':[{arm.vertex_groups[g.group].name:g.weight for g in me.vertices[i].groups}for i in ids],'center':center.tolist(),'minimum':ps.min(0).tolist(),'maximum':ps.max(0).tolist(),'pca_axes':axes.tolist(),'pca_dimensions':np.ptp((ps-center)@axes.T,axis=0).tolist(),'tags_surface_area':tags,'materials_surface_area':materials,'surface_area':area,'faces':[{'polygon_index':p.index,'vertices':[lookup[i]for i in p.vertices],'vertex_indices':list(p.vertices),'material':me.materials[p.material_index].name,'material_index':p.material_index,'tag':tag_names[tag.data[p.index].value]if tag and 0<=tag.data[p.index].value<len(tag_names)else None,'GauntletPart':part.data[p.index].value if part else None,'inferred_palette':infer_color(p)if part and part.data[p.index].value>0 else None,'edge':edge.data[p.index].value if edge else None,'smooth':p.use_smooth,'colors':[list(ca.data[i].color)for i in p.loop_indices]}for p in faces]}
  report['components'].append(entry)
  if rig_name=='SpellbladeRig':
   names={0:'dark glove palm',1:'proximal steel dorsal plate',2:'distal steel dorsal plate',3:'brass distal backplate edge',4:'steel knuckle bar',33:'thumb proximal dark core',34:'thumb proximal steel scale',35:'thumb distal dark core',36:'thumb distal steel scale',37:'upper arm proximal lame',38:'upper arm distal lame',39:'upper arm undersuit',40:'upper arm dark band',41:'forearm steel flared shell',42:'elbow brass chevron rim',43:'wrist brass cuff',44:'forearm outer raised steel panel',45:'forearm front raised steel panel'}
   if ci in names:entry['semantic_piece']=names[ci]
   elif 5<=ci<=32:
    i=(ci-5)//7;sub=(ci-5)%7
    entry['semantic_piece']='finger %s %s'%(i+1,'steel knuckle stud'if sub==0 else ('proximal','middle','distal')[(sub-1)//2]+(' dark core'if sub%2 else ' steel scale'))
  st=report['group_stats'].setdefault(bone,{'vertices':0,'faces':0,'area':0,'tags_area':{},'materials_area':{}})
  st['vertices']+=len(ids);st['faces']+=len(faces);st['area']+=area
  for k,v in tags.items():st['tags_area'][k]=st['tags_area'].get(k,0)+v
  for k,v in materials.items():st['materials_area'][k]=st['materials_area'].get(k,0)+v
 for bone,st in report['group_stats'].items():
  ips=np.array([tuple((rig.matrix_world@rig.data.bones[bone].matrix_local).inverted()@arm.matrix_world@v.co)for v in arm.data.vertices if any(arm.vertex_groups[w.group].name==bone and w.weight>.5 for w in v.groups)])
  st['min']=ips.min(0).tolist();st['max']=ips.max(0).tolist();st['bone_axis_bounds_size']=np.ptp(ips,axis=0).tolist()
 for ci,ids in enumerate(components(sword)):
  ps=np.array([tuple(invH@sword.matrix_world@sword.data.vertices[i].co)for i in ids]);center=ps.mean(0);axes=np.linalg.svd(ps-center)[2];dims=np.ptp((ps-center)@axes.T,axis=0)
  report['sword_components'].append({'component_index':ci,'vertex_indices':ids,'center':center.tolist(),'pca_axes':axes.tolist(),'pca_dimensions':dims.tolist(),'vertices_hand_local':ps.tolist(),'faces':[[ids.index(i)for i in p.vertices]for p in sword.data.polygons if all(i in set(ids)for i in p.vertices)]})
 # Actual handle identified by compact long connected component, not external pivot or wrapped runtime pose.
 handles=[c for c in report['sword_components']if np.linalg.norm(c['center'])<.15 and .15<c['pca_dimensions'][0]<.27 and c['pca_dimensions'][1]<.11]
 if len(handles)!=1:print('HANDLE_CANDIDATES',[(c['component_index'],c['center'],c['pca_dimensions'])for c in handles])
 if len(handles)==1:
  h=handles[0];G=Vector(h['center']);g=Vector(h['pca_axes'][0]);
  # The socket's +Y points toward the sword guard; choose the closest world direction via rest bone transform.
  socket=rig.data.bones['socket_sword'];direction=invH.to_3x3()@(rig.matrix_world.to_3x3()@(socket.tail_local-socket.head_local))
  if g.dot(direction)<0:g=-g
  fore=rig.data.bones['forearm.R'];foreline=invH.to_3x3()@(rig.matrix_world.to_3x3()@(fore.tail_local-fore.head_local));a=(foreline-g*foreline.dot(g)).normalized();b=g.cross(a).normalized()
  radius=max((Vector(p)-G-g*(Vector(p)-G).dot(g)).length for p in h['vertices_hand_local'])
  hpoly=BVHTree.FromPolygons(h['vertices_hand_local'],h['faces'],all_triangles=False)
  report['grip_face_intersections']=[]
  for c in report['components']:
   if c['group']!='hand.R':continue
   tree=BVHTree.FromPolygons(c['vertices_bone_local'],[p['vertices']for p in c['faces']],all_triangles=False)
   pairs=tree.overlap(hpoly)
   if pairs:report['grip_face_intersections'].append({'component_index':c['component_index'],'semantic_piece':c.get('semantic_piece'),'face_pairs':len(pairs)})
  report['hand_frame']={'grip_component_index':h['component_index'],'grip_center_hand_local':list(G),'grip_axis_toward_guard_hand_local':list(g),'forearm_projection_axis_a_hand_local':list(a),'dorsal_axis_b_hand_local':list(b),'grip_length':h['pca_dimensions'][0],'grip_radius':radius,'grip_basis_components':[]}
  for c in report['components']:
   if c['group']!='hand.R':continue
   ps=np.array(c['vertices_bone_local']);coords=(ps-np.array(G))@np.array([a,g,b]).T
   c['grip_basis_center']=coords.mean(0).tolist();c['grip_basis_dimensions']=np.ptp(coords,axis=0).tolist()
 return report

report={}
report['third_person']=inspect(root/'tools/blender/characters/spellblade/source/spellblade-third-person.blend','SpellbladeRig','Gauntlet.R')
report['first_person']=inspect(args.first_person,'SpellbladeFirstPersonRig','Arm.R')
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2));print('TP_INSPECTION_WRITTEN',out)
for key,val in report.items():
 print(key,'MATERIALS',val['materials'],'ATTRS',val['attributes'],'HAND',val['hand_frame'])
 for bn,st in val['group_stats'].items():print('GROUP',key,bn,st)
 for c in val['components']:
  print('COMP',key,c['component_index'],c['group'],'N',len(c['vertex_indices']),'CENTER',[round(n,5)for n in c['center']],'DIM',[round(n,5)for n in c['pca_dimensions']],'TAGS',c['tags_surface_area'],'GRIP',c.get('grip_basis_center'))
