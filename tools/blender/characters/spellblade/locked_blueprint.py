from __future__ import annotations

import bpy
from mathutils import Vector

from .hero_cloth import _folded_panel
from .hero_limbs import _segment_shell
from .hero_shells import _replace_named, _ring_shell, _xz_prism, _yz_prism
from .model import (
    ModelParts,
    _beveled_box,
    _bone_parent_keep_world,
    _cylinder_between,
    _diamond_blade,
    _rigid,
    _wedge,
)


# Final visual authority for the approved Spellblade concept.
# The dimensions below are measured against the supplied front/side/back sheet:
# narrow helmet, belt above half-height, knees near 0.60m, long armored legs,
# shoulder armor about 1.2m overall rather than the earlier 1.5m toy silhouette.


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

    shell = _ring_shell(
        "HelmetShell",
        (
            (1.640, 0.0, 0.120, 0.205, -0.150, 0.008),
            (1.705, 0.0, 0.165, 0.260, -0.185, 0.020),
            (1.820, 0.0, 0.205, 0.292, -0.205, 0.032),
            (1.940, 0.0, 0.198, 0.255, -0.205, 0.020),
            (2.030, 0.0, 0.145, 0.175, -0.175, 0.008),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, "head"))

    jaw = _xz_prism(
        "HelmetJaw",
        ((-0.178, 1.825), (0.178, 1.825), (0.190, 1.760),
         (0.140, 1.680), (0.060, 1.635), (0.0, 1.622),
         (-0.060, 1.635), (-0.140, 1.680), (-0.190, 1.760)),
        front_y=0.320,
        back_y=0.238,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(jaw, armature, "head"))

    recess = _xz_prism(
        "FaceRecess",
        ((-0.145, 1.905), (0.145, 1.905), (0.158, 1.850),
         (0.118, 1.748), (0.055, 1.690), (0.0, 1.672),
         (-0.055, 1.690), (-0.118, 1.748), (-0.158, 1.850)),
        front_y=0.338,
        back_y=0.282,
        material=materials["Leather"],
    )
    parts.append(_rigid(recess, armature, "head"))

    visor = _xz_prism(
        "Visor",
        ((-0.132, 1.880), (0.132, 1.880), (0.138, 1.840),
         (0.095, 1.744), (0.045, 1.700), (0.0, 1.686),
         (-0.045, 1.700), (-0.095, 1.744), (-0.138, 1.840)),
        front_y=0.346,
        back_y=0.337,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(visor, armature, "head"))

    bar = _beveled_box(
        "VisorGlow.Bar", (0.0, 0.354, 1.844), (0.220, 0.014, 0.021),
        materials["VisorGlow"], bevel=0.003,
    )
    stem = _beveled_box(
        "VisorGlow.Stem", (0.0, 0.355, 1.780), (0.030, 0.014, 0.145),
        materials["VisorGlow"], bevel=0.003,
    )
    parts.extend((_rigid(bar, armature, "head"), _rigid(stem, armature, "head")))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cheek = _xz_prism(
            f"HelmetCheek.{side}",
            ((0.048 * sign, 1.895), (0.185 * sign, 1.925),
             (0.198 * sign, 1.845), (0.160 * sign, 1.725),
             (0.085 * sign, 1.668), (0.066 * sign, 1.710)),
            front_y=0.357,
            back_y=0.312,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(cheek, armature, "head"))

        crown = _xz_prism(
            f"HelmetCrownTrim.{side}",
            ((0.016 * sign, 1.962), (0.155 * sign, 2.002),
             (0.198 * sign, 1.958), (0.172 * sign, 1.908),
             (0.055 * sign, 1.900)),
            front_y=0.358,
            back_y=0.316,
            material=materials["Brass"],
        )
        parts.append(_rigid(crown, armature, "head"))

        frame = _xz_prism(
            f"HelmetBrowFrame.{side}",
            ((0.132 * sign, 1.905), (0.195 * sign, 1.940),
             (0.185 * sign, 1.808), (0.145 * sign, 1.728),
             (0.116 * sign, 1.758)),
            front_y=0.360,
            back_y=0.336,
            material=materials["Brass"],
        )
        parts.append(_rigid(frame, armature, "head"))

    crest = _yz_prism(
        "Crest",
        ((-0.135, 2.018), (-0.090, 2.090), (-0.025, 2.145),
         (0.045, 2.168), (0.075, 2.125), (0.064, 2.040)),
        half_width=0.043,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(crest, armature, "head"))

    scarf = _ring_shell(
        "CrimsonScarf",
        (
            (1.520, 0.0, 0.255, 0.160, -0.140, 0.010),
            (1.585, 0.0, 0.315, 0.215, -0.170, 0.022),
            (1.655, 0.0, 0.285, 0.185, -0.150, 0.014),
        ),
        materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf, armature, "neck"))

    scarf_front = _xz_prism(
        "CrimsonScarfFront",
        ((-0.300, 1.625), (0.300, 1.625), (0.260, 1.560),
         (0.155, 1.505), (0.0, 1.480), (-0.155, 1.505), (-0.260, 1.560)),
        front_y=0.292,
        back_y=0.240,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf_front, armature, "chest"))
    return parts, names


def _torso(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {
        "UnderArmorTorso", "Breastplate", "ChestFacet.L", "ChestFacet.R",
        "BackArmor", "BreastplateTrim.L", "BreastplateTrim.R", "BreastplateCollar",
    }
    parts: list[bpy.types.Object] = []

    under = _ring_shell(
        "UnderArmorTorso",
        (
            (1.075, 0.0, 0.220, 0.105, -0.100, 0.004),
            (1.220, 0.0, 0.260, 0.125, -0.115, 0.006),
            (1.400, 0.0, 0.300, 0.135, -0.125, 0.008),
            (1.565, 0.0, 0.275, 0.120, -0.115, 0.004),
        ),
        materials["Leather"],
    )
    parts.append(_rigid(under, armature, "spine"))

    breast = _ring_shell(
        "Breastplate",
        (
            (1.095, 0.0, 0.235, 0.145, -0.125, 0.016),
            (1.180, 0.0, 0.285, 0.190, -0.155, 0.028),
            (1.320, 0.0, 0.345, 0.240, -0.188, 0.050),
            (1.455, 0.0, 0.365, 0.255, -0.198, 0.056),
            (1.555, 0.0, 0.330, 0.218, -0.180, 0.038),
            (1.595, 0.0, 0.285, 0.178, -0.158, 0.020),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(breast, armature, "chest"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _xz_prism(
            f"ChestFacet.{side}",
            ((0.025 * sign, 1.545), (0.285 * sign, 1.515),
             (0.322 * sign, 1.410), (0.295 * sign, 1.300),
             (0.205 * sign, 1.155), (0.050 * sign, 1.120)),
            front_y=0.302,
            back_y=0.268,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(facet, armature, "chest"))

        trim = _xz_prism(
            f"BreastplateTrim.{side}",
            ((0.270 * sign, 1.555), (0.335 * sign, 1.520),
             (0.350 * sign, 1.420), (0.305 * sign, 1.398),
             (0.280 * sign, 1.478)),
            front_y=0.317,
            back_y=0.289,
            material=materials["Brass"],
        )
        parts.append(_rigid(trim, armature, "chest"))

    collar = _xz_prism(
        "BreastplateCollar",
        ((-0.235, 1.562), (-0.100, 1.592), (0.100, 1.592),
         (0.235, 1.562), (0.205, 1.525), (0.0, 1.548), (-0.205, 1.525)),
        front_y=0.312,
        back_y=0.282,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(collar, armature, "chest"))

    back = _ring_shell(
        "BackArmor",
        (
            (1.100, 0.0, 0.220, -0.105, -0.178, 0.0),
            (1.205, 0.0, 0.275, -0.118, -0.218, 0.0),
            (1.365, 0.0, 0.340, -0.135, -0.250, 0.0),
            (1.515, 0.0, 0.320, -0.125, -0.235, 0.0),
            (1.575, 0.0, 0.260, -0.105, -0.195, 0.0),
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

    shell = _xz_prism(
        f"Pauldron.{side}",
        ((0.325 * sign, 1.555), (0.410 * sign, 1.625),
         (0.515 * sign, 1.620), (0.620 * sign, 1.545),
         (0.640 * sign, 1.455), (0.600 * sign, 1.375),
         (0.500 * sign, 1.330), (0.390 * sign, 1.360),
         (0.335 * sign, 1.450)),
        front_y=0.205,
        back_y=-0.155,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, f"clavicle.{side}"))

    facet = _xz_prism(
        f"PauldronFacet.{side}",
        ((0.355 * sign, 1.560), (0.430 * sign, 1.610),
         (0.515 * sign, 1.605), (0.590 * sign, 1.545),
         (0.602 * sign, 1.475), (0.560 * sign, 1.405),
         (0.470 * sign, 1.380), (0.400 * sign, 1.410)),
        front_y=0.242,
        back_y=0.205,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(facet, armature, f"clavicle.{side}"))

    trim = _xz_prism(
        f"PauldronTrim.{side}",
        ((0.330 * sign, 1.570), (0.410 * sign, 1.640),
         (0.520 * sign, 1.635), (0.625 * sign, 1.555),
         (0.595 * sign, 1.525), (0.515 * sign, 1.590),
         (0.425 * sign, 1.598), (0.360 * sign, 1.545)),
        front_y=0.260,
        back_y=0.225,
        material=materials["Brass"],
    )
    parts.append(_rigid(trim, armature, f"clavicle.{side}"))

    lower = _xz_prism(
        f"PauldronLower.{side}",
        ((0.400 * sign, 1.390), (0.590 * sign, 1.380),
         (0.605 * sign, 1.310), (0.565 * sign, 1.255),
         (0.455 * sign, 1.270), (0.405 * sign, 1.325)),
        front_y=0.155,
        back_y=-0.105,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(lower, armature, f"upper_arm.{side}"))

    badge = _xz_prism(
        f"ShoulderBadge.{side}",
        ((0.485 * sign, 1.535), (0.525 * sign, 1.575),
         (0.565 * sign, 1.535), (0.525 * sign, 1.495)),
        front_y=0.274,
        back_y=0.254,
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
        f"UnderUpperArm.{side}", f"UnderForearm.{side}",
        f"UpperArmPlate.{side}", f"Vambrace.{side}", f"VambraceFacet.{side}",
        f"Gauntlet.{side}", f"GauntletCuff.{side}",
    }
    parts: list[bpy.types.Object] = []

    under_upper = _segment_shell(
        f"UnderUpperArm.{side}",
        (0.365 * sign, 0.0, 1.495),
        (0.530 * sign, 0.0, 1.270),
        start_width=0.095, end_width=0.082,
        start_depth=0.095, end_depth=0.082,
        material=materials["Leather"], bulge=1.0,
    )
    parts.append(_rigid(under_upper, armature, f"upper_arm.{side}"))

    under_fore = _segment_shell(
        f"UnderForearm.{side}",
        (0.530 * sign, 0.0, 1.270),
        (0.680 * sign, 0.035, 0.980),
        start_width=0.080, end_width=0.072,
        start_depth=0.082, end_depth=0.074,
        material=materials["Leather"], bulge=1.0,
    )
    parts.append(_rigid(under_fore, armature, f"forearm.{side}"))

    upper = _segment_shell(
        f"UpperArmPlate.{side}",
        (0.385 * sign, 0.0, 1.470),
        (0.535 * sign, 0.0, 1.245),
        start_width=0.122, end_width=0.100,
        start_depth=0.138, end_depth=0.108,
        material=materials["DarkSteel"], bulge=1.03,
    )
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))

    forearm = _segment_shell(
        f"Vambrace.{side}",
        (0.535 * sign, 0.010, 1.245),
        (0.690 * sign, 0.040, 0.965),
        start_width=0.132, end_width=0.097,
        start_depth=0.145, end_depth=0.108,
        material=materials["DarkSteel"], bulge=1.04,
    )
    parts.append(_rigid(forearm, armature, f"forearm.{side}"))

    ridge = _xz_prism(
        f"VambraceFacet.{side}",
        ((0.540 * sign, 1.225), (0.600 * sign, 1.205),
         (0.705 * sign, 1.005), (0.680 * sign, 0.970),
         (0.615 * sign, 1.055)),
        front_y=0.176,
        back_y=0.146,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(ridge, armature, f"forearm.{side}"))

    cuff = _segment_shell(
        f"GauntletCuff.{side}",
        (0.645 * sign, 0.032, 1.045),
        (0.695 * sign, 0.040, 0.970),
        start_width=0.118, end_width=0.112,
        start_depth=0.126, end_depth=0.120,
        material=materials["Brass"], bulge=1.0,
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))

    hand = _segment_shell(
        f"Gauntlet.{side}",
        (0.690 * sign, 0.040, 0.965),
        (0.750 * sign, 0.070, 0.835),
        start_width=0.105, end_width=0.095,
        start_depth=0.115, end_depth=0.105,
        material=materials["DarkSteel"], bulge=1.02,
    )
    parts.append(_rigid(hand, armature, f"hand.{side}"))
    return parts, names


def _leg(
    side: str,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    sign = -1.0 if side == "L" else 1.0
    cx = 0.200 * sign
    names = {
        f"UnderThigh.{side}", f"UnderShin.{side}",
        f"Cuisse.{side}", f"CuisseFacet.{side}", f"KneePlate.{side}",
        f"Greave.{side}", f"GreaveFacet.{side}", f"Boot.{side}",
        f"BootFacet.{side}", f"BootAnkleTrim.{side}",
    }
    parts: list[bpy.types.Object] = []

    under_thigh = _segment_shell(
        f"UnderThigh.{side}",
        (cx, 0.0, 1.010), (cx, 0.0, 0.605),
        start_width=0.105, end_width=0.088,
        start_depth=0.110, end_depth=0.090,
        material=materials["Leather"], bulge=1.0,
    )
    parts.append(_rigid(under_thigh, armature, f"thigh.{side}"))

    under_shin = _segment_shell(
        f"UnderShin.{side}",
        (cx, 0.0, 0.595), (cx, 0.0, 0.145),
        start_width=0.082, end_width=0.070,
        start_depth=0.085, end_depth=0.074,
        material=materials["Leather"], bulge=1.0,
    )
    parts.append(_rigid(under_shin, armature, f"shin.{side}"))

    cuisse = _ring_shell(
        f"Cuisse.{side}",
        (
            (0.610, cx, 0.112, 0.125, -0.100, 0.010),
            (0.735, cx, 0.138, 0.155, -0.118, 0.016),
            (0.900, cx, 0.155, 0.168, -0.130, 0.020),
            (1.025, cx, 0.145, 0.158, -0.122, 0.014),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))

    cuisse_facet = _xz_prism(
        f"CuisseFacet.{side}",
        ((0.120 * sign, 0.985), (0.285 * sign, 0.965),
         (0.305 * sign, 0.820), (0.265 * sign, 0.665),
         (0.145 * sign, 0.680)),
        front_y=0.198,
        back_y=0.170,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(cuisse_facet, armature, f"thigh.{side}"))

    knee = _xz_prism(
        f"KneePlate.{side}",
        ((0.105 * sign, 0.640), (0.305 * sign, 0.632),
         (0.335 * sign, 0.585), (0.300 * sign, 0.525),
         (0.120 * sign, 0.530)),
        front_y=0.220,
        back_y=0.098,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(knee, armature, f"shin.{side}"))

    greave = _ring_shell(
        f"Greave.{side}",
        (
            (0.145, cx, 0.095, 0.125, -0.082, 0.008),
            (0.285, cx, 0.118, 0.150, -0.096, 0.016),
            (0.455, cx, 0.135, 0.168, -0.108, 0.022),
            (0.555, cx, 0.125, 0.145, -0.098, 0.014),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    greave_facet = _xz_prism(
        f"GreaveFacet.{side}",
        ((0.140 * sign, 0.525), (0.270 * sign, 0.505),
         (0.285 * sign, 0.385), (0.245 * sign, 0.205),
         (0.160 * sign, 0.205)),
        front_y=0.202,
        back_y=0.176,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(greave_facet, armature, f"shin.{side}"))

    boot = _ring_shell(
        f"Boot.{side}",
        (
            (0.004, cx, 0.135, 0.305, -0.082, 0.008),
            (0.080, cx, 0.148, 0.350, -0.098, 0.014),
            (0.145, cx, 0.140, 0.305, -0.098, 0.013),
            (0.210, cx, 0.120, 0.215, -0.092, 0.009),
            (0.260, cx, 0.102, 0.155, -0.086, 0.004),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(boot, armature, f"foot.{side}"))

    toe = _ring_shell(
        f"BootFacet.{side}",
        (
            (0.052, cx, 0.128, 0.365, 0.265, 0.004),
            (0.105, cx, 0.140, 0.375, 0.265, 0.006),
            (0.150, cx, 0.122, 0.315, 0.232, 0.003),
        ),
        materials["SteelEdge"],
    )
    parts.append(_rigid(toe, armature, f"foot.{side}"))

    ankle = _ring_shell(
        f"BootAnkleTrim.{side}",
        (
            (0.205, cx, 0.128, 0.200, -0.102, 0.004),
            (0.255, cx, 0.116, 0.180, -0.095, 0.003),
        ),
        materials["Brass"],
    )
    parts.append(_rigid(ankle, armature, f"shin.{side}"))
    return parts, names


def _waist_and_cloth(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {
        "WarBelt", "WarBelt.Buckle", "WarBelt.BuckleInset",
        "BeltPouch.L", "BeltPouch.R", "BeltPouchClasp.L", "BeltPouchClasp.R",
        "TabardFront", "TabardBack", "TabardTrim.L", "TabardTrim.R",
        "TabardSigil", "CapeTrim.L", "CapeTrim.R", "CapeSigil",
    }
    parts: list[bpy.types.Object] = []

    belt = _beveled_box(
        "WarBelt", (0.0, 0.015, 1.105), (0.600, 0.285, 0.092),
        materials["Leather"], bevel=0.016,
    )
    parts.append(_rigid(belt, armature, "pelvis"))

    buckle = _beveled_box(
        "WarBelt.Buckle", (0.105, 0.176, 1.112), (0.138, 0.048, 0.128),
        materials["Brass"], bevel=0.010,
    )
    parts.append(_rigid(buckle, armature, "pelvis"))
    buckle_inset = _beveled_box(
        "WarBelt.BuckleInset", (0.105, 0.203, 1.112), (0.074, 0.012, 0.066),
        materials["Leather"], bevel=0.005,
    )
    parts.append(_rigid(buckle_inset, armature, "pelvis"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(
            f"BeltPouch.{side}", (0.300 * sign, 0.080, 1.015), (0.145, 0.175, 0.205),
            materials["Leather"], bevel=0.015,
        )
        parts.append(_rigid(pouch, armature, "pelvis"))
        clasp = _beveled_box(
            f"BeltPouchClasp.{side}", (0.300 * sign, 0.175, 1.045), (0.055, 0.018, 0.047),
            materials["Brass"], bevel=0.005,
        )
        parts.append(_rigid(clasp, armature, "pelvis"))

    front = _folded_panel(
        "TabardFront",
        (
            (0.465, 0.125, 0.285),
            (0.660, 0.138, 0.280),
            (0.900, 0.150, 0.270),
            (1.135, 0.158, 0.255),
        ),
        thickness=0.026,
        center_fold=0.020,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(front, armature, "tabard_front_01"))

    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.155, -0.305),
            (0.730, 0.175, -0.302),
            (1.000, 0.195, -0.292),
            (1.320, 0.210, -0.270),
            (1.545, 0.195, -0.245),
        ),
        thickness=0.030,
        center_fold=-0.026,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(back, armature, "tabard_back_01"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _xz_prism(
            f"TabardTrim.{side}",
            ((0.125 * sign, 1.130), (0.154 * sign, 1.125),
             (0.140 * sign, 0.500), (0.112 * sign, 0.465),
             (0.108 * sign, 0.520), (0.118 * sign, 1.085)),
            front_y=0.306,
            back_y=0.286,
            material=materials["Brass"],
        )
        parts.append(_rigid(trim, armature, "tabard_front_01"))

        cape_trim = _xz_prism(
            f"CapeTrim.{side}",
            ((0.158 * sign, 1.535), (0.190 * sign, 1.520),
             (0.175 * sign, 0.545), (0.145 * sign, 0.505),
             (0.145 * sign, 0.565), (0.152 * sign, 1.485)),
            front_y=-0.325,
            back_y=-0.346,
            material=materials["Brass"],
        )
        parts.append(_rigid(cape_trim, armature, "tabard_back_01"))

    sigil = _xz_prism(
        "TabardSigil",
        ((0.000, 0.945), (0.040, 0.870), (0.018, 0.835),
         (0.018, 0.755), (0.067, 0.800), (0.082, 0.765),
         (0.000, 0.655), (-0.082, 0.765), (-0.067, 0.800),
         (-0.018, 0.755), (-0.018, 0.835), (-0.040, 0.870)),
        front_y=0.313,
        back_y=0.300,
        material=materials["Brass"],
    )
    parts.append(_rigid(sigil, armature, "tabard_front_01"))

    back_sigil = _xz_prism(
        "CapeSigil",
        ((0.000, 1.300), (0.048, 1.225), (0.022, 1.185),
         (0.022, 1.095), (0.070, 1.135), (0.085, 1.100),
         (0.000, 0.995), (-0.085, 1.100), (-0.070, 1.135),
         (-0.022, 1.095), (-0.022, 1.185), (-0.048, 1.225)),
        front_y=-0.347,
        back_y=-0.359,
        material=materials["Brass"],
    )
    parts.append(_rigid(back_sigil, armature, "tabard_back_01"))
    return parts, names


def _weapon_and_magic(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    weapon_names = {"HeroSword", "HeroSword.Guard", "HeroSword.Grip", "HeroSword.Pommel"}
    blade_base = Vector((0.835, 0.100, 0.875))
    blade_tip = Vector((1.465, 0.118, 0.060))
    blade = _diamond_blade("HeroSword", blade_base, blade_tip, 0.325, 0.040, materials["SteelEdge"])
    guard = _beveled_box(
        "HeroSword.Guard", (0.825, 0.095, 0.885), (0.600, 0.095, 0.082),
        materials["Brass"], bevel=0.015,
    )
    grip = _cylinder_between(
        "HeroSword.Grip", (0.715, 0.082, 0.705), (0.815, 0.094, 0.858),
        0.043, materials["Leather"], vertices=8,
    )
    pommel = _beveled_box(
        "HeroSword.Pommel", (0.690, 0.078, 0.668), (0.110, 0.095, 0.110),
        materials["Brass"], bevel=0.014,
    )
    weapon_parts = [blade, guard, grip, pommel]
    for obj in weapon_parts:
        _bone_parent_keep_world(obj, armature, "socket_sword")
    model = _replace_named(model, weapon_parts, weapon_names)

    magic_names = {"SorceryCore", "SorceryShard.1", "SorceryShard.2", "SorceryShard.3"}
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.082, location=(-0.790, 0.205, 0.875))
    core = bpy.context.object
    core.name = "SorceryCore"
    core.data.materials.append(materials["SorceryAccent"])
    magic_parts: list[bpy.types.Object] = [_bone_parent_keep_world(core, armature, "socket_sorcery")]
    offsets = ((-0.080, 0.018, 0.065), (0.068, 0.030, 0.075), (-0.025, 0.026, -0.078))
    for index, offset in enumerate(offsets):
        shard = _wedge(
            f"SorceryShard.{index + 1}",
            center=(-0.790 + offset[0], 0.205 + offset[1], 0.875 + offset[2]),
            width=0.040, depth=0.050, height=0.105,
            material=materials["SorceryAccent"], forward_tip=0.016,
        )
        magic_parts.append(_bone_parent_keep_world(shard, armature, "socket_sorcery"))
    model = _replace_named(model, magic_parts, magic_names)
    return model


def rebuild_locked_blueprint(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace dominant visible masses with the measured approved concept blueprint."""
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

    pieces, names = _waist_and_cloth(armature, materials)
    model = _replace_named(model, pieces, names)
    return _weapon_and_magic(model, armature, materials)
