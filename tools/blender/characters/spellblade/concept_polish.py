from __future__ import annotations

import bpy
from mathutils import Vector

from .model import ModelParts


# The traced model is the source mesh. This pass only reshapes/re-materials those
# authored pieces; it deliberately does not stack another blockout or duplicate
# cape/armor shell over the character.
ARM_X_COMPRESSION = 0.72
SHOULDER_X_COMPRESSION = 0.88


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
    shell = _named(model, "HelmetShell")
    if shell is not None:
        _scale_about(shell, (0.0, 0.0, 1.835), (0.88, 1.02, 1.07))

    jaw = _named(model, "HelmetJaw")
    if jaw is not None:
        _scale_about(jaw, (0.0, 0.185, 1.720), (0.86, 1.00, 1.05))

    for side in ("L", "R"):
        cheek = _named(model, f"HelmetCheek.{side}")
        if cheek is not None:
            _scale_about(cheek, (0.0, 0.225, 1.805), (0.88, 1.0, 1.03))
            _replace_material(cheek, materials["DarkSteel"])
        crown = _named(model, f"HelmetCrownTrim.{side}")
        if crown is not None:
            _scale_about(crown, (0.0, 0.215, 1.940), (0.90, 1.0, 1.0))

    # The required Visor object becomes the dark recess. Only the smaller bar and
    # stem emit cyan, preventing the face from reading as a glowing television.
    visor = _named(model, "Visor")
    _replace_material(visor, materials["DarkSteel"])
    if visor is not None:
        _scale_about(visor, (0.0, 0.285, 1.835), (0.94, 1.0, 1.35))

    _reshape_named(
        model,
        "VisorGlow.Bar",
        pivot=(0.0, 0.297, 1.842),
        scale=(0.78, 1.0, 0.72),
    )
    _reshape_named(
        model,
        "VisorGlow.Stem",
        pivot=(0.0, 0.297, 1.770),
        scale=(0.70, 1.0, 0.92),
    )
    _reshape_named(
        model,
        "Crest",
        pivot=(0.0, -0.020, 2.000),
        scale=(0.90, 0.95, 1.00),
    )


def _torso(model: ModelParts) -> None:
    _reshape_named(
        model,
        "Breastplate",
        pivot=(0.0, 0.120, 1.335),
        scale=(0.94, 1.08, 1.08),
    )
    for side in ("L", "R"):
        facet = _named(model, f"ChestFacet.{side}")
        if facet is not None:
            _scale_about(facet, (0.0, 0.262, 1.335), (0.91, 1.0, 1.05))

    _reshape_named(
        model,
        "WarBelt",
        pivot=(0.0, 0.015, 1.025),
        scale=(0.92, 1.0, 0.92),
    )


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
            if obj is not None:
                _recenter_side_piece(
                    obj,
                    side=side,
                    anchor_old=0.0,
                    anchor_new=0.0,
                    center_compression=SHOULDER_X_COMPRESSION,
                    width_scale=0.88,
                )

        for prefix in arm_prefixes:
            obj = _named(model, f"{prefix}{side}")
            if obj is not None:
                _recenter_side_piece(
                    obj,
                    side=side,
                    anchor_old=0.42,
                    anchor_new=0.40,
                    center_compression=ARM_X_COMPRESSION,
                    width_scale=0.92,
                )


def _legs_and_cloth(model: ModelParts) -> None:
    for side in ("L", "R"):
        for name in (f"Boot.{side}", f"BootFacet.{side}"):
            obj = _named(model, name)
            if obj is not None:
                center = _bounds_center(obj)
                _scale_about(obj, center, (0.80, 0.88, 0.94))
        ankle = _named(model, f"BootAnkleTrim.{side}")
        if ankle is not None:
            center = _bounds_center(ankle)
            _scale_about(ankle, center, (0.84, 0.90, 0.92))

    front = _named(model, "TabardFront")
    if front is not None:
        _scale_about(front, (0.0, 0.260, 0.725), (0.84, 1.0, 1.07))
    back = _named(model, "TabardBack")
    if back is not None:
        _scale_about(back, (0.0, -0.300, 1.010), (0.80, 1.0, 1.00))

    for side in ("L", "R"):
        for name in (f"TabardTrim.{side}", f"CapeTrim.{side}"):
            obj = _named(model, name)
            if obj is not None:
                _scale_about(obj, (0.0, 0.0, 0.75), (0.84 if "Tabard" in name else 0.80, 1.0, 1.03))

    sigil = _named(model, "TabardSigil")
    if sigil is not None:
        _scale_about(sigil, (0.0, 0.292, 0.755), (0.78, 1.0, 0.92))
    back_sigil = _named(model, "CapeSigil")
    if back_sigil is not None:
        _scale_about(back_sigil, (0.0, -0.337, 1.145), (0.76, 1.0, 0.88))


def _weapon_and_magic(model: ModelParts) -> None:
    # Socketed parts retain their authored mesh coordinates. Moving only the node
    # transform keeps raw GLB POSITION bounds stable for the external validator.
    for name in ("HeroSword", "HeroSword.Guard", "HeroSword.Grip", "HeroSword.Pommel"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (-0.16, 0.035, 0.0))

    for name in ("SorceryCore", "SorceryShard.1", "SorceryShard.2", "SorceryShard.3"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (0.16, 0.025, 0.0))


def refine_concept_proportions(model: ModelParts) -> ModelParts:
    """Correct the concept model's large silhouette errors without overlay geometry."""
    _helmet(model)
    _torso(model)
    _shoulders_and_arms(model)
    _legs_and_cloth(model)
    _weapon_and_magic(model)
    return model
