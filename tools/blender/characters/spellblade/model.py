from __future__ import annotations

from dataclasses import dataclass
from math import radians

import bpy
from mathutils import Vector

from .design import BODY_HEIGHT
from .rig import rigid_skin


REQUIRED_HERO_PIECES = (
    "HelmetShell", "HelmetJaw", "Visor", "Crest",
    "Breastplate", "Pauldron.L", "Pauldron.R",
    "Gauntlet.L", "Gauntlet.R", "Greave.L", "Greave.R",
    "Boot.L", "Boot.R", "TabardFront", "TabardBack", "HeroSword",
)


@dataclass(frozen=True)
class ModelParts:
    objects: tuple[bpy.types.Object, ...]
    materials: dict[str, bpy.types.Material]


def _activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _apply_transform(obj: bpy.types.Object) -> None:
    _activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def _material(name: str, color: tuple[float, float, float, float], *, metallic: float = 0.0,
              roughness: float = 0.5, emission_strength: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_strength > 0.0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = color
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = color
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return material


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "DarkSteel": _material("DarkSteel", (0.105, 0.135, 0.17, 1.0), metallic=0.82, roughness=0.34),
        "SteelEdge": _material("SteelEdge", (0.34, 0.40, 0.46, 1.0), metallic=0.9, roughness=0.24),
        "Brass": _material("Brass", (0.48, 0.30, 0.10, 1.0), metallic=0.72, roughness=0.31),
        "CrimsonCloth": _material("CrimsonCloth", (0.30, 0.025, 0.035, 1.0), metallic=0.0, roughness=0.82),
        "Leather": _material("Leather", (0.075, 0.045, 0.032, 1.0), metallic=0.0, roughness=0.88),
        "VisorGlow": _material("VisorGlow", (0.04, 0.74, 0.95, 1.0), metallic=0.12, roughness=0.22, emission_strength=5.0),
        "SorceryAccent": _material("SorceryAccent", (0.05, 0.58, 1.0, 1.0), metallic=0.0, roughness=0.18, emission_strength=7.0),
    }


def _assign(obj: bpy.types.Object, material: bpy.types.Material) -> bpy.types.Object:
    obj.data.materials.append(material)
    return obj


def _beveled_box(name: str, location: tuple[float, float, float], dimensions: tuple[float, float, float],
                  material: bpy.types.Material, *, bevel: float = 0.035,
                  rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2.0 for value in dimensions)
    _apply_transform(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new("ArmorBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.affect = "EDGES"
        _activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return _assign(obj, material)


def _tapered_prism(name: str, *, center: tuple[float, float, float], height: float,
                    bottom_width: float, top_width: float, depth: float,
                    material: bpy.types.Material) -> bpy.types.Object:
    z0 = -height / 2.0
    z1 = height / 2.0
    y0 = -depth / 2.0
    y1 = depth / 2.0
    bw = bottom_width / 2.0
    tw = top_width / 2.0
    vertices = [
        (-bw, y0, z0), (bw, y0, z0), (bw, y1, z0), (-bw, y1, z0),
        (-tw, y0, z1), (tw, y0, z1), (tw, y1, z1), (-tw, y1, z1),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    _apply_transform(obj)
    bevel = obj.modifiers.new("ArmorBevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 1
    _activate(obj)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return _assign(obj, material)


def _wedge(name: str, *, center: tuple[float, float, float], width: float, depth: float,
           height: float, material: bpy.types.Material, forward_tip: float = 0.08) -> bpy.types.Object:
    x = width / 2.0
    y0 = -depth / 2.0
    y1 = depth / 2.0 + forward_tip
    z = height / 2.0
    vertices = [
        (-x, y0, -z), (x, y0, -z), (-x, y0, z), (x, y0, z),
        (-x * 0.72, y1, -z * 0.55), (x * 0.72, y1, -z * 0.55),
        (-x * 0.72, y1, z * 0.55), (x * 0.72, y1, z * 0.55),
    ]
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5),
        (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    _apply_transform(obj)
    return _assign(obj, material)


def _cylinder_between(name: str, start: tuple[float, float, float], end: tuple[float, float, float],
                      radius: float, material: bpy.types.Material, *, vertices: int = 8) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    length = direction.length
    if length <= 1e-6:
        raise ValueError(f"{name} cylinder endpoints must differ")
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    _apply_transform(obj)
    return _assign(obj, material)


def _rigid(obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> bpy.types.Object:
    rigid_skin(obj, armature, bone)
    return obj


def _bone_parent_keep_world(obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> bpy.types.Object:
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = world
    return obj


def _helmet(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0.0, 0.0, 1.825))
    shell = bpy.context.object
    shell.name = "HelmetShell"
    shell.scale = (0.255, 0.225, 0.215)
    _apply_transform(shell)
    _assign(shell, materials["DarkSteel"])
    parts.append(_rigid(shell, armature, "head"))

    jaw = _wedge("HelmetJaw", center=(0.0, 0.125, 1.705), width=0.43, depth=0.18, height=0.19,
                 material=materials["DarkSteel"], forward_tip=0.055)
    parts.append(_rigid(jaw, armature, "head"))

    visor = _beveled_box("Visor", (0.0, 0.218, 1.835), (0.34, 0.035, 0.075), materials["VisorGlow"], bevel=0.012)
    parts.append(_rigid(visor, armature, "head"))

    brow_l = _beveled_box("HelmetBrow.L", (-0.11, 0.225, 1.895), (0.21, 0.055, 0.05), materials["SteelEdge"],
                          bevel=0.012, rotation=(0.0, 0.0, radians(-8)))
    brow_r = _beveled_box("HelmetBrow.R", (0.11, 0.225, 1.895), (0.21, 0.055, 0.05), materials["SteelEdge"],
                          bevel=0.012, rotation=(0.0, 0.0, radians(8)))
    parts.extend((_rigid(brow_l, armature, "head"), _rigid(brow_r, armature, "head")))

    crest = _wedge("Crest", center=(0.0, -0.02, 2.005), width=0.075, depth=0.27, height=0.07,
                   material=materials["Brass"], forward_tip=0.02)
    parts.append(_rigid(crest, armature, "head"))
    return parts


def _torso(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    under = _tapered_prism("UnderArmorTorso", center=(0.0, 0.0, 1.26), height=0.58,
                           bottom_width=0.48, top_width=0.68, depth=0.30, material=materials["Leather"])
    parts.append(_rigid(under, armature, "spine"))

    breast = _tapered_prism("Breastplate", center=(0.0, 0.055, 1.34), height=0.51,
                            bottom_width=0.53, top_width=0.78, depth=0.30, material=materials["DarkSteel"])
    parts.append(_rigid(breast, armature, "chest"))

    sternum = _beveled_box("BreastplateRidge", (0.0, 0.225, 1.36), (0.09, 0.055, 0.42), materials["SteelEdge"], bevel=0.016)
    parts.append(_rigid(sternum, armature, "chest"))

    belt = _beveled_box("WarBelt", (0.0, 0.015, 1.02), (0.58, 0.32, 0.10), materials["Brass"], bevel=0.02)
    parts.append(_rigid(belt, armature, "pelvis"))
    return parts


def _arm(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    upper = ((0.42 * sign, 0.0, 1.49), (0.72 * sign, 0.0, 1.23))
    fore = ((0.72 * sign, 0.0, 1.23), (0.90 * sign, 0.035, 0.94))
    parts: list[bpy.types.Object] = []

    pauldron = _wedge(f"Pauldron.{side}", center=(0.51 * sign, 0.02, 1.50), width=0.34, depth=0.34, height=0.23,
                      material=materials["DarkSteel"], forward_tip=0.035)
    parts.append(_rigid(pauldron, armature, f"clavicle.{side}"))

    shoulder_cap = _beveled_box(f"PauldronLayer.{side}", (0.61 * sign, 0.015, 1.43), (0.29, 0.30, 0.12),
                                materials["SteelEdge"], bevel=0.025,
                                rotation=(0.0, radians(18 * sign), radians(10 * sign)))
    parts.append(_rigid(shoulder_cap, armature, f"upper_arm.{side}"))

    upper_arm = _cylinder_between(f"UpperArm.{side}", *upper, 0.105, materials["Leather"])
    parts.append(_rigid(upper_arm, armature, f"upper_arm.{side}"))
    vambrace = _cylinder_between(f"Vambrace.{side}", *fore, 0.115, materials["DarkSteel"])
    parts.append(_rigid(vambrace, armature, f"forearm.{side}"))

    gauntlet = _beveled_box(f"Gauntlet.{side}", (0.925 * sign, 0.065, 0.86), (0.22, 0.20, 0.20),
                            materials["DarkSteel"], bevel=0.025, rotation=(radians(-8), 0.0, radians(8 * sign)))
    parts.append(_rigid(gauntlet, armature, f"hand.{side}"))
    return parts


def _leg(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    parts: list[bpy.types.Object] = []
    thigh = _cylinder_between(f"Thigh.{side}", (0.20 * sign, 0.0, 0.82), (0.21 * sign, 0.0, 0.47),
                              0.14, materials["Leather"])
    parts.append(_rigid(thigh, armature, f"thigh.{side}"))

    greave = _tapered_prism(f"Greave.{side}", center=(0.21 * sign, 0.045, 0.31), height=0.38,
                            bottom_width=0.23, top_width=0.29, depth=0.25, material=materials["DarkSteel"])
    parts.append(_rigid(greave, armature, f"shin.{side}"))

    kneecap = _wedge(f"KneePlate.{side}", center=(0.21 * sign, 0.12, 0.51), width=0.27, depth=0.16, height=0.16,
                     material=materials["SteelEdge"], forward_tip=0.045)
    parts.append(_rigid(kneecap, armature, f"shin.{side}"))

    boot = _beveled_box(f"Boot.{side}", (0.21 * sign, 0.115, 0.105), (0.36, 0.48, 0.21),
                        materials["DarkSteel"], bevel=0.035)
    parts.append(_rigid(boot, armature, f"foot.{side}"))
    toe = _wedge(f"BootToe.{side}", center=(0.21 * sign, 0.34, 0.105), width=0.34, depth=0.19, height=0.16,
                 material=materials["SteelEdge"], forward_tip=0.055)
    parts.append(_rigid(toe, armature, f"foot.{side}"))
    return parts


def _tabard(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    front = _tapered_prism("TabardFront", center=(0.0, 0.205, 0.73), height=0.48,
                           bottom_width=0.30, top_width=0.43, depth=0.055, material=materials["CrimsonCloth"])
    parts.append(_rigid(front, armature, "tabard_front_01"))
    front_lower = _tapered_prism("TabardFrontLower", center=(0.0, 0.22, 0.37), height=0.30,
                                 bottom_width=0.22, top_width=0.30, depth=0.05, material=materials["CrimsonCloth"])
    parts.append(_rigid(front_lower, armature, "tabard_front_02"))

    back = _tapered_prism("TabardBack", center=(0.0, -0.19, 0.73), height=0.48,
                          bottom_width=0.31, top_width=0.43, depth=0.055, material=materials["CrimsonCloth"])
    parts.append(_rigid(back, armature, "tabard_back_01"))
    back_lower = _tapered_prism("TabardBackLower", center=(0.0, -0.20, 0.38), height=0.28,
                                bottom_width=0.23, top_width=0.31, depth=0.05, material=materials["CrimsonCloth"])
    parts.append(_rigid(back_lower, armature, "tabard_back_02"))

    scarf = _beveled_box("CrimsonScarf", (0.0, -0.08, 1.61), (0.45, 0.24, 0.105), materials["CrimsonCloth"], bevel=0.035)
    parts.append(_rigid(scarf, armature, "neck"))
    return parts


def _diamond_blade(name: str, base: Vector, tip: Vector, width: float, thickness: float,
                   material: bpy.types.Material) -> bpy.types.Object:
    direction = (tip - base).normalized()
    side = direction.cross(Vector((0.0, 1.0, 0.0)))
    if side.length < 1e-5:
        side = direction.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    normal = direction.cross(side).normalized()
    mid = base + (tip - base) * 0.54
    vertices = [
        tuple(base + side * width * 0.42), tuple(base - side * width * 0.42),
        tuple(base + normal * thickness), tuple(base - normal * thickness),
        tuple(mid + side * width * 0.50), tuple(mid - side * width * 0.50),
        tuple(mid + normal * thickness), tuple(mid - normal * thickness), tuple(tip),
    ]
    faces = [
        (0, 4, 6, 2), (2, 6, 5, 1), (1, 5, 7, 3), (3, 7, 4, 0),
        (4, 8, 6), (6, 8, 5), (5, 8, 7), (7, 8, 4),
        (0, 2, 1), (0, 3, 2),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return _assign(obj, material)


def build_hero_sword(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    # Neutral pose keeps the oversized blade inside the 2.25m production height envelope.
    grip_base = Vector((0.95, 0.08, 0.76))
    blade_base = Vector((1.00, 0.10, 0.94))
    blade_tip = Vector((1.33, 0.14, 1.98))
    blade = _diamond_blade("HeroSword", blade_base, blade_tip, 0.17, 0.032, materials["SteelEdge"])

    guard = _beveled_box("HeroSword.Guard", (0.98, 0.09, 0.90), (0.42, 0.08, 0.065), materials["Brass"],
                         bevel=0.018, rotation=(0.0, radians(-17), radians(-3)))
    grip = _cylinder_between("HeroSword.Grip", tuple(grip_base), (0.98, 0.09, 0.91), 0.045, materials["Leather"], vertices=8)
    pommel = _beveled_box("HeroSword.Pommel", (0.945, 0.08, 0.735), (0.10, 0.09, 0.10), materials["Brass"], bevel=0.018)
    parts = [blade, guard, grip, pommel]
    for obj in parts:
        _bone_parent_keep_world(obj, armature, "socket_sword")
    return parts


def _sorcery_accent(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.095, location=(-0.96, 0.17, 0.84))
    core = bpy.context.object
    core.name = "SorceryCore"
    _apply_transform(core)
    _assign(core, materials["SorceryAccent"])
    parts.append(_bone_parent_keep_world(core, armature, "socket_sorcery"))
    for index, offset in enumerate(((-0.10, 0.03, 0.08), (0.08, 0.04, 0.10), (-0.04, 0.02, -0.10))):
        shard = _wedge(f"SorceryShard.{index + 1}", center=(-0.96 + offset[0], 0.17 + offset[1], 0.84 + offset[2]),
                       width=0.05, depth=0.06, height=0.14, material=materials["SorceryAccent"], forward_tip=0.02)
        parts.append(_bone_parent_keep_world(shard, armature, "socket_sorcery"))
    return parts


def build_third_person_model(armature: bpy.types.Object,
                             materials: dict[str, bpy.types.Material] | None = None) -> ModelParts:
    materials = materials or build_materials()
    objects: list[bpy.types.Object] = []
    objects.extend(_helmet(armature, materials))
    objects.extend(_torso(armature, materials))
    objects.extend(_arm("L", armature, materials))
    objects.extend(_arm("R", armature, materials))
    objects.extend(_leg("L", armature, materials))
    objects.extend(_leg("R", armature, materials))
    objects.extend(_tabard(armature, materials))
    objects.extend(build_hero_sword(armature, materials))
    objects.extend(_sorcery_accent(armature, materials))

    names = {obj.name for obj in objects}
    missing = [name for name in REQUIRED_HERO_PIECES if name not in names]
    if missing:
        raise ValueError(f"Spellblade production model missing hero pieces: {missing}")
    if max(vertex.co.z for obj in objects if obj.type == "MESH" for vertex in obj.data.vertices) > BODY_HEIGHT + 0.20:
        raise ValueError("Spellblade production model exceeds the neutral height envelope")
    return ModelParts(objects=tuple(objects), materials=materials)
