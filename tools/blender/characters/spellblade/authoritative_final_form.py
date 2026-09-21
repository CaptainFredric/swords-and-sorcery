from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _scale_about_center
from .authoritative_model import _add_rigid, _loft
from .model import ModelParts


def _remove_superseded_overlays(model: ModelParts) -> ModelParts:
    """Delete geometry from earlier passes that is intentionally superseded.

    The final pipeline is additive during iteration, so this pass explicitly
    removes old overlay names that would otherwise survive later authoritative
    rebuilds and create doubled armor/sword fittings.
    """
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
    """Replace the rounded side shell with a compact faceted bucket volume."""
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
            # z, x center, half width, front y, back y
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

    # Small rear plate breaks the shell into the same helmet/back-panel language
    # as the concept without creating the giant rectangular rear wall seen in
    # the previous side render.
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


def _restore_side_mass(model: ModelParts) -> None:
    """Increase front/back armor depth without widening the front silhouette."""
    for obj in model.objects:
        name = obj.name
        if name == "Breastplate":
            _scale_about_center(obj, 1.00, 1.14, 1.00)
        elif name in {"BackArmor", "TorsoUnder"}:
            _scale_about_center(obj, 1.00, 1.10, 1.00)
        elif name.startswith(("UpperArmPlate.", "Vambrace.", "Gauntlet.")):
            _scale_about_center(obj, 1.00, 1.08, 1.00)
        elif name.startswith(("Cuisse.", "KneePlate.", "Greave.")):
            _scale_about_center(obj, 1.00, 1.08, 1.00)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 1.00, 1.05, 1.00)


def _shape_rear_cloth_side(model: ModelParts) -> None:
    """Give the rear cloth a visible rearward fall in side view."""
    for obj in model.objects:
        if obj.name != "TabardBack" or obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            # Push lower cloth farther rearward, while leaving its belt root close
            # to the body.  This creates a cape/tabard fall rather than a red line.
            if vertex.co.z < 0.70:
                vertex.co.y -= 0.070
            elif vertex.co.z < 1.00:
                vertex.co.y -= 0.050
            elif vertex.co.z < 1.20:
                vertex.co.y -= 0.030
            else:
                vertex.co.y -= 0.015
        obj.data.update()


def apply_authoritative_final_form(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _remove_superseded_overlays(model)
    model = _rebuild_final_helmet(model, armature, materials)
    _restore_side_mass(model)
    _shape_rear_cloth_side(model)
    return model
