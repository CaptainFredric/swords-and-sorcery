"""Render isolated read only TP/FP hand reference crops in normalized anatomical cameras.
Blender --python this-file -- SOURCE.blend OUT_DIR INSPECTION.json
Source geometry and rendering visibility changes are never saved.
"""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
src,out,inspection=sys.argv[sys.argv.index('--')+1:];bpy.ops.wm.open_mainfile(filepath=str(Path(src).resolve()))
r=next(o for o in bpy.data.objects if o.type=='ARMATURE' and 'hand.R' in o.data.bones)
r.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
# Isolated source evidence. Rendering visibility changes are never saved to the source.
for o in bpy.data.objects:
 if o.type=='MESH':o.hide_render=o.name not in('Arm.R','Gauntlet.R','HeroSword')
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.065,.08,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for o in list(bpy.data.objects):
 if o.type in('LIGHT','CAMERA'):bpy.data.objects.remove(o,do_unlink=True)
H=r.matrix_world@r.pose.bones['hand.R'].matrix
# Same anatomical inspection frame, derived from each source's measured grip and dorsal plate.
import json,numpy as np
report=json.load(open(inspection));who='third_person' if 'third' in src else 'first_person';f=report[who]['hand_frame']
G=Vector(f['grip_center_hand_local']);g=Vector(f['grip_axis_toward_guard_hand_local']);a=Vector(f['forearm_projection_axis_a_hand_local']);b=Vector(f['dorsal_axis_b_hand_local'])
# Normalize the camera to the actual copied backplate/knuckle orientation in each source.
if who=='third_person':
 comp={c['component_index']:c for c in report[who]['components']};c1=Vector(comp[1]['center']);c4=Vector(comp[4]['center']);c0=Vector(comp[0]['center'])
else:
 arm=bpy.data.objects['Arm.R'];parts=arm.data.attributes['GauntletPart'];inv=(r.matrix_world@r.data.bones['hand.R'].matrix_local).inverted()
 def center(role):
  ids={i for f in arm.data.polygons if parts.data[f.index].value==role for i in f.vertices};return sum((inv@arm.matrix_world@arm.data.vertices[i].co for i in ids),Vector())/len(ids)
 c1=center(1001);c4=center(1004);c0=center(1000)
a=c4-c1;a=(a-g*a.dot(g)).normalized();b=a.cross(g).normalized()
if b.dot(c1-c0)<0:b=-b
for n,(pos,power,size) in enumerate([((-.4,-.3,.8),18,.55),((.4,.2,.5),12,.4),((0,.5,-.2),6,.35)]):
 d=bpy.data.lights.new('ParityLight'+str(n),'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=H@G+Vector(pos);o.rotation_euler=(H@G-o.location).to_track_quat('-Z','Y').to_euler()
def render(name,target,offset,scale):
 d=bpy.data.cameras.new('ParityCamera');d.type='ORTHO';d.ortho_scale=scale;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=H@(target+offset);o.rotation_euler=(H@target-o.location).to_track_quat('-Z','Y').to_euler();scene.camera=o;scene.render.filepath=str(Path(out).resolve()/(name+'.png'));bpy.ops.render.render(write_still=True)
Path(out).mkdir(parents=True,exist_ok=True)
render('cuff',Vector((0,0,0)),b*.38+g*.23-a*.08,.32)
render('hand-plate',G-a*.04+b*.045,b*.42+g*.06-a*.03,.31)
render('fingers',G,a*.32+b*.09+g*.08,.29)
