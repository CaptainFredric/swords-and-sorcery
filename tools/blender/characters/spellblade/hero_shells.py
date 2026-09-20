from __future__ import annotations

from collections.abc import Sequence

import bpy

from .model import ModelParts, _beveled_box, _rigid


# A ring is (z, x_center, half_width, front_y, back_y, front_ridge).
# These authored rings are the actual low-poly blueprint: silhouette in X/Z,
# deliberate armor depth in Y, and a small front ridge for readable facets.
Ring = tuple[float, float, float, float, float, float]


def _mesh_object(
    name: str,
    vertices: Sequence[tuple[float, float, float]],
    faces: Sequence[tuple[int, ...]],
    material: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(tuple(vertices), [], tuple(faces))
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def _ring_points(ring: Ring) -> tuple[tuple[float, float, float], ...]:
    z, center_x, half_width, front_y, back_y, ridge = ring
    side_y = (front_y + back_y) * 0.12
    return (
        (center_x - half_width * 0.43, front_y, z),
        (center_x, front_y + ridge, z),
        (center_x + half_width * 0.43, front_y, z),
        (center_x + half_width, side_y, z),
        (center_x + half_width * 0.62, back_y, z),
        (center_x - half_width * 0.62, back_y, z),
        (center_x - half_width, side_y, z),
    )


def _ring_shell(
    name: str,
    rings: Sequence[Ring],
    material: bpy.types.Material,
) -> bpy.types.Object:
    if len(rings) < 2:
        raise ValueError(f"{name} needs at least two depth rings")

    vertices: list[tuple[float, float, float]] = []
    points_per_ring = 7
    for ring in rings:
        vertices.extend(_ring_points(ring))

    faces: list[tuple[int, ...]] = []
    faces.append(tuple(reversed(range(points_per_ring))))
    top_start = (len(rings) - 1) * points_per_ring
    faces.append(tuple(top_start + index for index in range(points_per_ring)))
    for ring_index in range(len(rings) - 1):
        lower = ring_index * points_per_ring
        upper = (ring_index + 1) * points_per_ring
        for index in range(points_per_ring):
            nxt = (index + 1) % points_per_ring
            faces.append((lower + index, lower + nxt, upper + nxt, upper + index))

    return _mesh_object(name, vertices, faces, material)


def _xz_prism(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    front_y: float,
    back_y: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [(x, front_y, z) for x, z in points]
    vertices.extend((x, back_y, z) for x, z in points)
    count = len(points)
    faces: list[tuple[int, ...]] = [
        tuple(range(count)),
        tuple(reversed(tuple(count + index for index in range(count)))),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return _mesh_object(name, vertices, faces, material)


def _yz_prism(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    half_width: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [(-half_width, y, z) for y, z in points]
    vertices.extend((half_width, y, z) for y, z in points)
    count = len(points)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, count + index, count + nxt, nxt))
    return _mesh_object(name, vertices, faces, material)


def _remove_names(model: ModelParts, names: set[str]) -> list[bpy.types.Object]:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def _restore_required_names(
    replacements: Sequence[bpy.types.Object],
    names: set[str],
) -> None:
    """Recover canonical names after Blender creates replacement objects as .001."""
    for obj in replacements:
        for desired in names:
            prefix = f"{desired}."
            if obj.name == desired:
                break
            if obj.name.startswith(prefix):
                suffix = obj.name[len(prefix):]
                if suffix.isdigit():
                    obj.name = desired
                    obj.data.name = f"{desired}Mesh"
                    break


def _replace_named(
    model: ModelParts,
    replacements: Sequence[bpy.types.Object],
    names: set[str],
) -> ModelParts:
    kept = _remove_names(model, names)
    _restore_required_names(replacements, names)
    kept.extend(replacements)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _helmet_shells(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {
        "HelmetShell", "HelmetJaw", "HelmetCheek.L", "HelmetCheek.R",
        "HelmetCrownTrim.L", "HelmetCrownTrim.R", "Visor", "VisorGlow.Bar",
        "VisorGlow.Stem", "Crest", "CrimsonScarf", "FaceRecess",
    }
    parts: list[bpy.types.Object] = []

    # Compact faceted bucket with a real rear skull and forward brow. The middle
    # rings deliberately keep the concept's broad helmet while the jaw tapers.
    shell = _ring_shell(
        "HelmetShell",
        (
            (1.625, 0.0, 0.120, 0.185, -0.125, 0.006),
            (1.690, 0.0, 0.195, 0.235, -0.170, 0.018),
            (1.815, 0.0, 0.230, 0.270, -0.195, 0.030),
            (1.935, 0.0, 0.220, 0.245, -0.200, 0.022),
            (2.020, 0.0, 0.170, 0.170, -0.165, 0.010),
            (2.060, 0.0, 0.105, 0.095, -0.115, 0.000),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, "head"))

    jaw = _xz_prism(
        "HelmetJaw",
        ((-0.190, 1.820), (0.190, 1.820), (0.205, 1.750),
         (0.135, 1.645), (0.060, 1.610), (-0.060, 1.610),
         (-0.135, 1.645), (-0.205, 1.750)),
        front_y=0.292,
        back_y=0.205,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(jaw, armature, "head"))

    recess = _xz_prism(
        "FaceRecess",
        ((-0.160, 1.920), (0.160, 1.920), (0.182, 1.865),
         (0.150, 1.760), (0.075, 1.685), (0.0, 1.660),
         (-0.075, 1.685), (-0.150, 1.760), (-0.182, 1.865)),
        front_y=0.302,
        back_y=0.254,
        material=materials["Leather"],
    )
    parts.append(_rigid(recess, armature, "head"))

    visor = _xz_prism(
        "Visor",
        ((-0.142, 1.895), (0.142, 1.895), (0.150, 1.850),
         (0.112, 1.750), (0.055, 1.700), (0.0, 1.685),
         (-0.055, 1.700), (-0.112, 1.750), (-0.150, 1.850)),
        front_y=0.309,
        back_y=0.300,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(visor, armature, "head"))

    bar = _beveled_box(
        "VisorGlow.Bar", (0.0, 0.320, 1.855), (0.245, 0.012, 0.020),
        materials["VisorGlow"], bevel=0.003,
    )
    stem = _beveled_box(
        "VisorGlow.Stem", (0.0, 0.321, 1.790), (0.032, 0.012, 0.142),
        materials["VisorGlow"], bevel=0.003,
    )
    parts.extend((_rigid(bar, armature, "head"), _rigid(stem, armature, "head")))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cheek = _xz_prism(
            f"HelmetCheek.{side}",
            ((0.055 * sign, 1.900), (0.195 * sign, 1.925),
             (0.207 * sign, 1.835), (0.155 * sign, 1.700),
             (0.085 * sign, 1.665)),
            front_y=0.323,
            back_y=0.290,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(cheek, armature, "head"))

        brow = _xz_prism(
            f"HelmetCrownTrim.{side}",
            ((0.018 * sign, 1.955), (0.185 * sign, 1.995),
             (0.215 * sign, 1.955), (0.178 * sign, 1.905),
             (0.060 * sign, 1.900)),
            front_y=0.326,
            back_y=0.295,
            material=materials["Brass"],
        )
        parts.append(_rigid(brow, armature, "head"))

        vertical = _xz_prism(
            f"HelmetBrowFrame.{side}",
            ((0.150 * sign, 1.905), (0.205 * sign, 1.930),
             (0.190 * sign, 1.790), (0.145 * sign, 1.720),
             (0.120 * sign, 1.760)),
            front_y=0.327,
            back_y=0.305,
            material=materials["Brass"],
        )
        parts.append(_rigid(vertical, armature, "head"))

    crest = _yz_prism(
        "Crest",
        ((-0.135, 2.015), (-0.085, 2.105), (-0.020, 2.175),
         (0.055, 2.185), (0.085, 2.125), (0.070, 2.030)),
        half_width=0.044,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(crest, armature, "head"))

    scarf = _ring_shell(
        "CrimsonScarf",
        (
            (1.520, 0.0, 0.260, 0.155, -0.130, 0.012),
            (1.595, 0.0, 0.315, 0.200, -0.155, 0.022),
            (1.675, 0.0, 0.285, 0.175, -0.140, 0.015),
        ),
        materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf, armature, "neck"))

    scarf_front = _xz_prism(
        "CrimsonScarfFront",
        ((-0.315, 1.625), (0.315, 1.625), (0.265, 1.555),
         (0.150, 1.500), (0.0, 1.475), (-0.150, 1.500), (-0.265, 1.555)),
        front_y=0.255,
        back_y=0.205,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf_front, armature, "chest"))
    return parts, names


def _torso_shells(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {"Breastplate", "ChestFacet.L", "ChestFacet.R", "BackArmor"}
    parts: list[bpy.types.Object] = []

    # Strong V: broad upper chest, narrow armored waist, deep enough in profile
    # to keep the quarter/side views from reading as a traced slab.
    breast = _ring_shell(
        "Breastplate",
        (
            (1.070, 0.0, 0.235, 0.145, -0.120, 0.018),
            (1.155, 0.0, 0.285, 0.185, -0.150, 0.030),
            (1.300, 0.0, 0.355, 0.235, -0.185, 0.050),
            (1.430, 0.0, 0.365, 0.245, -0.190, 0.055),
            (1.535, 0.0, 0.330, 0.205, -0.170, 0.036),
            (1.575, 0.0, 0.280, 0.165, -0.150, 0.020),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(breast, armature, "chest"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _xz_prism(
            f"ChestFacet.{side}",
            ((0.025 * sign, 1.525), (0.285 * sign, 1.500),
             (0.325 * sign, 1.395), (0.295 * sign, 1.280),
             (0.205 * sign, 1.135), (0.050 * sign, 1.105)),
            front_y=0.287,
            back_y=0.255,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(facet, armature, "chest"))

        trim = _xz_prism(
            f"BreastplateTrim.{side}",
            ((0.270 * sign, 1.535), (0.340 * sign, 1.505),
             (0.355 * sign, 1.405), (0.300 * sign, 1.390),
             (0.275 * sign, 1.470)),
            front_y=0.300,
            back_y=0.278,
            material=materials["Brass"],
        )
        parts.append(_rigid(trim, armature, "chest"))

    collar = _xz_prism(
        "BreastplateCollar",
        ((-0.245, 1.545), (-0.100, 1.575), (0.100, 1.575),
         (0.245, 1.545), (0.210, 1.510), (0.0, 1.535), (-0.210, 1.510)),
        front_y=0.292,
        back_y=0.268,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(collar, armature, "chest"))

    back = _ring_shell(
        "BackArmor",
        (
            (1.075, 0.0, 0.220, -0.105, -0.180, 0.0),
            (1.180, 0.0, 0.280, -0.120, -0.220, 0.0),
            (1.350, 0.0, 0.345, -0.135, -0.245, 0.0),
            (1.505, 0.0, 0.320, -0.125, -0.230, 0.0),
            (1.565, 0.0, 0.260, -0.105, -0.195, 0.0),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(back, armature, "chest"))
    return parts, names


def _shoulder_shells(
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

    shell = _ring_shell(
        f"Pauldron.{side}",
        (
            (1.300, 0.535 * sign, 0.105, 0.105, -0.095, 0.006),
            (1.390, 0.555 * sign, 0.170, 0.165, -0.140, 0.014),
            (1.505, 0.550 * sign, 0.205, 0.205, -0.165, 0.020),
            (1.605, 0.520 * sign, 0.180, 0.175, -0.150, 0.016),
            (1.660, 0.490 * sign, 0.120, 0.115, -0.105, 0.008),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, f"clavicle.{side}"))

    x_inner = 0.405 * sign
    x_outer = 0.725 * sign
    facet = _xz_prism(
        f"PauldronFacet.{side}",
        ((x_inner, 1.585), (x_outer, 1.550), (0.735 * sign, 1.455),
         (0.665 * sign, 1.350), (0.475 * sign, 1.385)),
        front_y=0.225,
        back_y=0.185,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(facet, armature, f"clavicle.{side}"))

    trim = _xz_prism(
        f"PauldronTrim.{side}",
        ((0.405 * sign, 1.610), (0.515 * sign, 1.665),
         (0.675 * sign, 1.610), (0.725 * sign, 1.555),
         (0.655 * sign, 1.530), (0.515 * sign, 1.590)),
        front_y=0.244,
        back_y=0.214,
        material=materials["Brass"],
    )
    parts.append(_rigid(trim, armature, f"clavicle.{side}"))

    lower = _ring_shell(
        f"PauldronLower.{side}",
        (
            (1.245, 0.585 * sign, 0.095, 0.100, -0.085, 0.006),
            (1.325, 0.600 * sign, 0.140, 0.140, -0.115, 0.010),
            (1.420, 0.580 * sign, 0.135, 0.125, -0.110, 0.008),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(lower, armature, f"upper_arm.{side}"))

    badge = _xz_prism(
        f"ShoulderBadge.{side}",
        ((0.540 * sign, 1.530), (0.585 * sign, 1.575),
         (0.630 * sign, 1.530), (0.585 * sign, 1.485)),
        front_y=0.255,
        back_y=0.238,
        material=materials["Brass"],
    )
    parts.append(_rigid(badge, armature, f"clavicle.{side}"))
    return parts, names


def rebuild_primary_hero_shells(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace flat traced armor with the locked concept-faithful hero blueprint."""
    helmet_parts, helmet_names = _helmet_shells(armature, materials)
    model = _replace_named(model, helmet_parts, helmet_names)

    torso_parts, torso_names = _torso_shells(armature, materials)
    model = _replace_named(model, torso_parts, torso_names)

    for side in ("L", "R"):
        shoulder_parts, shoulder_names = _shoulder_shells(side, armature, materials)
        model = _replace_named(model, shoulder_parts, shoulder_names)
    return model
