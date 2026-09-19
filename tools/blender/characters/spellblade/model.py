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
        "DarkSteel": _material("DarkSteel", (0.095, 0.125, 0.16, 1.0), metallic=0.84, roughness=0.34),
        "SteelEdge": _material("SteelEdge", (0.34, 0.40, 0.46, 1.0), metallic=0.90, roughness=0.24),
        "Brass": _material("Brass", (0.48, 0.30, 0.10, 1.0), metallic=0.72, roughness=0.31),
        "CrimsonCloth": _material("CrimsonCloth", (0.30, 0.025, 0.035, 1.0), roughness=0.82),
        "Leather": _material("Leather", (0.075, 0.045, 0.032, 1.0), roughness=0.88),
        "VisorGlow": _material("VisorGlow", (0.04, 0.74, 0.95, 1.0), metallic=0.12, roughness=0.22, emission_strength=4.0),
        "SorceryAccent": _material("SorceryAccent", (0.05, 0.58, 1.0, 1.0), roughness=0.18, emission_strength=5.0),
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
    z0, z1 = -height / 2.0, height / 2.0
    y0, y1 = -depth / 2.0, depth / 2.0
    bw, tw = bottom_width / 2.0, top_width / 2.0
    vertices = [
        (-bw, y0, z0), (bw, y0, z0), (bw, y1, z0), (-bw, y1, z0),
        (-tw, y0, z1), (tw, y0, z1), (tw, y1, z1), (-tw, y1, z1),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    _apply_transform(obj)
    bevel = obj.modifiers.new("ArmorBevel", "BEVEL")
    bevel.width = 0.03
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
        (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
        (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3),
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
    a, b = Vector(start), Vector(end)
    direction = b - a
    if direction.length <= 1e-6:
        raise ValueError(f"{name} cylinder endpoints must differ")
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=direction.length, location=(a + b) * 0.5,
    )
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
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0.0, -0.005, 1.815))
    shell = bpy.context.object
    shell.name = "HelmetShell"
    shell.scale = (0.25, 0.205, 0.175)
    _apply_transform(shell)
    _assign(shell, materials["DarkSteel"])
    parts.append(_rigid(shell, armature, "head"))

    crown = _wedge("HelmetCrown", center=(0.0, -0.015, 1.965), width=0.40, depth=0.33, height=0.12,
                   material=materials["DarkSteel"], forward_tip=0.025)
    parts.append(_rigid(crown, armature, "head"))

    jaw = _wedge("HelmetJaw", center=(0.0, 0.13, 1.705), width=0.44, depth=0.20, height=0.20,
                 material=materials["DarkSteel"], forward_tip=0.065)
    parts.append(_rigid(jaw, armature, "head"))

    visor_plate = _beveled_box("VisorPlate", (0.0, 0.205, 1.835), (0.405, 0.07, 0.12),
                               materials["DarkSteel"], bevel=0.018)
    parts.append(_rigid(visor_plate, armature, "head"))
    visor = _beveled_box("Visor", (0.0, 0.247, 1.855), (0.325, 0.025, 0.042),
                         materials["VisorGlow"], bevel=0.008)
    parts.append(_rigid(visor, armature, "head"))

    for side, x, angle in (("L", -0.115, -9), ("R", 0.115, 9)):
        brow = _beveled_box(f"HelmetBrow.{side}", (x, 0.245, 1.905), (0.21, 0.045, 0.045),
                            materials["SteelEdge"], bevel=0.010,
                            rotation=(0.0, 0.0, radians(angle)))
        parts.append(_rigid(brow, armature, "head"))

    crest = _wedge("Crest", center=(0.0, -0.035, 2.015), width=0.085, depth=0.30, height=0.055,
                   material=materials["Brass"], forward_tip=0.015)
    parts.append(_rigid(crest, armature, "head"))
    return parts


def _torso(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    under = _tapered_prism("UnderArmorTorso", center=(0.0, 0.0, 1.26), height=0.58,
                           bottom_width=0.46, top_width=0.67, depth=0.30, material=materials["Leather"])
    parts.append(_rigid(under, armature, "spine"))

    breast = _tapered_prism("Breastplate", center=(0.0, 0.055, 1.34), height=0.51,
                            bottom_width=0.50, top_width=0.80, depth=0.30, material=materials["DarkSteel"])
    parts.append(_rigid(breast, armature, "chest"))
    sternum = _beveled_box("BreastplateRidge", (0.0, 0.225, 1.36), (0.075, 0.055, 0.40),
                           materials["SteelEdge"], bevel=0.014)
    parts.append(_rigid(sternum, armature, "chest"))

    belt = _beveled_box("WarBelt", (0.0, 0.015, 1.02), (0.57, 0.32, 0.09), materials["Brass"], bevel=0.02)
    parts.append(_rigid(belt, armature, "pelvis"))
    for side, sign in (("L", -1.0), ("R", 1.0)):
        fauld = _wedge(f"Fauld.{side}", center=(0.255 * sign, 0.055, 0.94), width=0.25, depth=0.28, height=0.20,
                       material=materials["DarkSteel"], forward_tip=0.025)
        parts.append(_rigid(fauld, armature, "pelvis"))
    return parts


def _arm(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    parts: list[bpy.types.Object] = []
    pauldron = _wedge(f"Pauldron.{side}", center=(0.53 * sign, 0.02, 1.50), width=0.42, depth=0.36, height=0.22,
                      material=materials["DarkSteel"], forward_tip=0.045)
    parts.append(_rigid(pauldron, armature, f"clavicle.{side}"))
    cap = _beveled_box(f"PauldronLayer.{side}", (0.635 * sign, 0.015, 1.43), (0.32, 0.30, 0.11),
                       materials["SteelEdge"], bevel=0.022,
                       rotation=(0.0, radians(18 * sign), radians(11 * sign)))
    parts.append(_rigid(cap, armature, f"upper_arm.{side}"))
    skirt = _wedge(f"PauldronSkirt.{side}", center=(0.66 * sign, 0.015, 1.36), width=0.30, depth=0.27, height=0.11,
                   material=materials["DarkSteel"], forward_tip=0.025)
    parts.append(_rigid(skirt, armature, f"upper_arm.{side}"))

    upper = _cylinder_between(f"UpperArm.{side}", (0.42 * sign, 0.0, 1.49), (0.72 * sign, 0.0, 1.23),
                              0.105, materials["Leather"])
    parts.append(_rigid(upper, armature, f"upper_arm.{side}"))
    vambrace = _cylinder_between(f"Vambrace.{side}", (0.72 * sign, 0.0, 1.23), (0.90 * sign, 0.035, 0.94),
                                 0.115, materials["DarkSteel"])
    parts.append(_rigid(vambrace, armature, f"forearm.{side}"))
    gauntlet = _beveled_box(f"Gauntlet.{side}", (0.925 * sign, 0.065, 0.86), (0.22, 0.20, 0.20),
                            materials["DarkSteel"], bevel=0.025,
                            rotation=(radians(-8), 0.0, radians(8 * sign)))
    parts.append(_rigid(gauntlet, armature, f"hand.{side}"))
    return parts


def _leg(side: str, armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    sign = -1.0 if side == "L" else 1.0
    parts: list[bpy.types.Object] = []
    thigh = _cylinder_between(f"Thigh.{side}", (0.20 * sign, 0.0, 0.82), (0.21 * sign, 0.0, 0.47),
                              0.14, materials["Leather"])
    parts.append(_rigid(thigh, armature, f"thigh.{side}"))
    cuisse = _tapered_prism(f"Cuisse.{side}", center=(0.205 * sign, 0.055, 0.67), height=0.26,
                            bottom_width=0.24, top_width=0.29, depth=0.23, material=materials["DarkSteel"])
    parts.append(_rigid(cuisse, armature, f"thigh.{side}"))
    greave = _tapered_prism(f"Greave.{side}", center=(0.21 * sign, 0.045, 0.31), height=0.38,
                            bottom_width=0.23, top_width=0.29, depth=0.25, material=materials["DarkSteel"])
    parts.append(_rigid(greave, armature, f"shin.{side}"))
    knee = _wedge(f"KneePlate.{side}", center=(0.21 * sign, 0.12, 0.51), width=0.27, depth=0.16, height=0.16,
                  material=materials["SteelEdge"], forward_tip=0.045)
    parts.append(_rigid(knee, armature, f"shin.{side}"))
    boot = _beveled_box(f"Boot.{side}", (0.21 * sign, 0.115, 0.105), (0.36, 0.48, 0.21),
                        materials["DarkSteel"], bevel=0.035)
    parts.append(_rigid(boot, armature, f"foot.{side}"))
    toe = _wedge(f"BootToe.{side}", center=(0.21 * sign, 0.34, 0.105), width=0.34, depth=0.19, height=0.16,
                 material=materials["SteelEdge"], forward_tip=0.055)
    parts.append(_rigid(toe, armature, f"foot.{side}"))
    return parts


def _tabard(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    front = _tapered_prism("TabardFront", center=(0.0, 0.205, 0.73), height=0.46,
                           bottom_width=0.24, top_width=0.36, depth=0.052, material=materials["CrimsonCloth"])
    parts.append(_rigid(front, armature, "tabard_front_01"))
    front_lower = _tapered_prism("TabardFrontLower", center=(0.0, 0.22, 0.39), height=0.26,
                                 bottom_width=0.18, top_width=0.24, depth=0.048, material=materials["CrimsonCloth"])
    parts.append(_rigid(front_lower, armature, "tabard_front_02"))
    back = _tapered_prism("TabardBack", center=(0.0, -0.19, 0.73), height=0.46,
                          bottom_width=0.25, top_width=0.36, depth=0.052, material=materials["CrimsonCloth"])
    parts.append(_rigid(back, armature, "tabard_back_01"))
    back_lower = _tapered_prism("TabardBackLower", center=(0.0, -0.20, 0.40), height=0.25,
                                bottom_width=0.18, top_width=0.25, depth=0.048, material=materials["CrimsonCloth"])
    parts.append(_rigid(back_lower, armature, "tabard_back_02"))
    scarf = _beveled_box("CrimsonScarf", (0.0, -0.08, 1.61), (0.44, 0.24, 0.095),
                         materials["CrimsonCloth"], bevel=0.03)
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
        (4, 8, 6), (6, 8, 5), (5, 8, 7), (7, 8, 4), (0, 2, 1), (0, 3, 2),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return _assign(obj, material)


def build_hero_sword(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    grip_base = Vector((0.95, 0.08, 0.74))
    blade_base = Vector((1.00, 0.10, 0.94))
    blade_tip = Vector((1.40, 0.14, 2.03))
    blade = _diamond_blade("HeroSword", blade_base, blade_tip, 0.205, 0.034, materials["SteelEdge"])
    guard = _beveled_box("HeroSword.Guard", (0.985, 0.09, 0.90), (0.50, 0.085, 0.07), materials["Brass"],
                         bevel=0.018, rotation=(0.0, radians(-18), radians(-3)))
    grip = _cylinder_between("HeroSword.Grip", tuple(grip_base), (0.98, 0.09, 0.91), 0.047,
                             materials["Leather"], vertices=8)
    pommel = _beveled_box("HeroSword.Pommel", (0.945, 0.08, 0.715), (0.11, 0.095, 0.11),
                          materials["Brass"], bevel=0.018)
    parts = [blade, guard, grip, pommel]
    for obj in parts:
        _bone_parent_keep_world(obj, armature, "socket_sword")
    return parts


def _sorcery_accent(armature: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.085, location=(-0.96, 0.17, 0.84))
    core = bpy.context.object
    core.name = "SorceryCore"
    _apply_transform(core)
    _assign(core, materials["SorceryAccent"])
    parts.append(_bone_parent_keep_world(core, armature, "socket_sorcery"))
    for index, offset in enumerate(((-0.09, 0.03, 0.075), (0.075, 0.04, 0.09), (-0.035, 0.02, -0.09))):
        shard = _wedge(
            f"SorceryShard.{index + 1}",
            center=(-0.96 + offset[0], 0.17 + offset[1], 0.84 + offset[2]),
            width=0.045, depth=0.055, height=0.12,
            material=materials["SorceryAccent"], forward_tip=0.018,
        )
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
