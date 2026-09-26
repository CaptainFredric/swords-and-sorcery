"""ov.py out.png [views] [scale] : orthographic renders registered to the concept's front/side/back views.

Each row: concept view | model under the game lighting (same registration) | concept with the model's piece
outlines drawn on it (cyan = silhouette, yellow = piece boundaries). Model in rig space; the registration is in
generation space (rig + (0.03, 0.12, 0)).
Optional env OV_ONLY=comma prefixes: restrict to objects whose names start with one of them.
"""
import tempfile
TMP = tempfile.gettempdir() + "/"
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import sys, os, math, json, bpy
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
OUT = a[0]
VIEWS = (a[1] if len(a) > 1 else "front,side,back").split(",")
ZOOM = a[2] if len(a) > 2 else None          # "x0,y0,x1,y1" normalised crop of the clean view, optional
REG = json.load(open(C3D / "data" / "register.json"))
G2R = Vector((-0.03, -0.12, 0.0))
scene = bpy.context.scene
only = [p for p in os.environ.get("OV_ONLY", "").split(",") if p]
keep = {o.name for o in bpy.data.collections["SpellbladeExport"].all_objects}
meshes = []
for o in scene.objects:
    if o.type == "MESH":
        show = o.name in keep and (not only or o.name.startswith(tuple(only)))
        o.hide_render = not show
        if show: meshes.append(o)
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
wo = nt.nodes.new("ShaderNodeOutputWorld"); nt.links.new(bg.outputs[0], wo.inputs[0])


def sun(name, hexcol, strength, pos):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN")); scene.collection.objects.link(l)
    l.data.energy = strength; l.data.color = srgb2lin(hexcol); l.data.angle = math.radians(1)
    d = Vector(pos).normalized(); l.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return l


sun("Key", 0xffe8bd, 3.0, (-3.5, 4.0, 6.0)); sun("Rim", 0x7cb7c4, 1.65, (4.0, -3.0, 3.0))
scene.render.engine = "BLENDER_EEVEE_NEXT"; scene.eevee.taa_render_samples = 16
scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
scene.render.film_transparent = True
cam = bpy.data.objects.new("OV", bpy.data.cameras.new("OV")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"

# flat id materials for the boundary pass
rng = np.random.default_rng(3)
idmat = {}
for o in meshes:
    m = bpy.data.materials.new("ID_" + o.name); m.use_nodes = True
    t = m.node_tree; t.nodes.clear()
    e = t.nodes.new("ShaderNodeEmission"); e.inputs[0].default_value = (*rng.random(3), 1)
    out = t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(e.outputs[0], out.inputs[0])
    idmat[o.name] = m


def render(path):
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path); W_, H_ = im.size
    px = np.array(im.pixels[:], np.float32).reshape(H_, W_, 4)[::-1].copy(); bpy.data.images.remove(im)
    return px


def with_id_materials(fn):
    saved = {}
    for o in meshes:
        saved[o.name] = [s.material for s in o.material_slots]
        for s in o.material_slots: s.material = idmat[o.name]
        if not o.material_slots: o.data.materials.append(idmat[o.name])
    lights = [l for l in scene.objects if l.type == "LIGHT"]
    for l in lights: l.hide_render = True
    try:
        return fn()
    finally:
        for l in lights: l.hide_render = False
        for o in meshes:
            for s, m in zip(o.material_slots, saved[o.name]): s.material = m


rows = []
for name in VIEWS:
    r = REG[name]
    im = bpy.data.images.load(str(C3D / "inputs" / r["file"])); Wc, Hc = im.size
    con = np.array(im.pixels[:], np.float32).reshape(Hc, Wc, 4)[::-1].copy(); bpy.data.images.remove(im)
    hax, A, B, C, D = r["haxis"], r["a"], r["b"], r["c"], r["d"]
    u0, v0, u1, v1 = (0.0, 0.0, 1.0, 1.0) if not ZOOM else [float(t) for t in ZOOM.split(",")]
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    hc = (uc - B) / A; zc = (vc - D) / C
    span_u, span_v = (u1 - u0) / abs(A), (v1 - v0) / abs(C)
    Wp = int(round((u1 - u0) * Wc)); Hp = int(round((v1 - v0) * Hc))
    K = int(os.environ.get("OV_SCALE", "1"))
    scene.render.resolution_x, scene.render.resolution_y = Wp * K, Hp * K
    cam.data.ortho_scale = max(span_u, span_v)
    if name == "front": loc, fwd = Vector((hc, 6.0, zc)), Vector((0, -1, 0))
    elif name == "back": loc, fwd = Vector((hc, -6.0, zc)), Vector((0, 1, 0))
    else: loc, fwd = Vector((6.0, hc, zc)), Vector((-1, 0, 0))
    cam.location = loc + G2R
    cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
    shaded = render(TMP + "ov_s.png")
    ids = with_id_materials(lambda: render(TMP + "ov_i.png"))
    cpx = con[int(v0 * Hc):int(v0 * Hc) + Hp, int(u0 * Wc):int(u0 * Wc) + Wp][..., :3]
    cpx = cpx[:Hp, :Wp]
    if cpx.shape[0] != Hp or cpx.shape[1] != Wp:
        pad = np.zeros((Hp, Wp, 3), np.float32); pad[:cpx.shape[0], :cpx.shape[1]] = cpx; cpx = pad
    if K > 1: cpx = np.repeat(np.repeat(cpx, K, 0), K, 1)
    if os.environ.get("OV_SAVE"):
        np.save(os.environ["OV_SAVE"] + f"_{name}_render.npy", shaded); np.save(os.environ["OV_SAVE"] + f"_{name}_concept.npy", cpx)
    bgc = np.array(srgb2lin(0x1c2129)) ** (1 / 2.2)
    sh = shaded[..., :3] * shaded[..., 3:4] + bgc * (1 - shaded[..., 3:4])
    al = shaded[..., 3] > 0.5
    idc = ids[..., :3]
    edge_sil = np.zeros_like(al); edge_id = np.zeros_like(al)
    for dy, dx in ((0, 1), (1, 0)):
        a1 = al; a2 = np.roll(np.roll(al, dy, 0), dx, 1)
        edge_sil |= a1 != a2
        d = np.abs(idc - np.roll(np.roll(idc, dy, 0), dx, 1)).sum(-1) > 0.08
        edge_id |= d & a1 & a2
    ov = cpx * 0.85
    ov[edge_id] = (1.0, 0.85, 0.1)
    ov[edge_sil] = (0.1, 1.0, 1.0)
    rows.append(np.concatenate([cpx, sh, ov], axis=1))
Wmax = max(r_.shape[1] for r_ in rows)
rows = [np.pad(r_, ((0, 0), (0, Wmax - r_.shape[1]), (0, 0))) for r_ in rows]
grid = np.concatenate(rows, axis=0)
o = bpy.data.images.new("ov", grid.shape[1], grid.shape[0])
o.pixels = np.concatenate([grid, np.ones(grid.shape[:2] + (1,), np.float32)], -1)[::-1].ravel()
o.filepath_raw = OUT; o.file_format = "PNG"; o.save()
print("OV", OUT, grid.shape)
