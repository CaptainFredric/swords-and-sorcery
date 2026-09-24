from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _remove, _scale_about_center
from .authoritative_model import _add_rigid, _loft, _prism_xz
from .model import ModelParts


_STAGE_WAIST = 1.205
_TARGET_WAIST = 1.310
_STAGE_SHOULDER = 1.650
_TARGET_SHOULDER = 1.670
_TOP = 2.235


def _stage2_z(z: float) -> float:
    if z <= _STAGE_WAIST:
        return z * (_TARGET_WAIST / _STAGE_WAIST)
    if z <= _STAGE_SHOULDER:
        return _TARGET_WAIST + (z - _STAGE_WAIST) * (
            (_TARGET_SHOULDER - _TARGET_WAIST) / (_STAGE_SHOULDER - _STAGE_WAIST)
        )
    return _TARGET_SHOULDER + (z - _STAGE_SHOULDER) * (
        (_TOP - _TARGET_SHOULDER) / (_TOP - _STAGE_SHOULDER)
    )


def _finish_heroic_ratio(model: ModelParts) -> None:
    for obj in model.objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.z = _stage2_z(vertex.co.z)
        obj.data.update()


def _rebuild_pauldrons(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove(model, {
        "Pauldron.L", "Pauldron.R",
        "PauldronFacet.L", "PauldronFacet.R",
        "PauldronTrim.L", "PauldronTrim.R",
    })
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.430 * sign
        shell = _loft(
            f"Pauldron.{side}",
            (
                (1.335, cx, 0.105, 0.115, -0.090),
                (1.420, cx, 0.150, 0.195, -0.135),
                (1.535, cx, 0.160, 0.220, -0.155),
                (1.625, cx, 0.115, 0.140, -0.115),
            ),
            materials["DarkSteel"],
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        raw = (
            (0.300, 1.455),
            (0.345, 1.565),
            (0.430, 1.615),
            (0.515, 1.600),
            (0.565, 1.535),
            (0.550, 1.445),
            (0.500, 1.380),
            (0.405, 1.390),
            (0.330, 1.425),
        )
        facet = _prism_xz(
            f"PauldronFacet.{side}",
            tuple((x * sign, z) for x, z in raw),
            front_y=0.238,
            back_y=0.210,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

        trim_raw = (
            (0.305, 1.505),
            (0.350, 1.590),
            (0.430, 1.632),
            (0.515, 1.612),
            (0.568, 1.548),
            (0.535, 1.515),
            (0.472, 1.563),
            (0.430, 1.582),
            (0.388, 1.558),
            (0.338, 1.485),
        )
        trim = _prism_xz(
            f"PauldronTrim.{side}",
            tuple((x * sign, z) for x, z in trim_raw),
            front_y=0.258,
            back_y=0.242,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _single_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _scale_x_from_origin(obj: bpy.types.Object, factor: float) -> None:
    if obj.type != "MESH":
        return
    for vertex in obj.data.vertices:
        vertex.co.x *= factor
    obj.data.update()


def _narrow_upper_silhouette(model: ModelParts) -> None:
    helmet_prefixes = (
        "Helmet", "FaceRecess", "Visor", "Crest", "CrimsonScarf",
    )
    torso_prefixes = (
        "TorsoUnder", "Breastplate", "BackArmor", "ChestFacet.",
        "BreastplateTrim.", "BreastplateCollar", "BreastplateCenterRidge",
    )
    shoulder_arm_prefixes = (
        "Pauldron.", "PauldronFacet.", "PauldronTrim.", "PauldronLower.",
        "ShoulderBadge.", "UpperArmPlate.", "UpperArmFacet.", "ArmUnder.",
        "ForearmUnder.", "Vambrace.", "Gauntlet.", "GauntletCuff.",
        "GauntletKnuckle", "GauntletFinger",
    )

    for obj in model.objects:
        name = obj.name
        if name.startswith(helmet_prefixes):
            _scale_x_from_origin(obj, 0.88)
        elif name.startswith(torso_prefixes):
            _scale_x_from_origin(obj, 0.90)
        elif name.startswith(shoulder_arm_prefixes):
            _scale_x_from_origin(obj, 0.92)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "KneePlate.", "KneeTrim.", "Greave.", "GreaveFacet.")):
            _scale_about_center(obj, 0.94, 1.0, 1.0)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 0.94, 1.0, 1.0)


def _bulk_limbs_and_refine_material_read(
    model: ModelParts,
    materials: dict[str, bpy.types.Material],
) -> None:
    for obj in model.objects:
        name = obj.name
        if name.startswith(("PauldronLower.", "ShoulderBadge.", "PauldronTrimTop.")):
            _scale_about_center(obj, 0.90, 1.05, 1.01)
        elif name.startswith(("ArmUnder.", "ForearmUnder.")):
            _scale_about_center(obj, 1.18, 1.16, 1.02)
        elif name.startswith(("UpperArmPlate.", "Vambrace.", "UpperArmFacet.")):
            _scale_about_center(obj, 1.14, 1.14, 1.02)
        elif name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckle", "GauntletFinger")):
            _scale_about_center(obj, 1.18, 1.16, 1.04)
        elif name.startswith(("ThighUnder.", "ShinUnder.")):
            _scale_about_center(obj, 1.20, 1.18, 1.01)
        elif name.startswith(("Cuisse.", "CuisseFacet.")):
            _scale_about_center(obj, 1.18, 1.16, 1.01)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.14, 1.12, 1.02)
        elif name.startswith(("Greave.", "GreaveFacet.")):
            _scale_about_center(obj, 1.18, 1.16, 1.01)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 1.04, 0.92, 1.00)
        elif name == "TabardFront":
            _scale_about_center(obj, 1.04, 1.02, 1.03)
        elif name == "SwordBladeFacet":
            _scale_about_center(obj, 0.82, 1.0, 0.82)
        elif name.startswith(("SwordGuard", "SwordPommel")):
            _scale_about_center(obj, 1.18, 1.12, 1.18)
        elif name == "SwordGem":
            _scale_about_center(obj, 1.30, 1.18, 1.30)
        elif name.startswith(("BeltBuckle", "BeltMedallion")):
            _scale_about_center(obj, 1.12, 1.05, 1.12)

        if name in {"Boot.L", "Boot.R", "BootHeel.L", "BootHeel.R"}:
            _single_material(obj, materials["DarkSteel"])
        elif name.startswith("BootSole"):
            _single_material(obj, materials["Leather"])
        elif name.startswith(("BootToe", "BootTop")):
            _single_material(obj, materials["SteelEdge"])
        elif name in {"Gauntlet.L", "Gauntlet.R"}:
            _single_material(obj, materials["DarkSteel"])
        elif name.startswith("GauntletKnuckle"):
            _single_material(obj, materials["SteelEdge"])


def apply_concept_accuracy_pass_v4(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_pauldrons(model, armature, materials)
    _bulk_limbs_and_refine_material_read(model, materials)
    _narrow_upper_silhouette(model)
    _finish_heroic_ratio(model)
    return model
