from __future__ import annotations

from mathutils import Vector

import bpy

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
    _set_material(materials["DarkSteel"], (0.075, 0.090, 0.115, 1.0), metallic=0.84, roughness=0.36)
    _set_material(materials["SteelEdge"], (0.39, 0.42, 0.47, 1.0), metallic=0.88, roughness=0.27)
    _set_material(materials["Brass"], (0.57, 0.37, 0.16, 1.0), metallic=0.70, roughness=0.33)
    _set_material(materials["CrimsonCloth"], (0.35, 0.028, 0.040, 1.0), roughness=0.84)
    _set_material(materials["Leather"], (0.064, 0.034, 0.022, 1.0), roughness=0.91)
    _set_material(materials["VisorGlow"], (0.030, 0.76, 0.98, 1.0), metallic=0.06, roughness=0.18, emission_strength=3.1)
    _set_material(materials["SorceryAccent"], (0.030, 0.64, 1.0, 1.0), roughness=0.15, emission_strength=4.2)


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


def _deepen_primary_forms(model: ModelParts) -> None:
    exact = {
        "HelmetShell": 1.23,
        "HelmetJaw": 1.18,
        "FaceRecess": 1.10,
        "Breastplate": 1.18,
        "TorsoUnder": 1.16,
        "BackArmor": 1.18,
        "CrimsonScarf": 1.14,
    }
    prefixes = {
        "HelmetCheek.": 1.14,
        "HelmetCrownTrim.": 1.12,
        "HelmetBrowFrame.": 1.12,
        "Pauldron.": 1.17,
        "PauldronFacet.": 1.14,
        "PauldronTrim.": 1.14,
        "PauldronLower.": 1.12,
    }
    for obj in model.objects:
        if obj.type != "MESH":
            continue
        factor = exact.get(obj.name)
        if factor is None:
            for prefix, value in prefixes.items():
                if obj.name.startswith(prefix):
                    factor = value
                    break
        if factor is None:
            continue
        for vertex in obj.data.vertices:
            # Preserve the authored front face while giving the rear shell more
            # skull/ribcage/pauldron volume, which is what the side reference shows.
            if vertex.co.y < 0.0:
                vertex.co.y *= factor
            else:
                vertex.co.y *= 1.04
        obj.data.update()


def _rebuild_belt(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {
        "Belt", "BeltBuckle", "BeltBuckleInset", "BeltMedallion", "BeltMedallionInset",
        "BeltPouch.L", "BeltPouch.R", "BeltPouchFlap.L", "BeltPouchFlap.R",
        "BeltDropStrap.L", "BeltDropStrap.R",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    belt = _beveled_box("Belt", (0.0, 0.015, 1.072), (0.585, 0.245, 0.105), m["Leather"], bevel=0.014)
    _add_rigid(parts, belt, armature, "pelvis")

    buckle = _beveled_box("BeltBuckle", (0.110, 0.158, 1.073), (0.150, 0.050, 0.150), m["Brass"], bevel=0.010)
    _add_rigid(parts, buckle, armature, "pelvis")
    inset = _beveled_box("BeltBuckleInset", (0.110, 0.188, 1.073), (0.090, 0.018, 0.090), m["DarkSteel"], bevel=0.006)
    _add_rigid(parts, inset, armature, "pelvis")

    medallion = _diamond("BeltMedallion", (-0.110, 0.190, 1.073), (0.060, 0.028, 0.060), m["Brass"])
    _add_rigid(parts, medallion, armature, "pelvis")
    medallion_inset = _diamond("BeltMedallionInset", (-0.110, 0.220, 1.073), (0.028, 0.010, 0.028), m["SteelEdge"])
    _add_rigid(parts, medallion_inset, armature, "pelvis")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(f"BeltPouch.{side}", (0.250 * sign, 0.120, 0.980), (0.125, 0.105, 0.180), m["Leather"], bevel=0.012)
        _add_rigid(parts, pouch, armature, "pelvis")
        flap = _beveled_box(f"BeltPouchFlap.{side}", (0.250 * sign, 0.180, 1.030), (0.108, 0.028, 0.062), m["Brass"], bevel=0.005)
        _add_rigid(parts, flap, armature, "pelvis")
        strap = _beveled_box(f"BeltDropStrap.{side}", (0.285 * sign, 0.092, 0.845), (0.062, 0.050, 0.260), m["Leather"], bevel=0.007)
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
            (0.020, cx, 0.155, 0.285, -0.105),
            (0.075, cx, 0.160, 0.305, -0.100),
            (0.135, cx, 0.150, 0.270, -0.095),
            (0.200, cx, 0.132, 0.195, -0.088),
            (0.255, cx, 0.116, 0.145, -0.080),
        ), m["SteelEdge"])
        _chamfer(boot, 0.011)
        _add_rigid(parts, boot, armature, f"foot.{side}")

        toe = _loft(f"BootToePlate.{side}", (
            (0.050, cx, 0.142, 0.315, 0.075),
            (0.095, cx, 0.150, 0.310, 0.070),
            (0.145, cx, 0.128, 0.260, 0.062),
        ), m["DarkSteel"])
        _chamfer(toe, 0.008)
        _add_rigid(parts, toe, armature, f"foot.{side}")

        sole = _beveled_box(f"BootSole.{side}", (cx, 0.085, 0.024), (0.320, 0.370, 0.042), m["DarkSteel"], bevel=0.007)
        _add_rigid(parts, sole, armature, f"foot.{side}")
        heel = _beveled_box(f"BootHeel.{side}", (cx, -0.065, 0.070), (0.255, 0.105, 0.105), m["DarkSteel"], bevel=0.009)
        _add_rigid(parts, heel, armature, f"foot.{side}")

        ankle_trim = _prism_xz(f"BootAnkleTrim.{side}", (
            ((cx - 0.125), 0.255), ((cx + 0.125), 0.255),
            ((cx + 0.118), 0.205), ((cx - 0.112), 0.195),
        ), front_y=0.138, back_y=-0.096, material=m["Brass"])
        _chamfer(ankle_trim, 0.005)
        _add_rigid(parts, ankle_trim, armature, f"shin.{side}")

        toe_trim = _prism_xz(f"BootToeTrim.{side}", (
            ((cx - 0.142), 0.122), ((cx + 0.142), 0.122),
            ((cx + 0.135), 0.092), ((cx - 0.135), 0.092),
        ), front_y=0.318, back_y=0.292, material=m["Brass"])
        _chamfer(toe_trim, 0.004)
        _add_rigid(parts, toe_trim, armature, f"foot.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_gauntlets(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({f"Gauntlet.{side}", f"GauntletCuff.{side}", f"GauntletKnuckles.{side}"})
        names.update({f"GauntletFinger.{side}.{index}" for index in range(4)})
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cuff = _segment(
            f"GauntletCuff.{side}",
            (0.475 * sign, 0.035, 1.000),
            (0.515 * sign, 0.052, 0.915),
            start_width=0.178,
            end_width=0.158,
            start_depth=0.176,
            end_depth=0.158,
            material=m["Brass"],
            bulge=1.00,
        )
        _chamfer(cuff, 0.006)
        _add_rigid(parts, cuff, armature, f"forearm.{side}")

        hand = _segment(
            f"Gauntlet.{side}",
            (0.505 * sign, 0.055, 0.930),
            (0.572 * sign, 0.092, 0.820),
            start_width=0.170,
            end_width=0.150,
            start_depth=0.170,
            end_depth=0.148,
            material=m["DarkSteel"],
            bulge=1.02,
        )
        _chamfer(hand, 0.008)
        _add_rigid(parts, hand, armature, f"hand.{side}")

        knuckles = _prism_xz(
            f"GauntletKnuckles.{side}",
            (
                (0.495 * sign, 0.905), (0.565 * sign, 0.880),
                (0.595 * sign, 0.825), (0.560 * sign, 0.792), (0.505 * sign, 0.820),
            ),
            front_y=0.160,
            back_y=0.114,
            material=m["SteelEdge"],
        )
        _chamfer(knuckles, 0.005)
        _add_rigid(parts, knuckles, armature, f"hand.{side}")

        # Four blunt finger plates make the hand read as an armored gauntlet rather
        # than a single geometric mitten at gameplay distance.
        for index in range(4):
            lateral = (index - 1.5) * 0.030
            finger_x = (0.568 + lateral) * sign
            finger = _beveled_box(
                f"GauntletFinger.{side}.{index}",
                (finger_x, 0.162, 0.805),
                (0.027, 0.045, 0.055),
                m["SteelEdge"],
                bevel=0.004,
            )
            _add_rigid(parts, finger, armature, f"hand.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_sword(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {"HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGrip", "SwordGem", "SwordPommel"}
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    # Match the concept's broad but controlled blade: substantial enough to read,
    # but no longer a shield-sized slab beside the character.
    base = Vector((0.535, 0.105, 0.835))
    tip = Vector((1.105, 0.105, 0.125))
    axis = tip - base
    axis2 = Vector((axis.x, 0.0, axis.z)).normalized()
    perp = Vector((-axis2.z, 0.0, axis2.x))

    neck = base + axis2 * 0.070
    late = tip - axis2 * 0.130
    profile = (
        base + perp * 0.120,
        neck + perp * 0.145,
        late + perp * 0.138,
        tip,
        late - perp * 0.138,
        neck - perp * 0.145,
        base - perp * 0.120,
    )
    blade = _prism_xz("HeroSword", tuple((point.x, point.z) for point in profile), front_y=0.142, back_y=0.068, material=m["SteelEdge"])
    _chamfer(blade, 0.009)
    _add_socket(parts, blade, armature, "socket_sword")

    inner = (
        base + axis2 * 0.045 + perp * 0.062,
        neck + axis2 * 0.035 + perp * 0.082,
        late + perp * 0.078,
        tip - axis2 * 0.040,
        late - perp * 0.078,
        neck + axis2 * 0.035 - perp * 0.082,
        base + axis2 * 0.045 - perp * 0.062,
    )
    facet = _prism_xz("SwordBladeFacet", tuple((point.x, point.z) for point in inner), front_y=0.151, back_y=0.140, material=m["DarkSteel"])
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis2 * 0.020
    guard_a = guard_center + perp * 0.220
    guard_b = guard_center - perp * 0.220
    guard = _segment(
        "SwordGuard", tuple(guard_a), tuple(guard_b),
        start_width=0.082, end_width=0.082,
        start_depth=0.098, end_depth=0.098,
        material=m["Brass"], bulge=1.00,
    )
    _chamfer(guard, 0.007)
    _add_socket(parts, guard, armature, "socket_sword")

    grip_end = base - axis2 * 0.195
    grip = _segment(
        "SwordGrip", tuple(base - axis2 * 0.052), tuple(grip_end),
        start_width=0.074, end_width=0.067,
        start_depth=0.078, end_depth=0.070,
        material=m["Leather"], bulge=1.00,
    )
    _chamfer(grip, 0.004)
    _add_socket(parts, grip, armature, "socket_sword")

    pommel_center = grip_end - axis2 * 0.050
    _add_socket(parts, _diamond("SwordPommel", tuple(pommel_center), (0.060, 0.050, 0.060), m["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.055, 0.0))), (0.040, 0.022, 0.040), m["CrimsonCloth"]), armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_cloth(model: ModelParts, armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> ModelParts:
    names = {
        "TabardFront", "TabardBack",
        "TabardFrontTrim.L", "TabardFrontTrim.R", "TabardFrontTrim.Bottom",
    }
    kept = _remove(model, names)
    parts: list[bpy.types.Object] = []

    front = _folded_panel(
        "TabardFront",
        (
            (0.420, 0.125, 0.245),
            (0.620, 0.142, 0.250),
            (0.820, 0.150, 0.252),
            (1.035, 0.155, 0.250),
        ),
        thickness=0.030,
        fold=0.020,
        material=m["CrimsonCloth"],
    )
    _add_rigid(parts, front, armature, "tabard_front_01")

    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.145, -0.265),
            (0.720, 0.165, -0.270),
            (0.980, 0.185, -0.260),
            (1.260, 0.210, -0.245),
            (1.520, 0.225, -0.220),
        ),
        thickness=0.030,
        fold=-0.022,
        material=m["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _prism_xz(
            f"TabardFrontTrim.{side}",
            (
                (0.118 * sign, 0.445), (0.142 * sign, 0.445),
                (0.160 * sign, 1.010), (0.135 * sign, 1.010),
            ),
            front_y=0.282,
            back_y=0.258,
            material=m["Brass"],
        )
        _add_rigid(parts, trim, armature, "tabard_front_01")

    bottom_trim = _prism_xz(
        "TabardFrontTrim.Bottom",
        ((-0.120, 0.445), (0.120, 0.445), (0.120, 0.472), (-0.120, 0.472)),
        front_y=0.282,
        back_y=0.258,
        material=m["Brass"],
    )
    _add_rigid(parts, bottom_trim, armature, "tabard_front_01")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def refine_authoritative_details(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Concept-detail pass for equipment and depth that define the Spellblade."""
    _retune_palette(materials)
    _deepen_primary_forms(model)
    model = _rebuild_belt(model, armature, materials)
    model = _rebuild_boots(model, armature, materials)
    model = _rebuild_gauntlets(model, armature, materials)
    model = _rebuild_sword(model, armature, materials)
    model = _rebuild_cloth(model, armature, materials)
    return model
