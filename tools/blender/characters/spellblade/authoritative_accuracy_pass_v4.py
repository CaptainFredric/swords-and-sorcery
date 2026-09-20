from __future__ import annotations

from collections.abc import Sequence

import bpy

from .authoritative_accuracy_pass import _remove, _scale_about_center
from .authoritative_model import _add_rigid, _mesh, _prism_xz
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
    """Raise the belt and hip line without shrinking the helmet identity."""
    for obj in model.objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.z = _stage2_z(vertex.co.z)
        obj.data.update()


def _wedge_profile(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    center_x: float,
    center_z: float,
    front_y: float,
    back_y: float,
    back_x_scale: float,
    back_z_scale: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    front = [(x, front_y, z) for x, z in points]
    back = [
        (
            center_x + (x - center_x) * back_x_scale,
            back_y,
            center_z + (z - center_z) * back_z_scale,
        )
        for x, z in points
    ]
    vertices = tuple((*front, *back))
    n = len(points)
    faces: list[tuple[int, ...]] = [tuple(range(n)), tuple(reversed(tuple(n + i for i in range(n))))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return _mesh(name, vertices, faces, material)


def _rebuild_pauldrons(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    remove_names = {
        "Pauldron.L", "Pauldron.R",
        "PauldronFacet.L", "PauldronFacet.R",
    }
    kept = _remove(model, remove_names)
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.475 * sign
        raw = (
            (0.300, 1.485),
            (0.345, 1.590),
            (0.455, 1.655),
            (0.565, 1.645),
            (0.645, 1.565),
            (0.625, 1.430),
            (0.555, 1.345),
            (0.420, 1.360),
            (0.325, 1.420),
        )
        points = tuple((x * sign, z) for x, z in raw)
        shell = _wedge_profile(
            f"Pauldron.{side}",
            points,
            center_x=cx,
            center_z=1.505,
            front_y=0.230,
            back_y=-0.155,
            back_x_scale=0.82,
            back_z_scale=0.88,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        facet_raw = (
            (0.340, 1.485),
            (0.390, 1.565),
            (0.470, 1.610),
            (0.550, 1.600),
            (0.600, 1.545),
            (0.585, 1.455),
            (0.530, 1.395),
            (0.430, 1.405),
            (0.360, 1.445),
        )
        facet_points = tuple((x * sign, z) for x, z in facet_raw)
        facet = _prism_xz(
            f"PauldronFacet.{side}",
            facet_points,
            front_y=0.255,
            back_y=0.228,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _bulk_limbs_and_reduce_blockiness(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name.startswith(("PauldronTrim.", "PauldronLower.", "ShoulderBadge.", "PauldronTrimTop.")):
            _scale_about_center(obj, 0.90, 1.06, 1.02)
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


def apply_concept_accuracy_pass_v4(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_pauldrons(model, armature, materials)
    _bulk_limbs_and_reduce_blockiness(model)
    _finish_heroic_ratio(model)
    return model
