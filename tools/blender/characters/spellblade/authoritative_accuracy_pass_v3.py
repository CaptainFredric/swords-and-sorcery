from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_accuracy_pass import _remove, _scale_about_center
from .authoritative_model import (
    _add_rigid,
    _add_socket,
    _diamond,
    _folded_panel,
    _loft,
    _prism_xz,
    _segment,
)
from .model import ModelParts, _beveled_box


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
    """Match the final geometry to the heroic rig landmarks.

    Ground and crest stay fixed while the belt rises, lengthening the legs and
    slightly compressing the upper body to the supplied concept proportions.
    """
    for obj in model.objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.z = _hero_z(vertex.co.z)
        obj.data.update()


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


def _set_base_color(material: bpy.types.Material, rgba: tuple[float, float, float, float]) -> None:
    material.diffuse_color = rgba
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba


def _retune_final_palette(materials: dict[str, bpy.types.Material]) -> None:
    _set_base_color(materials["DarkSteel"], (0.085, 0.105, 0.135, 1.0))
    _set_base_color(materials["SteelEdge"], (0.34, 0.38, 0.44, 1.0))
    _set_base_color(materials["Brass"], (0.56, 0.38, 0.18, 1.0))
    _set_base_color(materials["CrimsonCloth"], (0.34, 0.025, 0.038, 1.0))
    _set_base_color(materials["Leather"], (0.055, 0.030, 0.020, 1.0))


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

    # Compact faceted bucket with real rear skull depth and a projected mask.
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

    # Ribcage volume: broad at upper chest, hard tuck into the belt.
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

    _add_rigid(parts, _folded_panel("TabardBack", (
        (0.430, 0.085, -0.360),
        (0.640, 0.105, -0.345),
        (0.875, 0.125, -0.320),
        (1.105, 0.145, -0.285),
        (1.330, 0.155, -0.250),
        (1.505, 0.145, -0.215),
    ), thickness=0.028, fold=-0.055, material=materials["CrimsonCloth"]), armature, "tabard_back_01")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_shoulders(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        prefixes=("Pauldron.", "PauldronShell.", "PauldronFacet.", "PauldronTrim.", "PauldronLower.", "ShoulderBadge."),
    )
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        # Layered shield profile instead of the old rounded loft.
        shell = _prism_xz(
            f"Pauldron.{side}",
            (
                (0.315 * sign, 1.535),
                (0.405 * sign, 1.605),
                (0.525 * sign, 1.590),
                (0.610 * sign, 1.520),
                (0.600 * sign, 1.410),
                (0.535 * sign, 1.335),
                (0.415 * sign, 1.355),
                (0.345 * sign, 1.430),
            ),
            front_y=0.225,
            back_y=-0.155,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        rear_shell = _prism_xz(
            f"PauldronShell.{side}",
            (
                (0.340 * sign, 1.505),
                (0.425 * sign, 1.565),
                (0.535 * sign, 1.550),
                (0.585 * sign, 1.485),
                (0.555 * sign, 1.405),
                (0.430 * sign, 1.405),
            ),
            front_y=-0.130,
            back_y=-0.220,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, rear_shell, armature, f"clavicle.{side}")

        trim = _prism_xz(
            f"PauldronTrim.{side}",
            (
                (0.330 * sign, 1.548),
                (0.405 * sign, 1.625),
                (0.530 * sign, 1.610),
                (0.625 * sign, 1.535),
                (0.603 * sign, 1.497),
                (0.520 * sign, 1.560),
                (0.415 * sign, 1.575),
                (0.350 * sign, 1.515),
            ),
            front_y=0.250,
            back_y=0.220,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower = _prism_xz(
            f"PauldronLower.{side}",
            (
                (0.375 * sign, 1.405),
                (0.555 * sign, 1.390),
                (0.575 * sign, 1.335),
                (0.525 * sign, 1.270),
                (0.435 * sign, 1.285),
                (0.390 * sign, 1.335),
            ),
            front_y=0.155,
            back_y=-0.120,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

        badge = _diamond(
            f"ShoulderBadge.{side}",
            (0.520 * sign, 0.275, 1.470),
            (0.035, 0.020, 0.035),
            materials["Brass"],
        )
        _add_rigid(parts, badge, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_breastplate_face(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        exact={"BreastplateRidge", "BreastplateCenterRidge", "BreastplateFace"},
        prefixes=("ChestFacet.", "BreastplateTrim."),
    )
    parts: list[bpy.types.Object] = []

    face = _prism_xz(
        "BreastplateFace",
        (
            (-0.245, 1.535),
            (-0.325, 1.455),
            (-0.330, 1.355),
            (-0.275, 1.185),
            (-0.175, 1.095),
            (0.0, 1.070),
            (0.175, 1.095),
            (0.275, 1.185),
            (0.330, 1.355),
            (0.325, 1.455),
            (0.245, 1.535),
            (0.085, 1.570),
            (-0.085, 1.570),
        ),
        front_y=0.315,
        back_y=0.288,
        material=materials["SteelEdge"],
    )
    _add_rigid(parts, face, armature, "chest")

    ridge = _prism_xz(
        "BreastplateRidge",
        ((-0.022, 1.105), (0.022, 1.105), (0.030, 1.465), (0.0, 1.530), (-0.030, 1.465)),
        front_y=0.332,
        back_y=0.315,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, ridge, armature, "chest")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        edge = _prism_xz(
            f"BreastplateTrim.{side}",
            (
                (0.232 * sign, 1.535),
                (0.318 * sign, 1.465),
                (0.323 * sign, 1.395),
                (0.285 * sign, 1.385),
                (0.270 * sign, 1.445),
                (0.205 * sign, 1.505),
            ),
            front_y=0.338,
            back_y=0.316,
            material=materials["Brass"],
        )
        _add_rigid(parts, edge, armature, "chest")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _refine_lower_body(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("GreaveFace.", "BootInstepTrim."))
    parts: list[bpy.types.Object] = []

    for obj in kept:
        if obj.name.startswith(("Greave.", "GreaveTrim.")):
            _scale_about_center(obj, 1.08, 1.05, 1.03)
        elif obj.name.startswith(("Boot.", "BootToePlate.", "BootSole.", "BootHeel.")):
            _scale_about_center(obj, 0.90, 0.93, 1.02)

    for side, sign in (("L", -1.0), ("R", 1.0)):
        face = _prism_xz(
            f"GreaveFace.{side}",
            (
                (0.185 * sign, 0.535),
                (0.310 * sign, 0.515),
                (0.305 * sign, 0.250),
                (0.275 * sign, 0.185),
                (0.215 * sign, 0.195),
                (0.180 * sign, 0.300),
            ),
            front_y=0.175,
            back_y=0.140,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, face, armature, f"shin.{side}")

        instep = _prism_xz(
            f"BootInstepTrim.{side}",
            (
                (0.165 * sign, 0.185),
                (0.395 * sign, 0.175),
                (0.385 * sign, 0.135),
                (0.185 * sign, 0.145),
            ),
            front_y=0.220,
            back_y=0.155,
            material=materials["Brass"],
        )
        _add_rigid(parts, instep, armature, f"foot.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _refine_gauntlets(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("GauntletBackplate.", "GauntletFingerRidge."))
    parts: list[bpy.types.Object] = []

    for obj in kept:
        if obj.name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckles.")):
            _scale_about_center(obj, 1.10, 1.08, 1.06)

    for side, sign in (("L", -1.0), ("R", 1.0)):
        backplate = _prism_xz(
            f"GauntletBackplate.{side}",
            (
                (0.500 * sign, 0.930),
                (0.575 * sign, 0.900),
                (0.610 * sign, 0.835),
                (0.570 * sign, 0.795),
                (0.505 * sign, 0.820),
            ),
            front_y=0.185,
            back_y=0.145,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, backplate, armature, f"hand.{side}")

        ridge = _beveled_box(
            f"GauntletFingerRidge.{side}",
            (0.565 * sign, 0.205, 0.810),
            (0.120, 0.035, 0.035),
            materials["Brass"],
            bevel=0.004,
        )
        _add_rigid(parts, ridge, armature, f"hand.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_sword_hilt(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        exact={"SwordGuard", "SwordGuardOuter", "SwordGrip", "SwordGem", "SwordPommel"},
    )
    parts: list[bpy.types.Object] = []

    base = Vector((0.525, 0.105, 0.835))
    tip = Vector((1.030, 0.105, 0.150))
    axis = Vector((tip.x - base.x, 0.0, tip.z - base.z)).normalized()
    perp = Vector((-axis.z, 0.0, axis.x))
    guard_center = base - axis * 0.018

    outer = _segment(
        "SwordGuardOuter",
        tuple(guard_center + perp * 0.245),
        tuple(guard_center - perp * 0.245),
        start_width=0.095,
        end_width=0.095,
        start_depth=0.102,
        end_depth=0.102,
        material=materials["Brass"],
        bulge=1.00,
    )
    _add_socket(parts, outer, armature, "socket_sword")

    inner = _segment(
        "SwordGuard",
        tuple(guard_center + perp * 0.145),
        tuple(guard_center - perp * 0.145),
        start_width=0.052,
        end_width=0.052,
        start_depth=0.110,
        end_depth=0.110,
        material=materials["DarkSteel"],
        bulge=1.00,
    )
    _add_socket(parts, inner, armature, "socket_sword")

    grip_start = base - axis * 0.050
    grip_end = base - axis * 0.215
    grip = _segment(
        "SwordGrip",
        tuple(grip_start),
        tuple(grip_end),
        start_width=0.072,
        end_width=0.064,
        start_depth=0.076,
        end_depth=0.067,
        material=materials["Leather"],
        bulge=1.00,
    )
    _add_socket(parts, grip, armature, "socket_sword")

    _add_socket(parts, _diamond("SwordPommel", tuple(grip_end - axis * 0.052), (0.060, 0.050, 0.060), materials["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.060, 0.0))), (0.045, 0.022, 0.045), materials["CrimsonCloth"]), armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v3(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    _retune_final_palette(materials)
    model = _rebuild_identity_masses(model, armature, materials)
    model = _rebuild_shoulders(model, armature, materials)
    model = _rebuild_breastplate_face(model, armature, materials)
    model = _refine_lower_body(model, armature, materials)
    model = _refine_gauntlets(model, armature, materials)
    model = _rebuild_sword_hilt(model, armature, materials)
    _remap_vertical_proportions(model)
    return model
