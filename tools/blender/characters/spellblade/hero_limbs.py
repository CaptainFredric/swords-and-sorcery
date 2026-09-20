from __future__ import annotations

from collections.abc import Sequence

import bpy
from mathutils import Vector

from .hero_shells import _mesh_object, _replace_named, _ring_shell, _xz_prism
from .model import ModelParts, _rigid


def _segment_ring(
    center: Vector,
    lateral: Vector,
    forward: Vector,
    width: float,
    depth: float,
) -> tuple[tuple[float, float, float], ...]:
    """Eight-point faceted cross-section around a diagonal limb axis."""
    points = (
        center + forward * (depth * 1.08),
        center + lateral * (width * 0.70) + forward * (depth * 0.70),
        center + lateral * width,
        center + lateral * (width * 0.72) - forward * (depth * 0.78),
        center - forward * depth,
        center - lateral * (width * 0.72) - forward * (depth * 0.78),
        center - lateral * width,
        center - lateral * (width * 0.70) + forward * (depth * 0.70),
    )
    return tuple((point.x, point.y, point.z) for point in points)


def _segment_shell(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    *,
    start_width: float,
    end_width: float,
    start_depth: float,
    end_depth: float,
    material: bpy.types.Material,
    bulge: float = 1.06,
) -> bpy.types.Object:
    """Build a tapered low-poly armor shell around the actual limb direction."""
    a = Vector(start)
    b = Vector(end)
    axis = (b - a).normalized()
    forward = Vector((0.0, 1.0, 0.0))
    lateral = forward.cross(axis).normalized()
    middle = a.lerp(b, 0.52)

    rings = (
        _segment_ring(a, lateral, forward, start_width, start_depth),
        _segment_ring(
            middle,
            lateral,
            forward,
            max(start_width, end_width) * bulge,
            max(start_depth, end_depth) * bulge,
        ),
        _segment_ring(b, lateral, forward, end_width, end_depth),
    )

    vertices = [point for ring in rings for point in ring]
    count = 8
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple((len(rings) - 1) * count + index for index in range(count)),
    ]
    for ring_index in range(len(rings) - 1):
        lower = ring_index * count
        upper = (ring_index + 1) * count
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((lower + index, lower + nxt, upper + nxt, upper + index))
    return _mesh_object(name, vertices, faces, material)


def _arm_shells(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    names = {
        f"UnderUpperArm.{side}", f"UnderForearm.{side}",
        f"UpperArmPlate.{side}", f"Vambrace.{side}", f"VambraceFacet.{side}",
        f"Gauntlet.{side}", f"GauntletCuff.{side}",
    }
    parts: list[bpy.types.Object] = []

    # These coordinates intentionally match design.py's edit-bone endpoints.
    # The previous hero geometry still used the older, much wider arm chain, so
    # the visible armor pivoted around a different skeleton than the one exported.
    upper_under = _segment_shell(
        f"UnderUpperArm.{side}",
        (0.405 * sign, 0.0, 1.485),
        (0.600 * sign, 0.0, 1.235),
        start_width=0.090,
        end_width=0.080,
        start_depth=0.100,
        end_depth=0.090,
        material=materials["Leather"],
        bulge=1.03,
    )
    parts.append(_rigid(upper_under, armature, f"upper_arm.{side}"))

    fore_under = _segment_shell(
        f"UnderForearm.{side}",
        (0.600 * sign, 0.0, 1.225),
        (0.740 * sign, 0.035, 0.945),
        start_width=0.080,
        end_width=0.070,
        start_depth=0.090,
        end_depth=0.080,
        material=materials["Leather"],
        bulge=1.02,
    )
    parts.append(_rigid(fore_under, armature, f"forearm.{side}"))

    upper = _segment_shell(
        f"UpperArmPlate.{side}",
        (0.405 * sign, 0.0, 1.470),
        (0.600 * sign, 0.0, 1.235),
        start_width=0.150,
        end_width=0.118,
        start_depth=0.165,
        end_depth=0.125,
        material=materials["DarkSteel"],
        bulge=1.07,
    )
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))

    forearm = _segment_shell(
        f"Vambrace.{side}",
        (0.600 * sign, 0.010, 1.220),
        (0.740 * sign, 0.035, 0.945),
        start_width=0.150,
        end_width=0.108,
        start_depth=0.160,
        end_depth=0.118,
        material=materials["DarkSteel"],
        bulge=1.06,
    )
    parts.append(_rigid(forearm, armature, f"forearm.{side}"))

    ridge = _xz_prism(
        f"VambraceFacet.{side}",
        ((0.605 * sign, 1.205), (0.660 * sign, 1.185),
         (0.750 * sign, 0.985), (0.735 * sign, 0.945),
         (0.675 * sign, 1.035)),
        front_y=0.180,
        back_y=0.148,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(ridge, armature, f"forearm.{side}"))

    cuff = _segment_shell(
        f"GauntletCuff.{side}",
        (0.700 * sign, 0.030, 1.010),
        (0.742 * sign, 0.036, 0.945),
        start_width=0.136,
        end_width=0.128,
        start_depth=0.145,
        end_depth=0.135,
        material=materials["Brass"],
        bulge=1.0,
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))

    hand = _segment_shell(
        f"Gauntlet.{side}",
        (0.742 * sign, 0.036, 0.940),
        (0.792 * sign, 0.085, 0.805),
        start_width=0.120,
        end_width=0.105,
        start_depth=0.130,
        end_depth=0.115,
        material=materials["DarkSteel"],
        bulge=1.04,
    )
    parts.append(_rigid(hand, armature, f"hand.{side}"))
    return parts, names


def _leg_shells(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    center_x = 0.215 * sign
    names = {
        f"Cuisse.{side}", f"CuisseFacet.{side}", f"KneePlate.{side}",
        f"Greave.{side}", f"GreaveFacet.{side}", f"Boot.{side}",
        f"BootFacet.{side}", f"BootAnkleTrim.{side}",
    }
    parts: list[bpy.types.Object] = []

    cuisse = _ring_shell(
        f"Cuisse.{side}",
        (
            (0.515, center_x, 0.135, 0.140, -0.110, 0.012),
            (0.680, center_x, 0.175, 0.185, -0.140, 0.024),
            (0.835, center_x, 0.185, 0.180, -0.138, 0.024),
            (0.895, center_x, 0.155, 0.150, -0.120, 0.014),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))

    cuisse_facet = _xz_prism(
        f"CuisseFacet.{side}",
        ((0.115 * sign, 0.840), (0.315 * sign, 0.825),
         (0.340 * sign, 0.700), (0.285 * sign, 0.555),
         (0.140 * sign, 0.570)),
        front_y=0.215,
        back_y=0.180,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(cuisse_facet, armature, f"thigh.{side}"))

    knee = _xz_prism(
        f"KneePlate.{side}",
        ((0.095 * sign, 0.570), (0.335 * sign, 0.565),
         (0.365 * sign, 0.500), (0.320 * sign, 0.425),
         (0.110 * sign, 0.430)),
        front_y=0.230,
        back_y=0.095,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(knee, armature, f"shin.{side}"))

    greave = _ring_shell(
        f"Greave.{side}",
        (
            (0.110, center_x, 0.112, 0.145, -0.090, 0.012),
            (0.255, center_x, 0.145, 0.170, -0.105, 0.020),
            (0.410, center_x, 0.158, 0.182, -0.115, 0.026),
            (0.495, center_x, 0.145, 0.155, -0.105, 0.018),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    greave_facet = _xz_prism(
        f"GreaveFacet.{side}",
        ((0.135 * sign, 0.460), (0.295 * sign, 0.445),
         (0.315 * sign, 0.325), (0.265 * sign, 0.155),
         (0.155 * sign, 0.155)),
        front_y=0.215,
        back_y=0.185,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(greave_facet, armature, f"shin.{side}"))

    boot = _ring_shell(
        f"Boot.{side}",
        (
            (0.005, center_x, 0.170, 0.360, -0.095, 0.012),
            (0.095, center_x, 0.185, 0.405, -0.110, 0.022),
            (0.165, center_x, 0.175, 0.350, -0.110, 0.020),
            (0.235, center_x, 0.145, 0.235, -0.105, 0.014),
            (0.285, center_x, 0.120, 0.175, -0.095, 0.008),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(boot, armature, f"foot.{side}"))

    toe = _ring_shell(
        f"BootFacet.{side}",
        (
            (0.060, center_x, 0.160, 0.412, 0.300, 0.006),
            (0.115, center_x, 0.172, 0.420, 0.295, 0.008),
            (0.165, center_x, 0.152, 0.355, 0.260, 0.004),
        ),
        materials["SteelEdge"],
    )
    parts.append(_rigid(toe, armature, f"foot.{side}"))

    ankle = _ring_shell(
        f"BootAnkleTrim.{side}",
        (
            (0.225, center_x, 0.155, 0.220, -0.112, 0.006),
            (0.282, center_x, 0.140, 0.190, -0.102, 0.004),
        ),
        materials["Brass"],
    )
    parts.append(_rigid(ankle, armature, f"shin.{side}"))
    return parts, names


def rebuild_hero_limbs(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace legacy limb slabs with armor volumes that match the exported rig."""
    for side in ("L", "R"):
        arm_parts, arm_names = _arm_shells(side, armature, materials)
        model = _replace_named(model, arm_parts, arm_names)
        leg_parts, leg_names = _leg_shells(side, armature, materials)
        model = _replace_named(model, leg_parts, leg_names)
    return model
