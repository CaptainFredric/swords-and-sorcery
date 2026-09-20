from __future__ import annotations

import bpy

from .concept_model import (
    DETAIL_BOOT_TRACE_PX,
    DETAIL_HEAD_TRACE_PX,
    DETAIL_SHOULDER_TRACE_PX,
    MAIN_BREASTPLATE_TRACE_PX,
    _scaled_profile,
)
from .concept_refinement import _profile_slab
from .hero_shells import _replace_named
from .model import ModelParts, _rigid


def _set_color(material: bpy.types.Material, rgba: tuple[float, float, float, float]) -> None:
    material.diffuse_color = rgba
    if material.use_nodes and material.node_tree is not None:
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = rgba


def _flat_bevel(obj: bpy.types.Object, width: float) -> bpy.types.Object:
    """One-segment hard-surface chamfer, preserving flat concept shading."""
    if width <= 0.0:
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("ConceptChamfer", "BEVEL")
    modifier.width = width
    modifier.segments = 1
    modifier.affect = "EDGES"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def _plate(
    name: str,
    profile: tuple[tuple[float, float], ...],
    *,
    center_y: float,
    thickness: float,
    bevel: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
) -> bpy.types.Object:
    obj = _profile_slab(
        name,
        profile,
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    _flat_bevel(obj, bevel)
    return _rigid(obj, armature, bone)


def _traced(
    name: str,
    trace: tuple[tuple[float, float], ...],
    *,
    center_x: float,
    center_z: float,
    width: float,
    height: float,
    center_y: float,
    thickness: float,
    bevel: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
    mirror_x: bool = False,
) -> bpy.types.Object:
    return _plate(
        name,
        _scaled_profile(
            trace,
            center_x=center_x,
            center_z=center_z,
            width=width,
            height=height,
            mirror_x=mirror_x,
        ),
        center_y=center_y,
        thickness=thickness,
        bevel=bevel,
        material=material,
        armature=armature,
        bone=bone,
    )


def _helmet(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    m = model.materials
    parts: list[bpy.types.Object] = []
    names = {
        "HelmetShell", "HelmetJaw", "HelmetCheek.L", "HelmetCheek.R",
        "HelmetCrownTrim.L", "HelmetCrownTrim.R", "HelmetBrowFrame.L", "HelmetBrowFrame.R",
    }

    parts.append(_traced(
        "HelmetShell", DETAIL_HEAD_TRACE_PX["outer"],
        center_x=0.0, center_z=1.835, width=0.445, height=0.445,
        center_y=-0.005, thickness=0.395, bevel=0.020,
        material=m["SteelEdge"], armature=armature, bone="head",
    ))
    parts.append(_plate(
        "HelmetJaw",
        ((-0.190, 1.805), (0.190, 1.805), (0.170, 1.690),
         (0.075, 1.635), (0.0, 1.620), (-0.075, 1.635), (-0.170, 1.690)),
        center_y=0.150, thickness=0.230, bevel=0.015,
        material=m["DarkSteel"], armature=armature, bone="head",
    ))

    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        parts.append(_traced(
            f"HelmetCheek.{side}", DETAIL_HEAD_TRACE_PX["cheek"],
            center_x=0.105 * sign, center_z=1.810, width=0.205, height=0.240,
            center_y=0.226, thickness=0.052, bevel=0.008,
            material=m["DarkSteel"], armature=armature, bone="head", mirror_x=mirror,
        ))
        parts.append(_traced(
            f"HelmetCrownTrim.{side}", DETAIL_HEAD_TRACE_PX["crown_trim"],
            center_x=0.100 * sign, center_z=1.945, width=0.220, height=0.115,
            center_y=0.235, thickness=0.050, bevel=0.008,
            material=m["Brass"], armature=armature, bone="head", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"HelmetBrowFrame.{side}",
            ((0.125 * sign, 1.915), (0.198 * sign, 1.940),
             (0.185 * sign, 1.800), (0.145 * sign, 1.715), (0.112 * sign, 1.755)),
            center_y=0.274, thickness=0.040, bevel=0.006,
            material=m["Brass"], armature=armature, bone="head",
        ))
    return _replace_named(model, parts, names)


def _torso(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    m = model.materials
    names = {
        "Breastplate", "ChestFacet.L", "ChestFacet.R", "BackArmor",
        "BreastplateTrim.L", "BreastplateTrim.R", "BreastplateCollar",
    }
    parts: list[bpy.types.Object] = []

    parts.append(_traced(
        "Breastplate", MAIN_BREASTPLATE_TRACE_PX,
        center_x=0.0, center_z=1.335, width=0.720, height=0.505,
        center_y=0.025, thickness=0.350, bevel=0.026,
        material=m["SteelEdge"], armature=armature, bone="chest",
    ))

    for side, sign in (("L", -1.0), ("R", 1.0)):
        parts.append(_plate(
            f"ChestFacet.{side}",
            ((0.020 * sign, 1.520), (0.305 * sign, 1.490),
             (0.335 * sign, 1.385), (0.290 * sign, 1.255),
             (0.190 * sign, 1.120), (0.045 * sign, 1.105)),
            center_y=0.215, thickness=0.040, bevel=0.007,
            material=m["SteelEdge"], armature=armature, bone="chest",
        ))
        parts.append(_plate(
            f"BreastplateTrim.{side}",
            ((0.292 * sign, 1.520), (0.355 * sign, 1.485),
             (0.335 * sign, 1.380), (0.300 * sign, 1.350),
             (0.280 * sign, 1.430)),
            center_y=0.242, thickness=0.035, bevel=0.006,
            material=m["Brass"], armature=armature, bone="chest",
        ))

    parts.append(_plate(
        "BreastplateCollar",
        ((-0.255, 1.555), (-0.110, 1.590), (0.110, 1.590),
         (0.255, 1.555), (0.215, 1.510), (0.0, 1.535), (-0.215, 1.510)),
        center_y=0.225, thickness=0.038, bevel=0.007,
        material=m["Brass"], armature=armature, bone="chest",
    ))

    parts.append(_plate(
        "BackArmor",
        ((-0.335, 1.525), (0.335, 1.525), (0.315, 1.240),
         (0.215, 1.080), (-0.215, 1.080), (-0.315, 1.240)),
        center_y=-0.155, thickness=0.220, bevel=0.022,
        material=m["SteelEdge"], armature=armature, bone="chest",
    ))
    return _replace_named(model, parts, names)


def _shoulders(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    m = model.materials
    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        names = {
            f"Pauldron.{side}", f"PauldronFacet.{side}", f"PauldronTrim.{side}",
            f"ShoulderBadge.{side}", f"PauldronLower.{side}",
        }
        parts: list[bpy.types.Object] = []
        parts.append(_traced(
            f"Pauldron.{side}", DETAIL_SHOULDER_TRACE_PX["outer"],
            center_x=0.535 * sign, center_z=1.495, width=0.425, height=0.330,
            center_y=0.015, thickness=0.350, bevel=0.022,
            material=m["SteelEdge"], armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
        ))
        parts.append(_traced(
            f"PauldronFacet.{side}", DETAIL_SHOULDER_TRACE_PX["facet"],
            center_x=0.525 * sign, center_z=1.495, width=0.315, height=0.245,
            center_y=0.208, thickness=0.038, bevel=0.007,
            material=m["SteelEdge"], armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
        ))
        parts.append(_traced(
            f"PauldronTrim.{side}", DETAIL_SHOULDER_TRACE_PX["trim"],
            center_x=0.535 * sign, center_z=1.545, width=0.405, height=0.145,
            center_y=0.235, thickness=0.035, bevel=0.006,
            material=m["Brass"], armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"PauldronLower.{side}",
            ((0.445 * sign, 1.420), (0.690 * sign, 1.405),
             (0.680 * sign, 1.300), (0.570 * sign, 1.255), (0.470 * sign, 1.315)),
            center_y=0.030, thickness=0.280, bevel=0.018,
            material=m["DarkSteel"], armature=armature, bone=f"upper_arm.{side}",
        ))
        parts.append(_plate(
            f"ShoulderBadge.{side}",
            ((0.535 * sign, 1.535), (0.578 * sign, 1.578),
             (0.621 * sign, 1.535), (0.578 * sign, 1.492)),
            center_y=0.260, thickness=0.030, bevel=0.005,
            material=m["Brass"], armature=armature, bone=f"clavicle.{side}",
        ))
        model = _replace_named(model, parts, names)
    return model


def _legs(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    m = model.materials
    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        center_x = 0.255 * sign
        names = {
            f"Cuisse.{side}", f"CuisseFacet.{side}", f"KneePlate.{side}",
            f"Greave.{side}", f"GreaveFacet.{side}", f"Boot.{side}",
            f"BootFacet.{side}", f"BootAnkleTrim.{side}", f"KneeTrim.{side}",
        }
        parts: list[bpy.types.Object] = []
        parts.append(_plate(
            f"Cuisse.{side}",
            ((0.115 * sign, 0.980), (0.335 * sign, 0.950),
             (0.365 * sign, 0.805), (0.315 * sign, 0.625),
             (0.175 * sign, 0.625), (0.120 * sign, 0.790)),
            center_y=0.035, thickness=0.260, bevel=0.020,
            material=m["SteelEdge"], armature=armature, bone=f"thigh.{side}",
        ))
        parts.append(_plate(
            f"CuisseFacet.{side}",
            ((0.160 * sign, 0.920), (0.310 * sign, 0.900),
             (0.330 * sign, 0.800), (0.285 * sign, 0.675), (0.195 * sign, 0.685)),
            center_y=0.180, thickness=0.030, bevel=0.005,
            material=m["DarkSteel"], armature=armature, bone=f"thigh.{side}",
        ))
        parts.append(_plate(
            f"KneePlate.{side}",
            ((0.145 * sign, 0.645), (0.355 * sign, 0.635),
             (0.385 * sign, 0.565), (0.340 * sign, 0.490), (0.165 * sign, 0.495)),
            center_y=0.115, thickness=0.220, bevel=0.018,
            material=m["SteelEdge"], armature=armature, bone=f"shin.{side}",
        ))
        parts.append(_plate(
            f"KneeTrim.{side}",
            ((0.155 * sign, 0.625), (0.345 * sign, 0.615),
             (0.350 * sign, 0.585), (0.165 * sign, 0.590)),
            center_y=0.240, thickness=0.030, bevel=0.005,
            material=m["Brass"], armature=armature, bone=f"shin.{side}",
        ))
        parts.append(_traced(
            f"Greave.{side}", DETAIL_BOOT_TRACE_PX["greave"],
            center_x=center_x, center_z=0.350, width=0.285, height=0.405,
            center_y=0.030, thickness=0.245, bevel=0.020,
            material=m["SteelEdge"], armature=armature, bone=f"shin.{side}", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"GreaveFacet.{side}",
            ((0.170 * sign, 0.500), (0.340 * sign, 0.480),
             (0.350 * sign, 0.365), (0.315 * sign, 0.185), (0.210 * sign, 0.190)),
            center_y=0.170, thickness=0.030, bevel=0.005,
            material=m["DarkSteel"], armature=armature, bone=f"shin.{side}",
        ))
        parts.append(_traced(
            f"Boot.{side}", DETAIL_BOOT_TRACE_PX["boot"],
            center_x=0.280 * sign, center_z=0.135, width=0.340, height=0.255,
            center_y=0.120, thickness=0.500, bevel=0.025,
            material=m["SteelEdge"], armature=armature, bone=f"foot.{side}", mirror_x=mirror,
        ))
        parts.append(_traced(
            f"BootFacet.{side}", DETAIL_BOOT_TRACE_PX["toe_facet"],
            center_x=0.280 * sign, center_z=0.130, width=0.285, height=0.165,
            center_y=0.382, thickness=0.032, bevel=0.006,
            material=m["DarkSteel"], armature=armature, bone=f"foot.{side}", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"BootAnkleTrim.{side}",
            ((0.155 * sign, 0.285), (0.395 * sign, 0.285),
             (0.385 * sign, 0.235), (0.170 * sign, 0.225)),
            center_y=0.090, thickness=0.300, bevel=0.008,
            material=m["Brass"], armature=armature, bone=f"shin.{side}",
        ))
        model = _replace_named(model, parts, names)
    return model


def rebuild_reference_match(
    model: ModelParts,
    armature: bpy.types.Object,
) -> ModelParts:
    """Final visual pass: use the concept traces as hard-surface silhouette authority."""
    # The concept's steel reads as medium gunmetal; large pale panels were making
    # the procedural model look toy-like under the review lights.
    _set_color(model.materials["DarkSteel"], (0.095, 0.105, 0.125, 1.0))
    _set_color(model.materials["SteelEdge"], (0.235, 0.255, 0.285, 1.0))
    _set_color(model.materials["Brass"], (0.50, 0.31, 0.12, 1.0))
    _set_color(model.materials["CrimsonCloth"], (0.32, 0.035, 0.045, 1.0))

    model = _helmet(model, armature)
    model = _torso(model, armature)
    model = _shoulders(model, armature)
    model = _legs(model, armature)
    return model
