from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _remove, _scale_about_center
from .authoritative_model import _add_rigid, _folded_panel, _loft
from .model import ModelParts


def _rebuild_primary_profile(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {"HelmetShell", "HelmetJaw", "TorsoUnder", "Breastplate", "BackArmor"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # The concept's helmet is a tapered bucket, not a rectangular side extrusion.
    helmet = _loft(
        "HelmetShell",
        (
            (1.640, 0.0, 0.105, 0.125, -0.090),
            (1.690, 0.0, 0.160, 0.205, -0.145),
            (1.760, 0.0, 0.205, 0.275, -0.185),
            (1.860, 0.0, 0.218, 0.300, -0.205),
            (1.955, 0.0, 0.205, 0.265, -0.205),
            (2.030, 0.0, 0.165, 0.185, -0.165),
            (2.060, 0.0, 0.110, 0.115, -0.110),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, helmet, armature, "head")

    jaw = _loft(
        "HelmetJaw",
        (
            (1.625, 0.0, 0.070, 0.185, -0.060),
            (1.670, 0.0, 0.135, 0.255, -0.105),
            (1.735, 0.0, 0.180, 0.290, -0.125),
            (1.810, 0.0, 0.188, 0.292, -0.130),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, jaw, armature, "head")

    # Ribcage depth and waist taper are explicit in the side reference.
    under = _loft(
        "TorsoUnder",
        (
            (1.015, 0.0, 0.235, 0.130, -0.125),
            (1.120, 0.0, 0.255, 0.155, -0.145),
            (1.300, 0.0, 0.305, 0.185, -0.170),
            (1.470, 0.0, 0.325, 0.195, -0.180),
            (1.555, 0.0, 0.285, 0.165, -0.155),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, under, armature, "chest")

    breast = _loft(
        "Breastplate",
        (
            (1.070, 0.0, 0.215, 0.185, -0.020),
            (1.155, 0.0, 0.265, 0.235, -0.035),
            (1.310, 0.0, 0.335, 0.285, -0.055),
            (1.445, 0.0, 0.350, 0.300, -0.065),
            (1.535, 0.0, 0.310, 0.245, -0.055),
            (1.575, 0.0, 0.250, 0.180, -0.040),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, breast, armature, "chest")

    back = _loft(
        "BackArmor",
        (
            (1.070, 0.0, 0.215, -0.090, -0.190),
            (1.200, 0.0, 0.275, -0.105, -0.235),
            (1.385, 0.0, 0.325, -0.105, -0.255),
            (1.520, 0.0, 0.315, -0.095, -0.240),
            (1.565, 0.0, 0.260, -0.085, -0.205),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, back, armature, "chest")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _bulk_armored_anatomy(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.12, 1.10, 1.03)
        elif name.startswith(("GauntletCuff.", "Gauntlet.", "GauntletKnuckles.")):
            _scale_about_center(obj, 1.10, 1.08, 1.04)
        elif name.startswith(("Cuisse.", "CuisseFacet.")):
            _scale_about_center(obj, 1.12, 1.10, 1.02)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.12, 1.10, 1.05)
        elif name.startswith(("Greave.", "GreaveFacet.")):
            _scale_about_center(obj, 1.10, 1.09, 1.04)
        elif name.startswith("Boot."):
            _scale_about_center(obj, 1.03, 0.98, 1.12)
        elif name.startswith("BootToePlate."):
            _scale_about_center(obj, 1.02, 0.96, 1.10)
        elif name in {"Belt", "BeltBuckle", "BeltBuckleInset", "BeltMedallion", "BeltMedallionInset"}:
            _scale_about_center(obj, 1.06, 1.04, 1.10)
        elif name.startswith(("BeltPouch.", "BeltPouchFlap.", "BeltDropStrap.")):
            _scale_about_center(obj, 1.08, 1.04, 1.08)

    facet = next((obj for obj in model.objects if obj.name == "SwordBladeFacet"), None)
    if facet is not None:
        _scale_about_center(facet, 0.82, 1.0, 0.82)

    for obj in model.objects:
        if obj.name == "SorceryCore":
            _scale_about_center(obj, 1.22, 1.22, 1.22)
        elif obj.name.startswith("SorceryShard"):
            _scale_about_center(obj, 1.16, 1.16, 1.16)


def _narrow_rear_cloth(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove(model, {"TabardBack"})
    parts: list[bpy.types.Object] = []
    back = _folded_panel(
        "TabardBack",
        (
            (0.460, 0.105, -0.395),
            (0.680, 0.115, -0.360),
            (0.930, 0.130, -0.320),
            (1.190, 0.145, -0.275),
            (1.420, 0.155, -0.240),
            (1.535, 0.150, -0.220),
        ),
        thickness=0.032,
        fold=-0.026,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v2(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Correct side-profile boxes and restore the concept's armored anatomy."""
    model = _rebuild_primary_profile(model, armature, materials)
    _bulk_armored_anatomy(model)
    model = _narrow_rear_cloth(model, armature, materials)
    return model
