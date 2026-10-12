"""Source preservation and physical sword grip validation for the isolated right hand pass.
Run in Blender with -- BASELINE.blend CANDIDATE.blend. Source inspection is read only.
"""
import sys, math, json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def mesh_snapshot(obj, exclude_hand=False):
 ids={v.index for v in obj.data.vertices if not exclude_hand or not any(obj.vertex_groups[g.group].name=='hand.R' and g.weight>.5 for g in v.groups)}
 verts=sorted((tuple(v.co),tuple(sorted((obj.vertex_groups[g.group].name,round(g.weight,7)) for g in v.groups)))for v in obj.data.vertices if v.index in ids)
 color=obj.data.color_attributes.get('ArmorColor')
 faces=sorted((tuple(sorted(tuple(obj.data.vertices[i].co)for i in f.vertices)),f.material_index,tuple(sorted(tuple(color.data[l].color)for l in f.loop_indices))if color else())for f in obj.data.polygons if set(f.vertices)<=ids)
 return verts,faces

def snapshot(path):
 bpy.ops.wm.open_mainfile(filepath=str(path))
 rig=bpy.data.objects['SpellbladeFirstPersonRig'];arm=bpy.data.objects['Arm.R']
 return {'meshes':{o.name:mesh_snapshot(o)for o in bpy.data.objects if o.type=='MESH'and o!=arm},'arm_rest':mesh_snapshot(arm,True),
  'bones':[(b.name,b.parent.name if b.parent else None,tuple(tuple(row)for row in b.matrix_local))for b in rig.data.bones],
  'actions':[(a.name,tuple(a.frame_range),[(f.data_path,f.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation)for k in f.keyframe_points])for f in a.fcurves])for a in bpy.data.actions],
  'groups':[g.name for g in arm.vertex_groups], 'materials':[m.name for m in arm.data.materials],
  'reference':bytes(bpy.data.images['CANONICAL_SPELLBLADE_KEEP'].packed_file.data)}

paths=sys.argv[sys.argv.index('--')+1:];baseline=Path(paths[0]);candidate=Path(paths[1])
before=snapshot(baseline);after=snapshot(candidate)
for key in before:assert before[key]==after[key],f'Unrelated source data changed: {key}'
rig=bpy.data.objects['SpellbladeFirstPersonRig'];arm=bpy.data.objects['Arm.R'];sword=bpy.data.objects['HeroSword'];M=(rig.matrix_world@rig.data.bones['hand.R'].matrix_local).inverted()
ids={v.index for v in arm.data.vertices if any(arm.vertex_groups[g.group].name=='hand.R' and g.weight>.5 for g in v.groups)}
adj=[set()for v in sword.data.vertices]
for edge in sword.data.edges:
 a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
seen=set();candidates=[]
for v in sword.data.vertices:
 if v.index in seen:continue
 pending=[v.index];seen.add(v.index);part=[]
 while pending:
  i=pending.pop();part.append(i)
  for j in adj[i]:
   if j not in seen:seen.add(j);pending.append(j)
 points=np.array([tuple(M@sword.matrix_world@sword.data.vertices[i].co)for i in part]);center=points.mean(0);axis=np.linalg.svd(points-center)[2][0];length=np.ptp((points-center)@axis)
 if np.linalg.norm(center)<.15 and .15<length<.26:candidates.append(part)
assert len(candidates)==1,'Physical grip must remain uniquely identifiable'
def bvh(obj,indices):
 vertices=[M@obj.matrix_world@v.co for v in obj.data.vertices]
 faces=[list(f.vertices)for f in obj.data.polygons if set(f.vertices)<=indices]
 return BVHTree.FromPolygons(vertices,faces,all_triangles=False)
overlap=bvh(arm,ids).overlap(bvh(sword,set(candidates[0])))
assert not overlap,f'Right hand surfaces cut through physical grip: {len(overlap)} face pairs'
for i in ids:
 weights={arm.vertex_groups[g.group].name:g.weight for g in arm.data.vertices[i].groups}
 assert weights=={'hand.R':1.0},'Sword fingers must retain rigid hand attachment'
# Sample the actual evaluated skin through every authored action, including between keyframes.
checks=0
for action in bpy.data.actions:
 rig.animation_data.action=action
 for step in range(25):
  frame=action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*step/24
  bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));deps=bpy.context.evaluated_depsgraph_get()
  evaluated=[obj.evaluated_get(deps)for obj in(arm,sword)]
  def posed_bvh(obj,indices):
   return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],[list(f.vertices)for f in obj.data.polygons if set(f.vertices)<=indices],all_triangles=False)
  overlap=posed_bvh(evaluated[0],ids).overlap(posed_bvh(evaluated[1],set(candidates[0])))
  assert not overlap,f'{action.name} frame {frame}: hand cuts through physical grip'
  checks+=1
print('GAUNTLET_SOURCE_OK unrelated meshes, forearm, rig, actions, reference, materials and weights preserved; grip surface overlap zero; sampled poses',checks)
