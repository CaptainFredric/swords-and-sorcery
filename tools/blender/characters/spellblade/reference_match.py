from __future__ import annotations

import bpy

from .concept_model import DETAIL_HEAD_TRACE_PX, DETAIL_SHOULDER_TRACE_PX, _scaled_profile
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
    """One-segment hard-surface chamfer for thin detail plates only."""
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
    """Create a shallow overlay plate; never use this for a primary body volume."""
    obj = _profile_slab(
        name,
        profile,
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    _flat_bevel(obj, bevel)
    return _rigid(obj, armature, bone)


def _traced_detail(
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


def _helmet_details(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Keep the deep volumetric helmet shell; trace only its visible face layers."""
    m = model.materials
    names = {
        "HelmetJaw", "HelmetCheek.L", "HelmetCheek.R",
        "HelmetCrownTrim.L", "HelmetCrownTrim.R",
        "HelmetBrowFrame.L", "HelmetBrowFrame.R",
    }
    parts: list[bpy.types.Object] = []

    parts.append(_plate(
        "HelmetJaw",
        ((-0.188, 1.810), (0.188, 1.810), (0.170, 1.705),
         (0.078, 1.645), (0.0, 1.625), (-0.078, 1.645), (-0.170, 1.705)),
        center_y=0.285, thickness=0.055, bevel=0.010,
        material=m["DarkSteel"], armature=armature, bone="head",
    ))

    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        parts.append(_traced_detail(
            f"HelmetCheek.{side}", DETAIL_HEAD_TRACE_PX["cheek"],
            center_x=0.105 * sign, center_z=1.805, width=0.205, height=0.240,
            center_y=0.318, thickness=0.042, bevel=0.006,
            material=m["SteelEdge"], armature=armature, bone="head", mirror_x=mirror,
        ))
        parts.append(_traced_detail(
            f"HelmetCrownTrim.{side}", DETAIL_HEAD_TRACE_PX["crown_trim"],
            center_x=0.100 * sign, center_z=1.945, width=0.220, height=0.115,
            center_y=0.326, thickness=0.040, bevel=0.006,
            material=m["Brass"], armature=armature, bone="head", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"HelmetBrowFrame.{side}",
            ((0.125 * sign, 1.910), (0.198 * sign, 1.940),
             (0.186 * sign, 1.805), (0.148 * sign, 1.720), (0.114 * sign, 1.758)),
            center_y=0.350, thickness=0.030, bevel=0.005,
            material=m["Brass"], armature=armature, bone="head",
        ))
    return _replace_named(model, parts, names)


def _torso_details(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Keep the ring-built breast/back volume and add concept front facets over it."""
    m = model.materials
    names = {
        "ChestFacet.L", "ChestFacet.R",
        "BreastplateTrim.L", "BreastplateTrim.R", "BreastplateCollar",
    }
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        parts.append(_plate(
            f"ChestFacet.{side}",
            ((0.018 * sign, 1.535), (0.305 * sign, 1.505),
             (0.345 * sign, 1.400), (0.305 * sign, 1.275),
             (0.205 * sign, 1.125), (0.045 * sign, 1.105)),
            center_y=0.292, thickness=0.036, bevel=0.006,
            material=m["SteelEdge"], armature=armature, bone="chest",
        ))
        parts.append(_plate(
            f"BreastplateTrim.{side}",
            ((0.285 * sign, 1.535), (0.360 * sign, 1.500),
             (0.345 * sign, 1.400), (0.310 * sign, 1.365),
             (0.282 * sign, 1.455)),
            center_y=0.318, thickness=0.030, bevel=0.005,
            material=m["Brass"], armature=armature, bone="chest",
        ))

    parts.append(_plate(
        "BreastplateCollar",
        ((-0.255, 1.555), (-0.110, 1.590), (0.110, 1.590),
         (0.255, 1.555), (0.218, 1.515), (0.0, 1.540), (-0.218, 1.515)),
        center_y=0.310, thickness=0.032, bevel=0.006,
        material=m["Brass"], armature=armature, bone="chest",
    ))
    return _replace_named(model, parts, names)


def _shoulder_details(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Retain the wrapped pauldron wedge; trace only raised face/trim/badge layers."""
    m = model.materials
    for side, sign, mirror in (("L", -1.0, False), ("R", 1.0, True)):
        names = {
            f"PauldronFacet.{side}", f"PauldronTrim.{side}", f"ShoulderBadge.{side}",
        }
        parts: list[bpy.types.Object] = []
        parts.append(_traced_detail(
            f"PauldronFacet.{side}", DETAIL_SHOULDER_TRACE_PX["facet"],
            center_x=0.565 * sign, center_z=1.495, width=0.300, height=0.230,
            center_y=0.228, thickness=0.036, bevel=0.006,
            material=m["SteelEdge"], armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
        ))
        parts.append(_traced_detail(
            f"PauldronTrim.{side}", DETAIL_SHOULDER_TRACE_PX["trim"],
            center_x=0.565 * sign, center_z=1.548, width=0.370, height=0.135,
            center_y=0.254, thickness=0.030, bevel=0.005,
            material=m["Brass"], armature=armature, bone=f"clavicle.{side}", mirror_x=mirror,
        ))
        parts.append(_plate(
            f"ShoulderBadge.{side}",
            ((0.535 * sign, 1.535), (0.578 * sign, 1.578),
             (0.621 * sign, 1.535), (0.578 * sign, 1.492)),
            center_y=0.278, thickness=0.026, bevel=0.004,
            material=m["Brass"], armature=armature, bone=f"clavicle.{side}",
        ))
        model = _replace_named(model, parts, names)
    return model


def _arm_details(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Add the concept's raised vambrace and upper-arm planes without replacing volume."""
    m = model.materials
    for side, sign in (("L", -1.0), ("R", 1.0)):
        names = {f"VambraceFacet.{side}", f"UpperArmAccent.{side}", f"GauntletKnuckle.{side}"}
        parts = [
            _plate(
                f"UpperArmAccent.{side}",
                ((0.405 * sign, 1.445), (0.535 * sign, 1.390),
                 (0.605 * sign, 1.285), (0.565 * sign, 1.245), (0.455 * sign, 1.315)),
                center_y=0.170, thickness=0.025, bevel=0.004,
                material=m["SteelEdge"], armature=armature, bone=f"upper_arm.{side}",
            ),
            _plate(
                f"VambraceFacet.{side}",
                ((0.595 * sign, 1.190), (0.660 * sign, 1.170),
                 (0.755 * sign, 0.985), (0.730 * sign, 0.940), (0.665 * sign, 1.030)),
                center_y=0.184, thickness=0.028, bevel=0.004,
                material=m["SteelEdge"], armature=armature, bone=f"forearm.{side}",
            ),
            _plate(
                f"GauntletKnuckle.{side}",
                ((0.708 * sign, 0.900), (0.800 * sign, 0.875),
                 (0.812 * sign, 0.825), (0.735 * sign, 0.805)),
                center_y=0.172, thickness=0.024, bevel=0.004,
                material=m["SteelEdge"], armature=armature, bone=f"hand.{side}",
            ),
        ]
        model = _replace_named(model, parts, names)
    return model


def _leg_details(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Keep hard tapered thigh/shin/boot volumes; only replace their front armor faces."""
    m = model.materials
    for side, sign in (("L", -1.0), ("R", 1.0)):
        names = {
            f"CuisseFacet.{side}", f"KneePlate.{side}", f"KneeTrim.{side}",
            f"GreaveFacet.{side}", f"BootFacet.{side}",
        }
        parts = [
            _plate(
                f"CuisseFacet.{side}",
                ((0.110 * sign, 0.950), (0.335 * sign, 0.920),
                 (0.355 * sign, 0.785), (0.310 * sign, 0.640), (0.175 * sign, 0.650)),
                center_y=0.190, thickness=0.028, bevel=0.005,
                material=m["SteelEdge"], armature=armature, bone=f"thigh.{side}",
            ),
            _plate(
                f"KneePlate.{side}",
                ((0.145 * sign, 0.640), (0.355 * sign, 0.630),
                 (0.382 * sign, 0.560), (0.340 * sign, 0.490), (0.165 * sign, 0.495)),
                center_y=0.205, thickness=0.090, bevel=0.012,
                material=m["SteelEdge"], armature=armature, bone=f"shin.{side}",
            ),
            _plate(
                f"KneeTrim.{side}",
                ((0.155 * sign, 0.625), (0.345 * sign, 0.615),
                 (0.350 * sign, 0.585), (0.165 * sign, 0.590)),
                center_y=0.260, thickness=0.026, bevel=0.004,
                material=m["Brass"], armature=armature, bone=f"shin.{side}",
            ),
            _plate(
                f"GreaveFacet.{side}",
                ((0.150 * sign, 0.505), (0.355 * sign, 0.490),
                 (0.370 * sign, 0.365), (0.335 * sign, 0.190), (0.205 * sign, 0.195)),
                center_y=0.195, thickness=0.028, bevel=0.005,
                material=m["SteelEdge"], armature=armature, bone=f"shin.{side}",
            ),
            _plate(
                f"BootFacet.{side}",
                ((0.145 * sign, 0.155), (0.395 * sign, 0.155),
                 (0.420 * sign, 0.095), (0.385 * sign, 0.045),
                 (0.175 * sign, 0.045), (0.140 * sign, 0.095)),
                center_y=0.382, thickness=0.030, bevel=0.005,
                material=m["SteelEdge"], armature=armature, bone=f"foot.{side}",
            ),
        ]
        model = _replace_named(model, parts, names)
    return model


def rebuild_reference_match(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    """Final concept pass: decorate true 3-D shells, never flatten them into slabs."""
    _set_color(model.materials["DarkSteel"], (0.155, 0.175, 0.205, 1.0))
    _set_color(model.materials["SteelEdge"], (0.305, 0.325, 0.355, 1.0))
    _set_color(model.materials["Brass"], (0.50, 0.31, 0.12, 1.0))
    _set_color(model.materials["CrimsonCloth"], (0.32, 0.035, 0.045, 1.0))

    model = _helmet_details(model, armature)
    model = _torso_details(model, armature)
    model = _shoulder_details(model, armature)
    model = _arm_details(model, armature)
    model = _leg_details(model, armature)
    return model
