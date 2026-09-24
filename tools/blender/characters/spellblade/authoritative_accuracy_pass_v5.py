from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import _remove
from .authoritative_model import _add_rigid, _segment
from .model import ModelParts


def _rebuild_shoulders_side_profile(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({
            f"Pauldron.{side}",
            f"PauldronFacet.{side}",
            f"PauldronTrim.{side}",
            f"PauldronLower.{side}",
        })

    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # Final-space shoulder shells.  These lean down and rearward so the side
    # silhouette reads as an armored cap rather than a horizontal shelf.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        shell = _segment(
            f"Pauldron.{side}",
            (0.285 * sign, 0.055, 1.690),
            (0.545 * sign, -0.040, 1.575),
            start_width=0.220,
            end_width=0.285,
            start_depth=0.250,
            end_depth=0.320,
            material=materials["DarkSteel"],
            bulge=1.07,
        )
        _add_rigid(parts, shell, armature, f"clavicle.{side}")

        facet = _segment(
            f"PauldronFacet.{side}",
            (0.300 * sign, 0.145, 1.682),
            (0.530 * sign, 0.075, 1.585),
            start_width=0.150,
            end_width=0.195,
            start_depth=0.075,
            end_depth=0.095,
            material=materials["SteelEdge"],
            bulge=1.03,
        )
        _add_rigid(parts, facet, armature, f"clavicle.{side}")

        trim = _segment(
            f"PauldronTrim.{side}",
            (0.305 * sign, 0.190, 1.706),
            (0.525 * sign, 0.118, 1.615),
            start_width=0.060,
            end_width=0.075,
            start_depth=0.040,
            end_depth=0.052,
            material=materials["Brass"],
            bulge=1.00,
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower = _segment(
            f"PauldronLower.{side}",
            (0.390 * sign, -0.005, 1.585),
            (0.505 * sign, -0.035, 1.485),
            start_width=0.190,
            end_width=0.150,
            start_depth=0.215,
            end_depth=0.175,
            material=materials["DarkSteel"],
            bulge=1.02,
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _reshape_helmet_side_profile(model: ModelParts) -> None:
    for obj in model.objects:
        if obj.type != "MESH":
            continue

        if obj.name == "HelmetShell":
            for vertex in obj.data.vertices:
                z = vertex.co.z
                if vertex.co.y > 0.0:
                    if 1.815 <= z <= 1.995:
                        vertex.co.y += 0.030
                    elif z >= 2.035:
                        vertex.co.y -= 0.045
                    elif z <= 1.765:
                        vertex.co.y -= 0.025
                else:
                    if z >= 2.000:
                        vertex.co.y += 0.035
                    elif z <= 1.775:
                        vertex.co.y += 0.020
            obj.data.update()

        elif obj.name == "HelmetJaw":
            for vertex in obj.data.vertices:
                if vertex.co.y > 0.0:
                    if vertex.co.z <= 1.750:
                        vertex.co.y -= 0.055
                    elif vertex.co.z <= 1.815:
                        vertex.co.y -= 0.025
                    else:
                        vertex.co.y += 0.010
                elif vertex.co.z <= 1.775:
                    vertex.co.y += 0.020
            obj.data.update()

        elif obj.name == "FaceRecess":
            for vertex in obj.data.vertices:
                if vertex.co.z >= 1.885:
                    vertex.co.y += 0.014
                elif vertex.co.z <= 1.790:
                    vertex.co.y -= 0.012
            obj.data.update()

        elif obj.name == "Breastplate":
            for vertex in obj.data.vertices:
                if vertex.co.y <= 0.0:
                    continue
                z = vertex.co.z
                if 1.455 <= z <= 1.610:
                    vertex.co.y += 0.030
                elif z >= 1.645:
                    vertex.co.y -= 0.020
                elif z <= 1.385:
                    vertex.co.y -= 0.018
            obj.data.update()


def _cant_sword_through_depth(model: ModelParts) -> None:
    # The blade is already diagonal in X/Z.  Add Y/Z cant around the final
    # hand-height anchor so the same weapon remains diagonal in side view.
    for obj in model.objects:
        if obj.type != "MESH" or obj.name not in {"HeroSword", "SwordBladeFacet"}:
            continue
        for vertex in obj.data.vertices:
            vertex.co.y += 0.459 - 0.45 * vertex.co.z
        obj.data.update()


def apply_concept_accuracy_pass_v5(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _rebuild_shoulders_side_profile(model, armature, materials)
    _reshape_helmet_side_profile(model)
    _cant_sword_through_depth(model)
    return model
