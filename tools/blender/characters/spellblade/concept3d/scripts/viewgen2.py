"""viewgen.py -- in.glb out.png : import a generated mesh, stand it up at 2.1 m, render front(18)/side(88)/back(180)/quarter(45)."""
import sys, math, bpy
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
src, out = a[0], a[1]
AZS = [float(x) for x in a[2:]] or [18, 88, 180, 45]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
print("BOUNDS", tuple(round(c, 3) for c in mn), tuple(round(c, 3) for c in mx), "faces", sum(len(o.data.polygons) for o in obs))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"; scene.eevee.taa_render_samples = 16
scene.render.resolution_x, scene.render.resolution_y = 500, 700
scene.render.film_transparent = False
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.07, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
mat = bpy.data.materials.new("Clay"); mat.use_nodes = True
b = mat.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.55, 0.55, 0.58, 1); b.inputs["Roughness"].default_value = 0.6
for o in obs:
    o.data.materials.clear(); o.data.materials.append(mat)
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); scene.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN")); scene.collection.objects.link(fill)
fill.data.energy = 1.0; fill.rotation_euler = (math.radians(70), 0, math.radians(-140))
c = (mn + mx) / 2; h = (mx - mn).length
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = h * 0.8
import numpy as np
tiles = []
for az in AZS:
    r = math.radians(az)
    # generated meshes face -Y? try: glTF import keeps +Y forward as -Z->... camera orbit around c on the horizontal plane
    cam.location = c + Vector((math.sin(r) * h * 2, -math.cos(r) * h * 2, h * 0.12))
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = out.replace(".png", f"_{az}.png"); bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(scene.render.filepath)
    tiles.append(np.array(img.pixels[:], np.float32).reshape(700, 500, 4)); print("AZ", az)
row = np.concatenate(tiles, axis=1)
o = bpy.data.images.new("row", row.shape[1], 700); o.pixels = row.ravel(); o.filepath_raw = out; o.file_format = "PNG"; o.save()
print("VIEWS", out)
