# Render a .blend's own armature as Blender evaluates one of its Actions (no import, no conversion): what an animator
# opening the source would see. Front and side, Workbench. Nothing is saved.
#   Blender -b --disable-autoexec file.blend --python render_blend_pose.py -- out_prefix Action frame
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out, action, frame = argv[0], argv[1], int(argv[2])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data_create()
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
act = bpy.data.actions[action]
track = ad.nla_tracks.new(); track.name = action
track.strips.new(action, int(act.frame_range[0]), act)
scene = bpy.context.scene
scene.frame_set(int(act.frame_range[0]) + frame)
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x, scene.render.resolution_y = 700, 900
for o in bpy.data.objects:
    if o.name.startswith('SpellbladeReviewFloor'): o.hide_render = False
cam_data = bpy.data.cameras.new('c'); cam_data.lens = 50
cam = bpy.data.objects.new('c', cam_data); scene.collection.objects.link(cam); scene.camera = cam
target = Vector((0, 0, 1.0))
for name, offset in (('front', Vector((0, -5.5, 1.0))), ('side', Vector((5.5, 0, 1.0)))):
    cam.location = target + offset
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{out}-{action}-f{frame}-{name}.png'
    bpy.ops.render.render(write_still=True)
print('RENDERED', out)
