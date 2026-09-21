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
            (1.748, 0.0, 0.105, 0.045, -0.085),
            (1.790, 0.0, 0.155, 0.150, -0.155),
            (1.875, 0.0, 0.192, 0.245, -0.180),
            (1.965, 0.0, 0.202, 0.275, -0.182),
            (2.045, 0.0, 0.188, 0.210, -0.165),
            (2.105, 0.0, 0.145, 0.115, -0.120),
            (2.132, 0.0, 0.092, 0.035, -0.072),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, shell, armature, "head")

    jaw = _loft(
        "HelmetJaw",
        (
            (1.748, 0.0, 0.062, 0.065, -0.028),
            (1.790, 0.0, 0.118, 0.155, -0.055),
            (1.850, 0.0, 0.158, 0.225, -0.073),
            (1.915, 0.0, 0.174, 0.250, -0.082),
            (1.965, 0.0, 0.165, 0.235, -0.080),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, jaw, armature, "head")

    rear = _loft(
        "HelmetRearPlate",
        (
            (1.800, 0.0, 0.125, -0.135, -0.180),
            (1.900, 0.0, 0.165, -0.150, -0.205),
            (2.015, 0.0, 0.155, -0.145, -0.195),
            (2.070, 0.0, 0.118, -0.120, -0.165),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, rear, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


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
        shell = _prism_xz(
            f"Pauldron.{side}",
            (
                (0.305 * sign, 1.655),
                (0.385 * sign, 1.725),
                (0.500 * sign, 1.730),
                (0.595 * sign, 1.665),
                (0.605 * sign, 1.585),
                (0.550 * sign, 1.505),
                (0.445 * sign, 1.485),
                (0.350 * sign, 1.535),
            ),
            front_y=0.205,
            back_y=-0.135,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        facet = _prism_xz(
            f"PauldronFacet.{side}",
            (
                (0.350 * sign, 1.660),
                (0.420 * sign, 1.695),
                (0.510 * sign, 1.690),
                (0.565 * sign, 1.640),
                (0.550 * sign, 1.565),
                (0.475 * sign, 1.530),
                (0.390 * sign, 1.555),
            ),
            front_y=0.232,
            back_y=0.202,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

        trim = _prism_xz(
            f"PauldronTrim.{side}",
            (
                (0.315 * sign, 1.673),
                (0.385 * sign, 1.742),
                (0.505 * sign, 1.747),
                (0.615 * sign, 1.675),
                (0.596 * sign, 1.642),
                (0.500 * sign, 1.700),
                (0.400 * sign, 1.710),
                (0.335 * sign, 1.650),
            ),
            front_y=0.250,
            back_y=0.226,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower = _prism_xz(
            f"PauldronLower.{side}",
            (
                (0.365 * sign, 1.545),
                (0.545 * sign, 1.555),
                (0.565 * sign, 1.510),
                (0.515 * sign, 1.435),
                (0.425 * sign, 1.430),
                (0.375 * sign, 1.480),
            ),
            front_y=0.150,
            back_y=-0.110,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

        badge = _diamond(
            f"ShoulderBadge.{side}",
            (0.510 * sign, 0.267, 1.620),
            (0.040, 0.022, 0.040),
            materials["Brass"],
        )
        _add_rigid(parts, badge, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_armored_anatomy(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name == "Breastplate":
            _scale_about_center(obj, 1.02, 1.14, 1.02)
        elif name in {"BackArmor", "TorsoUnder"}:
            _scale_about_center(obj, 1.00, 1.10, 1.00)
        elif name.startswith(("ArmUnder.", "ForearmUnder.")):
            _scale_about_center(obj, 1.10, 1.10, 1.02)
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.14, 1.10, 1.04)
        elif name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckle", "GauntletFinger")):
            _scale_about_center(obj, 1.14, 1.10, 1.06)
        elif name.startswith(("ThighUnder.", "ShinUnder.")):
            _scale_about_center(obj, 1.08, 1.08, 1.01)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "CuisseOuter.")):
            _scale_about_center(obj, 1.12, 1.10, 1.03)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.12, 1.08, 1.05)
        elif name.startswith(("Greave.", "GreaveFacet.", "GreaveFace.")):
            _scale_about_center(obj, 1.12, 1.10, 1.03)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 1.12, 1.07, 1.08)
        elif name.startswith("Fauld."):
            _scale_about_center(obj, 0.78, 0.92, 0.86)
        elif name.startswith("FauldTrim."):
            _scale_about_center(obj, 0.82, 0.94, 0.90)


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
            (0.500, 0.135, -0.390),
            (0.720, 0.155, -0.375),
            (0.950, 0.175, -0.350),
            (1.180, 0.205, -0.320),
            (1.420, 0.245, -0.285),
            (1.650, 0.275, -0.245),
        ),
        thickness=0.040,
        fold=-0.045,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_ground_contact(model: ModelParts) -> None:
    """Keep the enlarged boot assembly on, not below, the ground plane."""
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
    model = _rebuild_final_shoulders(model, armature, materials)
    _restore_armored_anatomy(model)
    model = _rebuild_rear_cloth(model, armature, materials)
    _restore_ground_contact(model)
    return model
