"""The Spellblade's elbows and knees, remodelled as articulated plate (part of parts.py, after hands.py).

Rodin's knee and elbow were one continuous skinned surface: the poleyn, its wing, the strap above it and the band below
it (and at the elbow, the vambrace's rim) all lay across the joint, so at a deep bend they bent like rubber, the poleyn
crumpled, the straps crossed and the inside of the elbow folded through itself. Weighting that surface differently only
moves the stretch from one plate to the next (rigid.py's notes). So the joint is cut out and rebuilt as armour is made:
separate rigid pieces that overlap, each on one bone, with a padded sleeve beneath them that alone gives:

- a cut across each limb, a hand's breadth either side of the joint (`JOINTS`): every face of the joint between them
  goes, and the cannons either side become wholly their own bone's near the cut (so their edges stay true);
- a padded sleeve from inside one cut to inside the other, its weights easing from the upper limb through the joint's
  cop to the lower limb: the only surface that stretches, dark (leather), and seen only in the gaps the bend opens;
- the cop's plate on the cop bone (rigid.py: it turns half as far as the lower limb), so it always sits over the
  point of the joint: at the knee the poleyn, domed and ridged, with the fan-shaped wing on its outer side; at the
  elbow a smaller couter;
- a ring round each limb over its cut, rigid on that limb: at the knee the leather strap above and the pale band below,
  at the elbow a band above and the vambrace's pale rim below. They cover the cut edges, as a cuff covers a gauntlet's.

All of it in the colours already on the model (its own atlas texels: the steel, the pale rims, the strap's leather),
flat-shaded like the hands. The bend then shows plate turning over plate and padding between, as armour does; nothing
stretches but the padding, and nothing is hidden.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from tools.blender.characters.spellblade.rodin.hands import Builder, unit

# metres. up / down: where each limb is cut, from the joint's pivot along the limb; cap: the cop plate's reach round
# the hinge (degrees toward the upper limb, toward the lower) and its width as a share of the limb's; ring: the width of
# each ring along its limb; wing: the poleyn's fan (radius, or None)
JOINTS = {
    "knee": {"upper": "thigh", "lower": "shin", "cop": "knee", "up": 0.075, "down": 0.155,
             "cap": {"toward_upper": 24, "toward_lower": 30, "width": 0.9, "lift": 0.004, "ridge": 0.012},
             # the lames under the poleyn: (from, to) degrees round the hinge from the joint's point, toward each limb
             "lames": {"upper": (4, 30), "lower": (6, 38)},
             "rings": {"upper": ("strap", 0.046), "lower": ("rim", 0.05)}, "wing": 0.075},
    "elbow": {"upper": "upper_arm", "lower": "forearm", "cop": "elbow", "up": 0.075, "down": 0.04, "lames": None,
              "cap": {"toward_upper": 44, "toward_lower": 48, "width": 0.7, "lift": 0.006, "ridge": 0.01},
              "rings": {"upper": ("steelDark", 0.04), "lower": ("rim", 0.046)}, "wing": 0.05},
}
SIDES = 16                 # facets round a ring or the sleeve
SLEEVE = {"rings": 9, "inset": 0.88, "reach": 0.035}   # its radius as a share of the cut's, how far inside each cut
BALL_COP = 80              # degrees either side of the joint's point the cop's shell of the padded ball reaches
RING = {"lift": 0.009, "thick": 0.011}                 # rings stand off the cannon, and are this thick
NEAR = 0.06                # cannon vertices within this of a cut become wholly their limb's
LIMB = 0.26                # nothing further than this from the limb's axis is part of it


def smoothstep(e0: float, e1: float, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def rot(axis, angle: float) -> np.ndarray:
    x, y, z = unit(axis)
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    return np.array([[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
                     [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
                     [t * x * z - s * y, t * y * z + s * x, t * z * z + c]])


def joint_frame(rig, kind: str, side: str, hinge_local) -> dict:
    """The joint at rest: pivot C, up the upper limb u, down the lower limb l, the hinge h, the joint's point n (the
    outside of the bend: the knee's front, the elbow's point) and outward o (away from the body's midline, along the
    hinge). The hinge is square to both limbs: where the rest pose is bent, the normal of their plane; where it is all
    but straight, the actions' own bend axis (hinge_of) squared to them. Signed so a positive turn bends the joint."""
    spec = JOINTS[kind]
    upper, lower = rig.data.bones[f"{spec['upper']}.{side}"], rig.data.bones[f"{spec['lower']}.{side}"]
    mw = rig.matrix_world
    C = np.array(mw @ lower.head_local)
    u = unit(np.array(mw @ upper.head_local) - C)
    l = unit(np.array(mw @ lower.tail_local) - C)
    bend = math.degrees(math.acos(max(-1.0, min(1.0, float(-u @ l)))))
    if bend > 25:
        h = unit(np.cross(u, l))
    else:
        h = np.array(mw.to_3x3() @ lower.matrix_local.to_3x3() @ Vector(tuple(hinge_local)))
        h = h - u * (h @ u)
        h = unit(h - l * (h @ l))
    # (a positive turn of the lower limb about h closes the joint further)
    angle = lambda d: math.acos(max(-1.0, min(1.0, float(-u @ d))))
    if angle(rot(h, 0.3) @ l) < angle(l):
        h = -h
    if bend > 25:
        n = unit(-(u + l))
    else:
        inward = rot(h, 0.6) @ l - l
        inward = inward - l * (inward @ l)
        n = -unit(inward - h * (inward @ h))
    n = unit(n - h * (n @ h))
    o = h if h @ (C - np.array(mw @ rig.data.bones["pelvis"].head_local)) > 0 else -h
    return {"C": C, "u": u, "l": l, "h": h, "n": n, "o": o, "bend": bend}


def hinge_local(rig, kind: str, side: str, f) -> np.ndarray:
    """The frame's hinge in the lower limb's own rest frame (to turn the bone about it)."""
    lower = rig.data.bones[f"{JOINTS[kind]['lower']}.{side}"]
    return unit(np.array(lower.matrix_local.to_3x3().inverted() @ rig.matrix_world.to_3x3().inverted() @ Vector(tuple(f["h"]))))


def hinge_of(rig, kind: str, side: str) -> np.ndarray:
    """The joint's hinge in its lower limb's rest frame, from every frame of every action: the lower limb's direction,
    seen from the upper limb, swings in the plane square to its hinge, so the hinge is the direction those directions
    vary least in. Signed so that a positive turn about it bends the joint."""
    spec = JOINTS[kind]
    upper_name, lower_name = f"{spec['upper']}.{side}", f"{spec['lower']}.{side}"
    scene = bpy.context.scene
    keep = rig.animation_data.action
    dirs = []
    for action in bpy.data.actions:
        rig.animation_data.action = action
        f0, f1 = map(int, action.frame_range)
        for frame in range(f0, f1 + 1, 2):
            scene.frame_set(frame)
            pu, pl = rig.pose.bones[upper_name], rig.pose.bones[lower_name]
            d = pu.matrix.to_3x3().inverted() @ (pl.tail - pl.head)
            dirs.append(np.array(d.normalized()))
    rig.animation_data.action = keep
    scene.frame_set(scene.frame_start)
    dirs = np.array(dirs)
    _, _, vt = np.linalg.svd(dirs - 0 * dirs.mean(0), full_matrices=False)
    h_upper = vt[-1]
    # (into the lower limb's rest frame: at rest the lower limb's frame sits in the upper limb's by their rest matrices)
    upper, lower = rig.data.bones[upper_name], rig.data.bones[lower_name]
    to_lower = np.array(lower.matrix_local.to_3x3().inverted() @ upper.matrix_local.to_3x3())
    h = unit(to_lower @ h_upper)
    # the sign: the deepest bend turns the rest direction about +h
    rest = np.array((upper.matrix_local.to_3x3().inverted() @ (lower.tail_local - lower.head_local)).normalized())
    straightest = max(dirs, key=lambda d: d @ rest)
    deepest = min(dirs, key=lambda d: d @ rest)
    if np.cross(straightest, deepest) @ h_upper < 0:
        h = -h
    return h


def _weights(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    return [{names[g.group]: g.weight for g in v.groups} for v in obj.data.vertices], names


def _limb_vertices(obj, f, spec, side):
    """Each vertex's place by the joint: its reach up the upper limb and down the lower one from the pivot, how far it
    lies from either limb's axis, and how much of it the limb's bones carry."""
    co = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
    rel = co - f["C"]
    up = rel @ f["u"]
    down = rel @ f["l"]
    radial_u = np.linalg.norm(rel - np.outer(up, f["u"]), axis=1)
    radial_l = np.linalg.norm(rel - np.outer(down, f["l"]), axis=1)
    weights, _ = _weights(obj)
    bones = {f"{spec['upper']}.{side}", f"{spec['lower']}.{side}", f"{spec['cop']}.{side}"}
    share = np.array([sum(w for b, w in ws.items() if b in bones) for ws in weights])
    return co, up, down, radial_u, radial_l, share


def cut_joint(obj, f, spec, side) -> dict:
    """Cut the joint out of one part: every face most of whose corners lie between the two cuts (on the limb), and the
    cannons near the cuts made wholly their own limb's. Returns what was done."""
    from tools.blender.characters.spellblade.rodin.hands import cut
    co, up, down, ru, rl, share = _limb_vertices(obj, f, spec, side)
    inside = (up < spec["up"]) & (down < spec["down"]) & (np.minimum(ru, rl) < LIMB) & (share > 0.5)
    if not inside.any():
        return {"cutFaces": 0}
    # (a face goes if any corner of it lies in the joint, so what stays ends wholly past the cut, under its ring, with
    # no sliver of the old plates reaching back into the joint)
    touching = np.zeros(len(co), bool)
    for p in obj.data.polygons:
        if inside[list(p.vertices)].any():
            touching[list(p.vertices)] = True
    removed = cut(obj, touching)
    # the cannons either side: wholly their own bone near the cut
    co, up, down, ru, rl, share = _limb_vertices(obj, f, spec, side)
    weights, _ = _weights(obj)
    upper, lower, cop = f"{spec['upper']}.{side}", f"{spec['lower']}.{side}", f"{spec['cop']}.{side}"
    changed = 0
    for i, ws in enumerate(weights):
        if share[i] <= 0.5:
            continue
        if up[i] >= spec["up"] and up[i] < spec["up"] + NEAR and ru[i] < LIMB:
            bone, t = upper, smoothstep(spec["up"] + NEAR, spec["up"], up[i])
        elif down[i] >= spec["down"] and down[i] < spec["down"] + NEAR and rl[i] < LIMB:
            bone, t = lower, smoothstep(spec["down"] + NEAR, spec["down"], down[i])
        else:
            continue
        new = {b: w * (1 - t) for b, w in ws.items()}
        new[bone] = new.get(bone, 0.0) + t
        for b in list(new):
            if b in (upper, lower, cop) and b != bone:
                new[bone] += new.pop(b) * t
        total = sum(new.values()) or 1.0
        v = obj.data.vertices[i]
        for g in list(v.groups):
            obj.vertex_groups[g.group].remove([i])
        for b, w in new.items():
            if w / total < 0.01:
                continue
            group = obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)
            group.add([i], w / total, "REPLACE")
        changed += 1
    return {"cutFaces": removed, "rigidNearCut": changed}


def profile(objs, f, axis, at: float, spec, side) -> dict:
    """The limb's own surface at a cut (`at` along `axis` from the pivot): how far it reaches from the limb's axis in
    each of SIDES directions round it (the 90th percentile of the surface within 2 cm of the cut, so a ring laid at
    those radii clears its plates' rims), measured before the cut."""
    across = unit(f["h"] - axis * (f["h"] @ axis))
    front = unit(np.cross(axis, across))
    if front @ f["n"] < 0:
        front = -front
    pts = []
    for obj in objs:
        co, up, down, ru, rl, share = _limb_vertices(obj, f, spec, side)
        along = (co - f["C"]) @ axis
        radial = ru if axis is f["u"] else rl
        # (the cannon that stays, just past the cut: what the ring has to cover)
        pts.append(co[(along > at) & (along < at + 0.03) & (radial < LIMB) & (share > 0.3)])
    pts = np.concatenate(pts)
    rel = pts - f["C"]
    x, y = rel @ across, rel @ front
    angle = np.arctan2(y, x) % (2 * math.pi)
    r = np.hypot(x, y)
    radii = []
    for k in range(SIDES):
        q = 2 * math.pi * (k + 0.5) / SIDES
        d = np.abs((angle - q + math.pi) % (2 * math.pi) - math.pi)
        near = r[d < math.pi / SIDES * 1.5]
        radii.append(float(np.percentile(near, 90)) if len(near) >= 3 else np.nan)
    radii = np.array(radii)
    if np.isnan(radii).all():
        raise ValueError("no limb surface at a cut")
    # (an empty direction takes its neighbours' reach)
    for k in np.where(np.isnan(radii))[0]:
        around = [radii[(k + j) % SIDES] for j in (-2, -1, 1, 2) if not np.isnan(radii[(k + j) % SIDES])]
        radii[k] = float(np.mean(around)) if around else float(np.nanmean(radii))
    return {"centre": f["C"] + axis * at, "axis": axis, "across": across, "front": front, "radii": radii}


def _round(prof, at: float, k: int, scale: float = 1.0, out: float = 0.0):
    q = 2 * math.pi * (k + 0.5) / SIDES
    r = prof["radii"][k] * scale + out
    return prof["centre"] + prof["axis"] * at + (prof["across"] * math.cos(q) + prof["front"] * math.sin(q)) * r


def old_cap(objs, f, spec, side) -> dict:
    """Where Rodin's own cop plate was (measured before the cut): its surface's distance from the hinge over the joint's
    point, its width across, and its middle along the hinge, so the new plate keeps the knee's silhouette."""
    pts = []
    for obj in objs:
        co, up, down, ru, rl, share = _limb_vertices(obj, f, spec, side)
        inside = (up < spec["up"]) & (down < spec["down"]) & (np.minimum(ru, rl) < LIMB) & (share > 0.5)
        pts.append(co[inside])
    rel = np.concatenate(pts) - f["C"]
    h, n = f["h"], f["n"]
    upd = unit(f["u"] - h * (f["u"] @ h))
    s = rel @ h
    psi = np.degrees(np.arctan2(rel @ upd, rel @ n))
    d = np.hypot(rel @ n, rel @ upd)
    front = np.abs(psi) < 30
    middle = float(np.median(s[front]))
    reach = float(np.percentile(d[front & (np.abs(s - middle) < 0.05)], 95))
    s5, s95 = np.percentile(s[np.abs(psi) < 20], [6, 94])
    return {"radius": reach, "half": float(s95 - s5) / 2, "middle": float(s5 + s95) / 2}


def ring(b: Builder, prof, width: float, tone: str, bone: str, edge: str | None = None,
         lift: float = RING["lift"], thick: float = RING["thick"]) -> int:
    """A band round the limb over its cut, `lift` off its surface in every direction: an outer face, its two rolled
    edges (in `edge`'s tone, if given), and an inner face `thick` inside it."""
    def loop(at, out):
        return [b.vert(_round(prof, at, k, out=out), bone) for k in range(SIDES)]
    # (centred a little past the cut, over the cannon's cut edge)
    a, z = 0.01 - width / 2, 0.01 + width / 2
    outer = [loop(a, lift + thick * 0.4), loop(a + 0.008, lift + thick), loop(z - 0.008, lift + thick), loop(z, lift + thick * 0.4)]
    inner = [loop(a, lift - thick * 0.3), loop(z, lift - thick * 0.3)]
    n = 0
    tones = [edge or tone, tone, edge or tone]
    for j in range(3):
        for k in range(SIDES):
            m = (k + 1) % SIDES
            b.face([outer[j][k], outer[j][m], outer[j + 1][m], outer[j + 1][k]], tones[j])
            n += 1
    for k in range(SIDES):
        m = (k + 1) % SIDES
        b.face([inner[1][k], inner[1][m], inner[0][m], inner[0][k]], "padding")
        b.face([inner[0][k], inner[0][m], outer[0][m], outer[0][k]], edge or tone)
        b.face([outer[3][k], outer[3][m], inner[1][m], inner[1][k]], edge or tone)
        n += 3
    return n


def sleeve(b: Builder, f, upper, lower, bones, under: float | None = None) -> int:
    """The padded sleeve from inside the upper cut to inside the lower, through the pivot: each ring's reach in each
    direction eased from one cut's to the other's, and its weights from the upper limb through the cop to the lower
    limb (a Bezier's own weights, so the bend shares out smoothly)."""
    up_bone, cop, low_bone = bones
    P0 = upper["centre"] + upper["axis"] * SLEEVE["reach"]
    P2 = lower["centre"] + lower["axis"] * SLEEVE["reach"]
    P1 = f["C"]
    count = SLEEVE["rings"]
    loops = []
    for r in range(count):
        t = r / (count - 1)
        centre = (1 - t) ** 2 * P0 + 2 * t * (1 - t) * P1 + t * t * P2
        tangent = unit(2 * (1 - t) * (P1 - P0) + 2 * t * (P2 - P1))
        across = unit(f["h"] - tangent * (f["h"] @ tangent))
        front = unit(np.cross(tangent, across))
        if front @ f["n"] < 0:
            front = -front
        w = {up_bone: (1 - t) ** 2, cop: 2 * t * (1 - t), low_bone: t * t}
        loop = []
        for k in range(SIDES):
            q = 2 * math.pi * (k + 0.5) / SIDES
            rad = ((1 - t) * upper["radii"][k] + t * lower["radii"][k]) * SLEEVE["inset"]
            # (swelling forward under the cop plate and its lames, so they lie on it rather than stand off it)
            if under:
                facing = max(0.0, math.sin(q)) ** 1.5
                rad = max(rad, rad + (under - rad) * facing * math.sin(math.pi * t) ** 0.6)
            p = centre + (across * math.cos(q) + front * math.sin(q)) * rad
            v = b.bm.verts.new(tuple(float(c) for c in p))
            for bone, weight in w.items():
                if weight < 0.01:
                    continue
                group = b.obj.vertex_groups.get(bone) or b.obj.vertex_groups.new(name=bone)
                v[b.deform][group.index] = float(weight)
            loop.append(v)
        loops.append(loop)
    n = 0
    for r in range(count - 1):
        for k in range(SIDES):
            m = (k + 1) % SIDES
            # (quilted: alternate rings a shade lighter, so it reads as padding, not a stretched skin)
            b.face([loops[r][k], loops[r][m], loops[r + 1][m], loops[r + 1][k]], "padding" if r % 2 else "quilt")
            n += 1
    return n


def cap(b: Builder, f, spec, old, bone: str) -> dict:
    """The cop's plate (poleyn, couter) on the cop bone where Rodin's was: a faceted lozenge, curved about the hinge over
    the joint's point (a surface of revolution about the hinge, so it turns over the cannons, and they under it, without
    either passing through), ridged down its middle, a pale rim round its edge and its underside dark."""
    c = spec["cap"]
    C, h, n = f["C"], f["h"], f["n"]
    up = unit(f["u"] - h * (f["u"] @ h))
    half = old["half"] * c["width"]
    radius = old["radius"] + c["lift"]
    a_up, a_down = math.radians(c["toward_upper"]), math.radians(c["toward_lower"])
    S, A = 7, 9                                   # across, around (the outermost of each: the rim)
    grid = []
    for j in range(A):
        tau = 2 * j / (A - 1) - 1                 # -1 at its lower point, +1 at its upper
        phi = -a_down + (a_up + a_down) * j / (A - 1)
        hw = half * (1 - 0.55 * abs(tau) ** 1.6)   # (a lozenge: pointed at both ends)
        row = []
        for i in range(S):
            q = 2 * i / (S - 1) - 1               # -1..1 across
            ridge = c["ridge"] * max(0.0, 1 - abs(q) * 2.2) * (1 - 0.5 * abs(tau))
            r = radius - 0.016 * q * q + ridge - (0.004 if abs(q) == 1 or abs(tau) == 1 else 0)
            row.append(C + h * (old["middle"] + q * hw) + r * (math.cos(phi) * n + math.sin(phi) * up))
        grid.append(row)
    verts = [[b.vert(p, bone) for p in row] for row in grid]
    under = [[b.vert(C + (p - C) * (1 - 0.011 / radius), bone) for p in row] for row in grid]
    count = 0
    for j in range(A - 1):
        for i in range(S - 1):
            edge = i in (0, S - 2) or j in (0, A - 2)
            tone = "rim" if edge else ("steelLight" if i < (S - 1) / 2 else "steel")
            b.face([verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]], tone)
            b.face([under[j + 1][i], under[j + 1][i + 1], under[j][i + 1], under[j][i]], "padding")
            count += 2
    border = [(0, i) for i in range(S)] + [(j, S - 1) for j in range(1, A)] + \
        [(A - 1, i) for i in range(S - 2, -1, -1)] + [(j, 0) for j in range(A - 2, 0, -1)]
    for k in range(len(border)):
        (j0, i0), (j1, i1) = border[k], border[(k + 1) % len(border)]
        b.face([verts[j0][i0], under[j0][i0], under[j1][i1], verts[j1][i1]], "rim")
        count += 1
    return {"faces": count, "half": half, "radius": radius, "middle": old["middle"]}


def wing(b: Builder, f, spec, plate, half: float, ball_radius: float, bone: str, outer: bool = True) -> int:
    """A round plate on the side of the joint, square to the hinge and centred on it, rigid on the cop, so it turns in
    its own plane and always covers the side of the padded ball: on the outer side the poleyn's fan (larger toward the
    front, three-lobed, ribbed, rimmed); on the inner side a plain boss."""
    C, h, n, o = f["C"], f["h"], f["n"], f["o"]
    up = unit(f["u"] - h * (f["u"] @ h))
    out = o if outer else -o
    end = plate["middle"] + (half if out @ h > 0 else -half)
    hub = C + h * end - out * (0.02 if outer else 0.03)
    big = spec["wing"] if outer else ball_radius * 0.42
    angles = [2 * math.pi * k / 18 for k in range(18)]
    def reach(a):
        if not outer:
            return big
        # (a fan, pointed toward the knee's front as Rodin's was, short behind, just over the padded ball's hub)
        return big * (0.62 + 0.62 * max(0.0, math.cos(a)) ** 1.5 + 0.06 * math.cos(3 * a))
    rim = [hub + reach(a) * (math.cos(a) * n + math.sin(a) * up) for a in angles]
    # (a raised boss in the middle, the plate falling away from it to a rolled rim)
    centre_out = b.vert(hub + out * (0.03 if outer else 0.016), bone)
    centre_in = b.vert(hub - out * 0.004, bone)
    boss = [b.vert(hub + (p - hub) * 0.4 + out * (0.024 if outer else 0.013), bone) for p in rim]
    upper_ring = [b.vert(p + out * 0.008, bone) for p in rim]
    lower_ring = [b.vert(p - out * 0.004, bone) for p in rim]
    count = 0
    for k in range(len(rim)):
        m = (k + 1) % len(rim)
        top = "steelLight" if outer else "steel"
        face = "steel" if outer else "steelDark"
        b.face([centre_out, boss[k], boss[m]], top)
        b.face([boss[k], upper_ring[k], upper_ring[m], boss[m]], face if k % 3 else top)
        b.face([centre_in, lower_ring[m], lower_ring[k]], "padding")
        b.face([upper_ring[k], lower_ring[k], lower_ring[m], upper_ring[m]], "rim")
        count += 4
    return count


def lame(b: Builder, f, plate, span, toward: str, bone: str) -> int:
    """A lame under the cop plate's end, rigid on its limb: a band of revolution about the hinge a little inside the
    plate (so the plate turns over it), from `span[0]` to `span[1]` degrees round from the joint's point toward that
    limb, a touch narrower than the plate, rimmed along its outer edge. As the joint bends it comes out from under the
    plate and covers the opening."""
    C, h, n = f["C"], f["h"], f["n"]
    up = unit(f["u"] - h * (f["u"] @ h))
    sign = 1 if toward == "upper" else -1
    radius = plate["radius"] - 0.016
    half = plate["half"] * 0.86
    S, A = 5, 4
    rows = []
    for j in range(A):
        phi = sign * math.radians(span[0] + (span[1] - span[0]) * j / (A - 1))
        row = []
        for i in range(S):
            q = 2 * i / (S - 1) - 1
            r = radius - 0.014 * q * q
            row.append(C + h * (plate["middle"] + q * half) + r * (math.cos(phi) * n + math.sin(phi) * up))
        rows.append(row)
    verts = [[b.vert(p, bone) for p in row] for row in rows]
    under = [[b.vert(C + (p - C) * (1 - 0.009 / radius), bone) for p in row] for row in rows]
    count = 0
    for j in range(A - 1):
        for i in range(S - 1):
            tone = "rim" if j == A - 2 else ("steel" if i % 2 else "steelDark")
            face = [verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]]
            b.face(face if sign > 0 else face[::-1], tone)
            back = [under[j + 1][i], under[j + 1][i + 1], under[j][i + 1], under[j][i]]
            b.face(back if sign > 0 else back[::-1], "padding")
            count += 2
    border = [(0, i) for i in range(S)] + [(j, S - 1) for j in range(1, A)] + \
        [(A - 1, i) for i in range(S - 2, -1, -1)] + [(j, 0) for j in range(A - 2, 0, -1)]
    for k in range(len(border)):
        (j0, i0), (j1, i1) = border[k], border[(k + 1) % len(border)]
        b.face([verts[j0][i0], under[j0][i0], under[j1][i1], verts[j1][i1]], "rim")
        count += 1
    return count


def shell(b: Builder, f, s_half: float, s_mid: float, phis, radius, bone: str, tone, back: str = "padding",
          rim: str | None = "rim", thick: float = 0.01, steps=(7, 9)) -> int:
    """A rigid curved plate on `bone`, a surface of revolution about the joint's hinge: across the hinge from s_mid -
    s_half to s_mid + s_half (its width), round it through `phis` (radians from the joint's point, toward the upper limb
    positive), at `radius(q, tau)` from the hinge (q -1..1 across, tau -1..1 round). Turned about the hinge it stays on
    its own surface, so plates on neighbouring bones slide over one another and never part or pass through. Its face in
    `tone(i, j, S, A)`, its underside in `back`, its edge in `rim`."""
    C, h, n = f["C"], f["h"], f["n"]
    up = unit(f["u"] - h * (f["u"] @ h))
    S, A = steps
    p0, p1 = phis
    def point(q, tau, inset=0.0):
        phi = p0 + (p1 - p0) * (tau + 1) / 2
        r = radius(q, tau) - inset
        return C + h * (s_mid + q * s_half) + r * (math.cos(phi) * n + math.sin(phi) * up)
    grid = [[b.vert(point(2 * i / (S - 1) - 1, 2 * j / (A - 1) - 1), bone) for i in range(S)] for j in range(A)]
    under = [[b.vert(point(2 * i / (S - 1) - 1, 2 * j / (A - 1) - 1, thick), bone) for i in range(S)] for j in range(A)]
    count = 0
    for j in range(A - 1):
        for i in range(S - 1):
            b.face([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], tone(i, j, S, A))
            b.face([under[j + 1][i], under[j + 1][i + 1], under[j][i + 1], under[j][i]], back)
            count += 2
    border = [(0, i) for i in range(S)] + [(j, S - 1) for j in range(1, A)] + \
        [(A - 1, i) for i in range(S - 2, -1, -1)] + [(j, 0) for j in range(A - 2, 0, -1)]
    for k in range(len(border)):
        (j0, i0), (j1, i1) = border[k], border[(k + 1) % len(border)]
        b.face([grid[j0][i0], under[j0][i0], under[j1][i1], grid[j1][i1]], rim or back)
        count += 1
    return count


def ball(b: Builder, f, spec, plate, bones, radius: float, half: float) -> int:
    """The padded knee (or elbow) under the plates: a ball of revolution about the hinge, in three rigid overlapping
    shells, one on each limb and one on the cop. The cop's covers the joint's point far enough round (BALL_COP) that,
    however far the joint bends, the limbs' shells turning off it never uncover what is under them; the limbs' meet
    behind the joint, where the bend only folds them further over each other. Quilted: rings of it a shade lighter."""
    upper, cop, lower = bones
    profile = lambda inset: (lambda q, tau: max(0.004, radius * math.sqrt(max(0.0, 1 - abs(q) ** 2.4)) - inset))
    quilt = lambda i, j, S, A: "quilt" if j % 2 else "padding"
    d = math.radians
    count = shell(b, f, half, plate["middle"], (-d(BALL_COP), d(BALL_COP)), profile(0.008), cop, quilt, rim=None,
                  thick=0.012, steps=(9, 13))
    count += shell(b, f, half, plate["middle"], (d(16), d(200)), profile(0.0), upper, quilt, rim=None, thick=0.01,
                   steps=(9, 15))
    count += shell(b, f, half, plate["middle"], (-d(200), -d(16)), profile(-0.004), lower, quilt, rim=None, thick=0.01,
                   steps=(9, 15))
    return count


def build_joint(rig, parts: list, kind: str, side: str, hinge_local, palette: dict) -> dict:
    """Cut one joint out of `parts` and build it again (see the module notes); the new pieces go to the first part."""
    spec = JOINTS[kind]
    f = joint_frame(rig, kind, side, hinge_local)
    upper, lower, cop = f"{spec['upper']}.{side}", f"{spec['lower']}.{side}", f"{spec['cop']}.{side}"
    # (measured before the cut: the limb at each cut, and Rodin's own cop plate)
    upper_prof = profile(parts, f, f["u"], spec["up"], spec, side)
    lower_prof = profile(parts, f, f["l"], spec["down"], spec, side)
    old = old_cap(parts, f, spec, side)
    report = {"cut": {obj.name: cut_joint(obj, f, spec, side) for obj in parts}}
    b = Builder(parts[0], palette)
    # the padded ball the plates lie on: its radius reaches each cannon's cut (so it tucks inside them under the strap
    # and band), its half-width the limb's across the hinge; the cop plate lies on it
    reach = lambda prof, at: float(np.sqrt(np.median(prof["radii"]) ** 2 + at ** 2))
    ball_radius = min(reach(upper_prof, spec["up"]), reach(lower_prof, spec["down"]))
    half = min(np.max(np.abs(upper_prof["radii"] * np.cos(2 * np.pi * (np.arange(SIDES) + 0.5) / SIDES))),
               np.max(np.abs(lower_prof["radii"] * np.cos(2 * np.pi * (np.arange(SIDES) + 0.5) / SIDES))))
    old = {**old, "radius": max(ball_radius + 0.012, min(old["radius"], ball_radius + 0.03))}
    plate = cap(b, f, spec, old, cop)
    faces = plate["faces"]
    faces += ball(b, f, spec, plate, (upper, cop, lower), ball_radius, float(half))
    if spec["wing"]:
        faces += wing(b, f, spec, plate, float(half), ball_radius, cop, outer=True)
    faces += wing(b, f, {**spec, "wing": None}, plate, float(half), ball_radius, cop, outer=False)
    for toward, span in (spec.get("lames") or {}).items():
        faces += lame(b, f, plate, span, toward, upper if toward == "upper" else lower)
    tone, width = spec["rings"]["upper"]
    faces += ring(b, upper_prof, width, tone, upper, edge="rim" if tone != "strap" else None)
    tone, width = spec["rings"]["lower"]
    faces += ring(b, lower_prof, width, tone, lower)
    report["faces"] = b.finish()
    report["profiles"] = {k: [round(float(v), 3) for v in prof["radii"]] for k, prof in (("upper", upper_prof), ("lower", lower_prof))}
    report["oldCap"] = {k: round(v, 3) for k, v in old.items()}
    report["ball"] = [round(ball_radius, 3), round(float(half), 3)]
    return report
