from __future__ import annotations

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
    """Chamfered rectangular cross-section for hard-surface limb armor."""
    points = (
        center - lateral * (width * 0.58) + forward * depth,
        center + lateral * (width * 0.58) + forward * depth,
        center + lateral * width + forward * (depth * 0.36),
        center + lateral * width - forward * (depth * 0.68),
        center + lateral * (width * 0.55) - forward * depth,
        center - lateral * (width * 0.55) - forward * depth,
        center - lateral * width - forward * (depth * 0.68),
        center - lateral * width + forward * (depth * 0.36),
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
    bulge: float = 1.0,
) -> bpy.types.Object:
    """Build a two-section tapered armor cage; no rounded middle bulge."""
    a = Vector(start)
    b = Vector(end)
    axis = (b - a).normalized()
    forward = Vector((0.0, 1.0, 0.0))
    lateral = forward.cross(axis).normalized()

    rings = (
        _segment_ring(a, lateral, forward, start_width, start_depth),
        _segment_ring(b, lateral, forward, end_width, end_depth),
    )

    vertices = [point for ring in rings for point in ring]
    count = 8
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
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

    upper_under = _segment_shell(
        f"UnderUpperArm.{side}",
        (0.405 * sign, 0.0, 1.485), (0.600 * sign, 0.0, 1.235),
        start_width=0.090, end_width=0.080,
        start_depth=0.100, end_depth=0.090,
        material=materials["Leather"],
    )
    parts.append(_rigid(upper_under, armature, f"upper_arm.{side}"))

    fore_under = _segment_shell(
        f"UnderForearm.{side}",
        (0.600 * sign, 0.0, 1.225), (0.740 * sign, 0.035, 0.945),
        start_width=0.080, end_width=0.070,
        start_depth=0.090, end_depth=0.080,
        material=materials["Leather"],
    )
    parts.append(_rigid(fore_under, armature, f"forearm.{side}"))

    upper = _segment_shell(
        f"UpperArmPlate.{side}",
        (0.405 * sign, 0.0, 1.470), (0.600 * sign, 0.0, 1.235),
        start_width=0.150, end_width=0.118,
        start_depth=0.165, end_depth=0.125,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))

    forearm = _segment_shell(
        f"Vambrace.{side}",
        (0.600 * sign, 0.010, 1.220), (0.740 * sign, 0.035, 0.945),
        start_width=0.150, end_width=0.108,
        start_depth=0.160, end_depth=0.118,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(forearm, armature, f"forearm.{side}"))

    ridge = _xz_prism(
        f"VambraceFacet.{side}",
        ((0.605 * sign, 1.205), (0.660 * sign, 1.185),
         (0.750 * sign, 0.985), (0.735 * sign, 0.945),
         (0.675 * sign, 1.035)),
        front_y=0.180, back_y=0.148, material=materials["SteelEdge"],
    )
    parts.append(_rigid(ridge, armature, f"forearm.{side}"))

    cuff = _segment_shell(
        f"GauntletCuff.{side}",
        (0.700 * sign, 0.030, 1.010), (0.742 * sign, 0.036, 0.945),
        start_width=0.136, end_width=0.128,
        start_depth=0.145, end_depth=0.135,
        material=materials["Brass"],
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))

    hand = _segment_shell(
        f"Gauntlet.{side}",
        (0.742 * sign, 0.036, 0.940), (0.792 * sign, 0.085, 0.805),
        start_width=0.120, end_width=0.105,
        start_depth=0.130, end_depth=0.115,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(hand, armature, f"hand.{side}"))
    return parts, names


def _leg_shells(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    hip_x = 0.19 * sign
    knee_x = 0.25 * sign
    ankle_x = 0.28 * sign
    names = {
        f"Cuisse.{side}", f"CuisseFacet.{side}", f"KneePlate.{side}",
        f"Greave.{side}", f"GreaveFacet.{side}", f"Boot.{side}",
        f"BootFacet.{side}", f"BootAnkleTrim.{side}",
    }
    parts: list[bpy.types.Object] = []

    cuisse = _segment_shell(
        f"Cuisse.{side}", (hip_x, 0.0, 0.995), (knee_x, 0.0, 0.625),
        start_width=0.165, end_width=0.135,
        start_depth=0.165, end_depth=0.130,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))

    cuisse_facet = _xz_prism(
        f"CuisseFacet.{side}",
        ((0.105 * sign, 0.950), (0.325 * sign, 0.920),
         (0.345 * sign, 0.785), (0.305 * sign, 0.640),
         (0.165 * sign, 0.650)),
        front_y=0.205, back_y=0.176, material=materials["SteelEdge"],
    )
    parts.append(_rigid(cuisse_facet, armature, f"thigh.{side}"))

    knee = _xz_prism(
        f"KneePlate.{side}",
        ((0.145 * sign, 0.635), (0.350 * sign, 0.625),
         (0.375 * sign, 0.565), (0.338 * sign, 0.495),
         (0.165 * sign, 0.500)),
        front_y=0.225, back_y=0.098, material=materials["SteelEdge"],
    )
    parts.append(_rigid(knee, armature, f"shin.{side}"))

    greave = _segment_shell(
        f"Greave.{side}", (knee_x, 0.0, 0.530), (ankle_x, 0.0, 0.165),
        start_width=0.150, end_width=0.110,
        start_depth=0.165, end_depth=0.118,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    greave_facet = _xz_prism(
        f"GreaveFacet.{side}",
        ((0.150 * sign, 0.505), (0.355 * sign, 0.490),
         (0.370 * sign, 0.365), (0.335 * sign, 0.190),
         (0.205 * sign, 0.195)),
        front_y=0.210, back_y=0.180, material=materials["SteelEdge"],
    )
    parts.append(_rigid(greave_facet, armature, f"shin.{side}"))

    boot = _ring_shell(
        f"Boot.{side}",
        (
            (0.005, ankle_x, 0.150, 0.350, -0.090, 0.010),
            (0.100, ankle_x, 0.165, 0.390, -0.105, 0.018),
            (0.180, ankle_x, 0.150, 0.300, -0.105, 0.014),
            (0.265, ankle_x, 0.112, 0.165, -0.090, 0.006),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(boot, armature, f"foot.{side}"))

    toe = _ring_shell(
        f"BootFacet.{side}",
        (
            (0.055, ankle_x, 0.140, 0.400, 0.275, 0.005),
            (0.115, ankle_x, 0.150, 0.405, 0.270, 0.006),
            (0.165, ankle_x, 0.130, 0.330, 0.235, 0.003),
        ),
        materials["SteelEdge"],
    )
    parts.append(_rigid(toe, armature, f"foot.{side}"))

    ankle = _ring_shell(
        f"BootAnkleTrim.{side}",
        ((0.215, ankle_x, 0.140, 0.205, -0.105, 0.004),
         (0.270, ankle_x, 0.126, 0.180, -0.098, 0.003)),
        materials["Brass"],
    )
    parts.append(_rigid(ankle, armature, f"shin.{side}"))
    return parts, names


def rebuild_hero_limbs(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace legacy limb slabs with hard-surface volumes matched to the rig."""
    for side in ("L", "R"):
        arm_parts, arm_names = _arm_shells(side, armature, materials)
        model = _replace_named(model, arm_parts, arm_names)
        leg_parts, leg_names = _leg_shells(side, armature, materials)
        model = _replace_named(model, leg_parts, leg_names)
    return model
