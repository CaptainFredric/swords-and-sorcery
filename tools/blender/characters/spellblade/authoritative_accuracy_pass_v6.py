from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_accuracy_pass import _remove
from .authoritative_model import (
    _add_rigid,
    _add_socket,
    _diamond,
    _loft,
    _mesh,
    _prism_xz,
    _segment,
)
from .model import ModelParts, _beveled_box


def _rebuild_chest_identity(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {
        "Breastplate",
        "ChestFacet.L", "ChestFacet.R",
        "BreastplateTrim.L", "BreastplateTrim.R",
        "BreastplateCollar", "BreastplateCenterRidge",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # One coherent cuirass volume replaces the stacked rectangular chest read.
    # The widest station sits high on the ribcage and the lower plate pinches to
    # a pointed waist, matching the concept's strong inverted-V armor language.
    breast = _loft(
        "Breastplate",
        (
            (1.300, 0.0, 0.185, 0.205, -0.040),
            (1.365, 0.0, 0.225, 0.250, -0.052),
            (1.475, 0.0, 0.285, 0.292, -0.065),
            (1.585, 0.0, 0.315, 0.310, -0.072),
            (1.670, 0.0, 0.292, 0.272, -0.060),
            (1.715, 0.0, 0.238, 0.215, -0.040),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, breast, armature, "chest")

    # Twin front facets converge into a narrow lower point.  Their central seam
    # gives the breastplate a sternum ridge rather than a flat slab face.
    left = _prism_xz(
        "ChestFacet.L",
        (
            (-0.025, 1.690), (-0.245, 1.675), (-0.302, 1.600),
            (-0.255, 1.470), (-0.162, 1.350), (0.0, 1.292),
            (0.0, 1.610),
        ),
        front_y=0.332,
        back_y=0.302,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, left, armature, "chest")

    right = _prism_xz(
        "ChestFacet.R",
        (
            (0.025, 1.690), (0.245, 1.675), (0.302, 1.600),
            (0.255, 1.470), (0.162, 1.350), (0.0, 1.292),
            (0.0, 1.610),
        ),
        front_y=0.333,
        back_y=0.303,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, right, armature, "chest")

    ridge = _prism_xz(
        "BreastplateCenterRidge",
        (
            (-0.024, 1.665), (0.024, 1.665), (0.036, 1.535),
            (0.018, 1.345), (0.0, 1.300), (-0.018, 1.345), (-0.036, 1.535),
        ),
        front_y=0.354,
        back_y=0.330,
        material=materials["SteelEdge"],
    )
    _add_rigid(parts, ridge, armature, "chest")

    collar = _prism_xz(
        "BreastplateCollar",
        (
            (-0.250, 1.700), (-0.112, 1.735), (0.0, 1.708),
            (0.112, 1.735), (0.250, 1.700), (0.205, 1.662),
            (0.0, 1.680), (-0.205, 1.662),
        ),
        front_y=0.337,
        back_y=0.310,
        material=materials["Brass"],
    )
    _add_rigid(parts, collar, armature, "chest")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _prism_xz(
            f"BreastplateTrim.{side}",
            (
                (0.238 * sign, 1.676), (0.302 * sign, 1.610),
                (0.263 * sign, 1.485), (0.190 * sign, 1.370),
                (0.160 * sign, 1.392), (0.230 * sign, 1.500),
                (0.270 * sign, 1.600), (0.220 * sign, 1.650),
            ),
            front_y=0.348,
            back_y=0.325,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, "chest")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_helmet_face_identity(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {
        "FaceRecess", "Visor", "VisorGlow.Bar", "VisorGlow.Stem",
        "HelmetCheek.L", "HelmetCheek.R",
        "HelmetBrowFrame.L", "HelmetBrowFrame.R",
        "HelmetCrownTrim.L", "HelmetCrownTrim.R",
        "HelmetCrownPlate.L", "HelmetCrownPlate.R",
        "HelmetTemplePlate.L", "HelmetTemplePlate.R",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    recess = _prism_xz(
        "FaceRecess",
        (
            (-0.145, 2.025), (0.145, 2.025), (0.165, 1.985),
            (0.155, 1.875), (0.105, 1.790), (0.050, 1.748),
            (0.0, 1.735), (-0.050, 1.748), (-0.105, 1.790),
            (-0.155, 1.875), (-0.165, 1.985),
        ),
        front_y=0.337,
        back_y=0.292,
        material=materials["Leather"],
    )
    _add_rigid(parts, recess, armature, "head")

    visor = _prism_xz(
        "Visor",
        (
            (-0.130, 1.985), (0.130, 1.985), (0.138, 1.935),
            (0.095, 1.825), (0.040, 1.775), (0.0, 1.762),
            (-0.040, 1.775), (-0.095, 1.825), (-0.138, 1.935),
        ),
        front_y=0.348,
        back_y=0.329,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, visor, armature, "head")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        crown = _prism_xz(
            f"HelmetCrownPlate.{side}",
            (
                (0.012 * sign, 2.105), (0.112 * sign, 2.105),
                (0.188 * sign, 2.055), (0.172 * sign, 1.980),
                (0.125 * sign, 1.905), (0.090 * sign, 1.935),
                (0.082 * sign, 2.035),
            ),
            front_y=0.345,
            back_y=0.311,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, crown, armature, "head")

        temple = _prism_xz(
            f"HelmetTemplePlate.{side}",
            (
                (0.122 * sign, 1.980), (0.183 * sign, 2.005),
                (0.192 * sign, 1.920), (0.165 * sign, 1.820),
                (0.105 * sign, 1.770), (0.088 * sign, 1.815),
            ),
            front_y=0.350,
            back_y=0.322,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, temple, armature, "head")

        cheek = _prism_xz(
            f"HelmetCheek.{side}",
            (
                (0.100 * sign, 1.865), (0.178 * sign, 1.905),
                (0.182 * sign, 1.815), (0.125 * sign, 1.745),
                (0.058 * sign, 1.720), (0.075 * sign, 1.785),
            ),
            front_y=0.354,
            back_y=0.326,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, cheek, armature, "head")

        brow = _prism_xz(
            f"HelmetBrowFrame.{side}",
            (
                (0.012 * sign, 2.008), (0.124 * sign, 2.002),
                (0.160 * sign, 1.970), (0.135 * sign, 1.940),
                (0.020 * sign, 1.955),
            ),
            front_y=0.365,
            back_y=0.345,
            material=materials["Brass"],
        )
        _add_rigid(parts, brow, armature, "head")

        crown_trim = _prism_xz(
            f"HelmetCrownTrim.{side}",
            (
                (0.072 * sign, 2.090), (0.125 * sign, 2.082),
                (0.180 * sign, 2.048), (0.165 * sign, 2.020),
                (0.108 * sign, 2.048),
            ),
            front_y=0.359,
            back_y=0.340,
            material=materials["Brass"],
        )
        _add_rigid(parts, crown_trim, armature, "head")

    bar = _beveled_box(
        "VisorGlow.Bar", (0.0, 0.375, 1.952), (0.245, 0.016, 0.028),
        materials["VisorGlow"], bevel=0.003,
    )
    stem = _beveled_box(
        "VisorGlow.Stem", (0.0, 0.376, 1.868), (0.038, 0.016, 0.175),
        materials["VisorGlow"], bevel=0.003,
    )
    _add_rigid(parts, bar, armature, "head")
    _add_rigid(parts, stem, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _oriented_blade(
    name: str,
    base: Vector,
    tip: Vector,
    width_axis: Vector,
    thickness_axis: Vector,
    material: bpy.types.Material,
    *,
    inset: bool = False,
) -> bpy.types.Object:
    axis_vector = tip - base
    length = axis_vector.length
    axis = axis_vector.normalized()

    if inset:
        stations = (
            (0.055, 0.070),
            (0.145, 0.095),
            (0.720, 0.087),
            (0.890, 0.050),
            (0.955, 0.0),
        )
        half_thickness = 0.010
    else:
        stations = (
            (0.000, 0.118),
            (0.085, 0.150),
            (0.710, 0.142),
            (0.900, 0.090),
            (1.000, 0.0),
        )
        half_thickness = 0.031

    upper = [base + axis * (fraction * length) + width_axis * width for fraction, width in stations]
    lower = [base + axis * (fraction * length) - width_axis * width for fraction, width in reversed(stations)]
    # reversed(stations) must also reverse the axial location. Build explicitly so
    # the polygon travels around the blade perimeter without self-intersection.
    lower = [base + axis * (fraction * length) - width_axis * width for fraction, width in reversed(stations[:-1])]
    profile = upper + lower

    n = len(profile)
    vertices = [tuple(point + thickness_axis * half_thickness) for point in profile]
    vertices.extend(tuple(point - thickness_axis * half_thickness) for point in profile)

    faces: list[tuple[int, ...]] = [tuple(range(n)), tuple(reversed(tuple(n + i for i in range(n))))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return _mesh(name, vertices, faces, material)


def _rebuild_three_dimensional_sword(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {"HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGrip", "SwordGem", "SwordPommel"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    base = Vector((0.585, 0.105, 1.035))
    tip = Vector((1.075, 0.430, 0.205))
    axis = (tip - base).normalized()

    # A deliberate compound width vector keeps the broad blade readable from
    # both front and side cameras.  Orthogonalization makes it true blade width,
    # while axis x width supplies a separate thickness direction.
    width_axis = Vector((1.0, -0.68, 0.08))
    width_axis = (width_axis - axis * width_axis.dot(axis)).normalized()
    thickness_axis = axis.cross(width_axis).normalized()

    blade = _oriented_blade(
        "HeroSword", base, tip, width_axis, thickness_axis,
        materials["SteelEdge"], inset=False,
    )
    _add_socket(parts, blade, armature, "socket_sword")

    facet = _oriented_blade(
        "SwordBladeFacet",
        base + axis * 0.018 + thickness_axis * 0.033,
        tip - axis * 0.035 + thickness_axis * 0.033,
        width_axis,
        thickness_axis,
        materials["DarkSteel"],
        inset=True,
    )
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis * 0.020
    guard_a = guard_center + width_axis * 0.245
    guard_b = guard_center - width_axis * 0.245
    guard = _segment(
        "SwordGuard", tuple(guard_a), tuple(guard_b),
        start_width=0.092, end_width=0.092,
        start_depth=0.110, end_depth=0.110,
        material=materials["Brass"], bulge=1.00,
    )
    _add_socket(parts, guard, armature, "socket_sword")

    grip_start = base - axis * 0.055
    grip_end = base - axis * 0.220
    grip = _segment(
        "SwordGrip", tuple(grip_start), tuple(grip_end),
        start_width=0.080, end_width=0.070,
        start_depth=0.083, end_depth=0.072,
        material=materials["Leather"], bulge=1.00,
    )
    _add_socket(parts, grip, armature, "socket_sword")

    pommel_center = grip_end - axis * 0.050
    pommel = _diamond("SwordPommel", tuple(pommel_center), (0.060, 0.055, 0.060), materials["Brass"])
    _add_socket(parts, pommel, armature, "socket_sword")

    gem_center = guard_center + thickness_axis * 0.070
    gem = _diamond("SwordGem", tuple(gem_center), (0.045, 0.028, 0.045), materials["CrimsonCloth"])
    _add_socket(parts, gem, armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _spread_armored_stance(model: ModelParts) -> None:
    thigh_prefixes = ("ThighUnder.", "Cuisse.", "CuisseFacet.")
    knee_prefixes = ("KneePlate.", "KneeTrim.")
    shin_prefixes = ("ShinUnder.", "Greave.", "GreaveFacet.")
    foot_prefixes = ("Boot.", "BootToe", "BootSole.", "BootHeel.", "BootAnkleTrim.")

    for obj in model.objects:
        if obj.type != "MESH":
            continue
        side = -1.0 if obj.name.endswith(".L") or ".L." in obj.name else 1.0 if obj.name.endswith(".R") or ".R." in obj.name else 0.0
        if side == 0.0:
            continue

        if obj.name.startswith(thigh_prefixes):
            offset = 0.032
        elif obj.name.startswith(knee_prefixes):
            offset = 0.050
        elif obj.name.startswith(shin_prefixes):
            offset = 0.060
        elif obj.name.startswith(foot_prefixes):
            offset = 0.075
        else:
            continue

        for vertex in obj.data.vertices:
            vertex.co.x += side * offset
        obj.data.update()


def apply_concept_accuracy_pass_v6(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_chest_identity(model, armature, materials)
    model = _rebuild_helmet_face_identity(model, armature, materials)
    model = _rebuild_three_dimensional_sword(model, armature, materials)
    _spread_armored_stance(model)
    return model
