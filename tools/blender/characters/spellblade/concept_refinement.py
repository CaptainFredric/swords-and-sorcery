from __future__ import annotations

from math import radians

import bpy
from mathutils import Vector

from .design import (
    BOOT_SILHOUETTE_WIDTH,
    BREASTPLATE_UPPER_WIDTH,
    CREST_HEIGHT,
    GAUNTLET_CUFF_WIDTH,
    PAULDRON_CENTER_X,
    PAULDRON_WIDTH,
    SWORD_BLADE_WIDTH,
    SWORD_GUARD_WIDTH,
)
from .model import (
    ModelParts,
    _beveled_box,
    _bone_parent_keep_world,
    _diamond_blade,
    _rigid,
    _wedge,
)


def _replace_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _set_material_color(material: bpy.types.Material, color: tuple[float, float, float, float]) -> None:
    material.diffuse_color = color
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color


def _retune_concept_palette(model: ModelParts) -> None:
    # The blockout was intentionally dark. Lift the production steel toward the
    # supplied concept's readable gunmetal while preserving bright edge plates.
    _set_material_color(model.materials["DarkSteel"], (0.16, 0.18, 0.22, 1.0))
    _set_material_color(model.materials["SteelEdge"], (0.42, 0.45, 0.50, 1.0))
    _set_material_color(model.materials["Brass"], (0.52, 0.31, 0.11, 1.0))

    visor = model.materials["VisorGlow"]
    if visor.use_nodes and visor.node_tree is not None:
        bsdf = visor.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.6


def _helmet_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The concept face is a luminous T rather than a narrow horizontal slit.
    crossbar = _beveled_box(
        "VisorCrossbar",
        (0.0, 0.255, 1.855),
        (0.355, 0.030, 0.055),
        materials["VisorGlow"],
        bevel=0.009,
    )
    additions.append(_rigid(crossbar, armature, "head"))
    stem = _beveled_box(
        "VisorStem",
        (0.0, 0.257, 1.790),
        (0.060, 0.032, 0.175),
        materials["VisorGlow"],
        bevel=0.009,
    )
    additions.append(_rigid(stem, armature, "head"))

    # Cheek plates frame the visor and turn the face from a stacked block into
    # the concept's enclosed, angular helmet silhouette.
    for name, sign in (("HelmetCheek.L", -1.0), ("HelmetCheek.R", 1.0)):
        cheek = _beveled_box(
            name,
            (0.145 * sign, 0.235, 1.755),
            (0.155, 0.080, 0.185),
            materials["SteelEdge"],
            bevel=0.016,
            rotation=(radians(-5), radians(8 * sign), radians(7 * sign)),
        )
        additions.append(_rigid(cheek, armature, "head"))

    # Recolor the original low crest as a crimson base, then add the tall fin
    # that gives the front/side silhouette its unmistakable concept-sheet read.
    crest_base = next((obj for obj in model.objects if obj.name == "Crest"), None)
    if crest_base is not None:
        _replace_material(crest_base, materials["CrimsonCloth"])
    crest = _beveled_box(
        "CrestFin",
        (0.0, -0.055, 2.075),
        (0.105, 0.205, CREST_HEIGHT),
        materials["CrimsonCloth"],
        bevel=0.014,
        rotation=(radians(-6), 0.0, 0.0),
    )
    additions.append(_rigid(crest, armature, "head"))
    return additions


def _torso_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # Keep the upper plate compact so the pauldrons remain separate masses.
    upper = _wedge(
        "BreastplateUpper",
        center=(0.0, 0.095, 1.475),
        width=BREASTPLATE_UPPER_WIDTH,
        depth=0.29,
        height=0.18,
        material=materials["DarkSteel"],
        forward_tip=0.055,
    )
    additions.append(_rigid(upper, armature, "chest"))

    # Two forward facets turn the old flat trapezoid into readable armor planes.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        facet = _wedge(
            f"BreastplateFacet.{side}",
            center=(0.17 * sign, 0.205, 1.345),
            width=0.30,
            depth=0.105,
            height=0.32,
            material=materials["SteelEdge"],
            forward_tip=0.020,
        )
        additions.append(_rigid(facet, armature, "chest"))

        collar = _wedge(
            f"BreastplateCollar.{side}",
            center=(0.225 * sign, 0.175, 1.565),
            width=0.15,
            depth=0.085,
            height=0.070,
            material=materials["Brass"],
            forward_tip=0.015,
        )
        additions.append(_rigid(collar, armature, "chest"))

    # The red scarf is one of the concept's strongest identity breaks between
    # helmet and steel torso. Give it real front-facing volume instead of relying
    # on the narrow blockout neck wrap.
    scarf = _beveled_box(
        "CrimsonScarfFront",
        (0.0, 0.175, 1.615),
        (0.54, 0.090, 0.125),
        materials["CrimsonCloth"],
        bevel=0.026,
        rotation=(radians(4), 0.0, 0.0),
    )
    additions.append(_rigid(scarf, armature, "neck"))
    return additions


def _shoulder_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        outer = _beveled_box(
            f"PauldronOuter.{side}",
            (PAULDRON_CENTER_X * sign, 0.005, 1.455),
            (PAULDRON_WIDTH, 0.37, 0.18),
            materials["DarkSteel"],
            bevel=0.030,
            rotation=(0.0, radians(19 * sign), radians(14 * sign)),
        )
        additions.append(_rigid(outer, armature, f"clavicle.{side}"))

        rim = _beveled_box(
            f"PauldronRim.{side}",
            (PAULDRON_CENTER_X * sign, 0.185, 1.535),
            (PAULDRON_WIDTH * 0.76, 0.075, 0.060),
            materials["Brass"],
            bevel=0.014,
            rotation=(0.0, radians(15 * sign), radians(14 * sign)),
        )
        additions.append(_rigid(rim, armature, f"clavicle.{side}"))
    return additions


def _limb_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    sides = (
        ("L", -1.0, "GauntletCuff.L", "GauntletKnuckle.L", "GreaveRidge.L", "BootToeArmor.L"),
        ("R", 1.0, "GauntletCuff.R", "GauntletKnuckle.R", "GreaveRidge.R", "BootToeArmor.R"),
    )
    for side, sign, cuff_name, knuckle_name, greave_name, boot_name in sides:
        cuff = _beveled_box(
            cuff_name,
            (0.84 * sign, 0.045, 1.015),
            (GAUNTLET_CUFF_WIDTH, 0.25, 0.16),
            materials["DarkSteel"],
            bevel=0.025,
            rotation=(radians(-7), radians(5 * sign), radians(9 * sign)),
        )
        additions.append(_rigid(cuff, armature, f"forearm.{side}"))

        knuckle = _beveled_box(
            knuckle_name,
            (0.945 * sign, 0.165, 0.86),
            (0.22, 0.090, 0.105),
            materials["SteelEdge"],
            bevel=0.018,
            rotation=(radians(-8), 0.0, radians(8 * sign)),
        )
        additions.append(_rigid(knuckle, armature, f"hand.{side}"))

        greave = _beveled_box(
            greave_name,
            (0.21 * sign, 0.185, 0.315),
            (0.16, 0.070, 0.29),
            materials["SteelEdge"],
            bevel=0.018,
        )
        additions.append(_rigid(greave, armature, f"shin.{side}"))

        boot = _beveled_box(
            boot_name,
            (0.21 * sign, 0.345, 0.125),
            (BOOT_SILHOUETTE_WIDTH, 0.24, 0.14),
            materials["DarkSteel"],
            bevel=0.030,
        )
        additions.append(_rigid(boot, armature, f"foot.{side}"))
    return additions


def _sword_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The original blade remains nested inside this broader faceted shell. That
    # preserves the established socket/animation setup while changing the read
    # from a needle-like sword to the chunky concept blade.
    blade = _diamond_blade(
        "HeroSwordBroadBlade",
        Vector((1.00, 0.10, 0.94)),
        Vector((1.40, 0.14, 2.03)),
        SWORD_BLADE_WIDTH,
        0.052,
        materials["SteelEdge"],
    )
    additions.append(_bone_parent_keep_world(blade, armature, "socket_sword"))

    guard = _beveled_box(
        "HeroSwordBroadGuard",
        (0.985, 0.09, 0.90),
        (SWORD_GUARD_WIDTH, 0.105, 0.095),
        materials["Brass"],
        bevel=0.022,
        rotation=(0.0, radians(-18), radians(-3)),
    )
    additions.append(_bone_parent_keep_world(guard, armature, "socket_sword"))

    for name, x, angle in (
        ("HeroSwordGuardWing.L", 0.72, -18),
        ("HeroSwordGuardWing.R", 1.25, 18),
    ):
        wing = _beveled_box(
            name,
            (x, 0.09, 0.91),
            (0.18, 0.12, 0.17),
            materials["Brass"],
            bevel=0.020,
            rotation=(0.0, radians(-18), radians(angle)),
        )
        additions.append(_bone_parent_keep_world(wing, armature, "socket_sword"))

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.055, location=(0.985, 0.165, 0.905))
    gem = bpy.context.object
    gem.name = "HeroSwordGem"
    gem.data.materials.append(materials["CrimsonCloth"])
    additions.append(_bone_parent_keep_world(gem, armature, "socket_sword"))
    return additions


def refine_concept_silhouette(
    armature: bpy.types.Object,
    model: ModelParts,
) -> ModelParts:
    """Layer concept-defining forms onto the validated production blockout."""
    _retune_concept_palette(model)
    additions: list[bpy.types.Object] = []
    additions.extend(_helmet_refinement(armature, model))
    additions.extend(_torso_refinement(armature, model))
    additions.extend(_shoulder_refinement(armature, model))
    additions.extend(_limb_refinement(armature, model))
    additions.extend(_sword_refinement(armature, model))
    return ModelParts(objects=(*model.objects, *additions), materials=model.materials)
