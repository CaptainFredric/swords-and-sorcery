from __future__ import annotations

from collections.abc import Sequence

import bpy

from .model import ModelParts, _beveled_box, _rigid


# A ring is (z, x_center, half_width, front_y, back_y, front_ridge).
# Connecting several deliberately different rings gives the major armor masses
# real front/side/back volume instead of extruding one front silhouette.
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

    shell = _ring_shell(
        "HelmetShell",
        (
            (1.635, 0.0, 0.105, 0.180, -0.115, 0.010),
            (1.700, 0.0, 0.180, 0.225, -0.155, 0.020),
            (1.835, 0.0, 0.205, 0.252, -0.175, 0.024),
            (1.965, 0.0, 0.185, 0.205, -0.170, 0.014),
            (2.045, 0.0, 0.115, 0.105, -0.125, 0.000),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, "head"))

    jaw = _xz_prism(
        "HelmetJaw",
        ((-0.155, 1.805), (0.155, 1.805), (0.175, 1.745),
         (0.105, 1.650), (0.0, 1.620), (-0.105, 1.650), (-0.175, 1.745)),
        front_y=0.273,
        back_y=0.205,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(jaw, armature, "head"))

    recess = _xz_prism(
        "FaceRecess",
        ((-0.148, 1.915), (0.148, 1.915), (0.168, 1.850),
         (0.118, 1.715), (0.0, 1.675), (-0.118, 1.715), (-0.168, 1.850)),
        front_y=0.281,
        back_y=0.242,
        material=materials["Leather"],
    )
    parts.append(_rigid(recess, armature, "head"))

    visor = _xz_prism(
        "Visor",
        ((-0.128, 1.886), (0.128, 1.886), (0.140, 1.842),
         (0.090, 1.730), (0.0, 1.700), (-0.090, 1.730), (-0.140, 1.842)),
        front_y=0.286,
        back_y=0.279,
        material=materials["DarkSteel"],
    )
    parts.append(_rigid(visor, armature, "head"))

    bar = _beveled_box(
        "VisorGlow.Bar", (0.0, 0.294, 1.850), (0.228, 0.012, 0.019),
        materials["VisorGlow"], bevel=0.003,
    )
    stem = _beveled_box(
        "VisorGlow.Stem", (0.0, 0.295, 1.795), (0.030, 0.012, 0.118),
        materials["VisorGlow"], bevel=0.003,
    )
    parts.extend((_rigid(bar, armature, "head"), _rigid(stem, armature, "head")))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cheek = _xz_prism(
            f"HelmetCheek.{side}",
            ((0.045 * sign, 1.875), (0.165 * sign, 1.900),
             (0.178 * sign, 1.815), (0.120 * sign, 1.690),
             (0.072 * sign, 1.710)),
            front_y=0.296,
            back_y=0.276,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(cheek, armature, "head"))

        brow = _xz_prism(
            f"HelmetCrownTrim.{side}",
            ((0.020 * sign, 1.925), (0.170 * sign, 1.960),
             (0.188 * sign, 1.925), (0.055 * sign, 1.895)),
            front_y=0.292,
            back_y=0.270,
            material=materials["Brass"],
        )
        parts.append(_rigid(brow, armature, "head"))

    crest = _yz_prism(
        "Crest",
        ((-0.138, 2.035), (-0.066, 2.135), (0.012, 2.170),
         (0.070, 2.142), (0.058, 2.040)),
        half_width=0.032,
        material=materials["CrimsonCloth"],
    )
    parts.append(_rigid(crest, armature, "head"))

    scarf = _ring_shell(
        "CrimsonScarf",
        (
            (1.535, 0.0, 0.235, 0.145, -0.120, 0.010),
            (1.610, 0.0, 0.275, 0.175, -0.145, 0.018),
            (1.675, 0.0, 0.245, 0.150, -0.130, 0.010),
        ),
        materials["CrimsonCloth"],
    )
    parts.append(_rigid(scarf, armature, "neck"))
    return parts, names


def _torso_shells(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], set[str]]:
    names = {"Breastplate", "ChestFacet.L", "ChestFacet.R", "BackArmor"}
    parts: list[bpy.types.Object] = []

    breast = _ring_shell(
        "Breastplate",
        (
            (1.090, 0.0, 0.235, 0.135, -0.115, 0.020),
            (1.185, 0.0, 0.285, 0.175, -0.145, 0.032),
            (1.360, 0.0, 0.345, 0.218, -0.175, 0.045),
            (1.500, 0.0, 0.320, 0.190, -0.165, 0.032),
            (1.545, 0.0, 0.270, 0.155, -0.145, 0.020),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(breast, armature, "chest"))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _xz_prism(
            f"ChestFacet.{side}",
            ((0.020 * sign, 1.500), (0.270 * sign, 1.470),
             (0.285 * sign, 1.340), (0.205 * sign, 1.165),
             (0.045 * sign, 1.125)),
            front_y=0.260,
            back_y=0.238,
            material=materials["SteelEdge"],
        )
        parts.append(_rigid(facet, armature, "chest"))

    back = _xz_prism(
        "BackArmor",
        ((-0.285, 1.500), (0.285, 1.500), (0.320, 1.365),
         (0.275, 1.160), (0.180, 1.085), (-0.180, 1.085),
         (-0.275, 1.160), (-0.320, 1.365)),
        front_y=-0.170,
        back_y=-0.225,
        material=materials["DarkSteel"],
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
            (1.320, 0.515 * sign, 0.105, 0.110, -0.100, 0.008),
            (1.410, 0.535 * sign, 0.155, 0.155, -0.135, 0.012),
            (1.515, 0.525 * sign, 0.185, 0.185, -0.155, 0.016),
            (1.590, 0.500 * sign, 0.150, 0.145, -0.130, 0.010),
            (1.625, 0.475 * sign, 0.095, 0.090, -0.090, 0.004),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(shell, armature, f"clavicle.{side}"))

    x_inner = 0.405 * sign
    x_outer = 0.675 * sign
    facet = _xz_prism(
        f"PauldronFacet.{side}",
        ((x_inner, 1.565), (x_outer, 1.535), (0.690 * sign, 1.445),
         (0.620 * sign, 1.355), (0.460 * sign, 1.390)),
        front_y=0.205,
        back_y=0.178,
        material=materials["SteelEdge"],
    )
    parts.append(_rigid(facet, armature, f"clavicle.{side}"))

    trim = _xz_prism(
        f"PauldronTrim.{side}",
        ((0.410 * sign, 1.585), (0.510 * sign, 1.625),
         (0.650 * sign, 1.575), (0.675 * sign, 1.535),
         (0.520 * sign, 1.575)),
        front_y=0.221,
        back_y=0.197,
        material=materials["Brass"],
    )
    parts.append(_rigid(trim, armature, f"clavicle.{side}"))

    lower = _ring_shell(
        f"PauldronLower.{side}",
        (
            (1.265, 0.565 * sign, 0.090, 0.090, -0.080, 0.004),
            (1.330, 0.575 * sign, 0.125, 0.120, -0.105, 0.007),
            (1.405, 0.555 * sign, 0.115, 0.105, -0.095, 0.006),
        ),
        materials["DarkSteel"],
    )
    parts.append(_rigid(lower, armature, f"upper_arm.{side}"))

    badge = _xz_prism(
        f"ShoulderBadge.{side}",
        ((0.525 * sign, 1.515), (0.565 * sign, 1.555),
         (0.605 * sign, 1.515), (0.565 * sign, 1.475)),
        front_y=0.231,
        back_y=0.218,
        material=materials["Brass"],
    )
    parts.append(_rigid(badge, armature, f"clavicle.{side}"))
    return parts, names


def rebuild_primary_hero_shells(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace flat primary traced armor with authored three-dimensional shells."""
    helmet_parts, helmet_names = _helmet_shells(armature, materials)
    model = _replace_named(model, helmet_parts, helmet_names)

    torso_parts, torso_names = _torso_shells(armature, materials)
    model = _replace_named(model, torso_parts, torso_names)

    for side in ("L", "R"):
        shoulder_parts, shoulder_names = _shoulder_shells(side, armature, materials)
        model = _replace_named(model, shoulder_parts, shoulder_names)
    return model
