"""The Spellblade's sword, forged to the concept's weapon sheet (part of parts.py and look.py).

Rodin's sword was a broad flat slab, 22 cm across, with a pale tan guard and a stub of grip fused into the fist; the
concept's is a chunky but shaped knightly blade. This replaces it, keeping what the game relies on: the part's name
(HeroSword), its grip axis, where the guard sits in the fist, the reach of its point, the flat's turn in the hand and
its one rigid bone (hand.R). Every face is flat-shaded, as the rest of the armour is.

- Blade: a raised central ridge and bevelled edges (an eight-sided section: edge, bevel, flat, ridge), a short
  squared ricasso at the guard, a gentle taper and a long chisel point.
- Guard: a straight brass bar with blocked, pyramid-capped ends, a diamond frame over the blade's root, and a red gem
  standing proud of it on both faces.
- Grip and pommel: dark leather between two brass collars, and a faceted brass pommel below the fist.

Colours come from nine small swatches painted into the atlas's one free square (SWATCH_REGION; `paint_swatches` runs in
look.py after the atlas's lift for the game's light), so the sword stays in the one GameBody material, its sky
reflection and its Steel sheen, at no extra draw call.
"""
from __future__ import annotations

import math

import numpy as np

# the atlas's free square (Blender UVs, origin bottom left), checked free of every other face at build time
SWATCH_REGION = (0.295, 0.233, 0.361, 0.299)
# (sRGB, as painted after the lift; roughness; metalness before look.py's METAL_SCALE)
SWATCHES = {
    "steelLight": ((0.74, 0.77, 0.82), 0.30, 0.90),
    "steel": ((0.52, 0.56, 0.62), 0.34, 0.90),
    "steelDark": ((0.33, 0.36, 0.41), 0.40, 0.85),
    "brassLight": ((0.88, 0.72, 0.44), 0.30, 0.90),
    "brass": ((0.70, 0.52, 0.27), 0.36, 0.90),
    "brassDark": ((0.44, 0.31, 0.15), 0.45, 0.85),
    "gem": ((0.86, 0.12, 0.13), 0.18, 0.10),
    "gemDark": ((0.45, 0.04, 0.07), 0.25, 0.10),
    "leather": ((0.22, 0.15, 0.11), 0.80, 0.0),
}
SWATCH_ORDER = tuple(SWATCHES)

# metres, along the blade's centreline from the guard's centre, across its width and through its thickness
RICASSO = 0.045
BLADE_WIDTH = (0.108, 0.134, 0.112)      # at the ricasso, just above it, and where the point begins
POINT = 0.23                             # length of the chisel point
BEVEL = 0.024                            # width of each edge bevel
RIDGE = (0.027, 0.017)                   # thickness at the ridge: at the guard and where the point begins
EDGE = 0.004                             # thickness at the very edge
GUARD_HALF = 0.18                        # half the bar's span (to the end blocks' outer faces)
GUARD_BAR = (0.042, 0.046)               # the bar's depth along the blade and its thickness
GUARD_END = (0.056, 0.064, 0.054)        # end block: width, depth along the blade, thickness
GUARD_CAP = 0.034                        # the end blocks' pyramid caps
DIAMOND = (0.095, 0.050, 0.070, 0.056)   # the frame: up the blade, down toward the grip, half width, thickness
GEM = 0.62                               # the gem's size as a share of the frame
GRIP = (0.15, 0.025, 0.031, 0.013)       # length (a fist of four fingers between the collars), radius, collars
POMMEL = (0.043, 0.032, 0.05)            # belt radius, height above the belt, below it
SIDES = 8


def swatch_uv(name: str) -> tuple[float, float]:
    x0, y0, x1, y1 = SWATCH_REGION
    i = SWATCH_ORDER.index(name)
    cell = (x1 - x0) / 3
    return (x0 + cell * (i % 3 + 0.5), y0 + cell * (i // 3 + 0.5))


def check_region_free(uv_sets) -> int:
    """The number of face corners of the other parts that fall in the swatch region (must be none)."""
    x0, y0, x1, y1 = SWATCH_REGION
    hits = 0
    for uv in uv_sets:
        u, v = uv[:, 0] % 1.0, uv[:, 1] % 1.0
        hits += int(((u > x0) & (u < x1) & (v > y0) & (v < y1)).sum())
    return hits


def paint_swatches(diffuse: np.ndarray, metal: np.ndarray, metal_scale: float) -> None:
    """Paint each swatch's cell (pixel rows run from the bottom, as Blender stores them)."""
    x0, y0, x1, y1 = SWATCH_REGION
    for pixels, kind in ((diffuse, "colour"), (metal, "metal")):
        height, width = pixels.shape[:2]
        cell = (x1 - x0) / 3
        for i, name in enumerate(SWATCH_ORDER):
            colour, roughness, metalness = SWATCHES[name]
            ux, vy = x0 + cell * (i % 3), y0 + cell * (i // 3)
            c0, c1 = int(math.floor(ux * width)), int(math.ceil((ux + cell) * width))
            r0, r1 = int(math.floor(vy * height)), int(math.ceil((vy + cell) * height))
            if kind == "colour":
                pixels[r0:r1, c0:c1, :3] = colour
            else:
                pixels[r0:r1, c0:c1, 1] = roughness
                pixels[r0:r1, c0:c1, 2] = metalness * metal_scale


def _frame(axis, width_dir):
    a = np.asarray(axis, float)
    a /= np.linalg.norm(a)
    u = np.asarray(width_dir, float)
    u = u - a * (u @ a)
    u /= np.linalg.norm(u)
    return a, u, np.cross(a, u)


def forge(build, origin, axis, width_dir, guard_at: float, tip_at: float) -> dict:
    """Build the sword with `build`'s vert(point)/face(verts, swatch) calls. Positions: origin + axis * along."""
    a, u, v = _frame(axis, width_dir)
    o = np.asarray(origin, float)

    def at(along, across=0.0, through=0.0):
        return o + a * along + u * across + v * through

    vert, face = build
    g = guard_at
    length = tip_at - g

    # --- blade ---------------------------------------------------------------------------------------------
    point_start = length - POINT
    stations = [  # (along from the guard, width, ridge thickness)
        (0.0, BLADE_WIDTH[0], RIDGE[0]),
        (RICASSO, BLADE_WIDTH[0], RIDGE[0]),
        (RICASSO + 0.012, BLADE_WIDTH[1], RIDGE[0]),
        (point_start * 0.55, (BLADE_WIDTH[1] + BLADE_WIDTH[2]) / 2 + 0.002, (RIDGE[0] + RIDGE[1]) / 2),
        (point_start, BLADE_WIDTH[2], RIDGE[1]),
        (point_start + POINT * 0.55, BLADE_WIDTH[2] * 0.52, RIDGE[1] * 0.7),
    ]
    rings = []
    for s, width, ridge in stations:
        half = width / 2
        bevel = min(BEVEL, half * 0.45)
        shoulder = max(EDGE, ridge * 0.55)
        section = [(half, 0.0), (half - bevel, shoulder / 2), (0.0, ridge / 2), (-half + bevel, shoulder / 2),
                   (-half, 0.0), (-half + bevel, -shoulder / 2), (0.0, -ridge / 2), (half - bevel, -shoulder / 2)]
        rings.append([vert(at(g + s, x, y)) for x, y in section])
    # the faces between rings: bevels light, flats steel; the underside of each the darker of the two
    tone = ["steelLight", "steel", "steel", "steelLight", "steelLight", "steel", "steel", "steelLight"]
    for lower, upper in zip(rings, rings[1:]):
        for k in range(SIDES):
            j = (k + 1) % SIDES
            face([lower[k], lower[j], upper[j], upper[k]], tone[k])
    tip = vert(at(tip_at))
    for k in range(SIDES):
        face([rings[-1][k], rings[-1][(k + 1) % SIDES], tip], tone[k])
    face(list(reversed(rings[0])), "steelDark")       # (inside the guard)

    # --- guard ---------------------------------------------------------------------------------------------
    def box(c_along, c_across, c_through, half_along, half_across, half_through, top, sides, bottom):
        corners = {}
        for i in (-1, 1):
            for j in (-1, 1):
                for k in (-1, 1):
                    corners[i, j, k] = vert(at(c_along + i * half_along, c_across + j * half_across,
                                               c_through + k * half_through))
        c = corners
        face([c[1, -1, -1], c[1, 1, -1], c[1, 1, 1], c[1, -1, 1]], top)          # toward the point
        face([c[-1, -1, -1], c[-1, -1, 1], c[-1, 1, 1], c[-1, 1, -1]], bottom)   # toward the pommel
        face([c[-1, -1, 1], c[1, -1, 1], c[1, 1, 1], c[-1, 1, 1]], sides)        # the faces
        face([c[-1, -1, -1], c[-1, 1, -1], c[1, 1, -1], c[1, -1, -1]], sides)
        face([c[-1, 1, -1], c[-1, 1, 1], c[1, 1, 1], c[1, 1, -1]], sides)        # the ends
        face([c[-1, -1, -1], c[1, -1, -1], c[1, -1, 1], c[-1, -1, 1]], sides)
        return c

    bar_end = GUARD_HALF - GUARD_END[0]
    box(g, 0.0, 0.0, GUARD_BAR[0] / 2, bar_end, GUARD_BAR[1] / 2, "brassLight", "brass", "brassDark")
    for side in (-1, 1):
        centre = side * (GUARD_HALF - GUARD_END[0] / 2)
        c = box(g + 0.004, centre, 0.0, GUARD_END[1] / 2, GUARD_END[0] / 2, GUARD_END[2] / 2,
                "brassLight", "brass", "brassDark")
        # the pyramid cap on its outer face
        apex = vert(at(g + 0.004, side * (GUARD_HALF + GUARD_CAP)))
        outer = [c[i, side, k] for i, k in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for k in range(4):
            face([outer[k], outer[(k + 1) % 4], apex], "brassLight" if k % 2 else "brass")
    # the diamond frame over the blade's root, and its gem standing proud on both faces
    up, down, half_w, thick = DIAMOND
    centre = g + (up - down) / 2
    tips = [(g + up, 0.0), (centre, half_w), (g - down, 0.0), (centre, -half_w)]
    for side in (-1, 1):
        ring = [vert(at(al, ac, side * thick / 2)) for al, ac in tips]
        inner = [vert(at(centre + (al - centre) * GEM, ac * GEM, side * thick / 2)) for al, ac in tips]
        for k in range(4):
            j = (k + 1) % 4
            face([ring[k], ring[j], inner[j], inner[k]], "brassLight" if k < 2 else "brass")
        apex = vert(at(centre, 0.0, side * (thick / 2 + 0.012)))
        for k in range(4):
            face([inner[k], inner[(k + 1) % 4], apex], "gem" if k < 2 else "gemDark")
        if side == -1:
            back = ring
        else:
            front = ring
    for k in range(4):
        j = (k + 1) % 4
        face([back[k], back[j], front[j], front[k]], "brass" if k < 2 else "brassDark")

    # --- grip, collars and pommel --------------------------------------------------------------------------
    length_g, radius, collar_r, collar_l = GRIP
    top, bottom = g - GUARD_BAR[0] / 2, g - GUARD_BAR[0] / 2 - length_g
    angles = [2 * math.pi * (k + 0.5) / SIDES for k in range(SIDES)]

    def tube(a0, a1, r0, r1, swatch, cap0=None, cap1=None):
        lower = [vert(at(a0, r0 * math.cos(t), r0 * math.sin(t))) for t in angles]
        upper = [vert(at(a1, r1 * math.cos(t), r1 * math.sin(t))) for t in angles]
        for k in range(SIDES):
            j = (k + 1) % SIDES
            face([lower[k], lower[j], upper[j], upper[k]], swatch)
        if cap0:
            face(list(reversed(lower)), cap0)
        if cap1:
            face(upper, cap1)

    tube(bottom + collar_l, top - collar_l, radius, radius, "leather")
    tube(top - collar_l, top, collar_r, collar_r, "brass", cap0="brassDark", cap1="brassLight")
    tube(bottom, bottom + collar_l, collar_r, collar_r, "brass", cap0="brassDark", cap1="brassLight")
    belt_r, above, below = POMMEL
    belt_at = bottom - above
    belt = [vert(at(belt_at, belt_r * math.cos(t), belt_r * math.sin(t))) for t in angles]
    neck = [vert(at(bottom, collar_r * 0.8 * math.cos(t), collar_r * 0.8 * math.sin(t))) for t in angles]
    end = vert(at(belt_at - below))
    for k in range(SIDES):
        j = (k + 1) % SIDES
        face([belt[k], belt[j], neck[j], neck[k]], "brassLight" if k % 2 else "brass")
        face([belt[j], belt[k], end], "brass" if k % 2 else "brassDark")
    return {"blade": round(length, 3), "tipAlong": round(tip_at, 3), "guardAlong": round(g, 3),
            "pommelEnd": round(belt_at - below, 3), "guardSpan": round(2 * (GUARD_HALF + GUARD_CAP), 3)}
