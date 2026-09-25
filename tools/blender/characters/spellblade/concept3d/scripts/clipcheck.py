import bpy
from mathutils.bvhtree import BVHTree
col = bpy.data.collections["SpellbladeExport"]
meshes = [o for o in col.all_objects if o.type == "MESH"]
SWORD = {"HeroSword", "SwordGuard", "SwordGemSetting", "SwordGem", "SwordPommel"}
hand = {o.name for o in meshes if all(g.name == "hand.R" for g in o.vertex_groups) and o.vertex_groups}
BODY = [o for o in meshes if o.name not in SWORD and o.name not in hand and not o.name.startswith(("SwordGrip", "GripWrap", "Gauntlet.R", "Vambrace.R"))]
def tree(objs, dg):
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        b = len(verts); verts += [ev.matrix_world @ v.co for v in me.vertices]; polys += [[b + i for i in p.vertices] for p in me.polygons]; ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)
rig = bpy.data.objects["SpellbladeRig"]
tot = 0
for act in bpy.data.actions:
    rig.animation_data.action = act; f0, f1 = map(int, act.frame_range); bad = 0
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        if tree([o for o in meshes if o.name in SWORD], dg).overlap(tree(BODY, dg)): bad += 1
    print("CLIPFRAMES", act.name, f"{bad}/{f1 - f0 + 1}"); tot += bad
print("CLIP_TOTAL", tot)
