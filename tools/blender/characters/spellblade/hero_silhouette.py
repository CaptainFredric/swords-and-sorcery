from __future__ import annotations

from collections.abc import Sequence

import bpy

from .concept_refinement import _profile_slab
from .model import ModelParts, _beveled_box, _rigid


def _replace_material(obj: bpy.types.Object | None, material: bpy.types.Material) -> None:
    if obj is None or obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _named(model: ModelParts, name: str) -> bpy.types.Object | None:
    return next((obj for obj in model.objects if obj.name == name), None)


def _shell(
    name: str,
    profile: Sequence[tuple[float, float]],
    *,
    center_y: float,
    thickness: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
) -> bpy.types.Object:
    obj = _profile_slab(
        name,
        tuple(profile),
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    return _rigid(obj, armature, bone)


def _visor(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # Darken the old eyebrow rails. They are useful structure, but the bright
    # edge material made the entire face read as one pale rectangular screen.
    for name in ("HelmetBrow.L", "HelmetBrow.R"):
        _replace_material(_named(model, name), materials["DarkSteel"])

    # This mask sits in front of the blockout visor plate and supplies the real
    # helmet opening silhouette. The cyan pieces are then laid on top of it, so
    # the face reads as dark armor pierced by a T-shaped opening.
    mask = _shell(
        "VisorMask",
        (
            (-0.218, 1.918),
            (0.218, 1.918),
            (0.246, 1.850),
            (0.205, 1.735),
            (0.120, 1.675),
            (0.0, 1.650),
            (-0.120, 1.675),
            (-0.205, 1.735),
            (-0.246, 1.850),
        ),
        center_y=0.294,
        thickness=0.048,
        material=materials["DarkSteel"],
        armature=armature,
        bone="head",
    )
    additions.append(mask)

    bar = _beveled_box(
        "VisorHeroBar",
        (0.0, 0.326, 1.854),
        (0.315, 0.026, 0.038),
        materials["VisorGlow"],
        bevel=0.006,
    )
    additions.append(_rigid(bar, armature, "head"))
    stem = _beveled_box(
        "VisorHeroStem",
        (0.0, 0.327, 1.790),
        (0.040, 0.027, 0.150),
        materials["VisorGlow"],
        bevel=0.006,
    )
    additions.append(_rigid(stem, armature, "head"))

    # Small steel cheek rims break the mask from the helmet shell without
    # recreating the bright rectangular frame from the previous pass.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        rim = _shell(
            f"VisorCheekRim.{side}",
            (
                (0.220 * sign, 1.905),
                (0.246 * sign, 1.850),
                (0.205 * sign, 1.735),
                (0.177 * sign, 1.755),
                (0.207 * sign, 1.842),
            ),
            center_y=0.323,
            thickness=0.018,
            material=materials["SteelEdge"],
            armature=armature,
            bone="head",
        )
        additions.append(rim)
    return additions


def _chest(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    chest = _shell(
        "ChestHeroShell",
        (
            (-0.365, 1.535),
            (0.365, 1.535),
            (0.335, 1.405),
            (0.285, 1.245),
            (0.205, 1.135),
            (0.0, 1.080),
            (-0.205, 1.135),
            (-0.285, 1.245),
            (-0.335, 1.405),
        ),
        center_y=0.252,
        thickness=0.090,
        material=materials["DarkSteel"],
        armature=armature,
        bone="chest",
    )
    additions.append(chest)

    # Two inset facets give the breastplate the broad low-poly planes visible in
    # the concept without turning the whole chest silver.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _shell(
            f"ChestHeroFacet.{side}",
            (
                (0.315 * sign, 1.465),
                (0.055 * sign, 1.455),
                (0.050 * sign, 1.145),
                (0.180 * sign, 1.175),
                (0.275 * sign, 1.300),
            ),
            center_y=0.305,
            thickness=0.022,
            material=materials["SteelEdge"],
            armature=armature,
            bone="chest",
        )
        additions.append(facet)
    return additions


def _shoulders(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        shell = _shell(
            f"PauldronHeroShell.{side}",
            (
                (0.385 * sign, 1.545),
                (0.555 * sign, 1.640),
                (0.775 * sign, 1.595),
                (0.900 * sign, 1.475),
                (0.855 * sign, 1.340),
                (0.720 * sign, 1.285),
                (0.535 * sign, 1.345),
                (0.425 * sign, 1.430),
            ),
            center_y=0.105,
            thickness=0.315,
            material=materials["DarkSteel"],
            armature=armature,
            bone=f"clavicle.{side}",
        )
        additions.append(shell)

        trim = _shell(
            f"PauldronHeroTrim.{side}",
            (
                (0.435 * sign, 1.548),
                (0.565 * sign, 1.610),
                (0.760 * sign, 1.572),
                (0.820 * sign, 1.520),
                (0.770 * sign, 1.492),
                (0.565 * sign, 1.525),
            ),
            center_y=0.271,
            thickness=0.022,
            material=materials["Brass"],
            armature=armature,
            bone=f"clavicle.{side}",
        )
        additions.append(trim)

        lower = _shell(
            f"PauldronHeroLower.{side}",
            (
                (0.590 * sign, 1.410),
                (0.805 * sign, 1.425),
                (0.825 * sign, 1.330),
                (0.735 * sign, 1.245),
                (0.610 * sign, 1.270),
            ),
            center_y=0.150,
            thickness=0.245,
            material=materials["SteelEdge"],
            armature=armature,
            bone=f"upper_arm.{side}",
        )
        additions.append(lower)
    return additions


def _arms(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        forearm = _shell(
            f"ForearmHeroShell.{side}",
            (
                (0.655 * sign, 1.235),
                (0.785 * sign, 1.205),
                (0.965 * sign, 0.950),
                (0.970 * sign, 0.845),
                (0.865 * sign, 0.820),
                (0.735 * sign, 1.030),
            ),
            center_y=0.125,
            thickness=0.205,
            material=materials["DarkSteel"],
            armature=armature,
            bone=f"forearm.{side}",
        )
        additions.append(forearm)

        ridge = _shell(
            f"ForearmHeroRidge.{side}",
            (
                (0.755 * sign, 1.170),
                (0.815 * sign, 1.135),
                (0.925 * sign, 0.955),
                (0.900 * sign, 0.925),
                (0.835 * sign, 1.020),
            ),
            center_y=0.236,
            thickness=0.020,
            material=materials["SteelEdge"],
            armature=armature,
            bone=f"forearm.{side}",
        )
        additions.append(ridge)
    return additions


def _legs(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # Tone down the old toe cap so the new faceted boot front defines the read.
    for name in ("BootToe.L", "BootToe.R"):
        _replace_material(_named(model, name), materials["DarkSteel"])

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cuisse = _shell(
            f"CuisseHeroShell.{side}",
            (
                (0.075 * sign, 0.865),
                (0.320 * sign, 0.850),
                (0.365 * sign, 0.735),
                (0.315 * sign, 0.535),
                (0.120 * sign, 0.525),
                (0.070 * sign, 0.690),
            ),
            center_y=0.175,
            thickness=0.190,
            material=materials["DarkSteel"],
            armature=armature,
            bone=f"thigh.{side}",
        )
        additions.append(cuisse)

        thigh_facet = _shell(
            f"CuisseHeroFacet.{side}",
            (
                (0.145 * sign, 0.815),
                (0.285 * sign, 0.805),
                (0.310 * sign, 0.720),
                (0.265 * sign, 0.585),
                (0.175 * sign, 0.595),
            ),
            center_y=0.280,
            thickness=0.020,
            material=materials["SteelEdge"],
            armature=armature,
            bone=f"thigh.{side}",
        )
        additions.append(thigh_facet)

        greave = _shell(
            f"GreaveHeroShell.{side}",
            (
                (0.075 * sign, 0.500),
                (0.335 * sign, 0.500),
                (0.360 * sign, 0.365),
                (0.310 * sign, 0.125),
                (0.115 * sign, 0.115),
                (0.070 * sign, 0.285),
            ),
            center_y=0.182,
            thickness=0.200,
            material=materials["DarkSteel"],
            armature=armature,
            bone=f"shin.{side}",
        )
        additions.append(greave)

        greave_ridge = _shell(
            f"GreaveHeroFacet.{side}",
            (
                (0.160 * sign, 0.445),
                (0.275 * sign, 0.440),
                (0.295 * sign, 0.330),
                (0.255 * sign, 0.170),
                (0.170 * sign, 0.165),
            ),
            center_y=0.292,
            thickness=0.020,
            material=materials["SteelEdge"],
            armature=armature,
            bone=f"shin.{side}",
        )
        additions.append(greave_ridge)

        boot = _shell(
            f"BootHeroShell.{side}",
            (
                (0.025 * sign, 0.235),
                (0.355 * sign, 0.235),
                (0.455 * sign, 0.155),
                (0.435 * sign, 0.055),
                (0.330 * sign, 0.020),
                (0.095 * sign, 0.025),
                (0.015 * sign, 0.095),
            ),
            center_y=0.395,
            thickness=0.125,
            material=materials["DarkSteel"],
            armature=armature,
            bone=f"foot.{side}",
        )
        additions.append(boot)

        toe_facet = _shell(
            f"BootHeroFacet.{side}",
            (
                (0.085 * sign, 0.175),
                (0.350 * sign, 0.175),
                (0.405 * sign, 0.130),
                (0.375 * sign, 0.075),
                (0.140 * sign, 0.070),
            ),
            center_y=0.466,
            thickness=0.018,
            material=materials["SteelEdge"],
            armature=armature,
            bone=f"foot.{side}",
        )
        additions.append(toe_facet)
    return additions


def refine_hero_silhouette(
    armature: bpy.types.Object,
    model: ModelParts,
) -> ModelParts:
    """Replace the blockout read with concept-driven faceted front silhouettes."""
    additions: list[bpy.types.Object] = []
    additions.extend(_visor(armature, model))
    additions.extend(_chest(armature, model))
    additions.extend(_shoulders(armature, model))
    additions.extend(_arms(armature, model))
    additions.extend(_legs(armature, model))
    return ModelParts(objects=(*model.objects, *additions), materials=model.materials)
