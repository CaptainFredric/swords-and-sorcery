from __future__ import annotations

import bpy

from .hero_limbs import _segment_shell
from .hero_shells import _replace_named, _ring_shell, _xz_prism, _yz_prism
from .model import ModelParts, _beveled_box, _rigid


# Locked hero blueprint measured directly from the approved concept sheet.
# This module is intentionally the final geometry authority for the large visual
# masses. Earlier traced/volume passes can supply secondary pieces, but these
# replacements define the silhouette that reaches render/export.


def _helmet(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {
        "HelmetShell", "HelmetJaw", "FaceRecess", "Visor",
        "VisorGlow.Bar", "VisorGlow.Stem", "HelmetCheek.L", "HelmetCheek.R",
        "HelmetCrownTrim.L", "HelmetCrownTrim.R", "HelmetBrowFrame.L",
        "HelmetBrowFrame.R", "Crest", "CrimsonScarf", "CrimsonScarfFront",
    }
    parts: list[bpy.types.Object] = []

    # Deep bucket silhouette: narrower crown, broad brow, tapered jaw, substantial
    # rear skull. The side profile deliberately carries more depth than the old slab.
    shell = _ring_shell(
        "HelmetShell",
        (
            (1.645, 0.0, 0.145, 0.205, -0.150, 0.010),
            (1.715, 0.0, 0.205, 0.270, -0.185, 0.026),
            (1.845, 0.0, 0.235, 0.292, -0.205, 0.032),
            (1.955, 0.0, 0.220, 0.255, -0.205, 0.022),
            (2.035, 0.0, 0.165, 0.175, -0.175, 0.010),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, "head"))

    jaw = _xz_prism(
        "HelmetJaw",
        ((-0.190, 1.825), (0.190, 1.825), (0.205, 1.760),
         (0.150, 1.675), (0.065, 1.625), (0.0, 1.612),
         (-0.065, 1.625), (-0.150, 1.675), (-0.205, 1.760)),
        front_y=0.320,
        back_y=0.240,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(jaw, armature, "head"))

    recess = _xz_prism(
        "FaceRecess",
        ((-0.158, 1.915), (0.158, 1.915), (0.172, 1.855),
         (0.128, 1.745), (0.062, 1.685), (0.0, 1.665),
         (-0.062, 1.685), (-0.128, 1.745), (-0.172, 1.855)),
        front_y=0.334,
        back_y=0.286,
        material=materials["Leather"],
    )
    parts.append(_rigid(recess, armature, "head"))

    visor = _xz_prism(
        "Visor",
        ((-0.145, 1.885), (0.145, 1.885), (0.150, 1.842),
         (0.102, 1.738), (0.050, 1.695), (0.0, 1.680),
         (-0.050, 1.695), (-0.102, 1.738), (-0.150, 1.842)),
        front_y=0.342,
        back_y=0.333,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(visor, armature, "head"))

    bar = _beveled_box(
        "VisorGlow.Bar", (0.0, 0.350, 1.846), (0.248, 0.014, 0.024),
        materials["VisorGlow"], bevel=0.003,
    )
    stem = _beveled_box(
        "VisorGlow.Stem", (0.0, 0.351, 1.778), (0.034, 0.014, 0.155),
        materials["VisorGlow"], bevel=0.003,
    )
    parts.extend((_rigid(bar, armature, "head"), _rigid(stem, armature, "head")))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cheek = _xz_prism(
            f"HelmetCheek.{side}",
            ((0.050 * sign, 1.900), (0.205 * sign, 1.930),
             (0.222 * sign, 1.845), (0.175 * sign, 1.720),
             (0.095 * sign, 1.660), (0.070 * sign, 1.710)),
            front_y=0.354,
            back_y=0.315,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(cheek, armature, "head"))

        crown = _xz_prism(
            f"HelmetCrownTrim.{side}",
            ((0.018 * sign, 1.965), (0.175 * sign, 2.005),
             (0.220 * sign, 1.958), (0.190 * sign, 1.905),
             (0.060 * sign, 1.900)),
            front_y=0.355,
            back_y=0.318,
            material=materials["Brass"],
        )
        parts.append(_rigid(crown, armature, "head"))

        frame = _xz_prism(
            f"HelmetBrowFrame.{side}",
            ((0.145 * sign, 1.910), (0.215 * sign, 1.947),
             (0.202 * sign, 1.805), (0.158 * sign, 1.725),
             (0.125 * sign, 1.758)),
            front_y=0.357,
            back_y=0.334,
            material=materials["Brass"],
        )
        parts.append(_rigid(frame, armature, "head"))

    crest = _yz_prism(
        "Crest",
        ((-0.145, 2.015), (-0.095, 2.095), (-0.025, 2.165),
         (0.050, 2.185), (0.085, 2.135), (0.070, 2.035)),
        half_width=0.046,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(crest, armature, "head"))

    scarf = _ring_shell(
        "CrimsonScarf",
        (
            (1.515, 0.0, 0.275, 0.165, -0.140, 0.012),
            (1.585, 0.0, 0.335, 0.215, -0.170, 0.024),
            (1.665, 0.0, 0.300, 0.185, -0.150, 0.016),
        ),
        materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf, armature, "neck"))

    scarf_front = _xz_prism(
        "CrimsonScarfFront",
        ((-0.330, 1.625), (0.330, 1.625), (0.285, 1.555),
         (0.170, 1.495), (0.0, 1.465), (-0.170, 1.495), (-0.285, 1.555)),
        front_y=0.295,
        back_y=0.245,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf_front, armature, "chest"))
    return parts, names


def _torso(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {
        "Breastplate", "ChestFacet.L", "ChestFacet.R", "BackArmor",
        "BreastplateTrim.L", "BreastplateTrim.R", "BreastplateCollar",
    }
    parts: list[bpy.types.Object] = []

    breast = _ring_shell(
        "Breastplate",
        (
            (1.045, 0.0, 0.245, 0.145, -0.125, 0.018),
            (1.145, 0.0, 0.305, 0.195, -0.155, 0.032),
            (1.295, 0.0, 0.365, 0.245, -0.190, 0.052),
            (1.430, 0.0, 0.385, 0.258, -0.198, 0.058),
            (1.545, 0.0, 0.350, 0.220, -0.182, 0.040),
            (1.590, 0.0, 0.295, 0.178, -0.158, 0.022),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(breast, armature, "chest"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _xz_prism(
            f"ChestFacet.{side}",
            ((0.028 * sign, 1.540), (0.300 * sign, 1.510),
             (0.342 * sign, 1.400), (0.315 * sign, 1.285),
             (0.218 * sign, 1.125), (0.052 * sign, 1.095)),
            front_y=0.305,
            back_y=0.268,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(facet, armature, "chest"))

        trim = _xz_prism(
            f"BreastplateTrim.{side}",
            ((0.285 * sign, 1.550), (0.355 * sign, 1.515),
             (0.372 * sign, 1.410), (0.320 * sign, 1.390),
             (0.292 * sign, 1.475)),
            front_y=0.320,
            back_y=0.292,
            material=materials["Brass"],
        )
        parts.append(_rigid(trim, armature, "chest"))

    collar = _xz_prism(
        "BreastplateCollar",
        ((-0.255, 1.555), (-0.110, 1.590), (0.110, 1.590),
         (0.255, 1.555), (0.220, 1.515), (0.0, 1.542), (-0.220, 1.515)),
        front_y=0.315,
        back_y=0.282,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(collar, armature, "chest"))

    back = _ring_shell(
        "BackArmor",
        (
            (1.050, 0.0, 0.235, -0.108, -0.190, 0.0),
            (1.160, 0.0, 0.295, -0.122, -0.228, 0.0),
            (1.340, 0.0, 0.360, -0.140, -0.260, 0.0),
            (1.505, 0.0, 0.340, -0.130, -0.245, 0.0),
            (1.575, 0.0, 0.275, -0.110, -0.205, 0.0),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(back, armature, "chest"))
    return parts, names


def _shoulder(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    names = {
        f"Pauldron.{side}", f"PauldronFacet.{side}", f"PauldronTrim.{side}",
        f"ShoulderBadge.{side}", f"PauldronLower.{side}",
    }
    parts: list[bpy.types.Object] = []

    # Layered angular shoulder cap. A prism is used here deliberately instead of a
    # rounded ring so the front view gets the concept's sloped armor shelf.
    shell = _xz_prism(
        f"Pauldron.{side}",
        ((0.365 * sign, 1.575), (0.470 * sign, 1.660),
         (0.620 * sign, 1.650), (0.755 * sign, 1.545),
         (0.735 * sign, 1.405), (0.640 * sign, 1.325),
         (0.485 * sign, 1.355), (0.405 * sign, 1.455)),
        front_y=0.205,
        back_y=-0.155,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, f"clavicle.{side}"))

    facet = _xz_prism(
        f"PauldronFacet.{side}",
        ((0.400 * sign, 1.570), (0.485 * sign, 1.625),
         (0.620 * sign, 1.615), (0.708 * sign, 1.535),
         (0.690 * sign, 1.440), (0.610 * sign, 1.382),
         (0.500 * sign, 1.405)),
        front_y=0.240,
        back_y=0.205,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(facet, armature, f"clavicle.{side}"))

    trim = _xz_prism(
        f"PauldronTrim.{side}",
        ((0.372 * sign, 1.585), (0.470 * sign, 1.672),
         (0.625 * sign, 1.662), (0.765 * sign, 1.555),
         (0.715 * sign, 1.520), (0.610 * sign, 1.605),
         (0.480 * sign, 1.615), (0.405 * sign, 1.550)),
        front_y=0.260,
        back_y=0.225,
        material=materials["Brass"],
    )
    parts.append(_rigid(trim, armature, f"clavicle.{side}"))

    lower = _xz_prism(
        f"PauldronLower.{side}",
        ((0.470 * sign, 1.405), (0.690 * sign, 1.390),
         (0.710 * sign, 1.305), (0.660 * sign, 1.245),
         (0.530 * sign, 1.265), (0.475 * sign, 1.330)),
        front_y=0.155,
        back_y=-0.110,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(lower, armature, f"upper_arm.{side}"))

    badge = _xz_prism(
        f"ShoulderBadge.{side}",
        ((0.540 * sign, 1.535), (0.590 * sign, 1.585),
         (0.640 * sign, 1.535), (0.590 * sign, 1.485)),
        front_y=0.276,
        back_y=0.255,
        material=materials["Brass"],
    )
    parts.append(_rigid(badge, armature, f"clavicle.{side}"))
    return parts, names


def _arm(
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
        (0.500 * sign, 0.0, 1.405),
        (0.625 * sign, 0.0, 1.145),
        start_width=0.138,
        end_width=0.112,
        start_depth=0.150,
        end_depth=0.118,
        material=materials["DarkSteel"],
        bulge=1.04,
    )
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))

    forearm = _segment_shell(
        f"Vambrace.{side}",
        (0.625 * sign, 0.010, 1.130),
        (0.755 * sign, 0.040, 0.890),
        start_width=0.142,
        end_width=0.105,
        start_depth=0.155,
        end_depth=0.115,
        material=materials["DarkSteel"],
        bulge=1.05,
    )
    parts.append(_rigid(forearm, armature, f"forearm.{side}"))

    ridge = _xz_prism(
        f"VambraceFacet.{side}",
        ((0.630 * sign, 1.120), (0.690 * sign, 1.105),
         (0.770 * sign, 0.925), (0.745 * sign, 0.895),
         (0.690 * sign, 0.970)),
        front_y=0.182,
        back_y=0.150,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(ridge, armature, f"forearm.{side}"))

    cuff = _segment_shell(
        f"GauntletCuff.{side}",
        (0.710 * sign, 0.030, 0.965),
        (0.758 * sign, 0.040, 0.900),
        start_width=0.128,
        end_width=0.120,
        start_depth=0.138,
        end_depth=0.128,
        material=materials["Brass"],
        bulge=1.0,
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))

    hand = _segment_shell(
        f"Gauntlet.{side}",
        (0.758 * sign, 0.040, 0.895),
        (0.825 * sign, 0.070, 0.785),
        start_width=0.112,
        end_width=0.102,
        start_depth=0.122,
        end_depth=0.112,
        material=materials["DarkSteel"],
        bulge=1.02,
    )
    parts.append(_rigid(hand, armature, f"hand.{side}"))
    return parts, names


def _leg(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    cx = 0.205 * sign
    names = {
        f"Cuisse.{side}", f"CuisseFacet.{side}", f"KneePlate.{side}",
        f"Greave.{side}", f"GreaveFacet.{side}", f"Boot.{side}",
        f"BootFacet.{side}", f"BootAnkleTrim.{side}",
    }
    parts: list[bpy.types.Object] = []

    cuisse = _ring_shell(
        f"Cuisse.{side}",
        (
            (0.535, cx, 0.125, 0.125, -0.100, 0.010),
            (0.690, cx, 0.155, 0.165, -0.125, 0.018),
            (0.845, cx, 0.172, 0.175, -0.135, 0.020),
            (0.930, cx, 0.158, 0.155, -0.125, 0.014),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))

    cuisse_facet = _xz_prism(
        f"CuisseFacet.{side}",
        ((0.125 * sign, 0.875), (0.300 * sign, 0.855),
         (0.320 * sign, 0.720), (0.275 * sign, 0.570),
         (0.150 * sign, 0.585)),
        front_y=0.205,
        back_y=0.176,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(cuisse_facet, armature, f"thigh.{side}"))

    knee = _xz_prism(
        f"KneePlate.{side}",
        ((0.105 * sign, 0.585), (0.315 * sign, 0.575),
         (0.345 * sign, 0.515), (0.310 * sign, 0.445),
         (0.120 * sign, 0.450)),
        front_y=0.225,
        back_y=0.100,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(knee, armature, f"shin.{side}"))

    greave = _ring_shell(
        f"Greave.{side}",
        (
            (0.120, cx, 0.102, 0.130, -0.085, 0.010),
            (0.265, cx, 0.128, 0.158, -0.100, 0.018),
            (0.420, cx, 0.145, 0.175, -0.110, 0.024),
            (0.500, cx, 0.132, 0.150, -0.102, 0.016),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    greave_facet = _xz_prism(
        f"GreaveFacet.{side}",
        ((0.145 * sign, 0.465), (0.285 * sign, 0.445),
         (0.300 * sign, 0.330), (0.255 * sign, 0.175),
         (0.165 * sign, 0.175)),
        front_y=0.210,
        back_y=0.182,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(greave_facet, armature, f"shin.{side}"))

    boot = _ring_shell(
        f"Boot.{side}",
        (
            (0.004, cx, 0.145, 0.315, -0.085, 0.010),
            (0.085, cx, 0.158, 0.345, -0.100, 0.016),
            (0.155, cx, 0.150, 0.300, -0.100, 0.015),
            (0.225, cx, 0.128, 0.210, -0.095, 0.010),
            (0.275, cx, 0.108, 0.155, -0.088, 0.005),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(boot, armature, f"foot.{side}"))

    toe = _ring_shell(
        f"BootFacet.{side}",
        (
            (0.055, cx, 0.138, 0.355, 0.270, 0.004),
            (0.105, cx, 0.150, 0.365, 0.268, 0.006),
            (0.155, cx, 0.132, 0.310, 0.235, 0.003),
        ),
        materials["SteelEdge"],
    )
    parts.append(_rigid(toe, armature, f"foot.{side}"))

    ankle = _ring_shell(
        f"BootAnkleTrim.{side}",
        (
            (0.225, cx, 0.138, 0.200, -0.105, 0.005),
            (0.275, cx, 0.126, 0.180, -0.098, 0.003),
        ),
        materials["Brass"],
    )
    parts.append(_rigid(ankle, armature, f"shin.{side}"))
    return parts, names


def rebuild_locked_blueprint(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace the dominant visible masses with the approved Spellblade blueprint."""
    pieces, names = _helmet(armature, materials)
    model = _replace_named(model, pieces, names)

    pieces, names = _torso(armature, materials)
    model = _replace_named(model, pieces, names)

    for side in ("L", "R"):
        pieces, names = _shoulder(side, armature, materials)
        model = _replace_named(model, pieces, names)
        pieces, names = _arm(side, armature, materials)
        model = _replace_named(model, pieces, names)
        pieces, names = _leg(side, armature, materials)
        model = _replace_named(model, pieces, names)
    return model
