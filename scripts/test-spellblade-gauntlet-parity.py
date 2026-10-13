"""Verify accepted TP component topology/colors were transferred, plus complete sword clearance.
Run in Blender: -- THIRD_PERSON.blend CANDIDATE_FP.blend
"""
import sys
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
paths=sys.argv[sys.argv.index('--')+1:];bpy.ops.wm.open_mainfile(filepath=str(Path(paths[0]).resolve()));tp=bpy.data.objects['Gauntlet.R'];expected={}
for i,ids in enumerate(components(tp)):
 if any(tp.vertex_groups[w.group].name=='hand.R'and w.weight>.5 for w in tp.data.vertices[next(iter(ids))].groups):
  expected[1000+i]=(len(ids),signature(tp,[f for f in tp.data.polygons if set(f.vertices)<=ids]))
assert len(expected)==37
bpy.ops.wm.open_mainfile(filepath=str(Path(paths[1]).resolve()));arm=bpy.data.objects['Arm.R'];parts=arm.data.attributes['GauntletPart'];rig=bpy.data.objects['SpellbladeFirstPersonRig'];sword=bpy.data.objects['HeroSword']
roles={parts.data[f.index].value for f in arm.data.polygons if parts.data[f.index].value>=1000}
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
print('GAUNTLET_PARITY_OK 37 copied component topologies, material/shading assignments and exact corner colors; entire sword clearance poses',checks)
