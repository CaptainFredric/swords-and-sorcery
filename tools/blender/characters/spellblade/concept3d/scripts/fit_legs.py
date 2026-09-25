import sys, json, bpy
import numpy as np
jf = sys.argv[sys.argv.index("--") + 1]
J = json.load(open(jf))
body = bpy.data.objects["GenBody"]
G = np.array([tuple(body.matrix_world @ v.co) for v in body.data.vertices])
MID = 0.03
sheet = (np.abs(G[:, 0] - MID) < 0.15) & ((G[:, 1] > 0.26) | (G[:, 1] < -0.04)) & (G[:, 2] > 0.35)
for side, s in (("R", 1), ("L", -1)):
    keep = ((G[:, 0] - MID) * s > 0.03) & ~sheet
    cs = {}
    for z in (0.90, 0.80, 0.56, 0.40, 0.22):
        m = keep & (np.abs(G[:, 2] - z) < 0.015)
        pts = G[m]
        # take the cluster nearest the previous guess (one leg only), drop far outliers
        ref = np.array(J[f"knee.{side}"][:2])
        d = np.linalg.norm(pts[:, :2] - ref, axis=1); pts = pts[d < 0.30]
        cs[z] = ((pts[:, 0].min() + pts[:, 0].max()) / 2, (pts[:, 1].min() + pts[:, 1].max()) / 2, len(pts),
                 round(float(pts[:, 0].max() - pts[:, 0].min()), 3), round(float(pts[:, 1].max() - pts[:, 1].min()), 3))
        print("RING", side, z, [round(float(v), 3) for v in cs[z][:2]], "n", cs[z][2], "w", cs[z][3], "d", cs[z][4])
    knee = cs[0.56]; ank = cs[0.22]; th = (np.array(cs[0.90][:2]) + np.array(cs[0.80][:2])) / 2
    J[f"knee.{side}"] = [round(float(knee[0]), 4), round(float(knee[1]), 4), 0.56]
    J[f"ankle.{side}"] = [round(float(ank[0]), 4), round(float(ank[1]), 4), 0.21]
    # hip: extend the knee->thigh-mid line up to the hip height
    k = np.array([knee[0], knee[1], 0.56]); t = np.array([th[0], th[1], 0.85])
    hdir = (t - k) / np.linalg.norm(t - k); hip = k + hdir * ((1.03 - 0.56) / hdir[2])
    J[f"hip.{side}"] = [round(float(x), 4) for x in hip]
    toe = [J[f"ankle.{side}"][0], J[f"ankle.{side}"][1] + 0.30, 0.08]
    J[f"toe.{side}"] = [round(float(x), 4) for x in toe]
for k, v in {"pelvis": (MID, 0.13, 1.03), "spine": (MID, 0.14, 1.20), "chest": (MID, 0.15, 1.38), "neck": (0.02, 0.18, 1.64), "head": (0.0, 0.20, 1.76)}.items():
    J[k] = list(v)
json.dump(J, open(jf.replace(".json", "_v2.json"), "w"), indent=1)
for k in ("hip.R", "knee.R", "ankle.R", "hip.L", "knee.L", "ankle.L"): print("LEG", k, J[k])
