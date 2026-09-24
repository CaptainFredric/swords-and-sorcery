from __future__ import annotations

from mathutils import Vector

import bpy

from .authoritative_accuracy_pass import _scale_about_center
from .authoritative_model import _add_rigid, _add_socket, _diamond, _folded_panel, _loft, _prism_xz
from .model import ModelParts, _beveled_box


def _remove_matching(
    model: ModelParts,
    *,
    exact: set[str] | None = None,
    prefixes: tuple[str, ...] = (),
) -> list[bpy.types.Object]:
    exact = exact or set()
    kept: list[bpy.types.Object] = []
    for obj in model.objects:
        if obj.name in exact or obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def _mesh_center(obj: bpy.types.Object) -> Vector:
    if obj.type != "MESH" or not obj.data.vertices:
        return Vector((0.0, 0.0, 0.0))
    center = Vector((0.0, 0.0, 0.0))
    for vertex in obj.data.vertices:
        center += vertex.co
    return center / len(obj.data.vertices)


def _set_material_color(material: bpy.types.Material, color: tuple[float, float, float, float]) -> None:
    material.diffuse_color = color
    if not material.use_nodes or material.node_tree is None:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return
    if "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = color
    if material.name == "VisorGlow":
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = color


def _retune_palette(materials: dict[str, bpy.types.Material]) -> None:
    """Match the concept sheet's colder steel, warm brass, deep crimson and cyan visor."""
    _set_material_color(materials["DarkSteel"], (0.070, 0.085, 0.105, 1.0))
    _set_material_color(materials["SteelEdge"], (0.405, 0.445, 0.485, 1.0))
    _set_material_color(materials["Brass"], (0.535, 0.345, 0.135, 1.0))
    _set_material_color(materials["CrimsonCloth"], (0.335, 0.028, 0.040, 1.0))
    _set_material_color(materials["Leather"], (0.070, 0.043, 0.030, 1.0))
    _set_material_color(materials["VisorGlow"], (0.035, 0.82, 1.0, 1.0))


def _polish_primary_masses(model: ModelParts) -> None:
    """Bring the neutral silhouette closer to the sheet without returning to chibi proportions."""
    head_pivot = Vector((0.0, 0.0, 1.94))
    for obj in model.objects:
        name = obj.name
        if obj.type != "MESH":
            continue

        if name.startswith("Helmet") or name.startswith("VisorGlow") or name in {"FaceRecess", "Visor", "Crest"}:
            for vertex in obj.data.vertices:
                delta = vertex.co - head_pivot
                vertex.co = head_pivot + Vector((delta.x * 1.04, delta.y * 1.03, delta.z * 1.025))
            obj.data.update()
        elif name.startswith(("UpperArmPlate.", "Vambrace.")):
            _scale_about_center(obj, 1.055, 1.045, 1.025)
        elif name.startswith(("Cuisse.", "CuisseFacet.", "CuisseOuter.")):
            _scale_about_center(obj, 1.075, 1.045, 1.035)
        elif name.startswith(("Greave.", "GreaveFacet.", "GreaveFace.")):
            _scale_about_center(obj, 1.065, 1.040, 1.030)


def _rebuild_boots(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("Boot",))
    parts: list[bpy.types.Object] = []

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.286 * sign
        boot = _loft(
            f"Boot.{side}",
            (
                (0.018, cx, 0.142, 0.350, -0.105),
                (0.065, cx, 0.150, 0.355, -0.100),
                (0.125, cx, 0.150, 0.318, -0.092),
                (0.190, cx, 0.136, 0.255, -0.086),
                (0.260, cx, 0.118, 0.185, -0.080),
                (0.315, cx, 0.102, 0.135, -0.074),
            ),
            materials["SteelEdge"],
        )
        _add_rigid(parts, boot, armature, f"foot.{side}")

        sole = _beveled_box(
            f"BootSole.{side}",
            (cx, 0.122, 0.018),
            (0.292, 0.458, 0.028),
            materials["DarkSteel"],
            bevel=0.008,
        )
        _add_rigid(parts, sole, armature, f"foot.{side}")

        toe = _prism_xz(
            f"BootToePlate.{side}",
            (
                (cx - 0.135, 0.145),
                (cx + 0.135, 0.145),
                (cx + 0.142, 0.095),
                (cx + 0.120, 0.060),
                (cx - 0.120, 0.060),
                (cx - 0.142, 0.095),
            ),
            front_y=0.365,
            back_y=0.245,
            material=materials["SteelEdge"],
        )
        _add_rigid(parts, toe, armature, f"foot.{side}")

        trim = _prism_xz(
            f"BootAnkleTrim.{side}",
            (
                (cx - 0.120, 0.292),
                (cx + 0.120, 0.292),
                (cx + 0.128, 0.238),
                (cx - 0.128, 0.238),
            ),
            front_y=0.150,
            back_y=-0.090,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, f"shin.{side}")

        instep = _prism_xz(
            f"BootInstepPlate.{side}",
            (
                (cx - 0.115, 0.238),
                (cx + 0.115, 0.238),
                (cx + 0.132, 0.166),
                (cx + 0.095, 0.120),
                (cx - 0.095, 0.120),
                (cx - 0.132, 0.166),
            ),
            front_y=0.280,
            back_y=0.155,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, instep, armature, f"foot.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _bulk_gauntlets(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("GauntletBackPlate.",))
    parts: list[bpy.types.Object] = []

    for obj in kept:
        if obj.name.startswith("GauntletCuff."):
            _scale_about_center(obj, 1.08, 1.07, 1.06)
        elif obj.name.startswith("Gauntlet."):
            _scale_about_center(obj, 1.10, 1.12, 1.07)
        elif obj.name.startswith(("GauntletFingerPlate.", "GauntletKnuckle")):
            _scale_about_center(obj, 1.06, 1.10, 1.06)

    for side, sign in (("L", -1.0), ("R", 1.0)):
        gauntlet = next((obj for obj in kept if obj.name == f"Gauntlet.{side}"), None)
        if gauntlet is None:
            continue
        center = _mesh_center(gauntlet)
        plate = _diamond(
            f"GauntletBackPlate.{side}",
            (center.x, center.y + 0.078, center.z + 0.010),
            (0.070, 0.025, 0.060),
            materials["SteelEdge"],
        )
        _add_rigid(parts, plate, armature, f"hand.{side}")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_sword(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(model, prefixes=("Sword",), exact={"HeroSword"})
    parts: list[bpy.types.Object] = []

    base = Vector((0.595, 0.105, 1.015))
    tip = Vector((1.120, 0.105, 0.185))
    axis = (tip - base).normalized()
    perp = Vector((-axis.z, 0.0, axis.x)).normalized()
    neck = base + axis * 0.060
    late = tip - axis * 0.125

    outer_half = 0.116
    outer_profile = (
        base + perp * 0.078,
        neck + perp * outer_half,
        late + perp * (outer_half * 0.92),
        tip,
        late - perp * (outer_half * 0.92),
        neck - perp * outer_half,
        base - perp * 0.078,
    )
    blade = _prism_xz(
        "HeroSword",
        tuple((p.x, p.z) for p in outer_profile),
        front_y=0.150,
        back_y=0.066,
        material=materials["SteelEdge"],
    )
    _add_socket(parts, blade, armature, "socket_sword")

    inner_profile = tuple(base + (p - base) * 0.78 for p in outer_profile)
    facet = _prism_xz(
        "SwordBladeFacet",
        tuple((p.x, p.z) for p in inner_profile),
        front_y=0.160,
        back_y=0.148,
        material=materials["DarkSteel"],
    )
    _add_socket(parts, facet, armature, "socket_sword")

    guard_center = base - axis * 0.020
    guard_half = 0.235
    guard_points = (
        guard_center + perp * guard_half + axis * 0.038,
        guard_center + perp * (guard_half + 0.032),
        guard_center + perp * guard_half - axis * 0.040,
        guard_center - perp * guard_half - axis * 0.040,
        guard_center - perp * (guard_half + 0.032),
        guard_center - perp * guard_half + axis * 0.038,
    )
    guard = _prism_xz(
        "SwordGuard",
        tuple((p.x, p.z) for p in guard_points),
        front_y=0.172,
        back_y=0.052,
        material=materials["Brass"],
    )
    _add_socket(parts, guard, armature, "socket_sword")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        cap_center = guard_center + perp * ((guard_half + 0.030) * sign)
        cap = _diamond(
            f"SwordGuardCap.{side}",
            tuple(cap_center),
            (0.052, 0.050, 0.052),
            materials["Brass"],
        )
        _add_socket(parts, cap, armature, "socket_sword")

    grip_start = base - axis * 0.070
    grip_end = base - axis * 0.225
    grip_profile = (
        grip_start + perp * 0.032,
        grip_start - perp * 0.032,
        grip_end - perp * 0.027,
        grip_end + perp * 0.027,
    )
    grip = _prism_xz(
        "SwordGrip",
        tuple((p.x, p.z) for p in grip_profile),
        front_y=0.147,
        back_y=0.068,
        material=materials["Leather"],
    )
    _add_socket(parts, grip, armature, "socket_sword")

    collar = _diamond("SwordGripCollar", tuple(base - axis * 0.060), (0.043, 0.038, 0.043), materials["Brass"])
    _add_socket(parts, collar, armature, "socket_sword")

    gem_frame = _diamond(
        "SwordGemFrame",
        (guard_center.x, 0.182, guard_center.z),
        (0.055, 0.026, 0.055),
        materials["Brass"],
    )
    _add_socket(parts, gem_frame, armature, "socket_sword")
    gem = _diamond(
        "SwordGem",
        (guard_center.x, 0.210, guard_center.z),
        (0.032, 0.018, 0.032),
        materials["CrimsonCloth"],
    )
    _add_socket(parts, gem, armature, "socket_sword")

    pommel = _diamond("SwordPommel", tuple(grip_end - axis * 0.055), (0.052, 0.045, 0.052), materials["Brass"])
    _add_socket(parts, pommel, armature, "socket_sword")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _rebuild_rear_cloth_details(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        exact={"TabardBack", "TabardBackTrim.L", "TabardBackTrim.R", "TabardBackSigil"},
    )
    parts: list[bpy.types.Object] = []

    back = _folded_panel(
        "TabardBack",
        (
            (0.500, 0.088, -0.405),
            (0.720, 0.098, -0.390),
            (0.950, 0.108, -0.366),
            (1.180, 0.118, -0.335),
            (1.420, 0.130, -0.298),
            (1.625, 0.138, -0.258),
        ),
        thickness=0.030,
        fold=-0.040,
        material=materials["CrimsonCloth"],
    )
    _add_rigid(parts, back, armature, "tabard_back_01")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        trim = _prism_xz(
            f"TabardBackTrim.{side}",
            (
                (0.104 * sign, 0.555),
                (0.129 * sign, 0.555),
                (0.139 * sign, 1.565),
                (0.116 * sign, 1.565),
            ),
            front_y=-0.432,
            back_y=-0.448,
            material=materials["Brass"],
        )
        _add_rigid(parts, trim, armature, "tabard_back_01")

    sigil = _prism_xz(
        "TabardBackSigil",
        (
            (-0.020, 0.785),
            (0.020, 0.785),
            (0.020, 1.105),
            (0.070, 1.055),
            (0.085, 1.090),
            (0.000, 1.185),
            (-0.085, 1.090),
            (-0.070, 1.055),
            (-0.020, 1.105),
        ),
        front_y=-0.454,
        back_y=-0.466,
        material=materials["Brass"],
    )
    _add_rigid(parts, sigil, armature, "tabard_back_01")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def _finish_chest_and_belt(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    kept = _remove_matching(
        model,
        exact={"BreastplateLowerTrim", "BeltBuckle", "BeltBuckleInset"},
    )
    parts: list[bpy.types.Object] = []

    lower_trim = _prism_xz(
        "BreastplateLowerTrim",
        (
            (-0.270, 1.292),
            (-0.205, 1.262),
            (0.0, 1.248),
            (0.205, 1.262),
            (0.270, 1.292),
            (0.248, 1.326),
            (0.0, 1.285),
            (-0.248, 1.326),
        ),
        front_y=0.294,
        back_y=0.272,
        material=materials["Brass"],
    )
    _add_rigid(parts, lower_trim, armature, "chest")

    buckle = _beveled_box(
        "BeltBuckle",
        (0.075, 0.194, 1.238),
        (0.148, 0.052, 0.142),
        materials["Brass"],
        bevel=0.009,
    )
    _add_rigid(parts, buckle, armature, "pelvis")
    inset = _beveled_box(
        "BeltBuckleInset",
        (0.075, 0.224, 1.238),
        (0.088, 0.020, 0.082),
        materials["DarkSteel"],
        bevel=0.005,
    )
    _add_rigid(parts, inset, armature, "pelvis")

    return ModelParts(objects=tuple((*kept, *parts)), materials=model.materials)


def apply_authoritative_final_polish(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    _retune_palette(materials)
    _polish_primary_masses(model)
    model = _rebuild_boots(model, armature, materials)
    model = _bulk_gauntlets(model, armature, materials)
    model = _rebuild_sword(model, armature, materials)
    model = _rebuild_rear_cloth_details(model, armature, materials)
    model = _finish_chest_and_belt(model, armature, materials)
    return model
