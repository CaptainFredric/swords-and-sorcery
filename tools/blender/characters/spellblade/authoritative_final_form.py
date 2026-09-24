from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_accuracy_pass import _scale_about_center
from .authoritative_model import _add_rigid, _add_socket, _diamond, _folded_panel, _loft, _prism_xz
from .model import ModelParts


def _remove_superseded_overlays(model: ModelParts) -> ModelParts:
    exact = {
        "BreastplateFace",
        "BreastplateRidge",
        "SwordGuardOuter",
    }
    prefixes = ("PauldronShell.",)

    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in exact or obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _rebuild_final_helmet(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in {"HelmetShell", "HelmetJaw", "HelmetRearPlate"}:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []

    shell = _loft(
        "HelmetShell",
        (
            (1.748, 0.0, 0.096, 0.032, -0.070),
            (1.790, 0.0, 0.142, 0.125, -0.132),
            (1.875, 0.0, 0.176, 0.205, -0.158),
            (1.965, 0.0, 0.185, 0.226, -0.163),
            (2.045, 0.0, 0.171, 0.178, -0.147),
            (2.105, 0.0, 0.130, 0.096, -0.103),
            (2.132, 0.0, 0.082, 0.026, -0.062),
        ),
        materials["SteelEdge"],
    )
    _add_rigid(parts, shell, armature, "head")

    jaw = _loft(
        "HelmetJaw",
        (
            (1.748, 0.0, 0.054, 0.052, -0.022),
            (1.790, 0.0, 0.104, 0.132, -0.044),
            (1.850, 0.0, 0.143, 0.192, -0.060),
            (1.915, 0.0, 0.156, 0.210, -0.067),
            (1.965, 0.0, 0.148, 0.198, -0.066),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, jaw, armature, "head")

    rear = _loft(
        "HelmetRearPlate",
        (
            (1.800, 0.0, 0.112, -0.112, -0.150),
            (1.900, 0.0, 0.147, -0.124, -0.170),
            (2.015, 0.0, 0.138, -0.118, -0.163),
            (2.070, 0.0, 0.104, -0.096, -0.136),
        ),
        materials["DarkSteel"],
    )
    _add_rigid(parts, rear, armature, "head")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _compact_head_group(model: ModelParts) -> None:
    """Compact the complete helmet around a shared pivot, with a much flatter side profile."""
    pivot_x, pivot_y, pivot_z = 0.0, 0.0, 1.940
    sx, sy, sz = 0.92, 0.77, 0.94

    for obj in model.objects:
        name = obj.name
        belongs_to_head = (
            name.startswith("Helmet")
            or name.startswith("VisorGlow")
            or name in {"FaceRecess", "Visor", "Crest"}
        )
        if not belongs_to_head or obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.x = pivot_x + (vertex.co.x - pivot_x) * sx
            vertex.co.y = pivot_y + (vertex.co.y - pivot_y) * sy
            vertex.co.z = pivot_z + (vertex.co.z - pivot_z) * sz
        obj.data.update()


def _rebuild_final_shoulders(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    names: set[str] = set()
    for side in ("L", "R"):
        names.update({
            f"Pauldron.{side}", f"PauldronFacet.{side}", f"PauldronTrim.{side}",
            f"PauldronLower.{side}", f"ShoulderBadge.{side}", f"PauldronShell.{side}",
        })

    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []
    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.397 * sign

        # Volumetric sloped cap: the concept is broad, but the shoulder is not a flat disc.
        pauldron = _loft(
            f"Pauldron.{side}",
            (
                (1.430, cx, 0.092, 0.095, -0.085),
                (1.500, cx, 0.142, 0.155, -0.125),
                (1.595, cx, 0.158, 0.184, -0.145),
                (1.670, cx, 0.142, 0.158, -0.128),
                (1.718, cx, 0.096, 0.098, -0.082),
            ),
            materials["SteelEdge"],
        )
        _add_rigid(parts, pauldron, armature, f"clavicle.{side}")

        # A shallow angular face supplies the low-poly shield planes visible in front view.
        face = _prism_xz(
            f"PauldronShell.{side}",
            (
                (0.300 * sign, 1.660),
                (0.385 * sign, 1.715),
                (0.495 * sign, 1.695),
                (0.552 * sign, 1.625),
                (0.535 * sign, 1.525),
                (0.455 * sign, 1.470),
                (0.355 * sign, 1.495),
                (0.312 * sign, 1.565),
            ),
            front_y=0.198,
            back_y=0.168,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, face, armature, f"clavicle.{side}")

        trim = _prism_xz(
            f"PauldronTrim.{side}",
            (
                (0.305 * sign, 1.674),
                (0.382 * sign, 1.735),
                (0.500 * sign, 1.713),
                (0.565 * sign, 1.637),
                (0.548 * sign, 1.604),
                (0.493 * sign, 1.665),
                (0.390 * sign, 1.686),
                (0.326 * sign, 1.642),
            ),
            front_y=0.226,
            back_y=0.201,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"clavicle.{side}")

        lower = _prism_xz(
            f"PauldronLower.{side}",
            (
                (0.342 * sign, 1.530),
                (0.515 * sign, 1.525),
                (0.535 * sign, 1.478),
                (0.485 * sign, 1.405),
                (0.400 * sign, 1.408),
                (0.350 * sign, 1.458),
            ),
            front_y=0.138,
            back_y=-0.105,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, lower, armature, f"upper_arm.{side}")

        badge = _diamond(
            f"ShoulderBadge.{side}",
            (0.475 * sign, 0.246, 1.600),
            (0.034, 0.018, 0.034),
            materials["Brass"],
        )
        _add_rigid(parts, badge, armature, f"clavicle.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_armored_anatomy(model: ModelParts) -> None:
    """Undo accumulated over-bulking while preserving the concept's heavy armor."""
    for obj in model.objects:
        name = obj.name
        if name == "Breastplate":
            _scale_about_center(obj, 0.94, 1.07, 1.04)
        elif name in {"BackArmor", "TorsoUnder"}:
            _scale_about_center(obj, 0.95, 1.05, 1.03)
        elif name.startswith(("ArmUnder.", "ForearmUnder.")):
            _scale_about_center(obj, 0.96, 1.00, 1.05)
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 0.93, 1.00, 1.08)
        elif name.startswith(("Gauntlet.", "GauntletCuff.", "GauntletKnuckle", "GauntletFinger")):
            _scale_about_center(obj, 0.95, 1.00, 1.05)
        elif name.startswith(("ThighUnder.", "ShinUnder.")):
            _scale_about_center(obj, 0.94, 1.00, 1.05)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "CuisseOuter.")):
            _scale_about_center(obj, 0.90, 1.00, 1.08)
        elif name.startswith(("KneePlate.", "KneeTrim.")):
            _scale_about_center(obj, 0.92, 1.00, 1.04)
        elif name.startswith(("Greave.", "GreaveFacet.", "GreaveFace.")):
            _scale_about_center(obj, 0.91, 1.00, 1.08)
        elif name.startswith("Boot"):
            _scale_about_center(obj, 0.96, 0.95, 1.04)


def _refine_final_proportions(model: ModelParts) -> None:
    """Make the final export taller and cleaner rather than broad/chibi."""
    for obj in model.objects:
        name = obj.name
        if name in {"Breastplate", "BreastplateFace", "BreastplateRidge", "BackArmor", "TorsoUnder"}:
            _scale_about_center(obj, 0.94, 1.00, 1.04)
        elif name.startswith(("ChestFacet.", "BreastplateTrim.")):
            _scale_about_center(obj, 0.95, 1.00, 1.04)
        elif name == "CrimsonScarf":
            _scale_about_center(obj, 0.93, 0.96, 1.02)
        elif name == "TabardFront":
            _scale_about_center(obj, 0.86, 0.96, 1.05)
        elif name.startswith(("BeltPouch.", "BeltPouchFlap.")):
            _scale_about_center(obj, 0.93, 0.95, 1.00)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "CuisseOuter.")):
            _scale_about_center(obj, 0.96, 1.00, 1.04)
        elif name.startswith(("Greave.", "GreaveFacet.", "GreaveFace.")):
            _scale_about_center(obj, 0.96, 1.00, 1.04)


def _remove_hip_blocks(model: ModelParts) -> ModelParts:
    """Remove the procedural hip boxes; concept uses narrow straps beside tabard."""
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name.startswith(("Fauld.", "FauldTrim.")):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def _rebuild_concept_sword(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    exact = {
        "HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGuardOuter",
        "SwordGrip", "SwordGripCollar", "SwordGemSetting", "SwordGemFrame",
        "SwordGem", "SwordPommel",
    }
    prefixes = ("SwordGuardQuillon.", "SwordGuardCap.")
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in exact or obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []
    base = Vector((0.585, 0.105, 1.000))
    tip = Vector((1.145, 0.105, 0.150))
    axis = (tip - base).normalized()
    perp = Vector((-axis.z, 0.0, axis.x)).normalized()
    neck = base + axis * 0.055
    late = tip - axis * 0.115

    half_width = 0.096
    profile = (
        base + perp * 0.072,
        neck + perp * half_width,
        late + perp * (half_width * 0.94),
        tip,
        late - perp * (half_width * 0.94),
        neck - perp * half_width,
        base - perp * 0.072,
    )
    blade = _prism_xz(
        "HeroSword",
        tuple((p.x, p.z) for p in profile),
        front_y=0.142,
        back_y=0.074,
        material=materials["SteelEdge"],
    )
    _add_socket(parts, blade, armature, "socket_sword")

    inner = (
        base + axis * 0.045 + perp * 0.038,
        neck + axis * 0.030 + perp * 0.052,
        late + perp * 0.050,
        tip - axis * 0.045,
        late - perp * 0.050,
        neck + axis * 0.030 - perp * 0.052,
        base + axis * 0.045 - perp * 0.038,
    )
    facet = _prism_xz(
        "SwordBladeFacet",
        tuple((p.x, p.z) for p in inner),
        front_y=0.151,
        back_y=0.141,
        material=materials["DarkSteel"],
    )
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis * 0.018
    guard_half = 0.185
    guard_depth = 0.035
    guard_points = (
        guard_center + perp * guard_half + axis * guard_depth,
        guard_center + perp * (guard_half + 0.040),
        guard_center + perp * guard_half - axis * guard_depth,
        guard_center - perp * guard_half - axis * guard_depth,
        guard_center - perp * (guard_half + 0.040),
        guard_center - perp * guard_half + axis * guard_depth,
    )
    guard = _prism_xz(
        "SwordGuardOuter",
        tuple((p.x, p.z) for p in guard_points),
        front_y=0.164,
        back_y=0.052,
        material=materials["Brass"],
    )
    _add_socket(parts, guard, armature, "socket_sword")

    guard_inner_points = tuple(guard_center + (p - guard_center) * 0.68 for p in guard_points)
    guard_inner = _prism_xz(
        "SwordGuard",
        tuple((p.x, p.z) for p in guard_inner_points),
        front_y=0.174,
        back_y=0.062,
        material=materials["DarkSteel"],
    )
    _add_socket(parts, guard_inner, armature, "socket_sword")

    grip_start = base - axis * 0.055
    grip_end = base - axis * 0.205
    grip_perp = 0.030
    grip_profile = (
        grip_start + perp * grip_perp,
        grip_start - perp * grip_perp,
        grip_end - perp * 0.026,
        grip_end + perp * 0.026,
    )
    grip = _prism_xz(
        "SwordGrip",
        tuple((p.x, p.z) for p in grip_profile),
        front_y=0.145,
        back_y=0.070,
        material=materials["Leather"],
    )
    _add_socket(parts, grip, armature, "socket_sword")

    collar_center = base - axis * 0.045
    collar = _diamond("SwordGripCollar", tuple(collar_center), (0.045, 0.038, 0.045), materials["Brass"])
    _add_socket(parts, collar, armature, "socket_sword")

    gem_center = guard_center + Vector((0.0, 0.075, 0.0))
    gem_setting = _diamond("SwordGemSetting", tuple(gem_center), (0.052, 0.025, 0.052), materials["Brass"])
    _add_socket(parts, gem_setting, armature, "socket_sword")
    gem = _diamond("SwordGem", (gem_center.x, gem_center.y + 0.025, gem_center.z), (0.030, 0.016, 0.030), materials["CrimsonCloth"])
    _add_socket(parts, gem, armature, "socket_sword")

    pommel_center = grip_end - axis * 0.055
    pommel = _diamond("SwordPommel", tuple(pommel_center), (0.050, 0.044, 0.050), materials["Brass"])
    _add_socket(parts, pommel, armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _refine_boot_read(model: ModelParts) -> None:
    """Shorten the platform read and emphasize ankle/instep/toe hierarchy."""
    for obj in model.objects:
        name = obj.name
        if name.startswith("BootSole."):
            _scale_about_center(obj, 0.95, 0.84, 0.86)
        elif name.startswith("BootHeel."):
            _scale_about_center(obj, 0.92, 0.88, 1.08)
        elif name.startswith(("BootToePlate.", "BootTopPlate.")):
            _scale_about_center(obj, 0.94, 0.86, 1.02)
        elif name.startswith(("BootInstepPlate.", "BootAnkleTrim.", "BootTopTrim.")):
            _scale_about_center(obj, 0.94, 0.92, 1.08)
        elif name.startswith("Boot."):
            _scale_about_center(obj, 0.95, 0.90, 1.06)


def _rebuild_rear_cloth(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name == "TabardBack":
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)

    parts: list[bpy.types.Object] = []
    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.092, -0.405),
            (0.720, 0.108, -0.390),
            (0.950, 0.122, -0.365),
            (1.180, 0.142, -0.335),
            (1.420, 0.162, -0.295),
            (1.650, 0.178, -0.252),
        ),
        thickness=0.034,
        fold=-0.047,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")
    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _restore_ground_contact(model: ModelParts) -> None:
    boot_objects = [
        obj for obj in model.objects
        if obj.type == "MESH" and obj.name.startswith("Boot") and obj.data.vertices
    ]
    if not boot_objects:
        return

    min_z = min(vertex.co.z for obj in boot_objects for vertex in obj.data.vertices)
    target = 0.006
    if min_z >= target:
        return

    lift = target - min_z
    for obj in boot_objects:
        for vertex in obj.data.vertices:
            vertex.co.z += lift
        obj.data.update()


def apply_authoritative_final_form(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = _remove_superseded_overlays(model)
    model = _rebuild_final_helmet(model, armature, materials)
    _compact_head_group(model)
    model = _rebuild_final_shoulders(model, armature, materials)
    _restore_armored_anatomy(model)
    _refine_final_proportions(model)
    model = _rebuild_concept_sword(model, armature, materials)
    _refine_boot_read(model)
    model = _remove_hip_blocks(model)
    model = _rebuild_rear_cloth(model, armature, materials)
    _restore_ground_contact(model)
    return model
