"""Run in Blender's Python console: exec(open('/absolute/repo/tools/assets/export-so-fist.py').read()).
Reexports the editable source in one temporary scene, preserves other open scenes.
Set RAM_REPO to override the repository location. No asset generation services used.
"""
import bpy, json, struct, re
from pathlib import Path
root=Path(globals().get('RAM_REPO',__file__ if '__file__' in globals() else bpy.path.abspath('//')))
if root.is_file(): root=root.parents[2]
source=root/'assets/source/so-fist-ication/SoFist-crafted.blend'
previous=bpy.context.window.scene
with bpy.data.libraries.load(str(source),link=False) as (src,dst): dst.scenes=[src.scenes[0]]
scene=dst.scenes[0];bpy.context.window.scene=scene
try:
 for obj in scene.objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=next(o for o in scene.objects if o.type=='EMPTY' and o.parent is None)
 output=Path(globals().get('RAM_OUTPUT',root/'client/assets/props/so-fist-ication/so-fist-ication.glb'))
 bpy.ops.export_scene.gltf(filepath=str(output),use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_slide_to_zero=True)
 raw=output.read_bytes();size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);tail=raw[20+size:]
 for kind in ['nodes','meshes','materials','animations']:
  for item in g[kind]:item['name']=re.sub(r'\.\d{3}$','',item.get('name',''))
 assert len(g['nodes'])==20 and len(g['meshes'])==17 and len(g['animations'])==4
 payload=json.dumps(g,separators=(',',':')).encode();payload+=b' '*(-len(payload)%4)
 output.write_bytes(struct.pack('<III',0x46546c67,2,20+len(payload)+len(tail))+struct.pack('<II',len(payload),0x4e4f534a)+payload+tail)
 print('Exported',output)
finally:
 bpy.context.window.scene=previous
 bpy.data.scenes.remove(scene)
