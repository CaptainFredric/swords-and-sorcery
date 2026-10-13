"""Verify actual TP armor construction was transferred, plus complete sword clearance.
Run in Blender: -- THIRD_PERSON.blend CANDIDATE_FP.blend
CanonicalArmPart sources verify both hands and forearms. Older sources retain
the original GauntletPart right hand contract.
"""
import sys
from collections import Counter
from pathlib import Path
import bpy
from mathutils.bvhtree import BVHTree

def components(obj):
 adj=[set()for v in obj.data.vertices]
 for e in obj.data.edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 seen=set();parts=[]
 for v in obj.data.vertices:
  if v.index in seen:continue
  todo=[v.index];seen.add(v.index);ids=set()
  while todo:
   i=todo.pop();ids.add(i)
   for j in adj[i]:
    if j not in seen:seen.add(j);todo.append(j)
  parts.append(ids)
 return parts

def signature(obj,faces):
 colors=obj.data.color_attributes['ArmorColor']
 return sorted((len(f.vertices),obj.data.materials[f.material_index].name,f.use_smooth,tuple(sorted(tuple(round(v,6)for v in colors.data[l].color)for l in f.loop_indices)))for f in faces)

def rigid_bone(obj,vertices):
 weights=[{obj.vertex_groups[g.group].name:g.weight for g in obj.data.vertices[i].groups}for i in vertices]
 assert weights and all(w==weights[0]for w in weights),'Armor component must retain one rigid bone attachment'
 assert len(weights[0])==1 and next(iter(weights[0].values()))==1.0,'Armor must remain fully attached to its intended bone'
 return next(iter(weights[0]))

def topology_signature(obj,faces):
 """Build an incidence graph without depending on Blender vertex ordering.

 Colored corner nodes connect their vertex, face, and neighboring corners.
 This preserves topology and exact color association while permitting the
 vertex reordering caused by BMesh deletion and insertion.
 """
 vertices=sorted({i for f in faces for i in f.vertices});local={i:n for n,i in enumerate(vertices)}
 colors=obj.data.color_attributes['ArmorColor'];labels=[('vertex',)]*len(vertices);adj=[set()for _ in labels]
 def node(label):
  index=len(labels);labels.append(label);adj.append(set());return index
 def link(a,b):adj[a].add(b);adj[b].add(a)
 for edge in obj.data.edges:
  if all(i in local for i in edge.vertices):link(*(local[i]for i in edge.vertices))
 for face in faces:
  face_node=node(('face',obj.data.materials[face.material_index].name,face.use_smooth));corners=[]
  for loop in face.loop_indices:
   corner=node(('corner',tuple(colors.data[loop].color)));corners.append(corner)
   link(corner,face_node);link(corner,local[obj.data.loops[loop].vertex_index])
  for a,b in zip(corners,corners[1:]+corners[:1]):link(a,b)
 return labels,adj

def identical_construction(left,right):
 """Exact labeled graph isomorphism, including corner colors and materials."""
 labels_a,adj_a=left;labels_b,adj_b=right
 if len(labels_a)!=len(labels_b)or Counter(labels_a)!=Counter(labels_b):return False
 previous=0
 while True:
  palette={};new=[]
  for labels,adj in((labels_a,adj_a),(labels_b,adj_b)):
   values=[]
   for i,label in enumerate(labels):
    signature=(label,tuple(sorted(Counter(labels[j]for j in adj[i]).items(),key=repr)))
    values.append(palette.setdefault(signature,len(palette)))
   new.append(values)
  labels_a,labels_b=new
  if Counter(labels_a)!=Counter(labels_b):return False
  if len(palette)==previous:break
  previous=len(palette)
 candidates={label:{i for i,value in enumerate(labels_b)if value==label}for label in set(labels_a)}
 mapping={};used=set()
 def match():
  if len(mapping)==len(labels_a):return True
  remaining=[i for i in range(len(labels_a))if i not in mapping]
  a=min(remaining,key=lambda i:(-sum(j in mapping for j in adj_a[i]),len(candidates[labels_a[i]]-used),-len(adj_a[i])))
  for b in candidates[labels_a[a]]-used:
   if len(adj_a[a])!=len(adj_b[b])or any((x in adj_a[a])!=(y in adj_b[b])for x,y in mapping.items()):continue
   mapping[a]=b;used.add(b)
   if match():return True
   del mapping[a];used.remove(b)
  return False
 return match()

def canonical_parts(obj,side):
 attr=obj.data.attributes.get('CanonicalArmPart')
 assert attr is not None and attr.domain=='FACE' and attr.data_type=='INT',f'{obj.name}: CanonicalArmPart must be an integer face attribute'
 accepted={'hand.'+side,'forearm.'+side};roles={};coverage={bone:0 for bone in accepted}
 for face in obj.data.polygons:
  bone=rigid_bone(obj,face.vertices)
  if bone not in accepted:continue
  role=attr.data[face.index].value
  assert role>0,f'{obj.name}: every hand and forearm face must identify its canonical component'
  roles.setdefault(role,[]).append(face);coverage[bone]+=1
 assert all(coverage.values()),f'{obj.name}: both hand and forearm must be present'
 result={}
 for role,faces in roles.items():
  vertices={i for f in faces for i in f.vertices};bone=rigid_bone(obj,vertices)
  result[role]=(bone,topology_signature(obj,faces))
 return result

paths=sys.argv[sys.argv.index('--')+1:];bpy.ops.wm.open_mainfile(filepath=str(Path(paths[0]).resolve()));tp=bpy.data.objects['Gauntlet.R']
canonical=tp.data.attributes.get('CanonicalArmPart') is not None
if canonical:
 expected={side:canonical_parts(bpy.data.objects['Gauntlet.'+side],side)for side in('R','L')}
else:
 expected={}
 for i,part_ids in enumerate(components(tp)):
  if any(tp.vertex_groups[w.group].name=='hand.R'and w.weight>.5 for w in tp.data.vertices[next(iter(part_ids))].groups):
   expected[1000+i]=(len(part_ids),signature(tp,[f for f in tp.data.polygons if set(f.vertices)<=part_ids]))
 assert len(expected)==37
bpy.ops.wm.open_mainfile(filepath=str(Path(paths[1]).resolve()));arm=bpy.data.objects['Arm.R'];rig=bpy.data.objects['SpellbladeFirstPersonRig'];sword=bpy.data.objects['HeroSword']
if canonical:
 for side in('R','L'):
  actual=canonical_parts(bpy.data.objects['Arm.'+side],side)
  assert set(actual)==set(expected[side]),f'{side}: every canonical hand and forearm component must be copied exactly once'
  for role in expected[side]:
   assert actual[role][0]==expected[side][role][0] and identical_construction(actual[role][1],expected[side][role][1]),f'{side} component {role}: copied topology, bone attachment, material, shading or color corners changed'
 ids={v.index for v in arm.data.vertices if any(arm.vertex_groups[g.group].name=='hand.R' and g.weight>.5 for g in v.groups)}
else:
 parts=arm.data.attributes['GauntletPart'];roles={parts.data[f.index].value for f in arm.data.polygons if parts.data[f.index].value>=1000}
 assert roles==set(expected),'Every accepted hand component must retain a correspondence'
 ids=set()
 for role in roles:
  faces=[f for f in arm.data.polygons if parts.data[f.index].value==role];vertices={i for f in faces for i in f.vertices};ids|=vertices
  assert (len(vertices),signature(arm,faces))==expected[role],f'Transferred topology, shading or color changed in role {role}'
# The guard, blade and pommel matter as well as the handle. Use evaluated source skin.
checks=0
for action in bpy.data.actions:
 rig.animation_data.action=action
 for step in range(25):
  frame=action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*step/24;bpy.context.scene.frame_set(int(frame),subframe=frame%1);deps=bpy.context.evaluated_depsgraph_get()
  def tree(obj,subset=None):
   evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
   result=BVHTree.FromPolygons([evaluated.matrix_world@v.co for v in mesh.vertices],[tuple(f.vertices)for f in mesh.polygons if subset is None or set(f.vertices)<=subset]);evaluated.to_mesh_clear();return result
  overlap=tree(arm,ids).overlap(tree(sword));assert not overlap,f'{action.name} frame {frame}: hand intersects sword {len(overlap)} face pairs';checks+=1
if canonical:
 print('ARMS_PARITY_OK canonical hand and forearm components on both sides',sum(len(parts)for parts in expected.values()),'; topology, rigid bone attachments, material/shading assignments and exact vertex color corners; entire sword clearance poses',checks)
else:
 print('GAUNTLET_PARITY_OK 37 copied component topologies, material/shading assignments and exact corner colors; entire sword clearance poses',checks)
