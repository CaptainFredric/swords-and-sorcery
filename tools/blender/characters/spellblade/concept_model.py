from __future__ import annotations

from collections.abc import Sequence

import bpy
from mathutils import Vector

from .concept_refinement import _profile_slab
from .model import (
    ModelParts,
    REQUIRED_HERO_PIECES,
    _beveled_box,
    _bone_parent_keep_world,
    _cylinder_between,
    _diamond_blade,
    _rigid,
    _tapered_prism,
    _wedge,
)


# These local traces are measured from the large armor-detail panels on the
# approved 1448x1086 concept sheet. They preserve the actual drawn contour;
# _scaled_profile only maps that pixel contour onto the skeleton's meter scale.
DETAIL_HEAD_TRACE_PX = {
    "outer": ((35, 91), (47, 73), (73, 58), (82, 38), (104, 47), (120, 70),
              (129, 110), (121, 145), (103, 171), (72, 180), (45, 158)),
    "cheek": ((35, 92), (59, 76), (78, 88), (78, 126), (68, 166), (45, 154)),
    "crown_trim": ((47, 74), (73, 59), (104, 68), (121, 82), (113, 94), (76, 80)),
}

DETAIL_SHOULDER_TRACE_PX = {
    "outer": ((24, 48), (60, 29), (87, 40), (115, 68), (126, 101),
              (118, 126), (91, 145), (50, 134), (22, 114)),
    "facet": ((47, 55), (65, 43), (88, 49), (108, 72), (113, 101),
              (92, 124), (58, 119), (41, 101)),
    "trim": ((24, 48), (60, 29), (87, 40), (115, 68), (107, 77),
             (83, 55), (62, 48), (36, 61)),
}

DETAIL_BOOT_TRACE_PX = {
    "greave": ((58, 41), (108, 31), (132, 55), (130, 117), (115, 145),
               (78, 144), (58, 119)),
    "boot": ((43, 163), (87, 149), (121, 159), (140, 184), (136, 209),
             (116, 226), (58, 226), (36, 207), (35, 179)),
    "toe_facet": ((52, 170), (87, 159), (116, 168), (122, 192),
                  (104, 207), (57, 207), (42, 197), (42, 181)),
}

DETAIL_TORSO_TRACE_PX = {
    "tabard": ((43, 55), (108, 55), (111, 196), (103, 220), (77, 227),
               (52, 219), (43, 197)),
}

MAIN_BREASTPLATE_TRACE_PX = (
    (303, 170), (384, 168), (406, 194), (402, 232), (386, 280),
    (351, 301), (316, 283), (300, 242), (296, 203),
)

BACK_CAPE_TRACE_PX = (
    (112, 72), (174, 72), (186, 101), (185, 225), (174, 257),
    (143, 270), (113, 257), (102, 226), (101, 102),
)

# Explicit layer ordering. The visor has to be physically in front of the mask;
# the previous overlay pass put the mask in front and literally covered the cyan T.
HELMET_FACE_FRONT_Y = 0.225
VISOR_FRONT_Y = 0.285


def _scaled_profile(
    points: Sequence[tuple[float, float]],
    *,
    center_x: float,
    center_z: float,
    width: float,
    height: float,
    mirror_x: bool = False,
) -> tuple[tuple[float, float], ...]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x
    span_y = max_y - min_y
    if span_x <= 0.0 or span_y <= 0.0:
        raise ValueError("concept trace must span both pixel axes")
    mid_x = (min_x + max_x) * 0.5
    mid_y = (min_y + max_y) * 0.5
    direction = -1.0 if mirror_x else 1.0
    return tuple(
        (
            center_x + direction * ((x - mid_x) / span_x) * width,
            center_z - ((y - mid_y) / span_y) * height,
        )
        for x, y in points
    )


def _plate(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    center_x: float,
    center_z: float,
    width: float,
    height: float,
    center_y: float,
    thickness: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
    mirror_x: bool = False,
) -> bpy.types.Object:
    obj = _profile_slab(
        name,
        _scaled_profile(
            points,
            center_x=center_x,
            center_z=center_z,
            width=width,
            height=height,
            mirror_x=mirror_x,
        ),
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    return _rigid(obj, armature, bone)


def _raw_plate(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    center_y: float,
    thickness: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
) -> bpy.types.Object:
    obj = _profile_slab(
        name,
        tuple(points),
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    return _rigid(obj, armature, bone)


def _set_material_color(material: bpy.types.Material, color: tuple[float, float, float, float]) -> None:
    material.diffuse_color = color
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color


def _retune_palette(materials: dict[str, bpy.types.Material]) -> None:
    _set_material_color(materials["DarkSteel"], (0.12, 0.135, 0.16, 1.0))
    _set_material_color(materials["SteelEdge"], (0.39, 0.40, 0.43, 1.0))
    _set_material_color(materials["Brass"], (0.52, 0.32, 0.13, 1.0))
    _set_material_color(materials["CrimsonCloth"], (0.33, 0.035, 0.045, 1.0))
    _set_material_color(materials["Leather"], (0.055, 0.042, 0.040, 1.0))
    for key, strength in (("VisorGlow", 2.8), ("SorceryAccent", 2.8)):
        material = materials[key]
        if material.use_nodes and material.node_tree is not None:
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf is not None and "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = strength


def _understructure(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    torso = _tapered_prism(
        "UnderArmorTorso",
        center=(0.0, 0.0, 1.30),
        height=0.54,
        bottom_width=0.42,
        top_width=0.60,
        depth=0.28,
        material=materials["Leather"],
    )
    parts.append(_rigid(torso, armature, "spine"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        upper = _cylinder_between(
            f"UnderUpperArm.{side}",
            (0.42 * sign, 0.0, 1.49),
            (0.72 * sign, 0.0, 1.23),
            0.105,
            materials["Leather"],
            vertices=8,
        )
        parts.append(_rigid(upper, armature, f"upper_arm.{side}"))
        fore = _cylinder_between(
            f"UnderForearm.{side}",
            (0.72 * sign, 0.0, 1.23),
            (0.90 * sign, 0.035, 0.94),
            0.092,
            materials["Leather"],
            vertices=8,
        )
        parts.append(_rigid(fore, armature, f"forearm.{side}"))
        thigh = _cylinder_between(
            f"UnderThigh.{side}",
            (0.20 * sign, 0.0, 0.84),
            (0.21 * sign, 0.0, 0.49),
            0.125,
            materials["Leather"],
            vertices=8,
        )
        parts.append(_rigid(thigh, armature, f"thigh.{side}"))
        shin = _cylinder_between(
            f"UnderShin.{side}",
            (0.21 * sign, 0.0, 0.48),
            (0.21 * sign, 0.0, 0.16),
            0.095,
            materials["Leather"],
            vertices=8,
        )
        parts.append(_rigid(shin, armature, f"shin.{side}"))
    return parts


def _helmet(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    parts.append(_plate(
        "HelmetShell", DETAIL_HEAD_TRACE_PX["outer"],
        center_x=0.0, center_z=1.835, width=0.50, height=0.43,
        center_y=0.0, thickness=0.36, material=materials["DarkSteel"],
        armature=armature, bone="head",
    ))

    # A separate lower jaw gives the concept's deep chin without covering the T visor.
    parts.append(_raw_plate(
        "HelmetJaw",
        ((-0.205, 1.790), (0.205, 1.790), (0.178, 1.665),
         (0.080, 1.625), (-0.080, 1.625), (-0.178, 1.665)),
        center_y=0.185, thickness=0.070, material=materials["DarkSteel"],
        armature=armature, bone="head",
    ))

    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        parts.append(_plate(
            f"HelmetCheek.{side}", DETAIL_HEAD_TRACE_PX["cheek"],
            center_x=0.115 * sign, center_z=1.805, width=0.225, height=0.245,
            center_y=HELMET_FACE_FRONT_Y, thickness=0.030,
            material=materials["SteelEdge"], armature=armature, bone="head",
            mirror_x=mirror,
        ))
        parts.append(_plate(
            f"HelmetCrownTrim.{side}", DETAIL_HEAD_TRACE_PX["crown_trim"],
            center_x=0.105 * sign, center_z=1.940, width=0.235, height=0.105,
            center_y=0.215, thickness=0.032,
            material=materials["Brass"], armature=armature, bone="head",
            mirror_x=mirror,
        ))

    visor = _beveled_box(
        "Visor", (0.0, VISOR_FRONT_Y, 1.835), (0.310, 0.020, 0.040),
        materials["VisorGlow"], bevel=0.006,
    )
    parts.append(_rigid(visor, armature, "head"))
    glow_bar = _beveled_box(
        "VisorGlow.Bar", (0.0, VISOR_FRONT_Y + 0.012, 1.842), (0.270, 0.010, 0.017),
        materials["VisorGlow"], bevel=0.003,
    )
    parts.append(_rigid(glow_bar, armature, "head"))
    glow_stem = _beveled_box(
        "VisorGlow.Stem", (0.0, VISOR_FRONT_Y + 0.012, 1.770), (0.038, 0.012, 0.165),
        materials["VisorGlow"], bevel=0.004,
    )
    parts.append(_rigid(glow_stem, armature, "head"))

    crest = _raw_plate(
        "Crest",
        ((-0.050, 2.160), (0.040, 2.145), (0.048, 1.995), (-0.042, 2.005)),
        center_y=-0.020, thickness=0.155, material=materials["CrimsonCloth"],
        armature=armature, bone="head",
    )
    parts.append(crest)

    scarf = _raw_plate(
        "CrimsonScarf",
        ((-0.280, 1.675), (0.280, 1.675), (0.235, 1.565),
         (0.080, 1.535), (-0.135, 1.555), (-0.275, 1.610)),
        center_y=0.055, thickness=0.270, material=materials["CrimsonCloth"],
        armature=armature, bone="neck",
    )
    parts.append(scarf)
    return parts


def _torso(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    parts.append(_plate(
        "Breastplate", MAIN_BREASTPLATE_TRACE_PX,
        center_x=0.0, center_z=1.335, width=0.67, height=0.47,
        center_y=0.120, thickness=0.255, material=materials["DarkSteel"],
        armature=armature, bone="chest",
    ))

    # The concept breastplate is several large planes separated by dark seams,
    # not one pale slab. These two traced-looking inset planes preserve that read.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        parts.append(_raw_plate(
            f"ChestFacet.{side}",
            ((0.035 * sign, 1.535), (0.300 * sign, 1.505),
             (0.275 * sign, 1.300), (0.185 * sign, 1.165),
             (0.045 * sign, 1.135)),
            center_y=0.262, thickness=0.022, material=materials["SteelEdge"],
            armature=armature, bone="chest",
        ))

    back = _raw_plate(
        "BackArmor",
        ((-0.315, 1.520), (0.315, 1.520), (0.285, 1.210),
         (0.195, 1.095), (-0.195, 1.095), (-0.285, 1.210)),
        center_y=-0.190, thickness=0.150, material=materials["DarkSteel"],
        armature=armature, bone="chest",
    )
    parts.append(back)

    belt = _beveled_box(
        "WarBelt", (0.0, 0.015, 1.025), (0.62, 0.285, 0.090),
        materials["Leather"], bevel=0.018,
    )
    parts.append(_rigid(belt, armature, "pelvis"))
    buckle = _beveled_box(
        "WarBelt.Buckle", (0.125, 0.175, 1.035), (0.135, 0.045, 0.125),
        materials["Brass"], bevel=0.012,
    )
    parts.append(_rigid(buckle, armature, "pelvis"))
    buckle_dark = _beveled_box(
        "WarBelt.BuckleInset", (0.125, 0.201, 1.035), (0.072, 0.012, 0.064),
        materials["Leather"], bevel=0.006,
    )
    parts.append(_rigid(buckle_dark, armature, "pelvis"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(
            f"BeltPouch.{side}", (0.335 * sign, 0.085, 0.955), (0.155, 0.185, 0.220),
            materials["Leather"], bevel=0.018,
        )
        parts.append(_rigid(pouch, armature, "pelvis"))
        clasp = _beveled_box(
            f"BeltPouchClasp.{side}", (0.335 * sign, 0.184, 0.985), (0.060, 0.018, 0.050),
            materials["Brass"], bevel=0.006,
        )
        parts.append(_rigid(clasp, armature, "pelvis"))
    return parts


def _shoulder(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    mirror = side == "R"
    parts: list[bpy.types.Object] = []
    parts.append(_plate(
        f"Pauldron.{side}", DETAIL_SHOULDER_TRACE_PX["outer"],
        center_x=0.585 * sign, center_z=1.485, width=0.455, height=0.335,
        center_y=0.045, thickness=0.340, material=materials["DarkSteel"],
        armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
    ))
    parts.append(_plate(
        f"PauldronFacet.{side}", DETAIL_SHOULDER_TRACE_PX["facet"],
        center_x=0.570 * sign, center_z=1.495, width=0.345, height=0.255,
        center_y=0.226, thickness=0.024, material=materials["SteelEdge"],
        armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
    ))
    parts.append(_plate(
        f"PauldronTrim.{side}", DETAIL_SHOULDER_TRACE_PX["trim"],
        center_x=0.585 * sign, center_z=1.535, width=0.430, height=0.145,
        center_y=0.242, thickness=0.022, material=materials["Brass"],
        armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
    ))
    badge = _raw_plate(
        f"ShoulderBadge.{side}",
        ((0.610 * sign, 1.515), (0.650 * sign, 1.555),
         (0.690 * sign, 1.515), (0.650 * sign, 1.475)),
        center_y=0.258, thickness=0.020, material=materials["Brass"],
        armature=armature, bone=f"clavicle.{side}",
    )
    parts.append(badge)

    lower = _raw_plate(
        f"PauldronLower.{side}",
        ((0.515 * sign, 1.420), (0.775 * sign, 1.410),
         (0.760 * sign, 1.300), (0.625 * sign, 1.255),
         (0.530 * sign, 1.315)),
        center_y=0.120, thickness=0.230, material=materials["DarkSteel"],
        armature=armature, bone=f"upper_arm.{side}",
    )
    parts.append(lower)
    return parts


def _arm(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    parts: list[bpy.types.Object] = []
    upper_plate = _raw_plate(
        f"UpperArmPlate.{side}",
        ((0.445 * sign, 1.405), (0.650 * sign, 1.310),
         (0.735 * sign, 1.205), (0.650 * sign, 1.155),
         (0.520 * sign, 1.255)),
        center_y=0.115, thickness=0.195, material=materials["DarkSteel"],
        armature=armature, bone=f"upper_arm.{side}",
    )
    parts.append(upper_plate)

    vambrace = _raw_plate(
        f"Vambrace.{side}",
        ((0.675 * sign, 1.220), (0.795 * sign, 1.190),
         (0.965 * sign, 0.955), (0.955 * sign, 0.840),
         (0.845 * sign, 0.835), (0.735 * sign, 1.025)),
        center_y=0.120, thickness=0.205, material=materials["DarkSteel"],
        armature=armature, bone=f"forearm.{side}",
    )
    parts.append(vambrace)
    ridge = _raw_plate(
        f"VambraceFacet.{side}",
        ((0.750 * sign, 1.170), (0.815 * sign, 1.145),
         (0.915 * sign, 0.970), (0.890 * sign, 0.925),
         (0.835 * sign, 1.025)),
        center_y=0.233, thickness=0.020, material=materials["SteelEdge"],
        armature=armature, bone=f"forearm.{side}",
    )
    parts.append(ridge)

    gauntlet = _beveled_box(
        f"Gauntlet.{side}", (0.925 * sign, 0.070, 0.850), (0.215, 0.205, 0.190),
        materials["DarkSteel"], bevel=0.026,
    )
    parts.append(_rigid(gauntlet, armature, f"hand.{side}"))
    cuff = _beveled_box(
        f"GauntletCuff.{side}", (0.885 * sign, 0.060, 0.925), (0.255, 0.215, 0.055),
        materials["Brass"], bevel=0.010,
    )
    parts.append(_rigid(cuff, armature, f"forearm.{side}"))
    return parts


def _leg(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    mirror = side == "R"
    parts: list[bpy.types.Object] = []

    cuisse = _raw_plate(
        f"Cuisse.{side}",
        ((0.085 * sign, 0.875), (0.330 * sign, 0.850),
         (0.355 * sign, 0.720), (0.305 * sign, 0.525),
         (0.125 * sign, 0.520), (0.080 * sign, 0.680)),
        center_y=0.095, thickness=0.220, material=materials["DarkSteel"],
        armature=armature, bone=f"thigh.{side}",
    )
    parts.append(cuisse)
    cuisse_facet = _raw_plate(
        f"CuisseFacet.{side}",
        ((0.145 * sign, 0.820), (0.285 * sign, 0.800),
         (0.305 * sign, 0.705), (0.260 * sign, 0.575),
         (0.175 * sign, 0.585)),
        center_y=0.220, thickness=0.020, material=materials["SteelEdge"],
        armature=armature, bone=f"thigh.{side}",
    )
    parts.append(cuisse_facet)

    knee = _raw_plate(
        f"KneePlate.{side}",
        ((0.095 * sign, 0.565), (0.325 * sign, 0.560),
         (0.355 * sign, 0.485), (0.300 * sign, 0.425),
         (0.120 * sign, 0.430)),
        center_y=0.205, thickness=0.100, material=materials["SteelEdge"],
        armature=armature, bone=f"shin.{side}",
    )
    parts.append(knee)

    parts.append(_plate(
        f"Greave.{side}", DETAIL_BOOT_TRACE_PX["greave"],
        center_x=0.215 * sign, center_z=0.335, width=0.285, height=0.385,
        center_y=0.095, thickness=0.220, material=materials["DarkSteel"],
        armature=armature, bone=f"shin.{side}", mirror_x=mirror,
    ))
    greave_facet = _raw_plate(
        f"GreaveFacet.{side}",
        ((0.145 * sign, 0.465), (0.280 * sign, 0.445),
         (0.300 * sign, 0.325), (0.255 * sign, 0.165),
         (0.165 * sign, 0.165)),
        center_y=0.218, thickness=0.020, material=materials["SteelEdge"],
        armature=armature, bone=f"shin.{side}",
    )
    parts.append(greave_facet)

    parts.append(_plate(
        f"Boot.{side}", DETAIL_BOOT_TRACE_PX["boot"],
        center_x=0.215 * sign, center_z=0.130, width=0.420, height=0.250,
        center_y=0.185, thickness=0.360, material=materials["DarkSteel"],
        armature=armature, bone=f"foot.{side}", mirror_x=mirror,
    ))
    parts.append(_plate(
        f"BootFacet.{side}", DETAIL_BOOT_TRACE_PX["toe_facet"],
        center_x=0.215 * sign, center_z=0.125, width=0.350, height=0.165,
        center_y=0.375, thickness=0.025, material=materials["SteelEdge"],
        armature=armature, bone=f"foot.{side}", mirror_x=mirror,
    ))
    ankle = _beveled_box(
        f"BootAnkleTrim.{side}", (0.215 * sign, 0.145, 0.275), (0.300, 0.285, 0.055),
        materials["Brass"], bevel=0.010,
    )
    parts.append(_rigid(ankle, armature, f"shin.{side}"))
    return parts


def _cloth(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    parts.append(_plate(
        "TabardFront", DETAIL_TORSO_TRACE_PX["tabard"],
        center_x=0.0, center_z=0.725, width=0.305, height=0.655,
        center_y=0.260, thickness=0.040, material=materials["CrimsonCloth"],
        armature=armature, bone="tabard_front_01",
    ))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _raw_plate(
            f"TabardTrim.{side}",
            ((0.132 * sign, 1.035), (0.158 * sign, 1.025),
             (0.145 * sign, 0.430), (0.110 * sign, 0.395),
             (0.108 * sign, 0.455), (0.120 * sign, 0.985)),
            center_y=0.285, thickness=0.018, material=materials["Brass"],
            armature=armature, bone="tabard_front_01",
        )
        parts.append(trim)

    sigil = _raw_plate(
        "TabardSigil",
        ((0.000, 0.900), (0.045, 0.825), (0.020, 0.790),
         (0.020, 0.700), (0.075, 0.750), (0.090, 0.715),
         (0.000, 0.610), (-0.090, 0.715), (-0.075, 0.750),
         (-0.020, 0.700), (-0.020, 0.790), (-0.045, 0.825)),
        center_y=0.292, thickness=0.014, material=materials["Brass"],
        armature=armature, bone="tabard_front_01",
    )
    parts.append(sigil)

    parts.append(_plate(
        "TabardBack", BACK_CAPE_TRACE_PX,
        center_x=0.0, center_z=1.010, width=0.430, height=1.150,
        center_y=-0.300, thickness=0.046, material=materials["CrimsonCloth"],
        armature=armature, bone="tabard_back_01",
    ))
    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _raw_plate(
            f"CapeTrim.{side}",
            ((0.185 * sign, 1.555), (0.215 * sign, 1.535),
             (0.195 * sign, 0.465), (0.155 * sign, 0.430),
             (0.158 * sign, 0.500), (0.170 * sign, 1.510)),
            center_y=-0.330, thickness=0.016, material=materials["Brass"],
            armature=armature, bone="tabard_back_01",
        )
        parts.append(trim)
    back_sigil = _raw_plate(
        "CapeSigil",
        ((0.000, 1.300), (0.052, 1.220), (0.025, 1.175),
         (0.025, 1.080), (0.078, 1.125), (0.095, 1.090),
         (0.000, 0.985), (-0.095, 1.090), (-0.078, 1.125),
         (-0.025, 1.080), (-0.025, 1.175), (-0.052, 1.220)),
        center_y=-0.337, thickness=0.012, material=materials["Brass"],
        armature=armature, bone="tabard_back_01",
    )
    parts.append(back_sigil)
    return parts


def _hero_sword(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    # The approved hero pose carries the blade down and out from the sword hand.
    # This geometry therefore starts from the hand socket and extends toward the
    # ground rather than being authored as a vertical spear beside the head.
    blade_base = Vector((1.015, 0.095, 0.835))
    blade_tip = Vector((1.520, 0.115, 0.055))
    blade = _diamond_blade("HeroSword", blade_base, blade_tip, 0.300, 0.035, materials["SteelEdge"])
    guard = _beveled_box(
        "HeroSword.Guard", (0.995, 0.090, 0.850), (0.590, 0.090, 0.075),
        materials["Brass"], bevel=0.016,
    )
    grip = _cylinder_between(
        "HeroSword.Grip", (0.905, 0.080, 0.700), (0.985, 0.090, 0.825),
        0.045, materials["Leather"], vertices=8,
    )
    pommel = _beveled_box(
        "HeroSword.Pommel", (0.880, 0.075, 0.665), (0.115, 0.100, 0.115),
        materials["Brass"], bevel=0.016,
    )
    parts = [blade, guard, grip, pommel]
    for obj in parts:
        _bone_parent_keep_world(obj, armature, "socket_sword")
    return parts


def _sorcery(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.070, location=(-0.985, 0.185, 0.845))
    core = bpy.context.object
    core.name = "SorceryCore"
    core.data.materials.append(materials["SorceryAccent"])
    parts.append(_bone_parent_keep_world(core, armature, "socket_sorcery"))
    for index, offset in enumerate(((-0.075, 0.015, 0.060), (0.065, 0.025, 0.070), (-0.025, 0.020, -0.070))):
        shard = _wedge(
            f"SorceryShard.{index + 1}",
            center=(-0.985 + offset[0], 0.185 + offset[1], 0.845 + offset[2]),
            width=0.035, depth=0.045, height=0.095,
            material=materials["SorceryAccent"], forward_tip=0.014,
        )
        parts.append(_bone_parent_keep_world(shard, armature, "socket_sorcery"))
    return parts


def build_concept_model(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Build the visible third-person hero directly from traced concept pieces."""
    _retune_palette(materials)
    objects: list[bpy.types.Object] = []
    objects.extend(_understructure(armature, materials))
    objects.extend(_helmet(armature, materials))
    objects.extend(_torso(armature, materials))
    for side in ("L", "R"):
        objects.extend(_shoulder(side, armature, materials))
        objects.extend(_arm(side, armature, materials))
        objects.extend(_leg(side, armature, materials))
    objects.extend(_cloth(armature, materials))
    objects.extend(_hero_sword(armature, materials))
    objects.extend(_sorcery(armature, materials))

    names = {obj.name for obj in objects}
    missing = [name for name in REQUIRED_HERO_PIECES if name not in names]
    if missing:
        raise ValueError(f"traced concept model missing hero pieces: {missing}")
    return ModelParts(objects=tuple(objects), materials=materials)
