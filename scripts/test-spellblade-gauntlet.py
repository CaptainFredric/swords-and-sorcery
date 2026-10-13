"""Preservation and sword clearance for an isolated hand or unified arms pass.
Run in Blender with -- [--arms | --forearms | --right-hand] BASELINE.blend CANDIDATE.blend.
The original mode preserves the FP forearm. --arms permits both hands and
forearms in either source, while preserving the upper arms and unrelated data.
--forearms permits only forearm geometry; both accepted hands stay preserved.
--right-hand permits only hand.R geometry in either source; the left hand and
both forearms stay preserved.
Source inspection is read only.
"""
import argparse, sys, math, json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def mesh_snapshot(obj, exclude_hand=False, exclude_bones=(), strict=False):
 excluded=set(exclude_bones)|({'hand.R'} if exclude_hand else set())
 ids={v.index for v in obj.data.vertices if not any(obj.vertex_groups[g.group].name in excluded and g.weight>.5 for g in v.groups)}
 verts=sorted((tuple(v.co),tuple(sorted((obj.vertex_groups[g.group].name,round(g.weight,7)) for g in v.groups)))for v in obj.data.vertices if v.index in ids)
 color=obj.data.color_attributes.get('ArmorColor')
 faces=sorted((tuple(sorted(tuple(obj.data.vertices[i].co)for i in f.vertices)),f.material_index,tuple(sorted(tuple(color.data[l].color)for l in f.loop_indices))if color else())for f in obj.data.polygons if set(f.vertices)<=ids)
 if strict:
  faces=sorted((tuple(sorted((tuple(obj.data.vertices[obj.data.loops[l].vertex_index].co),tuple(color.data[l].color)if color else())for l in f.loop_indices)),f.material_index,f.use_smooth)for f in obj.data.polygons if set(f.vertices)<=ids)
  edges=sorted(tuple(sorted(tuple(obj.data.vertices[i].co)for i in e.vertices))for e in obj.data.edges if set(e.vertices)<=ids)
  return verts,faces,edges
 return verts,faces

def source_objects(arms=False):
 if not arms:return bpy.data.objects['SpellbladeFirstPersonRig'],[bpy.data.objects['Arm.R']]
 rig=bpy.data.objects.get('SpellbladeFirstPersonRig') or bpy.data.objects.get('SpellbladeRig')
 assert rig is not None,'Expected the authored TP or FP Spellblade rig'
 stem='Arm' if rig.name=='SpellbladeFirstPersonRig' else 'Gauntlet'
 return rig,[bpy.data.objects[stem+'.'+side]for side in('R','L')]

def matrix(value):return tuple(tuple(row)for row in value)

def object_contract(obj):
 return (obj.type,obj.parent.name if obj.parent else None,obj.parent_type,obj.parent_bone,
  matrix(obj.matrix_basis),matrix(obj.matrix_parent_inverse),matrix(obj.matrix_world),
  tuple((m.name,m.type,m.object.name if m.type=='ARMATURE' and m.object else None)for m in obj.modifiers))

def snapshot(path, arms=False, forearms=False, right_hand=False):
 bpy.ops.wm.open_mainfile(filepath=str(path))
 scoped=arms or forearms or right_hand
 rig,arm_objects=source_objects(scoped);arm=arm_objects[0]
 result={'meshes':{o.name:mesh_snapshot(o,strict=scoped)for o in bpy.data.objects if o.type=='MESH'and o not in arm_objects},'arm_rest':mesh_snapshot(arm,True),
  'bones':[(b.name,b.parent.name if b.parent else None,tuple(tuple(row)for row in b.matrix_local))for b in rig.data.bones],
  'actions':[(a.name,tuple(a.frame_range),[(f.data_path,f.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation)for k in f.keyframe_points])for f in a.fcurves])for a in bpy.data.actions],
  'groups':[g.name for g in arm.vertex_groups], 'materials':[m.name for m in arm.data.materials],
  'reference':bytes(bpy.data.images['CANONICAL_SPELLBLADE_KEEP'].packed_file.data)}
 if scoped:
  excluded={'hand.R'} if right_hand else {'forearm.R','forearm.L'} if forearms else {'hand.R','hand.L','forearm.R','forearm.L'}
  result['arm_rest']={o.name:mesh_snapshot(o,exclude_bones=excluded,strict=True)for o in arm_objects}
  result['groups']={o.name:tuple(g.name for g in o.vertex_groups)for o in arm_objects}
  result['materials']={o.name:tuple(m.name if m else None for m in o.data.materials)for o in arm_objects}
  result['object_contracts']={o.name:object_contract(o)for o in bpy.data.objects if o.type in('MESH','ARMATURE')}
  result['mesh_slots']={o.name:(tuple(g.name for g in o.vertex_groups),tuple(m.name if m else None for m in o.data.materials))for o in bpy.data.objects if o.type=='MESH'}
  result['rig_bone_settings']=[(b.name,b.use_connect,b.use_deform,b.inherit_scale)for b in rig.data.bones]
 return result

parser=argparse.ArgumentParser(description=__doc__)
scope=parser.add_mutually_exclusive_group()
scope.add_argument('--arms',action='store_true');scope.add_argument('--forearms',action='store_true')
scope.add_argument('--right-hand',action='store_true')
parser.add_argument('baseline',type=Path);parser.add_argument('candidate',type=Path)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);baseline=args.baseline;candidate=args.candidate
scoped=args.arms or args.forearms or args.right_hand
before=snapshot(baseline,args.arms,args.forearms,args.right_hand);after=snapshot(candidate,args.arms,args.forearms,args.right_hand)
for key in before:assert before[key]==after[key],f'Unrelated source data changed: {key}'
rig,arm_objects=source_objects(scoped);arm=arm_objects[0];sword=bpy.data.objects['HeroSword'];M=(rig.matrix_world@rig.data.bones['hand.R'].matrix_local).inverted()
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
sword_ids=set(range(len(sword.data.vertices))) if scoped else set(candidates[0])
overlap=bvh(arm,ids).overlap(bvh(sword,sword_ids))
assert not overlap,f'Right hand surfaces cut through physical {"sword" if scoped else "grip"}: {len(overlap)} face pairs'
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
  overlap=posed_bvh(evaluated[0],ids).overlap(posed_bvh(evaluated[1],sword_ids))
  assert not overlap,f'{action.name} frame {frame}: hand cuts through physical {"sword" if scoped else "grip"}: {len(overlap)} face pairs'
  checks+=1
if args.right_hand:
 print('RIGHT_HAND_SOURCE_OK left hand, both forearms, upper arms, unrelated meshes, object hierarchy and matrices, rig, actions, reference, material slots and vertex groups preserved; entire sword surface overlap zero; sampled poses',checks)
elif args.forearms:
 print('FOREARMS_SOURCE_OK both hands, upper arms, unrelated meshes, object hierarchy and matrices, rig, actions, reference, material slots and vertex groups preserved; entire sword surface overlap zero; sampled poses',checks)
elif args.arms:
 print('ARMS_SOURCE_OK both upper arms, unrelated meshes, object hierarchy and matrices, rig, actions, reference, material slots and vertex groups preserved; entire sword surface overlap zero; sampled poses',checks)
else:
 print('GAUNTLET_SOURCE_OK unrelated meshes, forearm, rig, actions, reference, materials and weights preserved; grip surface overlap zero; sampled poses',checks)
