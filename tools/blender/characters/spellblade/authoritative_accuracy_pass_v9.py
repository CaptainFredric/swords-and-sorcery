from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_model import _add_rigid, _add_socket, _diamond, _prism_xz
from .model import ModelParts, _beveled_box


def _remove_matching(
    model: ModelParts,
    *,
    exact: set[str] | None = None,
    prefixes: tuple[str, ...] = (),
) -> list[bpy.types.Object]:
    exact = exact or set()
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in exact or obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def _mesh_center(obj: bpy.types.Object) -> Vector:
    if obj.type != "MESH" or not obj.data.vertices:
        return Vector((0.0, 0.0, 0.0))
    center = Vector((0.0, 0.0, 0.0))
    for vertex in obj.data.vertices:
        center += vertex.co
    return center / len(obj.data.vertices)


def _rebuild_square_buckle(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, exact={"BeltBuckle", "BeltBuckleInset"})
    parts: list[bpy.types.Object] = []

    # The concept uses a chunky square buckle, not the diamond fitting used in
    # the intermediate waist pass.
    buckle = _beveled_box(
        "BeltBuckle",
        (0.085, 0.176, 1.245),
        (0.150, 0.052, 0.142),
        materials["Brass"],
        bevel=0.010,
    )
    _add_rigid(parts, buckle, armature, "pelvis")

    inset = _beveled_box(
        "BeltBuckleInset",
        (0.085, 0.207, 1.245),
        (0.088, 0.018, 0.082),
        materials["DarkSteel"],
        bevel=0.006,
    )
    _add_rigid(parts, inset, armature, "pelvis")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _finish_boots(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("BootTopPlate.", "BootTopTrim."))
    parts: list[bpy.types.Object] = []

    # Final-space top plates give each boot the concept's heel/instep/toe break
    # instead of reading as a single rectangular shoe block.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.280 * sign
        plate = _prism_xz(
            f"BootTopPlate.{side}",
            (
                (cx - 0.128, 0.275),
                (cx + 0.128, 0.275),
                (cx + 0.145, 0.190),
                (cx + 0.128, 0.120),
                (cx - 0.128, 0.120),
                (cx - 0.145, 0.190),
            ),
            front_y=0.232,
            back_y=0.155,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, plate, armature, f"foot.{side}")

        trim = _prism_xz(
            f"BootTopTrim.{side}",
            (
                (cx - 0.135, 0.215),
                (cx + 0.135, 0.205),
                (cx + 0.132, 0.165),
                (cx - 0.130, 0.175),
            ),
            front_y=0.252,
            back_y=0.228,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"foot.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _finish_gauntlets(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("GauntletFingerPlate.",))
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        gauntlet = next((obj for obj in kept if obj.name == f"Gauntlet.{side}"), None)
        if gauntlet is None:
            continue
        center = _mesh_center(gauntlet)

        # Four blunt overlapping finger plates preserve readability at gameplay
        # distance and make the hand match the concept's armored glove silhouette.
        for index in range(4):
            lateral = (index - 1.5) * 0.031
            finger = _beveled_box(
                f"GauntletFingerPlate.{side}.{index}",
                (
                    center.x + lateral * sign,
                    center.y + 0.090,
                    center.z - 0.035,
                ),
                (0.030, 0.050, 0.060),
                materials["SteelEdge"],
                bevel=0.004,
            )
            _add_rigid(parts, finger, armature, f"hand.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _finish_sword_fittings(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        exact={"SwordGem", "SwordGemFrame"},
        prefixes=("SwordGuardCap.",),
    )
    parts: list[bpy.types.Object] = []

    # Match the 3D sword pass exactly so these fittings sit on the actual guard.
    base = Vector((0.585, 0.105, 1.035))
    tip = Vector((1.075, 0.430, 0.205))
    axis = (tip - base).normalized()
    width_axis = Vector((1.0, -0.68, 0.08))
    width_axis = (width_axis - axis * width_axis.dot(axis)).normalized()
    thickness_axis = axis.cross(width_axis).normalized()
    guard_center = base - axis * 0.020

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cap_center = guard_center + width_axis * (0.247 * sign)
        cap = _diamond(
            f"SwordGuardCap.{side}",
            tuple(cap_center),
            (0.060, 0.052, 0.060),
            materials["Brass"],
        )
        _add_socket(parts, cap, armature, "socket_sword")

    frame_center = guard_center + thickness_axis * 0.069
    frame = _diamond(
        "SwordGemFrame",
        tuple(frame_center),
        (0.060, 0.032, 0.060),
        materials["Brass"],
    )
    _add_socket(parts, frame, armature, "socket_sword")

    gem_center = guard_center + thickness_axis * 0.091
    gem = _diamond(
        "SwordGem",
        tuple(gem_center),
        (0.038, 0.020, 0.038),
        materials["CrimsonCloth"],
    )
    _add_socket(parts, gem, armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v9(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_square_buckle(model, armature, materials)
    model = _finish_boots(model, armature, materials)
    model = _finish_gauntlets(model, armature, materials)
    model = _finish_sword_fittings(model, armature, materials)
    return model
