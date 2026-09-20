from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_model import _add_rigid, _add_socket, _diamond, _loft, _prism_xz, _segment
from .model import ModelParts, _beveled_box


def _set_material(
    material: bpy.types.Material,
    rgba: tuple[float, float, float, float],
    *,
    metallic: float | None = None,
    roughness: float | None = None,
    emission_strength: float | None = None,
) -> None:
    material.diffuse_color = rgba
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return
    bsdf.inputs["Base Color"].default_value = rgba
    if metallic is not None:
        bsdf.inputs["Metallic"].default_value = metallic
    if roughness is not None:
        bsdf.inputs["Roughness"].default_value = roughness
    if emission_strength is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = rgba
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = rgba
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength


def _retune_palette(materials: dict[str, bpy.types.Material]) -> None:
    # The concept uses a cool gunmetal body, warm muted brass, dense crimson cloth,
    # and a cyan visor that glows from a dark recess instead of washing out the face.
    _set_material(materials["DarkSteel"], (0.085, 0.100, 0.125, 1.0), metallic=0.82, roughness=0.38)
    _set_material(materials["SteelEdge"], (0.34, 0.37, 0.42, 1.0), metallic=0.88, roughness=0.29)
    _set_material(materials["Brass"], (0.56, 0.36, 0.15, 1.0), metallic=0.70, roughness=0.34)
    _set_material(materials["CrimsonCloth"], (0.34, 0.030, 0.042, 1.0), roughness=0.84)
    _set_material(materials["Leather"], (0.070, 0.038, 0.025, 1.0), roughness=0.90)
    _set_material(materials["VisorGlow"], (0.035, 0.76, 0.98, 1.0), metallic=0.08, roughness=0.20, emission_strength=3.3)
    _set_material(materials["SorceryAccent"], (0.035, 0.62, 1.0, 1.0), roughness=0.16, emission_strength=4.4)


def _chamfer(obj: bpy.types.Object, width: float) -> bpy.types.Object:
    if obj.type != "MESH" or width <= 0.0:
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("ConceptDetailChamfer", "BEVEL")
    modifier.width = width
    modifier.segments = 1
    modifier.affect = "EDGES"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def _remove(model: ModelParts, names: set[str]) -> list[bpy.types.Object]:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def _replace(model: ModelParts, names: set[str], replacements: list[bpy.types.Object]) -> ModelParts:
    kept = _remove(model, names)
    kept.extend(replacements)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _rebuild_belt(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {
        "Belt", "BeltBuckle", "BeltBuckleInset", "BeltMedallion",
        "BeltPouch.L", "BeltPouch.R", "BeltPouchFlap.L", "BeltPouchFlap.R",
        "BeltDropStrap.L", "BeltDropStrap.R",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    belt = _beveled_box("Belt", (0.0, 0.012, 1.072), (0.610, 0.270, 0.105), m["Leather"], bevel=0.014)
    _add_rigid(parts, belt, armature, "pelvis")

    buckle = _beveled_box("BeltBuckle", (0.105, 0.166, 1.073), (0.145, 0.045, 0.145), m["Brass"], bevel=0.010)
    _add_rigid(parts, buckle, armature, "pelvis")
    inset = _beveled_box("BeltBuckleInset", (0.105, 0.191, 1.073), (0.088, 0.018, 0.088), m["DarkSteel"], bevel=0.006)
    _add_rigid(parts, inset, armature, "pelvis")

    medallion = _diamond("BeltMedallion", (-0.115, 0.190, 1.073), (0.060, 0.028, 0.060), m["Brass"])
    _add_rigid(parts, medallion, armature, "pelvis")
    medallion_inset = _diamond("BeltMedallionInset", (-0.115, 0.222, 1.073), (0.030, 0.010, 0.030), m["SteelEdge"])
    _add_rigid(parts, medallion_inset, armature, "pelvis")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(f"BeltPouch.{side}", (0.258 * sign, 0.135, 0.973), (0.145, 0.120, 0.205), m["Leather"], bevel=0.014)
        _add_rigid(parts, pouch, armature, "pelvis")
        flap = _beveled_box(f"BeltPouchFlap.{side}", (0.258 * sign, 0.205, 1.035), (0.125, 0.032, 0.072), m["Brass"], bevel=0.006)
        _add_rigid(parts, flap, armature, "pelvis")
        strap = _beveled_box(f"BeltDropStrap.{side}", (0.305 * sign, 0.105, 0.855), (0.075, 0.055, 0.285), m["Leather"], bevel=0.008)
        _add_rigid(parts, strap, armature, "pelvis")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_boots(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({
            f"Boot.{side}", f"BootToePlate.{side}", f"BootSole.{side}",
            f"BootHeel.{side}", f"BootAnkleTrim.{side}", f"BootToeTrim.{side}",
        })
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.285 * sign
        boot = _loft(f"Boot.{side}", (
            (0.015, cx, 0.165, 0.345, -0.120),
            (0.070, cx, 0.170, 0.360, -0.112),
            (0.135, cx, 0.155, 0.305, -0.104),
            (0.200, cx, 0.135, 0.205, -0.094),
            (0.245, cx, 0.120, 0.160, -0.082),
        ), m["SteelEdge"])
        _chamfer(boot, 0.012)
        _add_rigid(parts, boot, armature, f"foot.{side}")

        toe = _loft(f"BootToePlate.{side}", (
            (0.040, cx, 0.152, 0.372, 0.105),
            (0.090, cx, 0.158, 0.365, 0.095),
            (0.140, cx, 0.136, 0.300, 0.080),
        ), m["DarkSteel"])
        _chamfer(toe, 0.009)
        _add_rigid(parts, toe, armature, f"foot.{side}")

        sole = _beveled_box(f"BootSole.{side}", (cx, 0.115, 0.025), (0.345, 0.475, 0.045), m["DarkSteel"], bevel=0.008)
        _add_rigid(parts, sole, armature, f"foot.{side}")
        heel = _beveled_box(f"BootHeel.{side}", (cx, -0.075, 0.068), (0.280, 0.120, 0.105), m["DarkSteel"], bevel=0.010)
        _add_rigid(parts, heel, armature, f"foot.{side}")

        ankle_trim = _prism_xz(f"BootAnkleTrim.{side}", (
            ((cx - 0.135), 0.245), ((cx + 0.135), 0.245),
            ((cx + 0.125), 0.195), ((cx - 0.120), 0.185),
        ), front_y=0.145, back_y=-0.105, material=m["Brass"])
        _chamfer(ankle_trim, 0.006)
        _add_rigid(parts, ankle_trim, armature, f"shin.{side}")

        toe_trim = _prism_xz(f"BootToeTrim.{side}", (
            ((cx - 0.155), 0.112), ((cx + 0.155), 0.112),
            ((cx + 0.145), 0.082), ((cx - 0.145), 0.082),
        ), front_y=0.376, back_y=0.344, material=m["Brass"])
        _chamfer(toe_trim, 0.004)
        _add_rigid(parts, toe_trim, armature, f"foot.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_gauntlets(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({f"Gauntlet.{side}", f"GauntletCuff.{side}", f"GauntletKnuckles.{side}"})
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cuff = _segment(
            f"GauntletCuff.{side}",
            (0.485 * sign, 0.038, 1.000),
            (0.525 * sign, 0.055, 0.915),
            start_width=0.165,
            end_width=0.148,
            start_depth=0.168,
            end_depth=0.150,
            material=m["Brass"],
            bulge=1.00,
        )
        _chamfer(cuff, 0.006)
        _add_rigid(parts, cuff, armature, f"forearm.{side}")

        hand = _segment(
            f"Gauntlet.{side}",
            (0.515 * sign, 0.055, 0.930),
            (0.585 * sign, 0.092, 0.820),
            start_width=0.150,
            end_width=0.132,
            start_depth=0.158,
            end_depth=0.136,
            material=m["DarkSteel"],
            bulge=1.02,
        )
        _chamfer(hand, 0.008)
        _add_rigid(parts, hand, armature, f"hand.{side}")

        knuckles = _prism_xz(
            f"GauntletKnuckles.{side}",
            (
                (0.505 * sign, 0.900), (0.575 * sign, 0.875),
                (0.602 * sign, 0.820), (0.570 * sign, 0.790), (0.515 * sign, 0.820),
            ),
            front_y=0.155,
            back_y=0.112,
            material=m["SteelEdge"],
        )
        _chamfer(knuckles, 0.005)
        _add_rigid(parts, knuckles, armature, f"hand.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_sword(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {"HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGrip", "SwordGem", "SwordPommel"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    base = Vector((0.595, 0.105, 0.835))
    tip = Vector((1.235, 0.105, 0.055))
    axis = tip - base
    axis2 = Vector((axis.x, 0.0, axis.z)).normalized()
    perp = Vector((-axis2.z, 0.0, axis2.x))

    neck = base + axis2 * 0.070
    late = tip - axis2 * 0.155
    profile = (
        base + perp * 0.155,
        neck + perp * 0.185,
        late + perp * 0.170,
        tip,
        late - perp * 0.170,
        neck - perp * 0.185,
        base - perp * 0.155,
    )
    blade = _prism_xz("HeroSword", tuple((point.x, point.z) for point in profile), front_y=0.145, back_y=0.055, material=m["SteelEdge"])
    _chamfer(blade, 0.010)
    _add_socket(parts, blade, armature, "socket_sword")

    inner = (
        base + axis2 * 0.040 + perp * 0.085,
        neck + axis2 * 0.040 + perp * 0.105,
        late + perp * 0.095,
        tip - axis2 * 0.035,
        late - perp * 0.095,
        neck + axis2 * 0.040 - perp * 0.105,
        base + axis2 * 0.040 - perp * 0.085,
    )
    facet = _prism_xz("SwordBladeFacet", tuple((point.x, point.z) for point in inner), front_y=0.153, back_y=0.144, material=m["DarkSteel"])
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis2 * 0.018
    guard_a = guard_center + perp * 0.285
    guard_b = guard_center - perp * 0.285
    guard = _segment(
        "SwordGuard", tuple(guard_a), tuple(guard_b),
        start_width=0.095, end_width=0.095,
        start_depth=0.110, end_depth=0.110,
        material=m["Brass"], bulge=1.00,
    )
    _chamfer(guard, 0.008)
    _add_socket(parts, guard, armature, "socket_sword")

    grip_end = base - axis2 * 0.235
    grip = _segment(
        "SwordGrip", tuple(base - axis2 * 0.060), tuple(grip_end),
        start_width=0.080, end_width=0.072,
        start_depth=0.082, end_depth=0.074,
        material=m["Leather"], bulge=1.00,
    )
    _chamfer(grip, 0.004)
    _add_socket(parts, grip, armature, "socket_sword")

    pommel_center = grip_end - axis2 * 0.055
    _add_socket(parts, _diamond("SwordPommel", tuple(pommel_center), (0.070, 0.055, 0.070), m["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.062, 0.0))), (0.050, 0.025, 0.050), m["CrimsonCloth"]), armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def refine_authoritative_details(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Concept-detail pass for equipment that defines the Spellblade at gameplay zoom."""
    _retune_palette(materials)
    model = _rebuild_belt(model, armature, materials)
    model = _rebuild_boots(model, armature, materials)
    model = _rebuild_gauntlets(model, armature, materials)
    model = _rebuild_sword(model, armature, materials)
    return model
