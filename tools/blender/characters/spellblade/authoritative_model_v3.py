from __future__ import annotations

import bpy

from .authoritative_model import _add_rigid, _prism_xz
from .authoritative_model_v2 import build_authoritative_spellblade_v2
from .model import ModelParts


def _set_color(material: bpy.types.Material, rgba: tuple[float, float, float, float]) -> None:
    material.diffuse_color = rgba
    if material.use_nodes and material.node_tree is not None:
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = rgba


def _centroid(obj: bpy.types.Object) -> tuple[float, float, float]:
    count = max(1, len(obj.data.vertices))
    x = sum(v.co.x for v in obj.data.vertices) / count
    y = sum(v.co.y for v in obj.data.vertices) / count
    z = sum(v.co.z for v in obj.data.vertices) / count
    return x, y, z


def _scale_mesh(obj: bpy.types.Object, *, sx: float = 1.0, sy: float = 1.0, sz: float = 1.0) -> None:
    cx, cy, cz = _centroid(obj)
    for vertex in obj.data.vertices:
        vertex.co.x = cx + (vertex.co.x - cx) * sx
        vertex.co.y = cy + (vertex.co.y - cy) * sy
        vertex.co.z = cz + (vertex.co.z - cz) * sz
    obj.data.update()


def _bevel(obj: bpy.types.Object, width: float) -> None:
    if obj.type != "MESH" or width <= 0.0:
        return
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


def _taper_back_cloth(obj: bpy.types.Object) -> None:
    # Reference back tabard narrows toward the lower edge instead of reading as
    # a rectangular superhero cape.
    for vertex in obj.data.vertices:
        z = vertex.co.z
        if z < 0.65:
            vertex.co.x *= 0.72
        elif z < 0.95:
            vertex.co.x *= 0.80
        else:
            vertex.co.x *= 0.88
    obj.data.update()


def _replace_sword_profile(model: ModelParts, armature: bpy.types.Object) -> ModelParts:
    parts = list(model.objects)
    old = next((obj for obj in parts if obj.name == "HeroSword"), None)
    if old is not None:
        parts.remove(old)
        bpy.data.objects.remove(old, do_unlink=True)

    # Broad, mostly parallel blade with a late faceted point, matching the concept.
    blade = _prism_xz(
        "HeroSword",
        (
            (0.575, 0.845), (0.770, 0.745),
            (1.060, 0.185), (1.090, 0.105), (1.045, 0.045),
            (0.970, 0.080), (0.655, 0.665), (0.520, 0.735),
        ),
        front_y=0.132,
        back_y=0.052,
        material=model.materials["SteelEdge"],
    )
    from .model import _bone_parent_keep_world
    _bone_parent_keep_world(blade, armature, "socket_sword")
    parts.append(blade)

    facet = _prism_xz(
        "SwordBladeFacet",
        (
            (0.615, 0.790), (0.755, 0.720),
            (1.015, 0.205), (1.040, 0.125),
            (0.965, 0.115), (0.690, 0.660),
        ),
        front_y=0.140,
        back_y=0.132,
        material=model.materials["DarkSteel"],
    )
    _bone_parent_keep_world(facet, armature, "socket_sword")
    parts.append(facet)
    return ModelParts(objects=tuple(parts), materials=model.materials)


def build_authoritative_spellblade_v3(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    model = build_authoritative_spellblade_v2(armature, materials)
    parts = list(model.objects)
    by_name = {obj.name: obj for obj in parts}

    # Concept steel is brighter than the undersuit, but not the near-white panels
    # produced by the previous review lighting/material combination.
    _set_color(materials["DarkSteel"], (0.12, 0.145, 0.17, 1.0))
    _set_color(materials["SteelEdge"], (0.31, 0.35, 0.40, 1.0))
    _set_color(materials["Brass"], (0.50, 0.31, 0.12, 1.0))
    _set_color(materials["CrimsonCloth"], (0.31, 0.035, 0.045, 1.0))

    # Restore the substantial armored anatomy visible in the concept without
    # returning to the oversized head/shoulder envelope of the first rebuild.
    for name in ("Breastplate", "TorsoUnder", "BackArmor"):
        if name in by_name:
            _scale_mesh(by_name[name], sx=1.07, sy=1.16)
    for prefix in ("ChestFacet.", "BreastplateTrim."):
        for name, obj in by_name.items():
            if name.startswith(prefix):
                _scale_mesh(obj, sx=1.05, sy=1.10)

    for prefix in ("UpperArmPlate.", "Vambrace.", "Gauntlet.", "GauntletCuff."):
        for name, obj in by_name.items():
            if name.startswith(prefix):
                _scale_mesh(obj, sx=1.08, sy=1.14)

    for prefix in ("Cuisse.", "KneePlate.", "Greave.", "Boot."):
        for name, obj in by_name.items():
            if name.startswith(prefix):
                _scale_mesh(obj, sx=1.15, sy=1.16)

    for prefix in ("Pauldron.", "PauldronFacet.", "PauldronTrim."):
        for name, obj in by_name.items():
            if name.startswith(prefix):
                _scale_mesh(obj, sy=1.16)

    if "CrimsonScarf" in by_name:
        _scale_mesh(by_name["CrimsonScarf"], sx=1.08, sy=1.12)
    if "TabardBack" in by_name:
        _taper_back_cloth(by_name["TabardBack"])

    # One-segment chamfers create the broad low-poly highlight bands in the sheet.
    large = (
        "HelmetShell", "HelmetJaw", "Breastplate", "BackArmor",
        "Pauldron.L", "Pauldron.R", "UpperArmPlate.L", "UpperArmPlate.R",
        "Vambrace.L", "Vambrace.R", "Cuisse.L", "Cuisse.R",
        "KneePlate.L", "KneePlate.R", "Greave.L", "Greave.R",
        "Boot.L", "Boot.R",
    )
    for name in large:
        obj = by_name.get(name)
        if obj is not None:
            _bevel(obj, 0.014 if not name.startswith("Boot.") else 0.012)

    for name, obj in by_name.items():
        if name.startswith(("HelmetCheek.", "HelmetCrownTrim.", "BreastplateTrim.", "PauldronTrim.")):
            _bevel(obj, 0.006)

    # Add a central sternum plane and explicit limb trim bands so the model reads
    # as designed plate armor instead of dark tapered tubes.
    ridge = _prism_xz(
        "BreastplateRidge",
        ((-0.030, 1.145), (0.030, 1.145), (0.040, 1.455), (0.0, 1.525), (-0.040, 1.455)),
        front_y=0.300,
        back_y=0.278,
        material=materials["DarkSteel"],
    )
    _add_rigid(parts, ridge, armature, "chest")
    _bevel(ridge, 0.005)

    for side, sign in (("L", -1.0), ("R", 1.0)):
        vambrace_trim = _prism_xz(
            f"VambraceTrim.{side}",
            ((0.525 * sign, 1.120), (0.585 * sign, 1.105),
             (0.610 * sign, 1.050), (0.548 * sign, 1.065)),
            front_y=0.143,
            back_y=0.115,
            material=materials["Brass"],
        )
        _add_rigid(parts, vambrace_trim, armature, f"forearm.{side}")
        _bevel(vambrace_trim, 0.004)

        greave_trim = _prism_xz(
            f"GreaveTrim.{side}",
            ((0.145 * sign, 0.305), (0.305 * sign, 0.300),
             (0.302 * sign, 0.265), (0.150 * sign, 0.270)),
            front_y=0.145,
            back_y=0.118,
            material=materials["Brass"],
        )
        _add_rigid(parts, greave_trim, armature, f"shin.{side}")
        _bevel(greave_trim, 0.004)

        thigh_outer = _prism_xz(
            f"CuisseOuter.{side}",
            ((0.185 * sign, 0.965), (0.268 * sign, 0.945),
             (0.278 * sign, 0.810), (0.235 * sign, 0.715), (0.180 * sign, 0.735)),
            front_y=0.125,
            back_y=0.085,
            material=materials["DarkSteel"],
        )
        _add_rigid(parts, thigh_outer, armature, f"thigh.{side}")
        _bevel(thigh_outer, 0.005)

    model = ModelParts(objects=tuple(parts), materials=materials)
    return _replace_sword_profile(model, armature)
