"""Pose Idle, then swing the cloth chains to the spring limits used at runtime and measure edge growth."""
import bpy, math
import numpy as np
from mathutils import Quaternion
rig = bpy.data.objects["SpellbladeRig"]
rig.animation_data.action = bpy.data.actions["Idle"]; bpy.context.scene.frame_set(1)
meshes = [o for o in bpy.data.collections["SpellbladeExport"].all_objects if o.type == "MESH" and len(o.data.vertices) > 30]
rest = {o.name: (np.array([tuple(e.vertices) for e in o.data.edges]), np.array([tuple(v.co) for v in o.data.vertices])) for o in meshes}
def measure(tag):
    dg = bpy.context.evaluated_depsgraph_get(); worst = (0, "")
    for o in meshes:
        E, P0 = rest[o.name]; ev = o.evaluated_get(dg); me = ev.to_mesh(); P = np.array([tuple(v.co) for v in me.vertices]); ev.to_mesh_clear()
        L0 = np.linalg.norm(P0[E[:, 0]] - P0[E[:, 1]], axis=1); L = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)
        g = (L - L0) * (L0 < 0.05); i = int(np.argmax(g))
        if g[i] > worst[0]: worst = (float(g[i]), f"{o.name} at {np.round(P0[E[i,0]], 2).tolist()}")
    print(f"CLOTHSWING {tag:28s} max growth {worst[0]*100:.1f} cm  {worst[1]}")
measure("idle (reference)")
cases = [("back 0.75 rad trailing", {"tabard_back_01": 0.75 * 0.55, "tabard_back_02": 0.75 * 0.65}, "X"),
         ("front 0.6 rad forward", {"tabard_front_01": -0.6 * 0.55, "tabard_front_02": -0.6 * 0.65}, "X"),
         ("back 0.32 rad sideways", {"tabard_back_01": 0.32 * 0.55, "tabard_back_02": 0.32 * 0.65}, "Z")]
for tag, rots, axis in cases:
    saved = {b: rig.pose.bones[b].rotation_quaternion.copy() for b in rots}
    for b, ang in rots.items():
        pb = rig.pose.bones[b]; pb.rotation_quaternion = Quaternion((1, 0, 0) if axis == "X" else (0, 0, 1), ang) @ pb.rotation_quaternion
    measure(tag)
    for b, q in saved.items(): rig.pose.bones[b].rotation_quaternion = q
