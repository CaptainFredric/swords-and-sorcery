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
        f"UpperArmPlate.{side}", f"Vambrace.{side}", f"VambraceFacet.{side}",
        f"Gauntlet.{side}", f"GauntletCuff.{side}",
    }
    parts: list[bpy.types.Object] = []

    upper = _segment_shell(
        f"UpperArmPlate.{side}",
        (0.485 * sign, 0.0, 1.405),
        (0.705 * sign, 0.0, 1.165),
        start_width=0.145,
        end_width=0.115,
        start_depth=0.155,
        end_depth=0.120,
        material=materials["DarkSteel"],
        bulge=1.08,
    )
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))

    forearm = _segment_shell(
        f"Vambrace.{side}",
        (0.700 * sign, 0.010, 1.145),
        (0.885 * sign, 0.035, 0.900),
        start_width=0.145,
        end_width=0.105,
        start_depth=0.155,
        end_depth=0.115,
        material=materials["DarkSteel"],
        bulge=1.07,
    )
    parts.append(_rigid(forearm, armature, f"forearm.{side}"))

    ridge = _xz_prism(
        f"VambraceFacet.{side}",
        ((0.705 * sign, 1.135), (0.780 * sign, 1.125),
         (0.900 * sign, 0.930), (0.865 * sign, 0.900),
         (0.790 * sign, 0.985)),
        front_y=0.175,
        back_y=0.145,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(ridge, armature, f"forearm.{side}"))

    cuff = _segment_shell(
        f"GauntletCuff.{side}",
        (0.842 * sign, 0.028, 0.970),
        (0.885 * sign, 0.036, 0.910),
        start_width=0.132,
        end_width=0.125,
        start_depth=0.140,
        end_depth=0.132,
        material=materials["Brass"],
        bulge=1.0,
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))

    hand = _segment_shell(
        f"Gauntlet.{side}",
        (0.885 * sign, 0.036, 0.900),
        (0.970 * sign, 0.055, 0.785),
        start_width=0.115,
        end_width=0.100,
        start_depth=0.125,
        end_depth=0.112,
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
            (0.525, center_x, 0.125, 0.130, -0.105, 0.012),
            (0.690, center_x, 0.160, 0.175, -0.135, 0.022),
            (0.845, center_x, 0.170, 0.165, -0.130, 0.020),
            (0.895, center_x, 0.145, 0.140, -0.115, 0.012),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))

    cuisse_facet = _xz_prism(
        f"CuisseFacet.{side}",
        ((0.125 * sign, 0.835), (0.305 * sign, 0.820),
         (0.325 * sign, 0.700), (0.275 * sign, 0.565),
         (0.150 * sign, 0.575)),
        front_y=0.205,
        back_y=0.175,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(cuisse_facet, armature, f"thigh.{side}"))

    knee = _xz_prism(
        f"KneePlate.{side}",
        ((0.105 * sign, 0.565), (0.325 * sign, 0.560),
         (0.350 * sign, 0.500), (0.310 * sign, 0.430),
         (0.120 * sign, 0.435)),
        front_y=0.220,
        back_y=0.095,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(knee, armature, f"shin.{side}"))

    greave = _ring_shell(
        f"Greave.{side}",
        (
            (0.115, center_x, 0.102, 0.135, -0.085, 0.012),
            (0.265, center_x, 0.132, 0.160, -0.100, 0.020),
            (0.425, center_x, 0.145, 0.170, -0.110, 0.024),
            (0.495, center_x, 0.132, 0.145, -0.100, 0.016),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    greave_facet = _xz_prism(
        f"GreaveFacet.{side}",
        ((0.145 * sign, 0.455), (0.285 * sign, 0.440),
         (0.300 * sign, 0.325), (0.255 * sign, 0.165),
         (0.165 * sign, 0.165)),
        front_y=0.205,
        back_y=0.180,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(greave_facet, armature, f"shin.{side}"))

    boot = _ring_shell(
        f"Boot.{side}",
        (
            (0.045, center_x, 0.155, 0.355, -0.090, 0.012),
            (0.105, center_x, 0.170, 0.390, -0.105, 0.020),
            (0.175, center_x, 0.158, 0.325, -0.105, 0.018),
            (0.245, center_x, 0.132, 0.220, -0.100, 0.012),
            (0.290, center_x, 0.112, 0.165, -0.092, 0.006),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(boot, armature, f"foot.{side}"))

    toe = _ring_shell(
        f"BootFacet.{side}",
        (
            (0.070, center_x, 0.148, 0.397, 0.295, 0.006),
            (0.125, center_x, 0.158, 0.405, 0.290, 0.008),
            (0.172, center_x, 0.140, 0.340, 0.255, 0.004),
        ),
        materials["SteelEdge"],
    )
    parts.append(_rigid(toe, armature, f"foot.{side}"))

    ankle = _ring_shell(
        f"BootAnkleTrim.{side}",
        (
            (0.235, center_x, 0.145, 0.205, -0.108, 0.006),
            (0.285, center_x, 0.132, 0.185, -0.100, 0.004),
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
    """Replace traced limb slabs with faceted armor volumes aligned to the rig."""
    for side in ("L", "R"):
        arm_parts, arm_names = _arm_shells(side, armature, materials)
        model = _replace_named(model, arm_parts, arm_names)
        leg_parts, leg_names = _leg_shells(side, armature, materials)
        model = _replace_named(model, leg_parts, leg_names)
    return model
