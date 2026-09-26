"""Write it/joints_concept.json: rig-space rest joints for the kit. Torso, legs, cloth chains: the live rig.
Arms: symmetric, concept proportions (upper arm 0.30, forearm 0.28, hand 0.15), live rest directions."""
import os
from pathlib import Path
KIT = Path(__file__).resolve().parent
ROOT = KIT.parents[4]
WORK = Path(os.environ.get("SPELLBLADE_KIT_WORK", ROOT / "artifacts" / "kit"))
C3D = ROOT / "tools" / "blender" / "characters" / "spellblade" / "concept3d"
import json, math
live = {
 "pelvis": ((0.000, 0.020, 1.030), (0.000, 0.020, 1.200)), "spine": ((0.000, 0.020, 1.200), (0.000, 0.020, 1.380)),
 "chest": ((0.000, 0.020, 1.380), (0.000, 0.020, 1.640)), "neck": ((0.000, 0.050, 1.640), (0.000, 0.050, 1.760)),
 "head": ((0.000, 0.050, 1.760), (0.000, 0.050, 2.000)),
 "upper_arm.L": ((-0.250, 0.000, 1.550), (-0.502, 0.075, 1.255)), "forearm.L": ((-0.502, 0.075, 1.255), (-0.395, 0.318, 1.114)),
 "hand.L": ((-0.395, 0.318, 1.114), (-0.461, 0.460, 1.128)),
 "upper_arm.R": ((0.300, 0.000, 1.550), (0.493, 0.078, 1.220)), "forearm.R": ((0.493, 0.078, 1.220), (0.643, 0.095, 0.944)),
 "hand.R": ((0.643, 0.095, 0.944), (0.592, 0.027, 0.804)),
 "tabard_root": ((0.000, 0.020, 1.200), (0.000, 0.020, 1.090)),
 "tabard_front_01": ((0.000, 0.236, 1.120), (0.000, 0.252, 0.800)), "tabard_front_02": ((0.000, 0.252, 0.800), (0.000, 0.268, 0.480)),
 "tabard_back_01": ((0.000, -0.340, 1.220), (0.000, -0.380, 0.840)), "tabard_back_02": ((0.000, -0.380, 0.840), (0.000, -0.430, 0.450)),
 "thigh.L": ((-0.170, 0.010, 1.030), (-0.240, 0.023, 0.560)), "shin.L": ((-0.240, 0.023, 0.560), (-0.294, -0.076, 0.210)),
 "foot.L": ((-0.294, -0.076, 0.210), (-0.294, 0.224, 0.080)),
 "thigh.R": ((0.170, -0.020, 1.030), (0.273, -0.057, 0.560)), "shin.R": ((0.273, -0.057, 0.560), (0.380, -0.054, 0.210)),
 "foot.R": ((0.380, -0.054, 0.210), (0.380, 0.246, 0.080)),
}
def sub(a, b): return [a[i] - b[i] for i in range(3)]
def add(a, b): return [a[i] + b[i] for i in range(3)]
def mul(a, s): return [x * s for x in a]
def unit(a): n = math.sqrt(sum(x * x for x in a)); return [x / n for x in a]
J = {k: [list(h), list(t)] for k, (h, t) in live.items()}
LEN = {"upper_arm": 0.30, "forearm": 0.28, "hand": 0.15}
for s, sx in (("R", 1), ("L", -1)):
    sh = [0.28 * sx, 0.0, 1.55]
    J[f"clavicle.{s}"] = [[0.07 * sx, 0.02, 1.56], sh]
    p = sh
    for seg in ("upper_arm", "forearm", "hand"):
        h, t = live[f"{seg}.{s}"]
        d = unit(sub(t, h)); q = add(p, mul(d, LEN[seg]))
        J[f"{seg}.{s}"] = [p, q]; p = q
for k in ("upper_arm", "forearm", "hand"):
    for s in "RL": print(k, s, [round(v, 3) for v in J[f"{k}.{s}"][0]], "->", [round(v, 3) for v in J[f"{k}.{s}"][1]])
WORK.mkdir(parents=True, exist_ok=True)
json.dump(J, open(WORK / "joints_concept.json", "w"), indent=1)
