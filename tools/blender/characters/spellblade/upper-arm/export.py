# build the chosen rerebrace exactly as in the lab and write it out in glTF space
import bpy, sys, json, math, mathutils, os, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='live.glb')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
exec(open('pauldturn.py').read(), {'bpy': bpy, 'arm': arm, 'mathutils': mathutils, 'math': math})
exec(open('cand.py').read(), {'bpy': bpy, 'arm': arm, 'mathutils': mathutils, 'math': math})
out = {}
for side in ('L', 'R'):
    ob = bpy.data.objects['Gauntlet.%s.Rerebrace' % side]; me = ob.data; uvl = me.uv_layers.active.data
    pos, nrm, uv, idx = [], [], [], []
    to_gl = lambda v: [v.x, v.z, -v.y]
    W = ob.matrix_world
    for p in me.polygons:
        base = len(pos) // 3; n = (W.to_3x3() @ p.normal).normalized()
        for li in p.loop_indices:
            v = W @ me.vertices[me.loops[li].vertex_index].co
            pos += to_gl(v); nrm += to_gl(n); u, vv = uvl[li].uv; uv += [u, 1 - vv]
        for i in range(1, p.loop_total - 1): idx += [base, base + i, base + i + 1]
    out[side] = {'bone': 'upper_arm.' + side, 'name': 'Gauntlet.%s.Rerebrace' % side, 'position': pos, 'normal': nrm, 'uv': uv, 'index': idx}
    print('EXPORT', side, len(pos) // 3, 'verts', len(idx) // 3, 'tris')
json.dump(out, open('rerebrace.json', 'w'))
