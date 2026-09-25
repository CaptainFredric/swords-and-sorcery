"""fit_joints.py -- out.json [png] : refine hand-read joint guesses on GenBody by limb cross-section centroids.

Each joint is moved to the centroid of the body surface in a thin slab perpendicular to the local limb
direction (parent->child), limited to a radius, so it lands on the limb's axis. Iterated a few times.
"""
import sys, json, math, bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
body = bpy.data.objects["GenBody"]
G = np.array([tuple(body.matrix_world @ v.co) for v in body.data.vertices])

# hand-read guesses from the gridded front/side renders (world metres, before recentring)
J = {
    "hip.R": (0.20, 0.12, 1.03), "knee.R": (0.33, 0.12, 0.56), "ankle.R": (0.37, 0.10, 0.21), "toe.R": (0.37, 0.42, 0.08),
    "hip.L": (-0.08, 0.12, 1.03), "knee.L": (-0.21, 0.12, 0.56), "ankle.L": (-0.26, 0.10, 0.21), "toe.L": (-0.26, 0.42, 0.08),
    "shoulder.R": (0.33, 0.12, 1.55), "elbow.R": (0.53, 0.12, 1.22), "wrist.R": (0.62, 0.15, 0.93), "handtip.R": (0.65, 0.19, 0.80),
    "shoulder.L": (-0.22, 0.12, 1.55), "elbow.L": (-0.44, 0.17, 1.22), "wrist.L": (-0.43, 0.45, 1.13), "handtip.L": (-0.43, 0.58, 1.12),
    "pelvis": (0.06, 0.13, 1.05), "spine": (0.06, 0.13, 1.22), "chest": (0.06, 0.13, 1.40), "neck": (0.04, 0.17, 1.66), "head": (0.0, 0.21, 1.76),
}
# (joint, direction neighbours, slab radius, side filter)
CHAINS = {
    "R_leg": ["hip.R", "knee.R", "ankle.R"], "L_leg": ["hip.L", "knee.L", "ankle.L"],
    "R_arm": ["shoulder.R", "elbow.R", "wrist.R", "handtip.R"], "L_arm": ["shoulder.L", "elbow.L", "wrist.L", "handtip.L"],
}
RADIUS = {"hip": 0.16, "knee": 0.15, "ankle": 0.13, "shoulder": 0.15, "elbow": 0.13, "wrist": 0.11, "handtip": 0.09}
MID_X = 0.06


def centroid(p, d, R, keep):
    d = d / np.linalg.norm(d); c = p.copy()
    for _ in range(5):
        rel = G - c; al = rel @ d; rad = rel - np.outer(al, d)
        m = (np.abs(al) < 0.02) & (np.linalg.norm(rad, axis=1) < R) & keep
        if m.sum() < 12: return c, int(m.sum())
        c = c + rad[m].mean(0)
    return c, int(m.sum())


P = {k: np.array(v, float) for k, v in J.items()}
for it in range(3):
    for chain in CHAINS.values():
        side = 1 if chain[0].endswith(".R") else -1
        keep = (G[:, 0] - MID_X) * side > 0.02
        # exclude the front tabard and back banner sheets from leg rings
        if "hip" in chain[0]:
            keep &= ~((np.abs(G[:, 0] - MID_X) < 0.14) & ((G[:, 1] > 0.24) | (G[:, 1] < -0.02)))
        for i, name in enumerate(chain):
            if name.startswith(("hip", "shoulder")):   # root joints: keep the guess (torso rings are ambiguous)
                continue
            prev = P[chain[i - 1]]; nxt = P[chain[i + 1]] if i + 1 < len(chain) else None
            d = (nxt - prev) if nxt is not None else (P[name] - prev)
            P[name], n = centroid(P[name], d, RADIUS[name.split(".")[0]], keep)
# spine: horizontal rings through the torso centre (exclude arms by radius)
for name in ("pelvis", "spine", "chest"):
    keep = np.ones(len(G), bool)
    c, n = centroid(P[name], np.array([0, 0, 1.0]), 0.22, keep)
    P[name] = np.array([c[0], c[1], P[name][2]])
out = {k: [round(float(x), 4) for x in v] for k, v in P.items()}
json.dump(out, open(OUT, "w"), indent=1)
for k, v in out.items():
    print("JOINT", k, v, "moved", round(float(np.linalg.norm(np.array(v) - np.array(J[k]))), 3))
