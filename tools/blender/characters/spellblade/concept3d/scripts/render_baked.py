import sys, math, bpy
import numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
out = a[0]; AZS = [float(x) for x in a[1:]] or [18, 90, 180, 40]
scene = bpy.context.scene
show = {"GenBody", "GenHelmet"} | {n for n in ("HeroSword", "SwordGuard", "SwordGemSetting", "SwordGem", "SwordGrip", "SwordPommel") if n in bpy.data.objects}
show |= {o.name for o in bpy.data.objects if o.get("keep_render")}
for o in scene.objects:
    if o.type == "MESH": o.hide_render = o.name not in show
scene.render.engine = "BLENDER_EEVEE_NEXT"; scene.eevee.taa_render_samples = 32
scene.view_settings.view_transform = "Standard"
W, H = 520, 760
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.film_transparent = False
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.10, 0.11, 0.14, 1); bg.inputs[1].default_value = 1.2
for o in [o for o in scene.objects if o.type == "LIGHT"]: bpy.data.objects.remove(o)
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN")); scene.collection.objects.link(key)
key.data.energy = 2.2; key.rotation_euler = (math.radians(55), 0, math.radians(35))
rim = bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "SUN")); scene.collection.objects.link(rim)
rim.data.energy = 1.0; rim.rotation_euler = (math.radians(60), 0, math.radians(200))
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50
tiles = []
for az in AZS:
    r = math.radians(az); t = Vector((0, 0.08, 1.08))
    cam.location = t + Vector((math.sin(r) * 4.6, math.cos(r) * 4.6, 0.75))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = "/tmp/rb.png"; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load("/tmp/rb.png"); tiles.append(np.array(im.pixels[:], np.float32).reshape(H, W, 4)); bpy.data.images.remove(im)
row = np.concatenate(tiles, axis=1)
o = bpy.data.images.new("r", row.shape[1], H); o.pixels = row.ravel(); o.filepath_raw = out; o.file_format = "PNG"; o.save()
print("RB", out)
