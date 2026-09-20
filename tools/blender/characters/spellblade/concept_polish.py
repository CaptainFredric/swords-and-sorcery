from __future__ import annotations

import bpy
from mathutils import Vector

from .model import ModelParts


# Final silhouette tuning. This pass runs after the authored hero shells/limbs are
# rebuilt, so these edits describe the geometry that is actually rendered/exported.
ARM_X_COMPRESSION = 0.94
SHOULDER_X_COMPRESSION = 0.98


def _named(model: ModelParts, name: str) -> bpy.types.Object | None:
    for obj in model.objects:
        if obj.name == name:
            return obj
    return None


def _world_point(obj: bpy.types.Object, local: Vector) -> Vector:
    return obj.matrix_world @ local


def _local_point(obj: bpy.types.Object, world: Vector) -> Vector:
    return obj.matrix_world.inverted_safe() @ world


def _bounds_center(obj: bpy.types.Object) -> tuple[float, float, float]:
    points = [_world_point(obj, vertex.co) for vertex in obj.data.vertices]
    xs = [point.x for point in points]
    ys = [point.y for point in points]
    zs = [point.z for point in points]
    return (
        (min(xs) + max(xs)) * 0.5,
        (min(ys) + max(ys)) * 0.5,
        (min(zs) + max(zs)) * 0.5,
    )


def _scale_about(
    obj: bpy.types.Object,
    pivot: tuple[float, float, float],
    scale: tuple[float, float, float],
) -> None:
    px, py, pz = pivot
    sx, sy, sz = scale
    for vertex in obj.data.vertices:
        world = _world_point(obj, vertex.co)
        reshaped = Vector((
            px + (world.x - px) * sx,
            py + (world.y - py) * sy,
            pz + (world.z - pz) * sz,
        ))
        vertex.co = _local_point(obj, reshaped)
    obj.data.update()


def _taper_x_by_z(
    obj: bpy.types.Object,
    *,
    pivot_x: float = 0.0,
    low_scale: float,
    high_scale: float,
) -> None:
    """Taper a mesh laterally over its world-space height without moving its bone parent."""
    points = [_world_point(obj, vertex.co) for vertex in obj.data.vertices]
    low_z = min(point.z for point in points)
    high_z = max(point.z for point in points)
    span = max(high_z - low_z, 1e-6)
    for vertex in obj.data.vertices:
        world = _world_point(obj, vertex.co)
        t = (world.z - low_z) / span
        x_scale = low_scale + (high_scale - low_scale) * t
        world.x = pivot_x + (world.x - pivot_x) * x_scale
        vertex.co = _local_point(obj, world)
    obj.data.update()


def _translate_socket_object(obj: bpy.types.Object, delta: tuple[float, float, float]) -> None:
    """Move a socket attachment by its node transform, never by rewriting POSITION data."""
    world = obj.matrix_world.copy()
    world.translation += Vector(delta)
    obj.matrix_world = world


def _replace_material(obj: bpy.types.Object | None, material: bpy.types.Material) -> None:
    if obj is None or obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _reshape_named(
    model: ModelParts,
    name: str,
    *,
    scale: tuple[float, float, float],
    pivot: tuple[float, float, float] | None = None,
) -> None:
    obj = _named(model, name)
    if obj is None:
        return
    _scale_about(obj, pivot or _bounds_center(obj), scale)


def _recenter_side_piece(
    obj: bpy.types.Object,
    *,
    side: str,
    anchor_old: float,
    anchor_new: float,
    center_compression: float,
    width_scale: float,
) -> None:
    sign = -1.0 if side == "L" else 1.0
    center_x, _, _ = _bounds_center(obj)
    old_abs = abs(center_x)
    target_abs = anchor_new + (old_abs - anchor_old) * center_compression
    target_x = sign * target_abs
    for vertex in obj.data.vertices:
        world = _world_point(obj, vertex.co)
        world.x = target_x + (world.x - center_x) * width_scale
        vertex.co = _local_point(obj, world)
    obj.data.update()


def _helmet(model: ModelParts) -> None:
    materials = model.materials

    # Keep the helmet compact and faceted. The crown taper prevents the front read
    # from collapsing back into a square while the lower jaw retains armored mass.
    shell = _named(model, "HelmetShell")
    if shell is not None:
        _scale_about(shell, (0.0, 0.0, 1.835), (0.82, 0.88, 0.88))
        _taper_x_by_z(shell, low_scale=0.90, high_scale=0.74)

    jaw = _named(model, "HelmetJaw")
    if jaw is not None:
        _scale_about(jaw, (0.0, 0.235, 1.760), (0.77, 0.90, 0.88))

    recess = _named(model, "FaceRecess")
    if recess is not None:
        _scale_about(recess, (0.0, 0.270, 1.820), (0.78, 0.92, 0.88))

    for side in ("L", "R"):
        cheek = _named(model, f"HelmetCheek.{side}")
        if cheek is not None:
            _scale_about(cheek, (0.0, 0.285, 1.805), (0.80, 0.93, 0.88))
            _replace_material(cheek, materials["DarkSteel"])
        crown = _named(model, f"HelmetCrownTrim.{side}")
        if crown is not None:
            _scale_about(crown, (0.0, 0.280, 1.920), (0.82, 0.92, 0.84))

    # Preserve a dark face recess and make the luminous T read as a narrow cut in it.
    visor = _named(model, "Visor")
    _replace_material(visor, materials["DarkSteel"])
    if visor is not None:
        _scale_about(visor, (0.0, 0.282, 1.815), (0.78, 0.94, 0.88))

    _reshape_named(
        model,
        "VisorGlow.Bar",
        pivot=(0.0, 0.294, 1.850),
        scale=(0.78, 0.95, 0.65),
    )
    _reshape_named(
        model,
        "VisorGlow.Stem",
        pivot=(0.0, 0.295, 1.795),
        scale=(0.62, 0.95, 0.88),
    )
    _reshape_named(
        model,
        "Crest",
        pivot=(0.0, 0.0, 2.035),
        scale=(0.86, 0.88, 1.04),
    )
    _reshape_named(model, "CrimsonScarf", scale=(0.86, 1.02, 0.82))


def _torso(model: ModelParts) -> None:
    materials = model.materials

    # Create a clearer armored V: full upper chest, pulled-in waist, and deeper
    # front/back curvature. This removes the rectangular breastplate read.
    breast = _named(model, "Breastplate")
    if breast is not None:
        _scale_about(breast, (0.0, 0.120, 1.325), (0.90, 1.06, 1.10))
        _taper_x_by_z(breast, low_scale=0.80, high_scale=1.05)

    for side in ("L", "R"):
        facet = _named(model, f"ChestFacet.{side}")
        if facet is not None:
            _scale_about(facet, (0.0, 0.250, 1.325), (0.88, 0.95, 1.08))
            _taper_x_by_z(facet, low_scale=0.83, high_scale=1.02)
            _replace_material(facet, materials["DarkSteel"])

    back = _named(model, "BackArmor")
    if back is not None:
        _scale_about(back, (0.0, -0.185, 1.325), (0.90, 0.98, 1.08))
        _taper_x_by_z(back, low_scale=0.82, high_scale=1.02)

    _reshape_named(
        model,
        "WarBelt",
        pivot=(0.0, 0.015, 1.025),
        scale=(0.86, 0.94, 0.82),
    )
    _reshape_named(model, "WarBelt.Buckle", scale=(0.84, 0.90, 0.84))
    _reshape_named(model, "WarBelt.BuckleInset", scale=(0.84, 0.90, 0.84))

    for side in ("L", "R"):
        for name in (f"BeltPouch.{side}", f"BeltPouchClasp.{side}"):
            obj = _named(model, name)
            if obj is None:
                continue
            _recenter_side_piece(
                obj,
                side=side,
                anchor_old=0.335,
                anchor_new=0.300,
                center_compression=0.88,
                width_scale=0.94,
            )
            _scale_about(obj, _bounds_center(obj), (0.86, 0.84, 0.82))


def _shoulders_and_arms(model: ModelParts) -> None:
    shoulder_prefixes = (
        "Pauldron.", "PauldronFacet.", "PauldronTrim.",
        "ShoulderBadge.", "PauldronLower.",
    )
    arm_prefixes = (
        "UnderUpperArm.", "UnderForearm.", "UpperArmPlate.",
        "Vambrace.", "VambraceFacet.", "Gauntlet.", "GauntletCuff.",
    )

    for side in ("L", "R"):
        for prefix in shoulder_prefixes:
            obj = _named(model, f"{prefix}{side}")
            if obj is None:
                continue
            _recenter_side_piece(
                obj,
                side=side,
                anchor_old=0.52,
                anchor_new=0.54,
                center_compression=SHOULDER_X_COMPRESSION,
                width_scale=1.03,
            )
            center = _bounds_center(obj)
            # Wide, shallow armor shelves produce the concept's strong shoulder line.
            _scale_about(obj, center, (1.10, 0.82, 0.68))

        for prefix in arm_prefixes:
            obj = _named(model, f"{prefix}{side}")
            if obj is None:
                continue
            _recenter_side_piece(
                obj,
                side=side,
                anchor_old=0.48,
                anchor_new=0.49,
                center_compression=ARM_X_COMPRESSION,
                width_scale=0.92,
            )
            center = _bounds_center(obj)
            # Slender faceted limbs keep the silhouette heroic rather than toy-like.
            _scale_about(obj, center, (0.82, 0.82, 1.05))


def _legs_and_cloth(model: ModelParts) -> None:
    for side in ("L", "R"):
        for name, scale in (
            (f"UnderThigh.{side}", (0.78, 0.82, 1.05)),
            (f"UnderShin.{side}", (0.76, 0.80, 1.06)),
            (f"Cuisse.{side}", (0.78, 0.84, 1.05)),
            (f"CuisseFacet.{side}", (0.80, 0.88, 1.05)),
            (f"KneePlate.{side}", (0.76, 0.80, 0.72)),
            (f"Greave.{side}", (0.78, 0.84, 1.08)),
            (f"GreaveFacet.{side}", (0.80, 0.88, 1.08)),
            (f"Boot.{side}", (0.68, 0.72, 0.78)),
            (f"BootFacet.{side}", (0.68, 0.72, 0.78)),
            (f"BootAnkleTrim.{side}", (0.72, 0.78, 0.80)),
        ):
            obj = _named(model, name)
            if obj is not None:
                _scale_about(obj, _bounds_center(obj), scale)

    front = _named(model, "TabardFront")
    if front is not None:
        _scale_about(front, (0.0, 0.260, 0.725), (0.72, 0.96, 1.10))
        _taper_x_by_z(front, low_scale=0.62, high_scale=1.00)

    back = _named(model, "TabardBack")
    if back is not None:
        _scale_about(back, (0.0, -0.300, 1.010), (0.74, 0.96, 1.08))
        _taper_x_by_z(back, low_scale=0.70, high_scale=1.00)

    for side in ("L", "R"):
        tabard_trim = _named(model, f"TabardTrim.{side}")
        if tabard_trim is not None:
            _scale_about(tabard_trim, (0.0, 0.0, 0.75), (0.72, 0.96, 1.08))
            _taper_x_by_z(tabard_trim, low_scale=0.62, high_scale=1.00)

        cape_trim = _named(model, f"CapeTrim.{side}")
        if cape_trim is not None:
            _scale_about(cape_trim, (0.0, 0.0, 0.95), (0.74, 0.96, 1.06))
            _taper_x_by_z(cape_trim, low_scale=0.70, high_scale=1.00)

    sigil = _named(model, "TabardSigil")
    if sigil is not None:
        _scale_about(sigil, (0.0, 0.292, 0.755), (0.66, 0.96, 1.00))
    back_sigil = _named(model, "CapeSigil")
    if back_sigil is not None:
        _scale_about(back_sigil, (0.0, -0.337, 1.145), (0.68, 0.96, 1.00))


def _weapon_and_magic(model: ModelParts) -> None:
    # Keep the sword outside the hip rather than pulling its guard through the belt.
    # The sorcery cluster sits just beyond the off-hand so it reads as a spell, not cyan fingers.
    for name in ("HeroSword", "HeroSword.Guard", "HeroSword.Grip", "HeroSword.Pommel"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (0.03, 0.035, -0.01))

    for name in ("SorceryCore", "SorceryShard.1", "SorceryShard.2", "SorceryShard.3"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (-0.10, 0.07, 0.04))


def refine_concept_proportions(model: ModelParts) -> ModelParts:
    """Apply the final concept-faithful silhouette pass to production geometry."""
    _helmet(model)
    _torso(model)
    _shoulders_and_arms(model)
    _legs_and_cloth(model)
    _weapon_and_magic(model)
    return model
