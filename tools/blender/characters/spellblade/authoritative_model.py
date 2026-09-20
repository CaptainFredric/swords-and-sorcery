from __future__ import annotations

from collections.abc import Sequence
from mathutils import Vector

import bpy

from .model import ModelParts, _beveled_box, _bone_parent_keep_world, _rigid


Section = tuple[float, float, float, float, float]


def _mesh(
    name: str,
    vertices: Sequence[tuple[float, float, float]],
    faces: Sequence[tuple[int, ...]],
    material: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(tuple(vertices), [], tuple(faces))
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def _section_points(section: Section) -> tuple[tuple[float, float, float], ...]:
    z, cx, half_width, front_y, back_y = section
    side_y = (front_y + back_y) * 0.10
    return (
        (cx - half_width * 0.68, front_y, z),
        (cx + half_width * 0.68, front_y, z),
        (cx + half_width, side_y + 0.025, z),
        (cx + half_width * 0.82, back_y, z),
        (cx - half_width * 0.82, back_y, z),
        (cx - half_width, side_y + 0.025, z),
    )


def _loft(name: str, sections: Sequence[Section], material: bpy.types.Material) -> bpy.types.Object:
    if len(sections) < 2:
        raise ValueError(f"{name} requires at least two sections")
    ring_size = 6
    vertices: list[tuple[float, float, float]] = []
    for section in sections:
        vertices.extend(_section_points(section))
    faces: list[tuple[int, ...]] = [tuple(reversed(range(ring_size)))]
    top = (len(sections) - 1) * ring_size
    faces.append(tuple(top + i for i in range(ring_size)))
    for r in range(len(sections) - 1):
        a = r * ring_size
        b = (r + 1) * ring_size
        for i in range(ring_size):
            j = (i + 1) % ring_size
            faces.append((a + i, a + j, b + j, b + i))
    return _mesh(name, vertices, faces, material)


def _prism_xz(
    name: str,
    points: Sequence[tuple[float, float]],
    *,
    front_y: float,
    back_y: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    n = len(points)
    vertices = [(x, front_y, z) for x, z in points]
    vertices.extend((x, back_y, z) for x, z in points)
    faces: list[tuple[int, ...]] = [tuple(range(n)), tuple(reversed(tuple(n + i for i in range(n))))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return _mesh(name, vertices, faces, material)


def _segment(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    *,
    start_width: float,
    end_width: float,
    start_depth: float,
    end_depth: float,
    material: bpy.types.Material,
    bulge: float = 1.06,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    axis = b - a
    if axis.length <= 1e-6:
        raise ValueError(f"{name} segment endpoints must differ")
    axis.normalize()
    forward = Vector((0.0, 1.0, 0.0))
    lateral = forward.cross(axis)
    if lateral.length <= 1e-6:
        lateral = Vector((1.0, 0.0, 0.0))
    else:
        lateral.normalize()
    forward = axis.cross(lateral).normalized()

    centers = (a, (a + b) * 0.5, b)
    widths = (start_width, max(start_width, end_width) * bulge, end_width)
    depths = (start_depth, max(start_depth, end_depth) * bulge, end_depth)

    vertices: list[tuple[float, float, float]] = []
    for center, width, depth in zip(centers, widths, depths):
        hw = width * 0.5
        hd = depth * 0.5
        corners = (
            center + lateral * (-hw * 0.72) + forward * hd,
            center + lateral * ( hw * 0.72) + forward * hd,
            center + lateral * hw + forward * (hd * 0.15),
            center + lateral * ( hw * 0.72) - forward * hd,
            center + lateral * (-hw * 0.72) - forward * hd,
            center - lateral * hw + forward * (hd * 0.15),
        )
        vertices.extend(tuple(v) for v in corners)

    ring_size = 6
    faces: list[tuple[int, ...]] = [tuple(reversed(range(ring_size))), tuple(2 * ring_size + i for i in range(ring_size))]
    for r in range(2):
        aa = r * ring_size
        bb = (r + 1) * ring_size
        for i in range(ring_size):
            j = (i + 1) % ring_size
            faces.append((aa + i, aa + j, bb + j, bb + i))
    return _mesh(name, vertices, faces, material)


def _folded_panel(
    name: str,
    rows: Sequence[tuple[float, float, float]],
    *,
    thickness: float,
    fold: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, half_width, y in rows:
        vertices.extend(((-half_width, y, z), (0.0, y + fold, z), (half_width, y, z)))
    front_count = len(vertices)
    for z, half_width, y in rows:
        vertices.extend(((-half_width, y - thickness, z), (0.0, y + fold - thickness, z), (half_width, y - thickness, z)))

    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        a = row * 3
        b = (row + 1) * 3
        faces.extend(((a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1)))
        ra = front_count + a
        rb = front_count + b
        faces.extend(((ra, rb, rb + 1, ra + 1), (ra + 1, rb + 1, rb + 2, ra + 2)))
        faces.append((a, b, rb, ra))
        faces.append((a + 2, ra + 2, rb + 2, b + 2))
    for offset in (0, (len(rows) - 1) * 3):
        ro = front_count + offset
        faces.extend(((offset, ro, ro + 1, offset + 1), (offset + 1, ro + 1, ro + 2, offset + 2)))
    return _mesh(name, vertices, faces, material)


def _diamond(
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices = (
        (cx - rx, cy, cz), (cx + rx, cy, cz),
        (cx, cy - ry, cz), (cx, cy + ry, cz),
        (cx, cy, cz - rz), (cx, cy, cz + rz),
    )
    faces = (
        (0, 3, 5), (3, 1, 5), (1, 2, 5), (2, 0, 5),
        (3, 0, 4), (1, 3, 4), (2, 1, 4), (0, 2, 4),
    )
    return _mesh(name, vertices, faces, material)


def _add_rigid(parts: list[bpy.types.Object], obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> bpy.types.Object:
    _rigid(obj, armature, bone)
    parts.append(obj)
    return obj


def _add_socket(parts: list[bpy.types.Object], obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> bpy.types.Object:
    _bone_parent_keep_world(obj, armature, bone)
    parts.append(obj)
    return obj


def _helmet(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    _add_rigid(parts, _loft("HelmetShell", (
        (1.675, 0.0, 0.155, 0.185, -0.145),
        (1.735, 0.0, 0.210, 0.235, -0.185),
        (1.855, 0.0, 0.235, 0.255, -0.205),
        (1.970, 0.0, 0.220, 0.235, -0.205),
        (2.050, 0.0, 0.165, 0.165, -0.165),
    ), m["SteelEdge"]), armature, "head")

    _add_rigid(parts, _prism_xz("FaceRecess", (
        (-0.158, 1.910), (0.158, 1.910), (0.175, 1.860),
        (0.150, 1.745), (0.070, 1.680), (0.0, 1.655),
        (-0.070, 1.680), (-0.150, 1.745), (-0.175, 1.860),
    ), front_y=0.278, back_y=0.244, material=m["Leather"]), armature, "head")

    _add_rigid(parts, _prism_xz("HelmetJaw", (
        (-0.185, 1.810), (0.185, 1.810), (0.165, 1.705),
        (0.080, 1.640), (0.0, 1.620), (-0.080, 1.640), (-0.165, 1.705),
    ), front_y=0.292, back_y=0.205, material=m["DarkSteel"]), armature, "head")

    _add_rigid(parts, _prism_xz("Visor", (
        (-0.140, 1.890), (0.140, 1.890), (0.150, 1.845),
        (0.110, 1.745), (0.050, 1.695), (0.0, 1.682),
        (-0.050, 1.695), (-0.110, 1.745), (-0.150, 1.845),
    ), front_y=0.304, back_y=0.286, material=m["DarkSteel"]), armature, "head")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"HelmetCheek.{side}", (
            (0.052 * sign, 1.900), (0.190 * sign, 1.925),
            (0.202 * sign, 1.835), (0.150 * sign, 1.705), (0.082 * sign, 1.665),
        ), front_y=0.310, back_y=0.280, material=m["SteelEdge"]), armature, "head")
        _add_rigid(parts, _prism_xz(f"HelmetCrownTrim.{side}", (
            (0.018 * sign, 1.958), (0.184 * sign, 1.995),
            (0.215 * sign, 1.955), (0.176 * sign, 1.905), (0.060 * sign, 1.900),
        ), front_y=0.319, back_y=0.289, material=m["Brass"]), armature, "head")
        _add_rigid(parts, _prism_xz(f"HelmetBrowFrame.{side}", (
            (0.147 * sign, 1.910), (0.203 * sign, 1.932),
            (0.188 * sign, 1.792), (0.145 * sign, 1.720), (0.120 * sign, 1.760),
        ), front_y=0.321, back_y=0.300, material=m["Brass"]), armature, "head")

    bar = _beveled_box("VisorGlow.Bar", (0.0, 0.327, 1.852), (0.240, 0.014, 0.025), m["VisorGlow"], bevel=0.003)
    stem = _beveled_box("VisorGlow.Stem", (0.0, 0.328, 1.790), (0.034, 0.014, 0.145), m["VisorGlow"], bevel=0.003)
    _add_rigid(parts, bar, armature, "head")
    _add_rigid(parts, stem, armature, "head")

    _add_rigid(parts, _prism_xz("Crest", (
        (-0.048, 2.025), (0.052, 2.025), (0.060, 2.185),
        (0.015, 2.205), (-0.050, 2.185),
    ), front_y=0.040, back_y=-0.110, material=m["CrimsonCloth"]), armature, "head")

    _add_rigid(parts, _loft("CrimsonScarf", (
        (1.505, 0.0, 0.255, 0.175, -0.145),
        (1.575, 0.0, 0.315, 0.220, -0.170),
        (1.645, 0.0, 0.295, 0.205, -0.160),
        (1.685, 0.0, 0.245, 0.160, -0.135),
    ), m["CrimsonCloth"]), armature, "neck")


def _torso(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    _add_rigid(parts, _loft("TorsoUnder", (
        (1.030, 0.0, 0.255, 0.150, -0.135),
        (1.290, 0.0, 0.305, 0.175, -0.155),
        (1.535, 0.0, 0.330, 0.185, -0.165),
    ), m["DarkSteel"]), armature, "chest")

    _add_rigid(parts, _loft("Breastplate", (
        (1.075, 0.0, 0.225, 0.205, -0.020),
        (1.155, 0.0, 0.270, 0.235, -0.030),
        (1.315, 0.0, 0.345, 0.280, -0.040),
        (1.455, 0.0, 0.365, 0.285, -0.045),
        (1.555, 0.0, 0.315, 0.235, -0.040),
    ), m["SteelEdge"]), armature, "chest")

    _add_rigid(parts, _loft("BackArmor", (
        (1.090, 0.0, 0.245, 0.025, -0.185),
        (1.300, 0.0, 0.325, 0.020, -0.230),
        (1.520, 0.0, 0.335, 0.015, -0.220),
    ), m["DarkSteel"]), armature, "chest")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"ChestFacet.{side}", (
            (0.030 * sign, 1.520), (0.292 * sign, 1.490),
            (0.330 * sign, 1.385), (0.292 * sign, 1.265),
            (0.205 * sign, 1.125), (0.050 * sign, 1.100),
        ), front_y=0.302, back_y=0.274, material=m["SteelEdge"]), armature, "chest")
        _add_rigid(parts, _prism_xz(f"BreastplateTrim.{side}", (
            (0.286 * sign, 1.505), (0.350 * sign, 1.475),
            (0.332 * sign, 1.395), (0.300 * sign, 1.360), (0.276 * sign, 1.430),
        ), front_y=0.322, back_y=0.300, material=m["Brass"]), armature, "chest")

    _add_rigid(parts, _prism_xz("BreastplateCollar", (
        (-0.255, 1.552), (-0.105, 1.590), (0.105, 1.590),
        (0.255, 1.552), (0.215, 1.510), (0.0, 1.535), (-0.215, 1.510),
    ), front_y=0.300, back_y=0.266, material=m["Brass"]), armature, "chest")


def _shoulders(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    for side, sign in (("L", -1.0), ("R", 1.0)):
        cx = 0.485 * sign
        _add_rigid(parts, _loft(f"Pauldron.{side}", (
            (1.315, cx, 0.145, 0.155, -0.125),
            (1.405, cx, 0.205, 0.205, -0.165),
            (1.525, cx, 0.215, 0.215, -0.175),
            (1.605, cx, 0.160, 0.165, -0.145),
        ), m["SteelEdge"]), armature, f"clavicle.{side}")

        _add_rigid(parts, _prism_xz(f"PauldronFacet.{side}", (
            (0.350 * sign, 1.535), (0.495 * sign, 1.595),
            (0.650 * sign, 1.520), (0.620 * sign, 1.395),
            (0.500 * sign, 1.335), (0.385 * sign, 1.390),
        ), front_y=0.230, back_y=0.205, material=m["DarkSteel"]), armature, f"clavicle.{side}")

        _add_rigid(parts, _prism_xz(f"PauldronTrim.{side}", (
            (0.350 * sign, 1.555), (0.495 * sign, 1.625),
            (0.650 * sign, 1.545), (0.630 * sign, 1.505),
            (0.495 * sign, 1.565), (0.370 * sign, 1.520),
        ), front_y=0.250, back_y=0.225, material=m["Brass"]), armature, f"clavicle.{side}")

        _add_rigid(parts, _prism_xz(f"PauldronLower.{side}", (
            (0.410 * sign, 1.390), (0.620 * sign, 1.385),
            (0.600 * sign, 1.290), (0.520 * sign, 1.245), (0.440 * sign, 1.300),
        ), front_y=0.145, back_y=-0.130, material=m["DarkSteel"]), armature, f"upper_arm.{side}")

        badge_x = 0.555 * sign
        _add_rigid(parts, _diamond(f"ShoulderBadge.{side}", (badge_x, 0.267, 1.472), (0.040, 0.024, 0.040), m["Brass"]), armature, f"clavicle.{side}")


def _arms(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    for side, sign in (("L", -1.0), ("R", 1.0)):
        shoulder = (0.43 * sign, 0.0, 1.455)
        elbow = (0.585 * sign, 0.010, 1.205)
        wrist = (0.705 * sign, 0.035, 0.935)
        hand_end = (0.755 * sign, 0.080, 0.805)

        _add_rigid(parts, _segment(f"ArmUnder.{side}", shoulder, elbow,
            start_width=0.170, end_width=0.135, start_depth=0.170, end_depth=0.145,
            material=m["DarkSteel"], bulge=1.02), armature, f"upper_arm.{side}")

        _add_rigid(parts, _segment(f"UpperArmPlate.{side}", (0.455 * sign, 0.025, 1.420), (0.575 * sign, 0.025, 1.235),
            start_width=0.205, end_width=0.155, start_depth=0.205, end_depth=0.175,
            material=m["SteelEdge"], bulge=1.08), armature, f"upper_arm.{side}")

        _add_rigid(parts, _segment(f"ForearmUnder.{side}", elbow, wrist,
            start_width=0.135, end_width=0.105, start_depth=0.135, end_depth=0.115,
            material=m["DarkSteel"], bulge=1.02), armature, f"forearm.{side}")

        _add_rigid(parts, _segment(f"Vambrace.{side}", (0.590 * sign, 0.030, 1.180), (0.700 * sign, 0.055, 0.955),
            start_width=0.205, end_width=0.145, start_depth=0.205, end_depth=0.150,
            material=m["SteelEdge"], bulge=1.07), armature, f"forearm.{side}")

        _add_rigid(parts, _segment(f"Gauntlet.{side}", wrist, hand_end,
            start_width=0.145, end_width=0.125, start_depth=0.150, end_depth=0.125,
            material=m["DarkSteel"], bulge=1.00), armature, f"hand.{side}")

        _add_rigid(parts, _segment(f"GauntletCuff.{side}", (0.685 * sign, 0.042, 0.980), (0.720 * sign, 0.055, 0.900),
            start_width=0.175, end_width=0.155, start_depth=0.180, end_depth=0.155,
            material=m["Brass"], bulge=1.00), armature, f"forearm.{side}")


def _legs(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    for side, sign in (("L", -1.0), ("R", 1.0)):
        hip = (0.190 * sign, 0.0, 1.010)
        knee = (0.245 * sign, 0.0, 0.600)
        ankle = (0.275 * sign, 0.0, 0.185)

        _add_rigid(parts, _segment(f"ThighUnder.{side}", hip, knee,
            start_width=0.190, end_width=0.140, start_depth=0.185, end_depth=0.145,
            material=m["DarkSteel"], bulge=1.03), armature, f"thigh.{side}")

        _add_rigid(parts, _segment(f"Cuisse.{side}", (0.190 * sign, 0.020, 0.965), (0.240 * sign, 0.020, 0.655),
            start_width=0.235, end_width=0.165, start_depth=0.225, end_depth=0.165,
            material=m["SteelEdge"], bulge=1.06), armature, f"thigh.{side}")

        _add_rigid(parts, _prism_xz(f"KneePlate.{side}", (
            (0.135 * sign, 0.650), (0.345 * sign, 0.645),
            (0.365 * sign, 0.590), (0.325 * sign, 0.515), (0.165 * sign, 0.520),
        ), front_y=0.150, back_y=-0.080, material=m["SteelEdge"]), armature, f"shin.{side}")

        _add_rigid(parts, _prism_xz(f"KneeTrim.{side}", (
            (0.150 * sign, 0.635), (0.340 * sign, 0.630),
            (0.343 * sign, 0.600), (0.160 * sign, 0.602),
        ), front_y=0.174, back_y=0.145, material=m["Brass"]), armature, f"shin.{side}")

        _add_rigid(parts, _segment(f"ShinUnder.{side}", knee, ankle,
            start_width=0.135, end_width=0.105, start_depth=0.135, end_depth=0.110,
            material=m["DarkSteel"], bulge=1.02), armature, f"shin.{side}")

        _add_rigid(parts, _segment(f"Greave.{side}", (0.245 * sign, 0.025, 0.545), (0.275 * sign, 0.030, 0.205),
            start_width=0.205, end_width=0.145, start_depth=0.205, end_depth=0.150,
            material=m["SteelEdge"], bulge=1.04), armature, f"shin.{side}")

        _add_rigid(parts, _loft(f"Boot.{side}", (
            (0.008, 0.285 * sign, 0.160, 0.330, -0.115),
            (0.075, 0.285 * sign, 0.165, 0.355, -0.105),
            (0.145, 0.285 * sign, 0.145, 0.275, -0.095),
            (0.220, 0.285 * sign, 0.125, 0.175, -0.085),
        ), m["SteelEdge"]), armature, f"foot.{side}")

        _add_rigid(parts, _prism_xz(f"BootAnkleTrim.{side}", (
            (0.155 * sign, 0.235), (0.400 * sign, 0.235),
            (0.390 * sign, 0.190), (0.170 * sign, 0.185),
        ), front_y=0.120, back_y=-0.100, material=m["Brass"]), armature, f"shin.{side}")


def _waist_and_cloth(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    belt = _beveled_box("Belt", (0.0, 0.015, 1.075), (0.590, 0.250, 0.095), m["Leather"], bevel=0.014)
    _add_rigid(parts, belt, armature, "pelvis")

    buckle = _beveled_box("BeltBuckle", (0.105, 0.158, 1.075), (0.130, 0.038, 0.135), m["Brass"], bevel=0.010)
    _add_rigid(parts, buckle, armature, "pelvis")
    buckle_inner = _beveled_box("BeltBuckleInset", (0.105, 0.180, 1.075), (0.078, 0.018, 0.082), m["Leather"], bevel=0.006)
    _add_rigid(parts, buckle_inner, armature, "pelvis")
    _add_rigid(parts, _diamond("BeltMedallion", (-0.115, 0.178, 1.075), (0.055, 0.025, 0.055), m["Brass"]), armature, "pelvis")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        pouch = _beveled_box(f"BeltPouch.{side}", (0.250 * sign, 0.125, 0.975), (0.145, 0.110, 0.205), m["Leather"], bevel=0.015)
        _add_rigid(parts, pouch, armature, "pelvis")
        flap = _beveled_box(f"BeltPouchFlap.{side}", (0.250 * sign, 0.190, 1.040), (0.125, 0.030, 0.070), m["Brass"], bevel=0.006)
        _add_rigid(parts, flap, armature, "pelvis")

    front = _folded_panel("TabardFront", (
        (0.355, 0.115, 0.260),
        (0.525, 0.135, 0.266),
        (0.735, 0.150, 0.272),
        (0.945, 0.155, 0.268),
        (1.055, 0.155, 0.255),
    ), thickness=0.026, fold=0.022, material=m["CrimsonCloth"])
    _add_rigid(parts, front, armature, "tabard_front_01")

    back = _folded_panel("TabardBack", (
        (0.395, 0.155, -0.285),
        (0.610, 0.180, -0.300),
        (0.850, 0.205, -0.305),
        (1.120, 0.220, -0.295),
        (1.390, 0.225, -0.270),
        (1.545, 0.210, -0.235),
    ), thickness=0.030, fold=-0.026, material=m["CrimsonCloth"])
    _add_rigid(parts, back, armature, "tabard_back_01")

    for side, sign in (("L", -1.0), ("R", 1.0)):
        _add_rigid(parts, _prism_xz(f"TabardTrim.{side}", (
            (0.128 * sign, 0.390), (0.153 * sign, 0.390),
            (0.170 * sign, 1.045), (0.145 * sign, 1.045),
        ), front_y=0.292, back_y=0.267, material=m["Brass"]), armature, "tabard_front_01")

    _add_rigid(parts, _prism_xz("TabardSigil", (
        (-0.018, 0.535), (0.018, 0.535), (0.018, 0.720),
        (0.060, 0.675), (0.072, 0.705), (0.0, 0.800),
        (-0.072, 0.705), (-0.060, 0.675), (-0.018, 0.720),
    ), front_y=0.302, back_y=0.286, material=m["Brass"]), armature, "tabard_front_01")


def _weapon(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    base = Vector((0.755, 0.105, 0.795))
    tip = Vector((1.155, 0.105, 0.060))
    axis = tip - base
    axis2 = Vector((axis.x, 0.0, axis.z)).normalized()
    perp = Vector((-axis2.z, 0.0, axis2.x))
    shoulder = base + axis2 * 0.085
    p0 = base + perp * 0.145
    p1 = shoulder + perp * 0.165
    p2 = tip + perp * 0.025
    p3 = tip - perp * 0.025
    p4 = shoulder - perp * 0.165
    p5 = base - perp * 0.145
    blade = _prism_xz("HeroSword", tuple((p.x, p.z) for p in (p0, p1, p2, p3, p4, p5)), front_y=0.145, back_y=0.065, material=m["SteelEdge"])
    _add_socket(parts, blade, armature, "socket_sword")

    guard_center = base - axis2 * 0.020
    guard_a = guard_center + perp * 0.255
    guard_b = guard_center - perp * 0.255
    guard = _segment("SwordGuard", tuple(guard_a), tuple(guard_b), start_width=0.085, end_width=0.085,
        start_depth=0.095, end_depth=0.095, material=m["Brass"], bulge=1.0)
    _add_socket(parts, guard, armature, "socket_sword")

    grip_end = base - axis2 * 0.220
    grip = _segment("SwordGrip", tuple(base - axis2 * 0.055), tuple(grip_end), start_width=0.075, end_width=0.070,
        start_depth=0.075, end_depth=0.070, material=m["Leather"], bulge=1.0)
    _add_socket(parts, grip, armature, "socket_sword")

    pommel_center = grip_end - axis2 * 0.045
    _add_socket(parts, _diamond("SwordPommel", tuple(pommel_center), (0.060, 0.050, 0.060), m["Brass"]), armature, "socket_sword")
    _add_socket(parts, _diamond("SwordGem", tuple(guard_center + Vector((0.0, 0.055, 0.0))), (0.045, 0.022, 0.045), m["CrimsonCloth"]), armature, "socket_sword")


def _sorcery(parts: list[bpy.types.Object], armature: bpy.types.Object, m: dict[str, bpy.types.Material]) -> None:
    core = _beveled_box("SorceryCore", (-0.790, 0.250, 0.885), (0.115, 0.115, 0.155), m["SorceryAccent"], bevel=0.012)
    _add_socket(parts, core, armature, "socket_sorcery")
    shard_specs = (
        (-0.875, 0.238, 0.965, 0.040), (-0.705, 0.255, 0.990, 0.035),
        (-0.900, 0.260, 0.835, 0.032), (-0.690, 0.242, 0.820, 0.030),
        (-0.790, 0.285, 1.045, 0.026), (-0.820, 0.220, 0.755, 0.024),
    )
    for i, (x, y, z, size) in enumerate(shard_specs, 1):
        shard = _beveled_box(f"SorceryShard.{i}", (x, y, z), (size, size, size), m["SorceryAccent"], bevel=size * 0.12)
        _add_socket(parts, shard, armature, "socket_sorcery")


def build_authoritative_spellblade(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Build the visible Spellblade once from the concept-sheet proportions.

    This intentionally does not inherit prior procedural hero geometry.  The rig,
    materials, animation and export contracts remain production infrastructure;
    every visible third-person mesh is authored here as one coherent character.
    """
    parts: list[bpy.types.Object] = []
    _helmet(parts, armature, materials)
    _torso(parts, armature, materials)
    _shoulders(parts, armature, materials)
    _arms(parts, armature, materials)
    _legs(parts, armature, materials)
    _waist_and_cloth(parts, armature, materials)
    _weapon(parts, armature, materials)
    _sorcery(parts, armature, materials)
    return ModelParts(objects=tuple(parts), materials=materials)
