"""The Spellblade's forearms, remodelled as plate vambraces (part of parts.py, before hands.py and joints.py).

Rodin never shaped the forearms as armour: the left was a smooth pale tube, the right a flared leather bracer carrying
the remnants of his own sculpted fist (it lay beside the sword's grip, weighted to the forearm, so the gauntlet
rebuild's cut at the wrist left lumps of it standing out round the new fist). First person copies these forearms onto
its own arms (fp_arms.py), where they fill the bottom of the view, so there they read as a stain.

Each forearm's faces go, from just past the elbow's cut (joints.py takes the rest) to the wrist, and a vambrace takes
their place, wholly on the forearm's bone:

- a fluted plate tube, polished facets alternating with duller ones, a little wider across the elbow's hinge than
  deep, swelling below the elbow and tapering round to the wrist; one profile for both arms (from the two forearms'
  own reach, measured before the cut), so they match;
- a raised ridge down its back (the elbow's side, where the forearm faces out);
- a leather strap round its middle with a brass buckle on the ridge;
- closed at both ends, under the elbow's ring (joints.py measures its ring from this) and the gauntlet's cuff
  (hands.py sizes its cuff to this).
"""
from __future__ import annotations

import math

import numpy as np

from tools.blender.characters.spellblade.rodin.hands import CUT, Builder, cut, grip_frame, unit
from tools.blender.characters.spellblade.rodin.joints import JOINTS, joint_frame

SIDES = 12
ASPECT = 1.14                  # across the hinge over front to back, easing to round at the wrist
RINGS = (0.0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.88, 1.0)
SWELL = 0.1                    # the swell below the elbow, as a share of the radius (at a quarter of the way down)
RIDGE = {"height": 0.008, "spread": 6, "clear": 0.075}   # the ridge's height, sharpness, and how far it stops short of the wrist
STRAP = {"at": 0.5, "width": 0.03, "lift": 0.005, "buckle": (0.017, 0.02, 0.007)}
RADIUS = (0.058, 0.095)        # a vambrace's radius stays within these (metres): Rodin's flanges are not the arm
START = JOINTS["elbow"]["down"] + 0.004   # the vambrace starts just past the elbow's cut (joints.py's ring covers it)
SHORT = 0.006                  # and ends this short of the wrist's cut, inside the gauntlet's cuff


def _ends(rig, side: str, sword, swatch):
    """The forearm's axis from the elbow, and where along it the vambrace ends at the wrist: the forearm's end for the
    spell hand, short of the grip for the sword hand (where hands.py cuts and seats the fist's cuff)."""
    mw = rig.matrix_world
    bone = rig.data.bones[f"forearm.{side}"]
    elbow = np.array(mw @ bone.head_local)
    tail = np.array(mw @ bone.tail_local)
    axis = unit(tail - elbow)
    if side == "L":
        return elbow, axis, float(np.linalg.norm(tail - elbow)) - SHORT
    grip = grip_frame(sword, swatch)
    a = unit(grip["axis"])
    toward = unit(axis - a * (axis @ a))
    end = grip["centre"] - toward * CUT
    return elbow, axis, float((end - elbow) @ axis) - SHORT


def _forearm(obj, side: str):
    names = {g.index: g.name for g in obj.vertex_groups}
    share = np.array([sum(g.weight for g in v.groups if names[g.group] in (f"forearm.{side}", f"elbow.{side}"))
                      for v in obj.data.vertices])
    co = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
    return share, co


def _reach(obj, side: str, elbow, axis, end) -> tuple[float, float]:
    """The forearm's own reach from its axis (35th percentile: the arm, not its flanges and lumps) near the elbow and
    near the wrist."""
    share, co = _forearm(obj, side)
    rel = co - elbow
    along = rel @ axis
    radial = np.linalg.norm(rel - np.outer(along, axis), axis=1)
    out = []
    for lo, hi in ((START, START + 0.06), (end - 0.08, end - 0.02)):
        pick = (share > 0.5) & (along > lo) & (along < hi) & (radial < 0.3)
        out.append(float(np.percentile(radial[pick], 35)) if pick.sum() > 8 else float(np.mean(RADIUS)))
    return tuple(float(np.clip(r, *RADIUS)) for r in out)


def build_arms(rig, gauntlets: dict, sword, palette: dict, swatch, hinges: dict) -> dict:
    """Cut each forearm out of its gauntlet part and build its vambrace (see the module notes). hinges: each elbow's
    hinge in the forearm's rest frame (joints.hinge_of), for which way across the arm is and where the elbow points."""
    report = {}
    ends = {side: _ends(rig, side, sword, swatch) for side in ("L", "R")}
    reach = {side: _reach(gauntlets[side], side, *ends[side]) for side in ("L", "R")}
    # (one profile for both arms; the wrist never wider than below the elbow)
    near_elbow = (reach["L"][0] + reach["R"][0]) / 2
    near_wrist = min(near_elbow * 0.92, (reach["L"][1] + reach["R"][1]) / 2)
    for side in ("L", "R"):
        obj = gauntlets[side]
        elbow, axis, end = ends[side]
        share, co = _forearm(obj, side)
        along = (co - elbow) @ axis
        # every face of the forearm past the elbow's cut goes: the tube, the bracer's flanges, the old fist's remnants
        # (the joint's own faces, inside the cut, joints.py measures and cuts)
        removed = cut(obj, (share > 0.5) & (along > JOINTS["elbow"]["down"]))
        f = joint_frame(rig, "elbow", side, hinges[side])
        across = unit(f["h"] - axis * (f["h"] @ axis))
        back = unit(np.cross(axis, across))
        if back @ f["n"] < 0:
            back = -back
        b = Builder(obj, palette)
        _vambrace(b, elbow, axis, across, back, START, end, (near_elbow, near_wrist), f"forearm.{side}")
        report[side] = {"cutFaces": removed, "faces": b.finish(), "from": round(START, 3), "to": round(end, 3),
                        "radius": [round(near_elbow, 3), round(near_wrist, 3)],
                        "own": [round(r, 3) for r in reach[side]]}
    return report


def _vambrace(b: Builder, elbow, axis, across, back, start: float, end: float, radius, bone: str) -> None:
    length = end - start

    def at(t):
        r = radius[0] + (radius[1] - radius[0]) * t
        return r * (1 + SWELL * math.sin(math.pi * min(1.0, t / 0.5)) * (t < 0.5))

    def aspect(t):
        return ASPECT + (1 - ASPECT) * max(0.0, (t - 0.6) / 0.4)

    def ridge(t, q):
        on = 0.06 < t and t * length < length - RIDGE["clear"]
        return RIDGE["height"] * max(0.0, math.cos(q)) ** RIDGE["spread"] if on else 0.0

    def point(t, q, grow=0.0):
        r, k = at(t) + grow, aspect(t) ** 0.5
        return (elbow + axis * (start + t * length) + across * (math.sin(q) * r * k)
                + back * (math.cos(q) * (r / k + ridge(t, q))))

    angles = [2 * math.pi * k / SIDES for k in range(SIDES)]
    rings = [[b.vert(point(t, q), bone) for q in angles] for t in RINGS]
    for j in range(len(RINGS) - 1):
        for k in range(SIDES):
            m = (k + 1) % SIDES
            outer = math.cos(2 * math.pi * (k + 0.5) / SIDES) > -0.2
            tone = ("steelLight" if k % 2 else "steel") if outer else ("steel" if k % 2 else "steelDark")
            b.face([rings[j][k], rings[j][m], rings[j + 1][m], rings[j + 1][k]], tone)
    # the strap round its middle, standing off the plate, with a buckle on the ridge
    half = STRAP["width"] / length / 2
    lo, hi = STRAP["at"] - half, STRAP["at"] + half
    band = [[b.vert(point(t, q, g), bone) for q in angles] for t, g in ((lo, -0.002), (lo, STRAP["lift"]),
                                                                        (hi, STRAP["lift"]), (hi, -0.002))]
    for j in range(3):
        for k in range(SIDES):
            m = (k + 1) % SIDES
            b.face([band[j][k], band[j][m], band[j + 1][m], band[j + 1][k]], "strap")
    w, h, d = STRAP["buckle"]
    centre = point(STRAP["at"], 0.0, STRAP["lift"])
    corners = [centre + across * x + axis * y for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    top = [b.vert(c + back * d, bone) for c in corners]
    foot = [b.vert(c - back * 0.002, bone) for c in corners]
    b.face(top, "brassLight")
    for k in range(4):
        m = (k + 1) % 4
        b.face([foot[k], foot[m], top[m], top[k]], "brass")
    # (closed at both ends, under the elbow's ring and the gauntlet's cuff: nothing to see into)
    for ring, t in ((rings[0], 0.0), (rings[-1], 1.0)):
        cap = b.vert(elbow + axis * (start + t * length), bone)
        for k in range(SIDES):
            b.face([ring[k], ring[(k + 1) % SIDES], cap], "padding")
