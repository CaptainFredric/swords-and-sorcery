"""posesheet.py out.png : render action key frames (3/4 front and 3/4 back) under the game-light emulation."""
import tempfile
TMP = tempfile.gettempdir() + "/"
import sys, math, bpy
import numpy as np
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene
keep = {o.name for o in bpy.data.collections["SpellbladeExport"].all_objects}
for o in sc.objects:
    if o.type == "MESH": o.hide_render = o.name not in keep
    if o.type == "LIGHT": o.hide_render = True
def srgb2lin(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
w = bpy.data.worlds.new("G"); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sp.inputs[0])
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value = -1; mr.inputs[2].default_value = 1; nt.links.new(sp.outputs[2], mr.inputs[0])
mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; nt.links.new(mr.outputs[0], mx.inputs[0])
mx.inputs[6].default_value = (*srgb2lin(0x353127), 1); mx.inputs[7].default_value = (*srgb2lin(0xdce7d2), 1)
bg = nt.nodes.new("ShaderNodeBackground"); nt.links.new(mx.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 2.25 / math.pi
lp = nt.nodes.new("ShaderNodeLightPath"); bgc = nt.nodes.new("ShaderNodeBackground"); bgc.inputs[0].default_value = (*srgb2lin(0x1c2129), 1)
ms = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(lp.outputs["Is Camera Ray"], ms.inputs[0]); nt.links.new(bg.outputs[0], ms.inputs[1]); nt.links.new(bgc.outputs[0], ms.inputs[2])
wo = nt.nodes.new("ShaderNodeOutputWorld"); nt.links.new(ms.outputs[0], wo.inputs[0])
def sun(n, hx, s, p):
    l = bpy.data.objects.new(n, bpy.data.lights.new(n, "SUN")); sc.collection.objects.link(l); l.data.energy = s; l.data.color = srgb2lin(hx)
    d = Vector(p).normalized(); l.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
sun("Key", 0xffe8bd, 3.0, (-3.5, 4.0, 6.0)); sun("Rim", 0x7cb7c4, 1.65, (4.0, -3.0, 3.0))
sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.eevee.taa_render_samples = 12
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
W, H = 260, 360
sc.render.resolution_x, sc.render.resolution_y = W, H
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.angle = math.radians(30)
rig = bpy.data.objects["SpellbladeRig"]
KEYS = [("Idle", 0.3), ("Run", 0.25), ("Run", 0.75), ("Air", 0.5), ("Guard", 0.5), ("Slash_1", 0.45), ("Slash_2", 0.45), ("Slash_3", 0.5),
        ("Cast", 0.4), ("Dash", 0.5), ("Stagger", 0.4), ("Death", 0.9)]
rows = []
for az in (25, 205):
    row = []
    for name, u in KEYS:
        act = bpy.data.actions[name]; rig.animation_data.action = act
        f0, f1 = act.frame_range; sc.frame_set(int(round(f0 + (f1 - f0) * u)))
        r = math.radians(az); cam.location = (math.sin(r) * 5.6, math.cos(r) * 5.6, 1.3)
        cam.rotation_euler = (Vector((0, 0, 1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = TMP + "ps.png"; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(TMP + "ps.png"); px = np.array(im.pixels[:], np.float32).reshape(H, W, 4)[::-1].copy(); bpy.data.images.remove(im)
        row.append(px)
    rows.append(np.concatenate(row, 1))
g = np.concatenate(rows, 0)
o = bpy.data.images.new("ps", g.shape[1], g.shape[0]); o.pixels = g[::-1].ravel(); o.filepath_raw = out; o.file_format = "PNG"; o.save()
print("POSESHEET", out)
