from __future__ import annotations

from math import radians

import bpy
from mathutils import Vector

from .design import (
    BOOT_ARMOR_CENTER_X,
    BOOT_SILHOUETTE_WIDTH,
    BREASTPLATE_UPPER_WIDTH,
    CREST_HEIGHT,
    FOREARM_ARMOR_WIDTH,
    GAUNTLET_CUFF_WIDTH,
    PAULDRON_CENTER_X,
    PAULDRON_DROP_HEIGHT,
    PAULDRON_WIDTH,
    SORCERY_ACCENT_RADIUS,
    SORCERY_EMISSION_STRENGTH,
    SWORD_BLADE_WIDTH,
    SWORD_GUARD_WIDTH,
    THIGH_ARMOR_WIDTH,
    UPPER_ARM_ARMOR_WIDTH,
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


def _profile_slab(
    name: str,
    profile_xz: tuple[tuple[float, float], ...],
    *,
    center_y: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Extrude an authored X/Z silhouette into a thin faceted armor or cloth plate."""
    if len(profile_xz) < 3:
        raise ValueError(f"{name} profile requires at least three points")
    if thickness <= 0.0:
        raise ValueError(f"{name} thickness must be positive")

    # Ensure the +Y/front cap winds outward. The supplied profiles are readable
    # as ordinary X/Z polygons, so normalize their winding here instead of making
    # each caller reason about Blender face normals.
    area2 = sum(
        x0 * z1 - x1 * z0
        for (x0, z0), (x1, z1) in zip(profile_xz, (*profile_xz[1:], profile_xz[0]))
    )
    ordered = tuple(profile_xz if area2 < 0.0 else reversed(profile_xz))
    half = thickness * 0.5
    count = len(ordered)
    vertices = [
        *((x, center_y + half, z) for x, z in ordered),
        *((x, center_y - half, z) for x, z in ordered),
    ]
    faces: list[tuple[int, ...]] = [
        tuple(range(count)),
        tuple(reversed(range(count, count * 2))),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, count + index, count + nxt, nxt))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def _set_material_color(material: bpy.types.Material, color: tuple[float, float, float, float]) -> None:
    material.diffuse_color = color
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color


def _retune_concept_palette(model: ModelParts) -> None:
    # The concept is gunmetal rather than blue-black, but its face is framed by
    # dark armor. Keep steel separation while avoiding the pale rectangular mask
    # that the earlier refinement produced around the visor.
    _set_material_color(model.materials["DarkSteel"], (0.13, 0.15, 0.18, 1.0))
    _set_material_color(model.materials["SteelEdge"], (0.36, 0.39, 0.44, 1.0))
    _set_material_color(model.materials["Brass"], (0.52, 0.31, 0.11, 1.0))

    visor = model.materials["VisorGlow"]
    if visor.use_nodes and visor.node_tree is not None:
        bsdf = visor.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.2

    # Keep the hand unmistakably cyan without letting Eevee clip the authored
    # geometry into a white bloom shape in neutral and cast review frames.
    sorcery = model.materials["SorceryAccent"]
    if sorcery.use_nodes and sorcery.node_tree is not None:
        bsdf = sorcery.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = SORCERY_EMISSION_STRENGTH


def _helmet_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The base model already owns the horizontal cyan slit. Add only the narrow
    # stem so the glow reads as a T-shaped opening instead of stacking a second
    # luminous rectangle over the face.
    stem = _beveled_box(
        "VisorStem",
        (0.0, 0.257, 1.790),
        (0.052, 0.030, 0.170),
        materials["VisorGlow"],
        bevel=0.007,
    )
    additions.append(_rigid(stem, armature, "head"))

    # The old cheeks were bright rectangular blocks. These authored silhouettes
    # wrap around the visor and taper toward the jaw, preserving a narrow cyan
    # negative space between darker plates.
    face_sides = (
        ("L", -1.0, "HelmetCheek.L", "HelmetFaceFrame.L", "HelmetBrowCowl.L"),
        ("R", 1.0, "HelmetCheek.R", "HelmetFaceFrame.R", "HelmetBrowCowl.R"),
    )
    for side, sign, cheek_name, frame_name, brow_name in face_sides:
        outer = (
            (0.245 * sign, 1.890),
            (0.072 * sign, 1.875),
            (0.060 * sign, 1.805),
            (0.078 * sign, 1.695),
            (0.180 * sign, 1.665),
            (0.255 * sign, 1.745),
        )
        cheek = _profile_slab(
            cheek_name,
            outer,
            center_y=0.236,
            thickness=0.075,
            material=materials["DarkSteel"],
        )
        additions.append(_rigid(cheek, armature, "head"))

        inner = (
            (0.190 * sign, 1.873),
            (0.064 * sign, 1.860),
            (0.055 * sign, 1.812),
            (0.068 * sign, 1.714),
            (0.112 * sign, 1.702),
            (0.152 * sign, 1.765),
        )
        frame = _profile_slab(
            frame_name,
            inner,
            center_y=0.278,
            thickness=0.028,
            material=materials["SteelEdge"],
        )
        additions.append(_rigid(frame, armature, "head"))

        brow = _profile_slab(
            brow_name,
            (
                (0.226 * sign, 1.923),
                (0.045 * sign, 1.900),
                (0.052 * sign, 1.865),
                (0.194 * sign, 1.874),
            ),
            center_y=0.270,
            thickness=0.040,
            material=materials["DarkSteel"],
        )
        additions.append(_rigid(brow, armature, "head"))

    chin = _profile_slab(
        "HelmetChin",
        (
            (-0.155, 1.705),
            (0.155, 1.705),
            (0.112, 1.655),
            (0.0, 1.628),
            (-0.112, 1.655),
        ),
        center_y=0.255,
        thickness=0.060,
        material=materials["DarkSteel"],
    )
    additions.append(_rigid(chin, armature, "head"))

    # Recolor the original low crest as a crimson base, then add the tall fin
    # that gives the front/side silhouette its unmistakable concept-sheet read.
    crest_base = next((obj for obj in model.objects if obj.name == "Crest"), None)
    if crest_base is not None:
        _replace_material(crest_base, materials["CrimsonCloth"])
    crest = _profile_slab(
        "CrestFin",
        (
            (-0.058, 1.965),
            (0.058, 1.965),
            (0.050, 2.170),
            (-0.042, 2.185),
        ),
        center_y=-0.055,
        thickness=0.19,
        material=materials["CrimsonCloth"],
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

    # The scarf should break the helmet from the chest, but its front edge is
    # intentionally tapered rather than another horizontal board.
    scarf = _profile_slab(
        "CrimsonScarfFront",
        (
            (-0.29, 1.665),
            (0.29, 1.665),
            (0.245, 1.575),
            (0.080, 1.545),
            (-0.205, 1.585),
        ),
        center_y=0.180,
        thickness=0.085,
        material=materials["CrimsonCloth"],
    )
    additions.append(_rigid(scarf, armature, "neck"))
    return additions


def _waist_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # The concept uses a dark leather belt as the structural band and reserves
    # brass for hardware. A full-width gold bar flattened the waist in the old
    # render and made the tabard look bolted onto a toy block.
    war_belt = next((obj for obj in model.objects if obj.name == "WarBelt"), None)
    if war_belt is not None:
        _replace_material(war_belt, materials["Leather"])

    buckle = _profile_slab(
        "BeltBuckle",
        (
            (-0.105, 1.075),
            (0.105, 1.075),
            (0.118, 0.985),
            (0.0, 0.958),
            (-0.118, 0.985),
        ),
        center_y=0.196,
        thickness=0.050,
        material=materials["Brass"],
    )
    additions.append(_rigid(buckle, armature, "pelvis"))

    waist_sides = (
        ("L", -1.0, "WaistStrap.L", "WaistPouch.L", "WaistPouchFlap.L"),
        ("R", 1.0, "WaistStrap.R", "WaistPouch.R", "WaistPouchFlap.R"),
    )
    for side, sign, strap_name, pouch_name, flap_name in waist_sides:
        strap = _profile_slab(
            strap_name,
            (
                (0.330 * sign, 1.045),
                (0.245 * sign, 1.055),
                (0.245 * sign, 0.790),
                (0.300 * sign, 0.755),
                (0.350 * sign, 0.800),
            ),
            center_y=0.168,
            thickness=0.055,
            material=materials["Leather"],
        )
        additions.append(_rigid(strap, armature, "pelvis"))

        pouch = _profile_slab(
            pouch_name,
            (
                (0.425 * sign, 0.990),
                (0.285 * sign, 0.990),
                (0.278 * sign, 0.820),
                (0.355 * sign, 0.790),
                (0.438 * sign, 0.840),
            ),
            center_y=0.205,
            thickness=0.110,
            material=materials["Leather"],
        )
        additions.append(_rigid(pouch, armature, "pelvis"))
        flap = _profile_slab(
            flap_name,
            (
                (0.424 * sign, 0.970),
                (0.292 * sign, 0.970),
                (0.315 * sign, 0.900),
                (0.390 * sign, 0.895),
            ),
            center_y=0.270,
            thickness=0.025,
            material=materials["Brass"],
        )
        additions.append(_rigid(flap, armature, "pelvis"))

    # This front-facing cloth shell covers the blockout slab with a deliberate
    # concept-like contour: broad at the belt, narrowed through the thigh, then
    # split into an asymmetric pointed termination.
    tabard = _profile_slab(
        "TabardHeroPanel",
        (
            (-0.205, 0.970),
            (0.205, 0.970),
            (0.176, 0.690),
            (0.142, 0.455),
            (0.035, 0.305),
            (0.0, 0.350),
            (-0.110, 0.300),
            (-0.165, 0.475),
        ),
        center_y=0.265,
        thickness=0.038,
        material=materials["CrimsonCloth"],
    )
    additions.append(_rigid(tabard, armature, "tabard_front_01"))

    left_trim = _profile_slab(
        "TabardTrim.L",
        (
            (-0.205, 0.970),
            (-0.170, 0.957),
            (-0.137, 0.485),
            (-0.108, 0.343),
            (-0.137, 0.314),
            (-0.176, 0.470),
        ),
        center_y=0.289,
        thickness=0.018,
        material=materials["Brass"],
    )
    additions.append(_rigid(left_trim, armature, "tabard_front_01"))

    right_trim = _profile_slab(
        "TabardTrim.R",
        (
            (0.205, 0.970),
            (0.170, 0.957),
            (0.149, 0.478),
            (0.039, 0.322),
            (0.018, 0.350),
            (0.119, 0.485),
        ),
        center_y=0.289,
        thickness=0.018,
        material=materials["Brass"],
    )
    additions.append(_rigid(right_trim, armature, "tabard_front_01"))

    sigil = _beveled_box(
        "TabardSigilStem",
        (0.0, 0.306, 0.690),
        (0.034, 0.018, 0.220),
        materials["Brass"],
        bevel=0.006,
    )
    additions.append(_rigid(sigil, armature, "tabard_front_01"))
    for side, sign in (("L", -1.0), ("R", 1.0)):
        arm = _beveled_box(
            f"TabardSigilArm.{side}",
            (0.047 * sign, 0.306, 0.735),
            (0.105, 0.018, 0.026),
            materials["Brass"],
            bevel=0.005,
            rotation=(0.0, 0.0, radians(-48 * sign)),
        )
        additions.append(_rigid(arm, armature, "tabard_front_01"))

    return additions


def _shoulder_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    sides = (
        ("L", -1.0, "PauldronDrop.L", "UpperArmPlate.L"),
        ("R", 1.0, "PauldronDrop.R", "UpperArmPlate.R"),
    )
    for side, sign, drop_name, upper_arm_name in sides:
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

        # A lower bell layer turns the broad top plate into a shoulder shell
        # instead of a horizontal bar and follows the arm through combat poses.
        drop = _beveled_box(
            drop_name,
            (0.69 * sign, 0.035, 1.365),
            (0.34, 0.30, PAULDRON_DROP_HEIGHT),
            materials["DarkSteel"],
            bevel=0.028,
            rotation=(0.0, radians(24 * sign), radians(12 * sign)),
        )
        additions.append(_rigid(drop, armature, f"upper_arm.{side}"))

        # Fill the remaining shoulder-to-elbow gap so the upper limb reads as
        # articulated plate armor rather than an exposed rig cylinder.
        upper_arm = _beveled_box(
            upper_arm_name,
            (0.59 * sign, 0.055, 1.335),
            (UPPER_ARM_ARMOR_WIDTH, 0.235, 0.29),
            materials["SteelEdge"],
            bevel=0.024,
            rotation=(0.0, radians(38 * sign), radians(6 * sign)),
        )
        additions.append(_rigid(upper_arm, armature, f"upper_arm.{side}"))
    return additions


def _limb_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    sides = (
        (
            "L", -1.0, "VambracePlate.L", "GauntletCuff.L", "GauntletKnuckle.L",
            "CuisseOuter.L", "KneeCap.L", "GreaveRidge.L", "BootToeArmor.L",
        ),
        (
            "R", 1.0, "VambracePlate.R", "GauntletCuff.R", "GauntletKnuckle.R",
            "CuisseOuter.R", "KneeCap.R", "GreaveRidge.R", "BootToeArmor.R",
        ),
    )
    for (
        side, sign, vambrace_name, cuff_name, knuckle_name,
        cuisse_name, knee_name, greave_name, boot_name,
    ) in sides:
        # Bridge the large shoulder and hand masses with a proper plated forearm.
        vambrace = _beveled_box(
            vambrace_name,
            (0.795 * sign, 0.075, 1.095),
            (FOREARM_ARMOR_WIDTH, 0.25, 0.29),
            materials["DarkSteel"],
            bevel=0.026,
            rotation=(radians(-5), radians(27 * sign), radians(5 * sign)),
        )
        additions.append(_rigid(vambrace, armature, f"forearm.{side}"))

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

        # Carry armor mass continuously from the fauld through the knee instead
        # of leaving a narrow leather cylinder between torso and greave.
        cuisse = _beveled_box(
            cuisse_name,
            (0.205 * sign, 0.085, 0.675),
            (THIGH_ARMOR_WIDTH, 0.255, 0.30),
            materials["DarkSteel"],
            bevel=0.030,
            rotation=(0.0, radians(3 * sign), 0.0),
        )
        additions.append(_rigid(cuisse, armature, f"thigh.{side}"))

        knee = _wedge(
            knee_name,
            center=(0.21 * sign, 0.165, 0.505),
            width=0.31,
            depth=0.18,
            height=0.15,
            material=materials["SteelEdge"],
            forward_tip=0.055,
        )
        additions.append(_rigid(knee, armature, f"shin.{side}"))

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
            (BOOT_ARMOR_CENTER_X * sign, 0.345, 0.125),
            (BOOT_SILHOUETTE_WIDTH, 0.24, 0.14),
            materials["DarkSteel"],
            bevel=0.030,
        )
        additions.append(_rigid(boot, armature, f"foot.{side}"))
    return additions


def _sorcery_refinement(
    armature: bpy.types.Object,
    model: ModelParts,
) -> list[bpy.types.Object]:
    materials = model.materials
    additions: list[bpy.types.Object] = []

    # Keep the authored magic asymmetrical and separated so the individual cyan
    # shards read as energy around the hand rather than merging into a white cross.
    shard_specs = (
        ("SorceryHeroShard.1", (-1.065, 0.205, 0.885), 0.070, 0.060, 0.130, 0.025),
        ("SorceryHeroShard.2", (-0.885, 0.220, 0.860), 0.060, 0.055, 0.110, 0.020),
        ("SorceryHeroShard.3", (-0.985, 0.235, 0.745), 0.055, 0.050, 0.105, 0.018),
    )
    for name, center, width, depth, height, tip in shard_specs:
        shard = _wedge(
            name,
            center=center,
            width=width + SORCERY_ACCENT_RADIUS * 0.05,
            depth=depth,
            height=height,
            material=materials["SorceryAccent"],
            forward_tip=tip,
        )
        additions.append(_bone_parent_keep_world(shard, armature, "socket_sorcery"))
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
    additions.extend(_waist_refinement(armature, model))
    additions.extend(_shoulder_refinement(armature, model))
    additions.extend(_limb_refinement(armature, model))
    additions.extend(_sorcery_refinement(armature, model))
    additions.extend(_sword_refinement(armature, model))
    return ModelParts(objects=(*model.objects, *additions), materials=model.materials)
