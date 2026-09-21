from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _scale_about_center
from .authoritative_model import _add_rigid, _diamond, _folded_panel, _loft, _prism_xz
from .model import ModelParts


def _remove_superseded_overlays(model: ModelParts) -> ModelParts:
    exact = {
        "BreastplateFace",
        "BreastplateRidge",
        "SwordGuardOuter",
    }
    prefixes = ("PauldronShell.",)

    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in exact or obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _rebuild_final_helmet(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in {"HelmetShell", "HelmetJaw", "HelmetRearPlate"}:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []

    shell = _loft(
        "HelmetShell",
        (
            (1.748, 0.0, 0.100, 0.038, -0.078),
            (1.790, 0.0, 0.148, 0.138, -0.145),
            (1.875, 0.0, 0.184, 0.225, -0.170),
            (1.965, 0.0, 0.194, 0.252, -0.175),
            (2.045, 0.0, 0.180, 0.195, -0.158),
            (2.105, 0.0, 0.138, 0.105, -0.112),
            (2.132, 0.0, 0.088, 0.030, -0.068),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, shell, armature, "head")

    jaw = _loft(
        "HelmetJaw",
        (
            (1.748, 0.0, 0.058, 0.058, -0.026),
            (1.790, 0.0, 0.110, 0.145, -0.050),
            (1.850, 0.0, 0.150, 0.210, -0.068),
            (1.915, 0.0, 0.164, 0.232, -0.075),
            (1.965, 0.0, 0.155, 0.220, -0.074),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, jaw, armature, "head")

    rear = _loft(
        "HelmetRearPlate",
        (
            (1.800, 0.0, 0.118, -0.125, -0.165),
            (1.900, 0.0, 0.154, -0.138, -0.188),
            (2.015, 0.0, 0.145, -0.132, -0.180),
            (2.070, 0.0, 0.110, -0.108, -0.150),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, rear, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _compact_head_group(model: ModelParts) -> None:
    """Shrink all helmet identity pieces around one head pivot, not individually."""
    pivot_x, pivot_y, pivot_z = 0.0, 0.0, 1.940
    sx, sy, sz = 0.91, 0.86, 0.90

    for obj in model.objects:
        name = obj.name
        belongs_to_head = (
            name.startswith("Helmet")
            or name.startswith("VisorGlow")
            or name in {"FaceRecess", "Visor", "Crest"}
        )
        if not belongs_to_head or obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.x = pivot_x + (vertex.co.x - pivot_x) * sx
            vertex.co.y = pivot_y + (vertex.co.y - pivot_y) * sy
            vertex.co.z = pivot_z + (vertex.co.z - pivot_z) * sz
        obj.data.update()


def _rebuild_final_shoulders(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({
            f"Pauldron.{side}", f"PauldronFacet.{side}", f"PauldronTrim.{side}",
            f"PauldronLower.{side}", f"ShoulderBadge.{side}", f"PauldronShell.{side}",
        })

    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []
    for side, sign in (("L", -1.0), ("R", 1.0)):
        # Large shield plate: sloping crown, long outer face, pointed lower edge.
        shell = _prism_xz(
            f"Pauldron.{side}",
            (
                (0.300 * sign, 1.680),
                (0.385 * sign, 1.755),
                (0.515 * sign, 1.735),
                (0.625 * sign, 1.650),
                (0.615 * sign, 1.535),
                (0.535 * sign, 1.445),
                (0.415 * sign, 1.465),
                (0.335 * sign, 1.545),
            ),
            front_y=0.218,
            back_y=-0.160,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        facet = _prism_xz(
            f"PauldronFacet.{side}",
            (
                (0.350 * sign, 1.675),
                (0.425 * sign, 1.715),
                (0.520 * sign, 1.700),
                (0.575 * sign, 1.640),
                (0.560 * sign, 1.555),
                (0.485 * sign, 1.505),
                (0.395 * sign, 1.535),
            ),
            front_y=0.245,
            back_y=0.212,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

        # Brass is a top/outer rim, not a full octagonal ring.
        trim = _prism_xz(
            f"PauldronTrim.{side}",
            (
                (0.315 * sign, 1.690),
                (0.385 * sign, 1.773),
                (0.520 * sign, 1.752),
                (0.642 * sign, 1.660),
                (0.625 * sign, 1.620),
                (0.515 * sign, 1.705),
                (0.400 * sign, 1.725),
                (0.335 * sign, 1.665),
            ),
            front_y=0.263,
            back_y=0.238,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower = _prism_xz(
            f"PauldronLower.{side}",
            (
                (0.365 * sign, 1.545),
                (0.560 * sign, 1.550),
                (0.585 * sign, 1.495),
                (0.525 * sign, 1.405),
                (0.430 * sign, 1.410),
                (0.375 * sign, 1.470),
            ),
            front_y=0.160,
            back_y=-0.125,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

        badge = _diamond(
            f"ShoulderBadge.{side}",
            (0.515 * sign, 0.282, 1.625),
            (0.040, 0.022, 0.040),
            materials["Brass"],
        )
        _add_rigid(parts, badge, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_armored_anatomy(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name == "Breastplate":
            _scale_about_center(obj, 1.02, 1.15, 1.03)
        elif name in {"BackArmor", "TorsoUnder"}:
            _scale_about_center(obj, 1.00, 1.11, 1.00)
        elif name.startswith(("ArmUnder.", "ForearmUnder.")):
            _scale_about_center(obj, 1.12, 1.10, 1.03)
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.16, 1.11, 1.05)
        elif name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckle", "GauntletFinger")):
            _scale_about_center(obj, 1.16, 1.11, 1.07)
        elif name.startswith(("ThighUnder.", "ShinUnder.")):
            _scale_about_center(obj, 1.09, 1.08, 1.02)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "CuisseOuter.")):
            _scale_about_center(obj, 1.12, 1.10, 1.04)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.12, 1.08, 1.05)
        elif name.startswith(("Greave.", "GreaveFacet.", "GreaveFace.")):
            _scale_about_center(obj, 1.12, 1.10, 1.04)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 1.13, 1.07, 1.08)


def _remove_hip_blocks(model: ModelParts) -> ModelParts:
    """Remove the procedural hip boxes; concept uses narrow straps beside tabard."""
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name.startswith(("Fauld.", "FauldTrim.")):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _rebuild_rear_cloth(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name == "TabardBack":
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []
    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.100, -0.410),
            (0.720, 0.115, -0.395),
            (0.950, 0.130, -0.370),
            (1.180, 0.150, -0.340),
            (1.420, 0.175, -0.300),
            (1.650, 0.190, -0.255),
        ),
        thickness=0.038,
        fold=-0.050,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_ground_contact(model: ModelParts) -> None:
    boot_objects = [
        obj for obj in model.objects
        if obj.type == "MESH" and obj.name.startswith("Boot") and obj.data.vertices
    ]
    if not boot_objects:
        return

    min_z = min(vertex.co.z for obj in boot_objects for vertex in obj.data.vertices)
    target = 0.006
    if min_z >= target:
        return

    lift = target - min_z
    for obj in boot_objects:
        for vertex in obj.data.vertices:
            vertex.co.z += lift
        obj.data.update()


def apply_authoritative_final_form(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _remove_superseded_overlays(model)
    model = _rebuild_final_helmet(model, armature, materials)
    _compact_head_group(model)
    model = _rebuild_final_shoulders(model, armature, materials)
    _restore_armored_anatomy(model)
    model = _remove_hip_blocks(model)
    model = _rebuild_rear_cloth(model, armature, materials)
    _restore_ground_contact(model)
    return model
