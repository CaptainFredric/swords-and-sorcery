from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _remove, _scale_about_center
from .authoritative_model import _add_rigid, _folded_panel, _loft, _prism_xz
from .model import ModelParts


_OLD_WAIST_Z = 1.075
_NEW_WAIST_Z = 1.205
_TOP_Z = 2.235
_LOWER_SCALE = _NEW_WAIST_Z / _OLD_WAIST_Z
_UPPER_SCALE = (_TOP_Z - _NEW_WAIST_Z) / (_TOP_Z - _OLD_WAIST_Z)


def _hero_z(z: float) -> float:
    if z <= _OLD_WAIST_Z:
        return z * _LOWER_SCALE
    return _NEW_WAIST_Z + (z - _OLD_WAIST_Z) * _UPPER_SCALE


def _remap_vertical_proportions(model: ModelParts) -> None:
    """Give the neutral silhouette the concept's longer-legged heroic ratio.

    Ground and crest height stay fixed.  The belt rises while the upper body is
    compacted slightly, matching the supplied front reference instead of the
    previous 50/50 upper/lower split.
    """
    for obj in model.objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.z = _hero_z(vertex.co.z)
        obj.data.update()


def _rebuild_identity_masses(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {
        "HelmetShell",
        "HelmetJaw",
        "Breastplate",
        "BackArmor",
        "CrimsonScarf",
        "TabardBack",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # Bucket helmet: compact crown, pronounced front mask and a tapered rear
    # skull.  These Y depths are deliberately asymmetric so the side view is
    # not another rectangular extrusion.
    _add_rigid(parts, _loft("HelmetShell", (
        (1.640, 0.0, 0.090, 0.095, -0.120),
        (1.690, 0.0, 0.145, 0.205, -0.165),
        (1.760, 0.0, 0.190, 0.285, -0.205),
        (1.855, 0.0, 0.205, 0.305, -0.225),
        (1.945, 0.0, 0.195, 0.270, -0.225),
        (2.015, 0.0, 0.160, 0.195, -0.190),
        (2.055, 0.0, 0.110, 0.105, -0.135),
    ), materials["SteelEdge"]), armature, "head")

    _add_rigid(parts, _loft("HelmetJaw", (
        (1.620, 0.0, 0.060, 0.160, -0.040),
        (1.665, 0.0, 0.120, 0.245, -0.070),
        (1.730, 0.0, 0.175, 0.305, -0.105),
        (1.805, 0.0, 0.185, 0.315, -0.125),
    ), materials["DarkSteel"]), armature, "head")

    # The concept breastplate projects forward at the sternum, tucks hard at
    # the waist, and has a separate shoulder-blade mass behind it.
    _add_rigid(parts, _loft("Breastplate", (
        (1.070, 0.0, 0.205, 0.175, -0.005),
        (1.145, 0.0, 0.245, 0.225, -0.020),
        (1.285, 0.0, 0.325, 0.305, -0.045),
        (1.420, 0.0, 0.350, 0.335, -0.060),
        (1.525, 0.0, 0.305, 0.270, -0.045),
        (1.575, 0.0, 0.245, 0.190, -0.025),
    ), materials["SteelEdge"]), armature, "chest")

    _add_rigid(parts, _loft("BackArmor", (
        (1.075, 0.0, 0.205, -0.070, -0.175),
        (1.190, 0.0, 0.260, -0.075, -0.225),
        (1.360, 0.0, 0.315, -0.080, -0.270),
        (1.500, 0.0, 0.310, -0.075, -0.255),
        (1.565, 0.0, 0.250, -0.060, -0.205),
    ), materials["DarkSteel"]), armature, "chest")

    _add_rigid(parts, _loft("CrimsonScarf", (
        (1.500, 0.0, 0.240, 0.155, -0.135),
        (1.555, 0.0, 0.315, 0.235, -0.185),
        (1.625, 0.0, 0.300, 0.225, -0.180),
        (1.675, 0.0, 0.235, 0.155, -0.140),
    ), materials["CrimsonCloth"]), armature, "neck")

    # Narrow, folded rear cloth rather than the previous red plank.
    _add_rigid(parts, _folded_panel("TabardBack", (
        (0.430, 0.085, -0.360),
        (0.640, 0.105, -0.345),
        (0.875, 0.125, -0.320),
        (1.105, 0.145, -0.285),
        (1.330, 0.155, -0.250),
        (1.505, 0.145, -0.215),
    ), thickness=0.028, fold=-0.055, material=materials["CrimsonCloth"]), armature, "tabard_back_01")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _shape_armor_read(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name.startswith(("Pauldron.", "PauldronFacet.", "PauldronTrim.", "PauldronLower.")):
            _scale_about_center(obj, 1.06, 1.12, 0.96)
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.05, 1.08, 1.02)
        elif name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckle")):
            _scale_about_center(obj, 1.07, 1.06, 1.03)
        elif name.startswith(("Cuisse.", "Greave.")):
            _scale_about_center(obj, 1.06, 1.08, 1.02)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.08, 1.07, 1.02)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 1.02, 0.94, 1.03)


def _add_breastplate_center_ridge(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove(model, {"BreastplateCenterRidge"})
    parts: list[bpy.types.Object] = []
    ridge = _prism_xz(
        "BreastplateCenterRidge",
        (
            (-0.035, 1.135), (0.035, 1.135), (0.055, 1.300),
            (0.035, 1.500), (0.0, 1.545), (-0.035, 1.500), (-0.055, 1.300),
        ),
        front_y=0.356,
        back_y=0.326,
        material=materials["SteelEdge"],
    )
    _add_rigid(parts, ridge, armature, "chest")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v3(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_identity_masses(model, armature, materials)
    _shape_armor_read(model)
    model = _add_breastplate_center_ridge(model, armature, materials)
    _remap_vertical_proportions(model)
    return model
