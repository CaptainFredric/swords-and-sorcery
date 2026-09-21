from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _remove
from .authoritative_model import (
    _add_rigid,
    _diamond,
    _folded_panel,
    _loft,
    _prism_xz,
)
from .model import ModelParts, _beveled_box


def _rebuild_back_armor(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {
        "BackArmor", "BackFacet.L", "BackFacet.R", "BackSpineRidge",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    back = _loft(
        "BackArmor",
        (
            (1.300, 0.0, 0.195, -0.050, -0.185),
            (1.390, 0.0, 0.245, -0.060, -0.225),
            (1.520, 0.0, 0.300, -0.070, -0.260),
            (1.635, 0.0, 0.305, -0.065, -0.268),
            (1.705, 0.0, 0.250, -0.050, -0.232),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, back, armature, "chest")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _prism_xz(
            f"BackFacet.{side}",
            (
                (0.018 * sign, 1.675), (0.220 * sign, 1.665),
                (0.285 * sign, 1.585), (0.255 * sign, 1.465),
                (0.160 * sign, 1.350), (0.030 * sign, 1.315),
            ),
            front_y=-0.258,
            back_y=-0.284,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, facet, armature, "chest")

    ridge = _prism_xz(
        "BackSpineRidge",
        (
            (-0.024, 1.670), (0.024, 1.670), (0.034, 1.525),
            (0.018, 1.340), (0.0, 1.305), (-0.018, 1.340), (-0.034, 1.525),
        ),
        front_y=-0.286,
        back_y=-0.305,
        material=materials["Brass"],
    )
    _add_rigid(parts, ridge, armature, "chest")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_scarf(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove(model, {"CrimsonScarf", "ScarfTail.L", "ScarfTail.R"})
    parts: list[bpy.types.Object] = []

    scarf = _loft(
        "CrimsonScarf",
        (
            (1.635, 0.0, 0.230, 0.170, -0.155),
            (1.675, 0.0, 0.295, 0.225, -0.190),
            (1.720, 0.0, 0.310, 0.238, -0.202),
            (1.758, 0.0, 0.270, 0.195, -0.175),
        ),
        materials["CrimsonCloth"],
    )
    _add_rigid(parts, scarf, armature, "neck")

    # Short asymmetrical rear folds stop the scarf from reading as a red collar ring.
    left = _prism_xz(
        "ScarfTail.L",
        ((-0.080, 1.690), (-0.225, 1.675), (-0.255, 1.560), (-0.165, 1.595)),
        front_y=-0.185,
        back_y=-0.225,
        material=materials["CrimsonCloth"],
    )
    right = _prism_xz(
        "ScarfTail.R",
        ((0.055, 1.695), (0.185, 1.675), (0.205, 1.610), (0.125, 1.630)),
        front_y=-0.188,
        back_y=-0.222,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, left, armature, "neck")
    _add_rigid(parts, right, armature, "neck")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_waist_and_tabards(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names = {
        "Belt", "BeltBuckle", "BeltBuckleInset", "BeltMedallion", "BeltMedallionInset",
        "BeltPouch.L", "BeltPouch.R", "BeltPouchFlap.L", "BeltPouchFlap.R",
        "BeltDropStrap.L", "BeltDropStrap.R",
        "Fauld.L", "Fauld.R", "FauldTrim.L", "FauldTrim.R",
        "TabardFront", "TabardBack", "TabardTrim.L", "TabardTrim.R", "TabardSigil",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    belt = _beveled_box(
        "Belt", (0.0, 0.012, 1.245), (0.585, 0.245, 0.082),
        materials["Leather"], bevel=0.012,
    )
    _add_rigid(parts, belt, armature, "pelvis")

    buckle = _diamond("BeltBuckle", (0.075, 0.165, 1.245), (0.070, 0.025, 0.060), materials["Brass"])
    _add_rigid(parts, buckle, armature, "pelvis")
    buckle_inset = _diamond("BeltBuckleInset", (0.075, 0.190, 1.245), (0.038, 0.012, 0.032), materials["Leather"])
    _add_rigid(parts, buckle_inset, armature, "pelvis")
    medallion = _diamond("BeltMedallion", (-0.095, 0.168, 1.245), (0.050, 0.024, 0.050), materials["Brass"])
    _add_rigid(parts, medallion, armature, "pelvis")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        fauld = _prism_xz(
            f"Fauld.{side}",
            (
                (0.105 * sign, 1.225), (0.300 * sign, 1.225),
                (0.322 * sign, 1.145), (0.260 * sign, 1.030),
                (0.145 * sign, 1.055),
            ),
            front_y=0.155,
            back_y=0.025,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, fauld, armature, "pelvis")

        fauld_trim = _prism_xz(
            f"FauldTrim.{side}",
            (
                (0.118 * sign, 1.218), (0.285 * sign, 1.218),
                (0.302 * sign, 1.185), (0.130 * sign, 1.185),
            ),
            front_y=0.180,
            back_y=0.150,
            material=materials["Brass"],
        )
        _add_rigid(parts, fauld_trim, armature, "pelvis")

        pouch = _loft(
            f"BeltPouch.{side}",
            (
                (1.070, 0.305 * sign, 0.058, 0.155, 0.055),
                (1.145, 0.305 * sign, 0.075, 0.175, 0.045),
                (1.225, 0.305 * sign, 0.068, 0.162, 0.050),
            ),
            materials["Leather"],
        )
        _add_rigid(parts, pouch, armature, "pelvis")

        flap = _prism_xz(
            f"BeltPouchFlap.{side}",
            (
                (0.245 * sign, 1.205), (0.365 * sign, 1.205),
                (0.355 * sign, 1.150), (0.305 * sign, 1.125), (0.255 * sign, 1.150),
            ),
            front_y=0.187,
            back_y=0.170,
            material=materials["Brass"],
        )
        _add_rigid(parts, flap, armature, "pelvis")

    front = _folded_panel(
        "TabardFront",
        (
            (0.420, 0.105, 0.285),
            (0.610, 0.125, 0.292),
            (0.830, 0.145, 0.300),
            (1.050, 0.160, 0.298),
            (1.205, 0.168, 0.282),
        ),
        thickness=0.030,
        fold=0.032,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, front, armature, "tabard_front_01")

    back = _folded_panel(
        "TabardBack",
        (
            (0.470, 0.115, -0.320),
            (0.690, 0.135, -0.330),
            (0.930, 0.150, -0.325),
            (1.135, 0.165, -0.305),
            (1.245, 0.170, -0.278),
        ),
        thickness=0.032,
        fold=-0.030,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _prism_xz(
            f"TabardTrim.{side}",
            (
                (0.104 * sign, 0.430), (0.125 * sign, 0.430),
                (0.172 * sign, 1.195), (0.150 * sign, 1.195),
            ),
            front_y=0.326,
            back_y=0.304,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, "tabard_front_01")

    sigil = _prism_xz(
        "TabardSigil",
        (
            (-0.018, 0.650), (0.018, 0.650), (0.018, 0.820),
            (0.055, 0.785), (0.072, 0.815), (0.0, 0.915),
            (-0.072, 0.815), (-0.055, 0.785), (-0.018, 0.820),
        ),
        front_y=0.337,
        back_y=0.321,
        material=materials["Brass"],
    )
    _add_rigid(parts, sigil, armature, "tabard_front_01")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_concept_accuracy_pass_v7(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_back_armor(model, armature, materials)
    model = _rebuild_scarf(model, armature, materials)
    model = _rebuild_waist_and_tabards(model, armature, materials)
    return model
