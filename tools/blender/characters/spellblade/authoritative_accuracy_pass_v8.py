from __future__ import annotations

from collections.abc import Sequence

import bpy

from .authoritative_accuracy_pass import _remove
from .authoritative_model import _add_rigid, _loft, _mesh, _prism_xz
from .model import ModelParts


def _prism_yz(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    left_x: float,
    right_x: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Extrude an authored side-view Y/Z profile across X."""
    n = len(points)
    vertices = [(left_x, y, z) for y, z in points]
    vertices.extend((right_x, y, z) for y, z in points)
    faces: list[tuple[int, ...]] = [tuple(range(n)), tuple(reversed(tuple(n + i for i in range(n))))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return _mesh(name, vertices, faces, material)


def _rebuild_helmet_side_shell(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove(model, {"HelmetShell", "HelmetJaw", "HelmetRearPlate"})
    parts: list[bpy.types.Object] = []

    # Side silhouette follows the reference: short rear wall, sloped crown,
    # projected brow/visor, then a tucked lower jaw.  Front face plates from v6
    # sit over this shell and preserve the cyan-T identity.
    shell = _prism_yz(
        "HelmetShell",
        (
            (-0.185, 1.775),
            (-0.208, 1.930),
            (-0.175, 2.060),
            (-0.080, 2.155),
            (0.035, 2.188),
            (0.155, 2.145),
            (0.252, 2.075),
            (0.300, 1.980),
            (0.282, 1.885),
            (0.225, 1.805),
            (0.100, 1.752),
            (-0.050, 1.745),
        ),
        left_x=-0.192,
        right_x=0.192,
        material=materials["SteelEdge"],
    )
    _add_rigid(parts, shell, armature, "head")

    jaw = _prism_yz(
        "HelmetJaw",
        (
            (-0.090, 1.805),
            (0.070, 1.792),
            (0.205, 1.820),
            (0.305, 1.900),
            (0.315, 1.970),
            (0.270, 1.985),
            (0.225, 1.900),
            (0.105, 1.825),
            (-0.045, 1.825),
        ),
        left_x=-0.165,
        right_x=0.165,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, jaw, armature, "head")

    rear = _prism_yz(
        "HelmetRearPlate",
        (
            (-0.220, 1.830),
            (-0.232, 2.005),
            (-0.180, 2.090),
            (-0.135, 2.060),
            (-0.165, 1.840),
        ),
        left_x=-0.172,
        right_x=0.172,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, rear, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_layered_shoulders(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({
            f"Pauldron.{side}", f"PauldronFacet.{side}", f"PauldronTrim.{side}",
            f"PauldronLower.{side}", f"ShoulderBadge.{side}",
        })
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.445 * sign
        cap = _loft(
            f"Pauldron.{side}",
            (
                (1.505, cx, 0.120, 0.080, -0.095),
                (1.565, cx, 0.165, 0.115, -0.125),
                (1.640, cx, 0.190, 0.145, -0.145),
                (1.700, cx, 0.165, 0.120, -0.125),
                (1.735, cx, 0.105, 0.070, -0.080),
            ),
            materials["DarkSteel"],
        )
        _add_rigid(parts, cap, armature, f"clavicle.{side}")

        facet_raw = (
            (0.305, 1.655), (0.405, 1.720), (0.530, 1.700),
            (0.590, 1.635), (0.560, 1.570), (0.470, 1.535),
            (0.355, 1.570),
        )
        facet = _prism_xz(
            f"PauldronFacet.{side}",
            tuple((x * sign, z) for x, z in facet_raw),
            front_y=0.162,
            back_y=0.130,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

        trim_raw = (
            (0.325, 1.675), (0.405, 1.724), (0.515, 1.710),
            (0.570, 1.660), (0.545, 1.635), (0.455, 1.670),
            (0.365, 1.645),
        )
        trim = _prism_xz(
            f"PauldronTrim.{side}",
            tuple((x * sign, z) for x, z in trim_raw),
            front_y=0.184,
            back_y=0.160,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower_raw = (
            (0.350, 1.555), (0.535, 1.570), (0.550, 1.525),
            (0.500, 1.455), (0.415, 1.445), (0.360, 1.495),
        )
        lower = _prism_xz(
            f"PauldronLower.{side}",
            tuple((x * sign, z) for x, z in lower_raw),
            front_y=0.120,
            back_y=-0.105,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

        badge = _prism_xz(
            f"ShoulderBadge.{side}",
            (
                (0.480 * sign, 1.665), (0.520 * sign, 1.625),
                (0.480 * sign, 1.585), (0.440 * sign, 1.625),
            ),
            front_y=0.196,
            back_y=0.178,
            material=materials["Brass"],
        )
        _add_rigid(parts, badge, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v8(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_helmet_side_shell(model, armature, materials)
    model = _rebuild_layered_shoulders(model, armature, materials)
    return model
