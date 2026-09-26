"""Render unit-albedo patches in each face orientation under the game-light emulation; print linear radiance factor."""
import tempfile
TMP = tempfile.gettempdir() + "/"
import bpy, math, bmesh
import numpy as np
from mathutils import Vector
sc = bpy.context.scene
for o in list(sc.objects): bpy.data.objects.remove(o)
def srgb2lin(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
w = bpy.data.worlds.new("GameHemi"); sc.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sep.inputs[0])
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value = -1; mr.inputs[2].default_value = 1; nt.links.new(sep.outputs[2], mr.inputs[0])
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(mr.outputs[0], mix.inputs[0])
mix.inputs[6].default_value = (*srgb2lin(0x353127), 1); mix.inputs[7].default_value = (*srgb2lin(0xdce7d2), 1)
bg = nt.nodes.new("ShaderNodeBackground"); nt.links.new(mix.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 2.25 / math.pi
wo = nt.nodes.new("ShaderNodeOutputWorld"); nt.links.new(bg.outputs[0], wo.inputs[0])
def sun(name, hexcol, strength, pos):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN")); sc.collection.objects.link(l)
    l.data.energy = strength; l.data.color = srgb2lin(hexcol); l.data.angle = math.radians(1)
    d = Vector(pos).normalized(); l.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
sun("Key", 0xffe8bd, 3.0, (-3.5, 4.0, 6.0)); sun("Rim", 0x7cb7c4, 1.65, (4.0, -3.0, 3.0))
sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.eevee.taa_render_samples = 16
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.film_transparent = True
# patches: small squares facing given normals, laid out on a grid, orthographic camera from +Y (front), emission-free
normals = {"front": (0, 1, 0), "front_up30": (0, math.cos(math.radians(30)), math.sin(math.radians(30))),
           "front_down30": (0, math.cos(math.radians(30)), -math.sin(math.radians(30))), "top": (0, 0.2, 1),
           "front_left45": (-0.7071, 0.7071, 0), "front_right45": (0.7071, 0.7071, 0), "left": (-1, 0.15, 0), "right": (1, 0.15, 0)}
m = bpy.data.materials.new("W"); m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
b.inputs["Metallic"].default_value = 0.1; b.inputs["Roughness"].default_value = 0.6
res = {}
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 0.4
sc.render.resolution_x = sc.render.resolution_y = 64
for k, n in normals.items():
    for o in [o for o in sc.objects if o.type == "MESH"]: bpy.data.objects.remove(o)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    me = bpy.data.meshes.new(k); bm.to_mesh(me); ob = bpy.data.objects.new(k, me); sc.collection.objects.link(ob)
    me.materials.append(m)
    nv = Vector(n).normalized(); ob.rotation_euler = nv.to_track_quat("Z", "Y").to_euler()
    # camera looks along -nv's projection so the patch fills the view; view from the front-ish direction of the game camera
    cam.location = nv * 3.0; cam.rotation_euler = (-nv).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = TMP + "cal.png"; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(TMP + "cal.png"); px = np.array(im.pixels[:]).reshape(64, 64, 4); bpy.data.images.remove(im)
    c = px[24:40, 24:40, :3].reshape(-1, 3).mean(0)          # sRGB display values
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    res[k] = (lin / 0.5).round(3).tolist()
    print("CAL %-14s factor(lin/albedo) %s  srgb %s" % (k, res[k], (c * 255).astype(int)))
