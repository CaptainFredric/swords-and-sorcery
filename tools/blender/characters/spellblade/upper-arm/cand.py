# Candidate rerebrace, built in Blender in the rest pose and bound to the upper arm.
# Params from env REREBRACE (JSON): radius, from, to, seg, window_to, window_half (deg), window_soft, bands, taper
import bmesh, json, os
P = json.loads(os.environ.get('REREBRACE', '{}'))
R, F0, F1, SEG = P.get('radius', 0.065), P.get('from', 0.05), P.get('to', 0.96), P.get('seg', 16)
WIN_TO, WIN_HALF = P.get('window_to', 0.55), math.radians(P.get('window_half', 95))
BANDS = P.get('bands', [[0.05, 0.1], [0.9, 0.96]]); TAPER = P.get('taper', 1.0); STEP = P.get('step', 0.05)
BLEND = P.get('blend')          # [f0, f1]: the pauldron's weight fading to the arm's between them (None: all arm)
R_TOP = P.get('radius_top', R); R_FULL_AT = P.get('radius_full_at', F0)
STEEL, BRONZE = (0.5518, 1 - 0.7393), (0.2311, 1 - 0.9848)   # glTF uv -> Blender uv (v flipped)
W = arm.matrix_world
mat = bpy.data.materials.get('SpellbladeLeftGauntlet1')
built = []
for side in ('L', 'R'):
    bu, bf = arm.data.bones['upper_arm.' + side], arm.data.bones['forearm.' + side]
    j, e = W @ bu.head_local, W @ bf.head_local
    L = (e - j).length; ax = (e - j).normalized()
    # the pauldron's side of the arm, from its own vertices in the rest pose
    pl = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Pauldron.' + side))
    lat = mathutils.Vector()
    for v in pl.data.vertices:
        d = (pl.matrix_world @ v.co) - j; a = d.dot(ax)
        if 0 <= a <= L: lat += d - ax * a
    lat = (lat - ax * lat.dot(ax)).normalized()
    u1 = lat; u2 = ax.cross(u1).normalized()
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
    stations = []
    f = F0
    while f < F1 - 1e-6: stations.append(round(f, 4)); f += STEP
    stations.append(F1)
    for b in BANDS: stations += [x for x in b if F0 <= x <= F1]
    stations = sorted(set(stations))
    def ring(f, k):
        g = 2 * math.pi * k / SEG
        t = 1 if R_FULL_AT <= F0 else max(0, min(1, (f - F0) / (R_FULL_AT - F0)))
        r = (R_TOP + (R - R_TOP) * t * t * (3 - 2 * t)) * (1 + (TAPER - 1) * (f - F0) / (F1 - F0))
        return j + ax * f * L + (u1 * math.cos(g) + u2 * math.sin(g)) * r
    def windowed(f, k):   # a face in the pauldron's window: left out
        if f >= WIN_TO: return False
        g = 2 * math.pi * (k + 0.5) / SEG; ang = abs(math.atan2(math.sin(g), math.cos(g)))
        return ang < WIN_HALF
    for i in range(len(stations) - 1):
        f0, f1 = stations[i], stations[i + 1]
        bronze = any(b0 - 1e-6 <= f0 and f1 <= b1 + 1e-6 for b0, b1 in BANDS)
        for k in range(SEG):
            if windowed((f0 + f1) / 2, k): continue
            vs = [bm.verts.new(p) for p in (ring(f0, k), ring(f0, k + 1), ring(f1, k + 1), ring(f1, k))]
            fc = bm.faces.new(vs)
            # outward
            c = sum((v.co for v in vs), mathutils.Vector()) / 4; mid = j + ax * ((f0 + f1) / 2) * L
            fc.normal_update()
            if fc.normal.dot(c - mid) < 0: fc.normal_flip()
            for lp in fc.loops: lp[uvl].uv = BRONZE if bronze else STEEL
    me = bpy.data.meshes.new('Gauntlet.%s.Rerebrace' % side); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    ob = bpy.data.objects.new('Gauntlet.%s.Rerebrace' % side, me); bpy.context.scene.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    vg = ob.vertex_groups.new(name='upper_arm.' + side)
    if BLEND:
        vp = ob.vertex_groups.new(name='pauldron.' + side)
        for v in me.vertices:
            f = (v.co - j).dot(ax) / L; t = max(0, min(1, (f - BLEND[0]) / (BLEND[1] - BLEND[0]))); w = t * t * (3 - 2 * t)
            if w > 0: vg.add([v.index], w, 'REPLACE')
            if w < 1: vp.add([v.index], 1 - w, 'REPLACE')
    else:
        vg.add(range(len(me.vertices)), 1.0, 'REPLACE')
    ob.parent = arm; md = ob.modifiers.new('arm', 'ARMATURE'); md.object = arm
    built.append(ob)
print('CANDIDATE', [ (o.name, len(o.data.polygons)) for o in built ])
