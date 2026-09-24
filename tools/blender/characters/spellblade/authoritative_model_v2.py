from __future__ import annotations

import bpy
from mathutils import Vector

from .authoritative_model import (
    _add_rigid,
    _add_socket,
    _diamond,
    _folded_panel,
    _loft,
    _prism_xz,
    _segment,
)
from .model import ModelParts, _beveled_box


def _helmet(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    # Concept ratio: helmet is compact (~16-17% of total character width/height envelope),
    # with a narrow dark face cavity and heavy brow/cheek framing.
    _add_rigid(parts, _loft("HelmetShell", (
        (1.690, 0.0, 0.125, 0.160, -0.135),
        (1.745, 0.0, 0.170, 0.210, -0.175),
        (1.855, 0.0, 0.185, 0.230, -0.190),
        (1.965, 0.0, 0.175, 0.215, -0.190),
        (2.045, 0.0, 0.140, 0.150, -0.155),
    ), m["SteelEdge"]), armature, "head")

    _add_rigid(parts, _prism_xz("FaceRecess", (
        (-0.128, 1.905), (0.128, 1.905), (0.142, 1.858),
        (0.120, 1.765), (0.058, 1.705), (0.0, 1.686),
        (-0.058, 1.705), (-0.120, 1.765), (-0.142, 1.858),
    ), front_y=0.257, back_y=0.226, material=m["Leather"]), armature, "head")

    _add_rigid(parts, _prism_xz("HelmetJaw", (
        (-0.145, 1.805), (0.145, 1.805), (0.132, 1.725),
        (0.070, 1.675), (0.0, 1.660), (-0.070, 1.675), (-0.132, 1.725),
    ), front_y=0.270, back_y=0.195, material=m["DarkSteel"]), armature, "head")

    _add_rigid(parts, _prism_xz("Visor", (
        (-0.115, 1.887), (0.115, 1.887), (0.122, 1.850),
        (0.092, 1.770), (0.045, 1.716), (0.0, 1.702),
        (-0.045, 1.716), (-0.092, 1.770), (-0.122, 1.850),
    ), front_y=0.280, back_y=0.264, material=m["DarkSteel"]), armature, "head")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"HelmetCheek.{side}", (
            (0.043 * sign, 1.895), (0.158 * sign, 1.918),
            (0.168 * sign, 1.838), (0.125 * sign, 1.720), (0.068 * sign, 1.690),
        ), front_y=0.286, back_y=0.260, material=m["SteelEdge"]), armature, "head")
        _add_rigid(parts, _prism_xz(f"HelmetCrownTrim.{side}", (
            (0.015 * sign, 1.955), (0.148 * sign, 1.986),
            (0.178 * sign, 1.952), (0.148 * sign, 1.910), (0.050 * sign, 1.905),
        ), front_y=0.292, back_y=0.270, material=m["Brass"]), armature, "head")
        _add_rigid(parts, _prism_xz(f"HelmetBrowFrame.{side}", (
            (0.118 * sign, 1.902), (0.165 * sign, 1.922),
            (0.154 * sign, 1.810), (0.118 * sign, 1.742), (0.098 * sign, 1.775),
        ), front_y=0.294, back_y=0.276, material=m["Brass"]), armature, "head")

    bar = _beveled_box("VisorGlow.Bar", (0.0, 0.299, 1.850), (0.192, 0.012, 0.020), m["VisorGlow"], bevel=0.0025)
    stem = _beveled_box("VisorGlow.Stem", (0.0, 0.300, 1.797), (0.027, 0.012, 0.125), m["VisorGlow"], bevel=0.0025)
    _add_rigid(parts, bar, armature, "head")
    _add_rigid(parts, stem, armature, "head")

    _add_rigid(parts, _prism_xz("Crest", (
        (-0.040, 2.025), (0.042, 2.025), (0.050, 2.165),
        (0.012, 2.185), (-0.042, 2.168),
    ), front_y=0.025, back_y=-0.095, material=m["CrimsonCloth"]), armature, "head")

    _add_rigid(parts, _loft("CrimsonScarf", (
        (1.505, 0.0, 0.218, 0.155, -0.125),
        (1.565, 0.0, 0.270, 0.195, -0.145),
        (1.625, 0.0, 0.255, 0.180, -0.140),
        (1.665, 0.0, 0.210, 0.145, -0.120),
    ), m["CrimsonCloth"]), armature, "neck")


def _torso(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    # Broad enough to read armored, but the upper chest no longer approaches the
    # shoulder envelope; this restores the reference's clear V taper.
    _add_rigid(parts, _loft("TorsoUnder", (
        (1.045, 0.0, 0.220, 0.140, -0.125),
        (1.285, 0.0, 0.260, 0.160, -0.145),
        (1.525, 0.0, 0.285, 0.170, -0.155),
    ), m["DarkSteel"]), armature, "chest")

    _add_rigid(parts, _loft("Breastplate", (
        (1.085, 0.0, 0.205, 0.185, -0.018),
        (1.165, 0.0, 0.235, 0.218, -0.025),
        (1.315, 0.0, 0.285, 0.255, -0.030),
        (1.445, 0.0, 0.300, 0.260, -0.035),
        (1.535, 0.0, 0.265, 0.220, -0.035),
    ), m["SteelEdge"]), armature, "chest")

    _add_rigid(parts, _loft("BackArmor", (
        (1.100, 0.0, 0.220, 0.015, -0.170),
        (1.300, 0.0, 0.275, 0.015, -0.205),
        (1.505, 0.0, 0.285, 0.010, -0.205),
    ), m["DarkSteel"]), armature, "chest")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"ChestFacet.{side}", (
            (0.025 * sign, 1.500), (0.242 * sign, 1.475),
            (0.275 * sign, 1.385), (0.247 * sign, 1.275),
            (0.175 * sign, 1.145), (0.045 * sign, 1.120),
        ), front_y=0.277, back_y=0.253, material=m["SteelEdge"]), armature, "chest")
        _add_rigid(parts, _prism_xz(f"BreastplateTrim.{side}", (
            (0.238 * sign, 1.492), (0.300 * sign, 1.462),
            (0.282 * sign, 1.390), (0.255 * sign, 1.355), (0.235 * sign, 1.420),
        ), front_y=0.295, back_y=0.276, material=m["Brass"]), armature, "chest")

    _add_rigid(parts, _prism_xz("BreastplateCollar", (
        (-0.215, 1.535), (-0.090, 1.568), (0.090, 1.568),
        (0.215, 1.535), (0.180, 1.500), (0.0, 1.520), (-0.180, 1.500),
    ), front_y=0.275, back_y=0.248, material=m["Brass"]), armature, "chest")


def _shoulders(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    # The concept pauldron is an angular layered shield, not a ball.  Build it as
    # an extruded six-plane shell, then add one dark inner plate and brass rim.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        outer = (
            (0.285 * sign, 1.525), (0.370 * sign, 1.600), (0.485 * sign, 1.575),
            (0.535 * sign, 1.505), (0.510 * sign, 1.375), (0.415 * sign, 1.320),
            (0.315 * sign, 1.375),
        )
        _add_rigid(parts, _prism_xz(f"Pauldron.{side}", outer,
            front_y=0.190, back_y=-0.135, material=m["SteelEdge"]), armature, f"clavicle.{side}")

        facet = (
            (0.320 * sign, 1.505), (0.385 * sign, 1.565), (0.470 * sign, 1.545),
            (0.500 * sign, 1.485), (0.475 * sign, 1.390), (0.405 * sign, 1.350),
            (0.340 * sign, 1.395),
        )
        _add_rigid(parts, _prism_xz(f"PauldronFacet.{side}", facet,
            front_y=0.216, back_y=0.190, material=m["DarkSteel"]), armature, f"clavicle.{side}")

        trim = (
            (0.285 * sign, 1.525), (0.370 * sign, 1.600), (0.485 * sign, 1.575),
            (0.535 * sign, 1.505), (0.518 * sign, 1.475), (0.472 * sign, 1.535),
            (0.380 * sign, 1.555), (0.315 * sign, 1.500),
        )
        _add_rigid(parts, _prism_xz(f"PauldronTrim.{side}", trim,
            front_y=0.235, back_y=0.214, material=m["Brass"]), armature, f"clavicle.{side}")

        _add_rigid(parts, _prism_xz(f"PauldronLower.{side}", (
            (0.335 * sign, 1.382), (0.495 * sign, 1.365),
            (0.478 * sign, 1.285), (0.410 * sign, 1.245), (0.350 * sign, 1.292),
        ), front_y=0.125, back_y=-0.105, material=m["DarkSteel"]), armature, f"upper_arm.{side}")

        _add_rigid(parts, _diamond(f"ShoulderBadge.{side}", (0.435 * sign, 0.250, 1.455),
            (0.032, 0.018, 0.032), m["Brass"]), armature, f"clavicle.{side}")


def _arms(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    for side, sign in (("L", -1.0), ("R", 1.0)):
        shoulder = (0.350 * sign, 0.0, 1.455)
        elbow = (0.500 * sign, 0.010, 1.205)
        wrist = (0.620 * sign, 0.035, 0.930)
        hand_end = (0.675 * sign, 0.080, 0.790)

        _add_rigid(parts, _segment(f"ArmUnder.{side}", shoulder, elbow,
            start_width=0.145, end_width=0.120, start_depth=0.155, end_depth=0.130,
            material=m["DarkSteel"], bulge=1.01), armature, f"upper_arm.{side}")
        _add_rigid(parts, _segment(f"UpperArmPlate.{side}", (0.375 * sign, 0.020, 1.410), (0.490 * sign, 0.022, 1.245),
            start_width=0.175, end_width=0.140, start_depth=0.180, end_depth=0.155,
            material=m["SteelEdge"], bulge=1.04), armature, f"upper_arm.{side}")
        _add_rigid(parts, _segment(f"ForearmUnder.{side}", elbow, wrist,
            start_width=0.118, end_width=0.095, start_depth=0.130, end_depth=0.105,
            material=m["DarkSteel"], bulge=1.01), armature, f"forearm.{side}")
        _add_rigid(parts, _segment(f"Vambrace.{side}", (0.505 * sign, 0.027, 1.175), (0.615 * sign, 0.050, 0.950),
            start_width=0.180, end_width=0.125, start_depth=0.185, end_depth=0.135,
            material=m["SteelEdge"], bulge=1.04), armature, f"forearm.{side}")
        _add_rigid(parts, _segment(f"Gauntlet.{side}", wrist, hand_end,
            start_width=0.125, end_width=0.105, start_depth=0.135, end_depth=0.112,
            material=m["DarkSteel"], bulge=1.00), armature, f"hand.{side}")
        _add_rigid(parts, _segment(f"GauntletCuff.{side}", (0.600 * sign, 0.040, 0.975), (0.635 * sign, 0.055, 0.900),
            start_width=0.150, end_width=0.135, start_depth=0.155, end_depth=0.138,
            material=m["Brass"], bulge=1.00), armature, f"forearm.{side}")


def _legs(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    # Knee is raised to the concept landmark (~30% of character height from the ground),
    # giving the reference its long shin/greave read instead of the prior squat stance.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        hip = (0.165 * sign, 0.0, 1.045)
        knee = (0.210 * sign, 0.0, 0.655)
        ankle = (0.240 * sign, 0.0, 0.180)

        _add_rigid(parts, _segment(f"ThighUnder.{side}", hip, knee,
            start_width=0.165, end_width=0.125, start_depth=0.170, end_depth=0.135,
            material=m["DarkSteel"], bulge=1.02), armature, f"thigh.{side}")
        _add_rigid(parts, _segment(f"Cuisse.{side}", (0.165 * sign, 0.018, 1.000), (0.205 * sign, 0.020, 0.705),
            start_width=0.205, end_width=0.150, start_depth=0.205, end_depth=0.155,
            material=m["SteelEdge"], bulge=1.04), armature, f"thigh.{side}")

        _add_rigid(parts, _prism_xz(f"KneePlate.{side}", (
            (0.118 * sign, 0.700), (0.295 * sign, 0.695),
            (0.318 * sign, 0.645), (0.285 * sign, 0.575), (0.138 * sign, 0.580),
        ), front_y=0.135, back_y=-0.072, material=m["SteelEdge"]), armature, f"shin.{side}")
        _add_rigid(parts, _prism_xz(f"KneeTrim.{side}", (
            (0.130 * sign, 0.685), (0.292 * sign, 0.680),
            (0.294 * sign, 0.653), (0.138 * sign, 0.655),
        ), front_y=0.157, back_y=0.132, material=m["Brass"]), armature, f"shin.{side}")

        _add_rigid(parts, _segment(f"ShinUnder.{side}", knee, ankle,
            start_width=0.120, end_width=0.095, start_depth=0.130, end_depth=0.105,
            material=m["DarkSteel"], bulge=1.01), armature, f"shin.{side}")
        _add_rigid(parts, _segment(f"Greave.{side}", (0.210 * sign, 0.020, 0.590), (0.238 * sign, 0.028, 0.215),
            start_width=0.180, end_width=0.125, start_depth=0.185, end_depth=0.135,
            material=m["SteelEdge"], bulge=1.03), armature, f"shin.{side}")

        _add_rigid(parts, _loft(f"Boot.{side}", (
            (0.008, 0.245 * sign, 0.135, 0.315, -0.105),
            (0.070, 0.245 * sign, 0.140, 0.335, -0.098),
            (0.135, 0.245 * sign, 0.125, 0.255, -0.090),
            (0.205, 0.245 * sign, 0.108, 0.165, -0.080),
        ), m["SteelEdge"]), armature, f"foot.{side}")
        _add_rigid(parts, _prism_xz(f"BootAnkleTrim.{side}", (
            (0.135 * sign, 0.218), (0.350 * sign, 0.218),
            (0.340 * sign, 0.178), (0.150 * sign, 0.173),
        ), front_y=0.108, back_y=-0.090, material=m["Brass"]), armature, f"shin.{side}")


def _waist_and_cloth(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    belt = _beveled_box("Belt", (0.0, 0.010, 1.075), (0.500, 0.220, 0.085), m["Leather"], bevel=0.012)
    _add_rigid(parts, belt, armature, "pelvis")
    buckle = _beveled_box("BeltBuckle", (0.085, 0.135, 1.075), (0.110, 0.035, 0.115), m["Brass"], bevel=0.008)
    _add_rigid(parts, buckle, armature, "pelvis")
    inset = _beveled_box("BeltBuckleInset", (0.085, 0.155, 1.075), (0.065, 0.015, 0.068), m["Leather"], bevel=0.004)
    _add_rigid(parts, inset, armature, "pelvis")
    _add_rigid(parts, _diamond("BeltMedallion", (-0.105, 0.154, 1.075), (0.044, 0.020, 0.044), m["Brass"]), armature, "pelvis")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(f"BeltPouch.{side}", (0.215 * sign, 0.105, 0.975), (0.120, 0.095, 0.180), m["Leather"], bevel=0.012)
        _add_rigid(parts, pouch, armature, "pelvis")
        flap = _beveled_box(f"BeltPouchFlap.{side}", (0.215 * sign, 0.158, 1.030), (0.105, 0.024, 0.060), m["Brass"], bevel=0.005)
        _add_rigid(parts, flap, armature, "pelvis")

    front = _folded_panel("TabardFront", (
        (0.500, 0.105, 0.230),
        (0.630, 0.120, 0.238),
        (0.790, 0.135, 0.245),
        (0.950, 0.140, 0.242),
        (1.050, 0.140, 0.230),
    ), thickness=0.024, fold=0.020, material=m["CrimsonCloth"])
    _add_rigid(parts, front, armature, "tabard_front_01")

    back = _folded_panel("TabardBack", (
        (0.430, 0.145, -0.255),
        (0.620, 0.165, -0.270),
        (0.840, 0.185, -0.280),
        (1.080, 0.195, -0.275),
        (1.315, 0.200, -0.255),
        (1.505, 0.190, -0.220),
    ), thickness=0.028, fold=-0.024, material=m["CrimsonCloth"])
    _add_rigid(parts, back, armature, "tabard_back_01")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"TabardTrim.{side}", (
            (0.110 * sign, 0.520), (0.132 * sign, 0.520),
            (0.150 * sign, 1.040), (0.128 * sign, 1.040),
        ), front_y=0.266, back_y=0.244, material=m["Brass"]), armature, "tabard_front_01")

    _add_rigid(parts, _prism_xz("TabardSigil", (
        (-0.015, 0.595), (0.015, 0.595), (0.015, 0.735),
        (0.048, 0.700), (0.058, 0.725), (0.0, 0.805),
        (-0.058, 0.725), (-0.048, 0.700), (-0.015, 0.735),
    ), front_y=0.275, back_y=0.262, material=m["Brass"]), armature, "tabard_front_01")


def _weapon(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    base = Vector((0.670, 0.095, 0.805))
    tip = Vector((1.050, 0.095, 0.055))
    axis = tip - base
    axis2 = Vector((axis.x, 0.0, axis.z)).normalized()
    perp = Vector((-axis2.z, 0.0, axis2.x))
    shoulder = base + axis2 * 0.075
    poly = (
        base + perp * 0.120,
        shoulder + perp * 0.145,
        tip + perp * 0.022,
        tip - perp * 0.022,
        shoulder - perp * 0.145,
        base - perp * 0.120,
    )
    blade = _prism_xz("HeroSword", tuple((p.x, p.z) for p in poly), front_y=0.132, back_y=0.058, material=m["SteelEdge"])
    _add_socket(parts, blade, armature, "socket_sword")

    guard_center = base - axis2 * 0.018
    ga = guard_center + perp * 0.210
    gb = guard_center - perp * 0.210
    _add_socket(parts, _segment("SwordGuard", tuple(ga), tuple(gb),
        start_width=0.070, end_width=0.070, start_depth=0.080, end_depth=0.080,
        material=m["Brass"], bulge=1.0), armature, "socket_sword")

    grip_end = base - axis2 * 0.190
    _add_socket(parts, _segment("SwordGrip", tuple(base - axis2 * 0.045), tuple(grip_end),
        start_width=0.062, end_width=0.058, start_depth=0.064, end_depth=0.060,
        material=m["Leather"], bulge=1.0), armature, "socket_sword")
    pommel = grip_end - axis2 * 0.040
    _add_socket(parts, _diamond("SwordPommel", tuple(pommel), (0.050, 0.042, 0.050), m["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.046, 0.0))), (0.036, 0.018, 0.036), m["CrimsonCloth"]), armature, "socket_sword")


def _sorcery(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    core = _beveled_box("SorceryCore", (-0.700, 0.220, 0.875), (0.090, 0.090, 0.120), m["SorceryAccent"], bevel=0.010)
    _add_socket(parts, core, armature, "socket_sorcery")
    specs = (
        (-0.765, 0.215, 0.940, 0.030), (-0.640, 0.225, 0.955, 0.028),
        (-0.775, 0.235, 0.825, 0.026), (-0.635, 0.215, 0.815, 0.025),
        (-0.700, 0.250, 1.000, 0.022),
    )
    for i, (x, y, z, size) in enumerate(specs, 1):
        shard = _beveled_box(f"SorceryShard.{i}", (x, y, z), (size, size, size), m["SorceryAccent"], bevel=size * 0.10)
        _add_socket(parts, shard, armature, "socket_sorcery")


def build_authoritative_spellblade_v2(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Measured second rebuild against the supplied front/side/back concept sheet."""
    parts: list[bpy.types.Object] = []
    _helmet(parts, armature, materials)
    _torso(parts, armature, materials)
    _shoulders(parts, armature, materials)
    _arms(parts, armature, materials)
    _legs(parts, armature, materials)
    _waist_and_cloth(parts, armature, materials)
    _weapon(parts, armature, materials)
    _sorcery(parts, armature, materials)
    return ModelParts(objects=tuple(parts), materials=materials)
