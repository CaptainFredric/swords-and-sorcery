from __future__ import annotations

from collections.abc import Sequence

import bpy

from .concept_refinement import _profile_slab
from .model import ModelParts, _rigid


def _profile_slab_yz(
    name: str,
    profile_yz: Sequence[tuple[float, float]],
    *,
    center_x: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Extrude an authored Y/Z silhouette into a thin side armor shell."""
    if len(profile_yz) < 3:
        raise ValueError(f"{name} profile requires at least three points")
    if thickness <= 0.0:
        raise ValueError(f"{name} thickness must be positive")

    area2 = sum(
        y0 * z1 - y1 * z0
        for (y0, z0), (y1, z1) in zip(profile_yz, (*profile_yz[1:], profile_yz[0]))
    )
    ordered = tuple(profile_yz if area2 > 0.0 else reversed(profile_yz))
    half = thickness * 0.5
    count = len(ordered)
    vertices = [
        *((center_x + half, y, z) for y, z in ordered),
        *((center_x - half, y, z) for y, z in ordered),
    ]
    faces: list[tuple[int, ...]] = [
        tuple(range(count)),
        tuple(reversed(range(count, count * 2))),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def _back_armor(armature: bpy.types.Object, model: ModelParts) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The concept's rear torso is still armored beneath the cloth. This plate
    # deliberately follows the same compact shoulder-to-waist taper as the
    # front breastplate rather than exposing the old rectangular under-torso.
    back_plate = _profile_slab(
        "BackHeroPlate",
        (
            (-0.345, 1.535),
            (0.345, 1.535),
            (0.330, 1.405),
            (0.275, 1.235),
            (0.205, 1.100),
            (0.000, 1.055),
            (-0.205, 1.100),
            (-0.275, 1.235),
            (-0.330, 1.405),
        ),
        center_y=-0.245,
        thickness=0.085,
        material=materials["DarkSteel"],
    )
    additions.append(_rigid(back_plate, armature, "chest"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _profile_slab(
            f"BackHeroFacet.{side}",
            (
                (0.305 * sign, 1.470),
                (0.070 * sign, 1.455),
                (0.060 * sign, 1.155),
                (0.180 * sign, 1.185),
                (0.270 * sign, 1.315),
            ),
            center_y=-0.294,
            thickness=0.018,
            material=materials["SteelEdge"],
        )
        additions.append(_rigid(facet, armature, "chest"))
    return additions


def _cape(armature: bpy.types.Object, model: ModelParts) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The rear concept has a broad crimson mantle narrowing into a long central
    # panel. The top is chest-bound; the lower panel follows the existing cloth
    # chain so later animation can move it independently from the breastplate.
    mantle = _profile_slab(
        "CapeHeroMantle",
        (
            (-0.365, 1.600),
            (0.365, 1.600),
            (0.335, 1.515),
            (0.265, 1.455),
            (0.000, 1.405),
            (-0.265, 1.455),
            (-0.335, 1.515),
        ),
        center_y=-0.355,
        thickness=0.050,
        material=materials["CrimsonCloth"],
    )
    additions.append(_rigid(mantle, armature, "chest"))

    cape = _profile_slab(
        "CapeHeroBack",
        (
            (-0.285, 1.485),
            (0.285, 1.485),
            (0.270, 0.790),
            (0.205, 0.705),
            (0.060, 0.665),
            (0.000, 0.620),
            (-0.060, 0.665),
            (-0.205, 0.705),
            (-0.270, 0.790),
        ),
        center_y=-0.370,
        thickness=0.042,
        material=materials["CrimsonCloth"],
    )
    additions.append(_rigid(cape, armature, "tabard_back_01"))

    # Thin brass edge profiles reproduce the clearly drawn border without
    # flattening the entire cape into a bright frame.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _profile_slab(
            f"CapeHeroTrim.{side}",
            (
                (0.285 * sign, 1.465),
                (0.247 * sign, 1.455),
                (0.235 * sign, 0.800),
                (0.190 * sign, 0.735),
                (0.215 * sign, 0.705),
                (0.270 * sign, 0.785),
            ),
            center_y=-0.397,
            thickness=0.014,
            material=materials["Brass"],
        )
        additions.append(_rigid(trim, armature, "tabard_back_01"))

    sigil = _profile_slab(
        "CapeHeroSigil",
        (
            (0.000, 1.305),
            (0.055, 1.225),
            (0.026, 1.180),
            (0.026, 1.080),
            (0.080, 1.125),
            (0.096, 1.090),
            (0.000, 0.985),
            (-0.096, 1.090),
            (-0.080, 1.125),
            (-0.026, 1.080),
            (-0.026, 1.180),
            (-0.055, 1.225),
        ),
        center_y=-0.401,
        thickness=0.012,
        material=materials["Brass"],
    )
    additions.append(_rigid(sigil, armature, "tabard_back_01"))
    return additions


def _side_depth(armature: bpy.types.Object, model: ModelParts) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        helmet = _profile_slab_yz(
            f"HelmetSideShell.{side}",
            (
                (-0.205, 1.985),
                (0.095, 2.025),
                (0.255, 1.925),
                (0.300, 1.820),
                (0.245, 1.690),
                (0.050, 1.650),
                (-0.175, 1.700),
            ),
            center_x=0.205 * sign,
            thickness=0.075,
            material=materials["DarkSteel"],
        )
        additions.append(_rigid(helmet, armature, "head"))

        helmet_trim = _profile_slab_yz(
            f"HelmetSideTrim.{side}",
            (
                (-0.145, 1.990),
                (0.090, 2.008),
                (0.228, 1.920),
                (0.240, 1.875),
                (0.205, 1.865),
                (0.070, 1.930),
                (-0.135, 1.930),
            ),
            center_x=0.248 * sign,
            thickness=0.020,
            material=materials["SteelEdge"],
        )
        additions.append(_rigid(helmet_trim, armature, "head"))

        torso = _profile_slab_yz(
            f"TorsoSideShell.{side}",
            (
                (-0.245, 1.505),
                (0.165, 1.535),
                (0.310, 1.425),
                (0.285, 1.225),
                (0.175, 1.085),
                (-0.145, 1.075),
                (-0.255, 1.220),
            ),
            center_x=0.305 * sign,
            thickness=0.090,
            material=materials["DarkSteel"],
        )
        additions.append(_rigid(torso, armature, "chest"))

        boot = _profile_slab_yz(
            f"BootSideShell.{side}",
            (
                (-0.175, 0.235),
                (0.305, 0.235),
                (0.465, 0.155),
                (0.455, 0.060),
                (0.330, 0.025),
                (-0.120, 0.030),
                (-0.205, 0.105),
            ),
            center_x=0.205 * sign,
            thickness=0.075,
            material=materials["DarkSteel"],
        )
        additions.append(_rigid(boot, armature, f"foot.{side}"))

        badge = _profile_slab(
            f"ShoulderBadge.{side}",
            (
                (0.595 * sign, 1.515),
                (0.650 * sign, 1.565),
                (0.705 * sign, 1.515),
                (0.650 * sign, 1.465),
            ),
            center_y=-0.205,
            thickness=0.026,
            material=materials["Brass"],
        )
        additions.append(_rigid(badge, armature, f"clavicle.{side}"))

    return additions


def refine_depth_and_back(armature: bpy.types.Object, model: ModelParts) -> ModelParts:
    """Add the authored side depth and rear silhouette visible in the concept sheet."""
    additions: list[bpy.types.Object] = []
    additions.extend(_back_armor(armature, model))
    additions.extend(_cape(armature, model))
    additions.extend(_side_depth(armature, model))
    return ModelParts(objects=(*model.objects, *additions), materials=model.materials)
