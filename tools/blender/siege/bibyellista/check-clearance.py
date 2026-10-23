"""Sample actual triangle clearance in the saved v4.1 production operator fit scene."""
import bpy,json,math,os
from pathlib import Path
from mathutils import Quaternion,Vector
from mathutils.bvhtree import BVHTree
scene=bpy.context.scene
main=scene.objects['Elevation_Cradle'];upper=scene.objects['Upper_Turret_Mount']
for o in scene.objects:
 if o.get('v41_vehicle') and o.animation_data:o.animation_data_clear()
def descendants(root): return [root]+[o for c in root.children for o in descendants(c)]
def tree(objects,evaluated=False):
 verts=[];faces=[];deps=bpy.context.evaluated_depsgraph_get()
 for original in objects:
  if original.type!='MESH':continue
  o=original.evaluated_get(deps) if evaluated else original
  start=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices)
  faces.extend(tuple(start+i for i in p.vertices) for p in o.data.polygons)
 return BVHTree.FromPolygons(verts,faces),verts
operator=[o for o in scene.objects if o.type=='MESH' and o.parent and o.parent.type=='ARMATURE' and o.name!='HeroSword']
bpy.context.view_layer.update();body,_=tree(operator,True)
rows=[]
for mp in [-.15,0,.35]:
 main.rotation_mode='QUATERNION';main.rotation_quaternion=Quaternion((1,0,0),-mp);bpy.context.view_layer.update();lower,_=tree(descendants(main))
 for up in [-.15,0,.35]:
  for yaw in range(0,361,15):
   upper.rotation_mode='QUATERNION';upper.rotation_quaternion=Quaternion((0,0,1),math.radians(yaw))@Quaternion((1,0,0),-up);bpy.context.view_layer.update()
   top,points=tree(descendants(upper));sample=points[::24]
   rows.append({'mainPitch':mp,'upperPitch':up,'yaw':yaw,'mainOverlaps':len(top.overlap(lower)), 'operatorOverlaps':len(top.overlap(body)),
                'sampleMainDistance':min(lower.find_nearest(p)[3] for p in sample), 'sampleOperatorDistance':min(body.find_nearest(p)[3] for p in sample)})
main.rotation_quaternion=Quaternion((1,0,0),0);upper.rotation_quaternion=Quaternion((1,0,0),0);bpy.context.view_layer.update()
out=Path(os.environ.get('BIBYE_V41_SOURCE',str(Path(bpy.data.filepath).parent)))/'clearance.json';out.write_text(json.dumps(rows,indent=2))
print('configs',len(rows),'overlapConfigs',sum(bool(r['mainOverlaps'] or r['operatorOverlaps']) for r in rows),'sampledMinMain',min(r['sampleMainDistance']for r in rows),'sampledMinOperator',min(r['sampleOperatorDistance']for r in rows))
