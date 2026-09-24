from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_model import (
    _add_rigid,
    _add_socket,
    _diamond,
    _folded_panel,
    _prism_xz,
    _segment,
)
from .model import ModelParts


def _mesh_center(obj: bpy.types.Object) -> Vector:
    if obj.type != "MESH" or not obj.data.vertices:
        return Vector((0.0, 0.0, 0.0))
    center = Vector((0.0, 0.0, 0.0))
    for vertex in obj.data.vertices:
        center += vertex.co
    return center / len(obj.data.vertices)


def _scale_about_center(obj: bpy.types.Object, sx: float, sy: float, sz: float) -> None:
    if obj.type != "MESH" or not obj.data.vertices:
        return
    center = _mesh_center(obj)
    scale = Vector((sx, sy, sz))
    for vertex in obj.data.vertices:
        vertex.co = center + (vertex.co - center) * scale
    obj.data.update()


def _remove(model: ModelParts, names: set[str]) -> list[bpy.types.Object]:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def _strengthen_armor_mass(model: ModelParts) -> None:
    for obj in model.objects:
        name = obj.name
        if name.startswith(("Pauldron.", "PauldronFacet.", "PauldronTrim.", "PauldronLower.", "ShoulderBadge.")):
            _scale_about_center(obj, 1.20, 1.13, 1.12)
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.16, 1.14, 1.04)
        elif name.startswith(("GauntletCuff.", "Gauntlet.", "GauntletKnuckles.")):
            _scale_about_center(obj, 1.12, 1.10, 1.05)
        elif name.startswith(("Cuisse.", "CuisseFacet.")):
            _scale_about_center(obj, 1.18, 1.14, 1.03)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 1.20, 1.15, 1.08)
        elif name.startswith(("Greave.", "GreaveFacet.")):
            _scale_about_center(obj, 1.17, 1.14, 1.04)
        elif name.startswith("Boot."):
            _scale_about_center(obj, 1.04, 0.96, 1.12)
        elif name.startswith("BootToePlate."):
            _scale_about_center(obj, 1.04, 0.92, 1.15)
        elif name == "Breastplate":
            _scale_about_center(obj, 1.035, 1.05, 1.00)


def _augment_helmet(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {"HelmetCrownPlate.L", "HelmetCrownPlate.R", "HelmetTemplePlate.L", "HelmetTemplePlate.R"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # Broad crown plates are a defining feature in the concept: they descend from
    # the crown toward the brow and make the cyan T feel recessed inside armor.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        crown = _prism_xz(
            f"HelmetCrownPlate.{side}",
            (
                (0.018 * sign, 2.035),
                (0.165 * sign, 2.030),
                (0.200 * sign, 1.980),
                (0.188 * sign, 1.895),
                (0.142 * sign, 1.815),
                (0.105 * sign, 1.845),
                (0.098 * sign, 1.950),
            ),
            front_y=0.326,
            back_y=0.288,
            material=m["Brass"],
        )
        _add_rigid(parts, crown, armature, "head")

        temple = _prism_xz(
            f"HelmetTemplePlate.{side}",
            (
                (0.135 * sign, 1.900),
                (0.205 * sign, 1.915),
                (0.208 * sign, 1.805),
                (0.168 * sign, 1.720),
                (0.125 * sign, 1.750),
            ),
            front_y=0.330,
            back_y=0.300,
            material=m["SteelEdge"],
        )
        _add_rigid(parts, temple, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_sword(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {"HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGrip", "SwordGem", "SwordPommel"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    base = Vector((0.525, 0.105, 0.835))
    tip = Vector((1.030, 0.105, 0.150))
    axis = Vector((tip.x - base.x, 0.0, tip.z - base.z)).normalized()
    perp = Vector((-axis.z, 0.0, axis.x))
    neck = base + axis * 0.060
    late = tip - axis * 0.120

    profile = (
        base + perp * 0.082,
        neck + perp * 0.108,
        late + perp * 0.102,
        tip,
        late - perp * 0.102,
        neck - perp * 0.108,
        base - perp * 0.082,
    )
    blade = _prism_xz(
        "HeroSword",
        tuple((p.x, p.z) for p in profile),
        front_y=0.140,
        back_y=0.070,
        material=m["SteelEdge"],
    )
    _add_socket(parts, blade, armature, "socket_sword")

    inner = (
        base + axis * 0.040 + perp * 0.046,
        neck + axis * 0.030 + perp * 0.060,
        late + perp * 0.058,
        tip - axis * 0.040,
        late - perp * 0.058,
        neck + axis * 0.030 - perp * 0.060,
        base + axis * 0.040 - perp * 0.046,
    )
    facet = _prism_xz(
        "SwordBladeFacet",
        tuple((p.x, p.z) for p in inner),
        front_y=0.150,
        back_y=0.139,
        material=m["DarkSteel"],
    )
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis * 0.018
    guard = _segment(
        "SwordGuard",
        tuple(guard_center + perp * 0.190),
        tuple(guard_center - perp * 0.190),
        start_width=0.076,
        end_width=0.076,
        start_depth=0.090,
        end_depth=0.090,
        material=m["Brass"],
        bulge=1.00,
    )
    _add_socket(parts, guard, armature, "socket_sword")

    grip_end = base - axis * 0.185
    grip = _segment(
        "SwordGrip",
        tuple(base - axis * 0.048),
        tuple(grip_end),
        start_width=0.070,
        end_width=0.063,
        start_depth=0.074,
        end_depth=0.066,
        material=m["Leather"],
        bulge=1.00,
    )
    _add_socket(parts, grip, armature, "socket_sword")
    _add_socket(parts, _diamond("SwordPommel", tuple(grip_end - axis * 0.047), (0.055, 0.047, 0.055), m["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.052, 0.0))), (0.037, 0.020, 0.037), m["CrimsonCloth"]), armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_back_cloth(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    kept = _remove(model, {"TabardBack"})
    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.140, -0.390),
            (0.720, 0.160, -0.355),
            (0.980, 0.185, -0.315),
            (1.260, 0.210, -0.270),
            (1.520, 0.225, -0.225),
        ),
        thickness=0.034,
        fold=-0.030,
        material=m["CrimsonCloth"],
    )
    parts: list[bpy.types.Object] = []
    _add_rigid(parts, back, armature, "tabard_back_01")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _strengthen_sorcery(model: ModelParts) -> None:
    for obj in model.objects:
        if obj.name == "SorceryCore":
            _scale_about_center(obj, 1.28, 1.28, 1.28)
        elif obj.name.startswith("SorceryShard"):
            _scale_about_center(obj, 1.20, 1.20, 1.20)


def apply_concept_accuracy_pass(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Final measured silhouette/equipment push against the supplied concept sheet."""
    _strengthen_armor_mass(model)
    model = _augment_helmet(model, armature, materials)
    model = _rebuild_sword(model, armature, materials)
    model = _rebuild_back_cloth(model, armature, materials)
    _strengthen_sorcery(model)
    return model
