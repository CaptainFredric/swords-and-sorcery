"""Max edge stretch (posed length / rest length) per action for all skinned export meshes; reports the worst edges."""
import bpy
import numpy as np
rig = bpy.data.objects["SpellbladeRig"]
meshes = [o for o in bpy.data.collections["SpellbladeExport"].all_objects if o.type == "MESH" and len(o.data.vertices) > 30]
rest = {}
for o in meshes:
    P = np.array([tuple(v.co) for v in o.data.vertices]); E = np.array([tuple(e.vertices) for e in o.data.edges])
    rest[o.name] = (E, np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1) + 1e-6)
worst_all = []
for act in bpy.data.actions:
    rig.animation_data.action = act; f0, f1 = map(int, act.frame_range); worst = (0, None)
    for f in range(f0, f1 + 1, 2):
        bpy.context.scene.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        for o in meshes:
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            P = np.array([tuple(v.co) for v in me.vertices]); ev.to_mesh_clear()
            E, L0 = rest[o.name]
            if len(P) != len(o.data.vertices): continue
            r = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1) / L0
            big = L0 > 0.004
            grow = (r - 1) * L0 * (L0 < 0.05)
            i = int(np.argmax(grow)); v = float(grow[i] * 100)
            if v > worst[0]: worst = (v, f"{o.name} f{f} at {np.round(P[E[i,0]], 2).tolist()}")
    print(f"STRETCH {act.name:8s} max growth {worst[0]:.1f} cm on a short edge  {worst[1]}")
    worst_all.append(worst[0])
print("STRETCH_WORST", round(max(worst_all), 2))
