"""gamelook.py out.png [views] : render the export model under an emulation of the game's menu lighting
(three.js HemisphereLight sky 0xdce7d2 / ground 0x353127 x2.25, warm sun x3.0 from front-left-top, cool rim x1.65
from back-right; no tone mapping, sRGB), next to concept crops."""
import tempfile
TMP = tempfile.gettempdir() + "/"
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, math, bpy
import numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
out = a[0]
VIEWS = a[1] if len(a) > 1 else "front,upper,side,back,helmet"
scene = bpy.context.scene
keep = {o.name for o in bpy.data.collections["SpellbladeExport"].all_objects}
for o in scene.objects:
    if o.type == "MESH": o.hide_render = o.name not in keep
    if o.type == "LIGHT": o.hide_render = True
def srgb2lin(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
w = bpy.data.worlds.new("GameHemi"); scene.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sep.inputs[0])
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value = -1; mr.inputs[2].default_value = 1; nt.links.new(sep.outputs[2], mr.inputs[0])
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(mr.outputs[0], mix.inputs[0])
mix.inputs[6].default_value = (*srgb2lin(0x353127), 1); mix.inputs[7].default_value = (*srgb2lin(0xdce7d2), 1)
bg = nt.nodes.new("ShaderNodeBackground"); nt.links.new(mix.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 2.25 / math.pi
# camera-visible background stays the game's dark clear colour
lp = nt.nodes.new("ShaderNodeLightPath"); bgc = nt.nodes.new("ShaderNodeBackground"); bgc.inputs[0].default_value = (*srgb2lin(0x1c2129), 1)
ms = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(lp.outputs["Is Camera Ray"], ms.inputs[0]); nt.links.new(bg.outputs[0], ms.inputs[1]); nt.links.new(bgc.outputs[0], ms.inputs[2])
wo = nt.nodes.new("ShaderNodeOutputWorld"); nt.links.new(ms.outputs[0], wo.inputs[0])
def sun(name, hexcol, strength, pos_blender):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN")); scene.collection.objects.link(l)
    l.data.energy = strength; l.data.color = srgb2lin(hexcol); l.data.angle = math.radians(1)
    d = Vector(pos_blender).normalized(); l.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
# menu light positions (three.js, character turned to face the camera) mapped to the character frame (+Y front)
sun("Key", 0xffe8bd, 3.0, (-3.5, 4.0, 6.0))
sun("Rim", 0x7cb7c4, 1.65, (4.0, -3.0, 3.0))
scene.render.engine = "BLENDER_EEVEE_NEXT"; scene.eevee.taa_render_samples = 24
scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
scene.render.film_transparent = False
H = 700
cam = bpy.data.objects.new("GL", bpy.data.cameras.new("GL")); scene.collection.objects.link(cam); scene.camera = cam
con = bpy.data.images.load(str(ROOT / "tools/blender/characters/spellblade/source/references/canonical-spellblade.png"))
cw, ch = con.size; cpx = np.array(con.pixels[:], np.float32).reshape(ch, cw, 4)[::-1]
SPEC = {"front": (18, 5.4, 1.2, 1.05, 30, (150, 15, 560, 760)), "upper": (18, 2.6, 1.55, 1.45, 30, (215, 20, 505, 470)),
        "side": (88, 5.4, 1.2, 1.05, 30, (600, 15, 900, 400)), "back": (180, 5.4, 1.2, 1.05, 30, (600, 400, 900, 780)),
        "helmet": (24, 1.35, 2.2, 1.86, 30, (930, 505, 1066, 700))}
cols = []
for name in VIEWS.split(","):
    az, dist, h, ty, fov, crop = SPEC[name]
    x0, y0, x1, y1 = crop; W = int(H * 0.72)
    scene.render.resolution_x, scene.render.resolution_y = W, H
    cam.data.angle = math.radians(fov) * (W / H) if W > H else math.radians(fov)
    cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(fov)
    r_ = math.radians(az)
    cam.location = (math.sin(r_) * dist, math.cos(r_) * dist, h)
    cam.rotation_euler = (Vector((0, 0, ty)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = TMP + "gl.png"; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(TMP + "gl.png"); px = np.array(im.pixels[:], np.float32).reshape(H, W, 4)[::-1]; bpy.data.images.remove(im)
    c = cpx[y0:y1, x0:x1]; s = min(W / c.shape[1], H / c.shape[0])
    ch_, cw_ = int(c.shape[0] * s), int(c.shape[1] * s)
    ys = (np.arange(ch_) / s).astype(int).clip(0, c.shape[0] - 1); xs = (np.arange(cw_) / s).astype(int).clip(0, c.shape[1] - 1)
    panel = np.zeros((H, W, 4), np.float32); panel[..., :3] = (0.11, 0.13, 0.16); panel[..., 3] = 1
    oy, ox = (H - ch_) // 2, (W - cw_) // 2; panel[oy:oy + ch_, ox:ox + cw_] = c[ys][:, xs]
    cols.append(np.concatenate([panel, px], axis=0))
grid = np.concatenate(cols, axis=1)
o = bpy.data.images.new("r", grid.shape[1], grid.shape[0]); o.pixels = grid[::-1].ravel(); o.filepath_raw = out; o.file_format = "PNG"; o.save()
print("GAMELOOK", out)
