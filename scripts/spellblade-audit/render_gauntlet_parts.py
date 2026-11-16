# Blender (background): import a Spellblade GLB, colour Gauntlet.<side>'s loose pieces, and render it (and the whole arm)
# at bind and at a clip frame, from two angles. Read-only: nothing is saved.
#   Blender -b --python render_gauntlet_parts.py -- model.glb out_prefix [clip frame side]
import bpy, sys, colorsys, math, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
clip = argv[2] if len(argv) > 2 else 'Slash_1'
frame = int(argv[3]) if len(argv) > 3 else 8
side = argv[4] if len(argv) > 4 else 'R'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
gname = f'Gauntlet.{side}'
g = next(o for o in bpy.data.objects if o.type == 'MESH' and (o.name == gname or o.data.name == gname))
# colour each loose piece (vertex colour attribute), by connectivity
me = g.data
import bmesh
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table()
# weld by position for connectivity only
seen = {}
pos_root = {}
parent = list(range(len(bm.verts)))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for e in bm.edges:
    a, b = find(e.verts[0].index), find(e.verts[1].index)
    if a != b: parent[a] = b
for v in bm.verts:
    k = tuple(round(c, 5) for c in v.co)
    if k in pos_root:
        a, b = find(v.index), find(pos_root[k])
        if a != b: parent[a] = b
    else: pos_root[k] = v.index
roots = {}
random.seed(4)
for v in bm.verts:
    r = find(v.index)
    if r not in roots: roots[r] = colorsys.hsv_to_rgb(random.random(), 0.75, 0.95)
bm.free()
attr = me.color_attributes.new('piece', 'FLOAT_COLOR', 'POINT')
for i, _ in enumerate(me.vertices): attr.data[i].color = (*roots[find(i)], 1)
mat = bpy.data.materials.new('pieces'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'piece'
nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
g.data.materials.clear(); g.data.materials.append(mat)
print('pieces', len(roots))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'VERTEX'
scene.render.resolution_x, scene.render.resolution_y = 900, 900
scene.render.image_settings.file_format = 'PNG'
world = bpy.data.worlds.new('w'); scene.world = world
cam_data = bpy.data.cameras.new('c'); cam_data.lens = 85
cam = bpy.data.objects.new('c', cam_data); scene.collection.objects.link(cam); scene.camera = cam

def hand_pos():
    pb = arm.pose.bones[f'hand.{side}']
    return arm.matrix_world @ pb.head, arm.matrix_world @ arm.pose.bones[f'forearm.{side}'].head

def shoot(tag, others_hidden):
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not g: o.hide_render = others_hidden
    bpy.context.view_layer.update()
    h, f = hand_pos()
    mid = (h + f) / 2
    for view, offset in (('front', Vector((0, -1.1, 0.15))), ('side', Vector((1.1, 0, 0.15))), ('top', Vector((0.25, -0.35, 1.0)))):
        cam.location = mid + offset * (1.0 if others_hidden else 1.6)
        d = (mid - cam.location); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{out}-{tag}-{view}.png'
        bpy.ops.render.render(write_still=True)

# bind (rest)
arm.data.pose_position = 'REST'
shoot('bind', True)
arm.data.pose_position = 'POSE'
act = bpy.data.actions.get(clip) or next((a for a in bpy.data.actions if a.name.startswith(clip)), None)
arm.animation_data_create(); arm.animation_data.action = act
scene.frame_set(int(act.frame_range[0]) + frame)
shoot(f'{clip}-f{frame}', True)
shoot(f'{clip}-f{frame}-body', False)
