from __future__ import annotations

import bpy
from mathutils import Vector

from .model import ModelParts


# Final silhouette tuning is intentionally modest. The hero builders now own the
# blueprint; this pass must not shrink their concept-authored volumes back into a
# toy-like figure.
ARM_X_COMPRESSION = 0.97
SHOULDER_X_COMPRESSION = 1.00


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
        _scale_about(shell, _bounds_center(shell), (0.98, 1.02, 0.98))

    jaw = _named(model, "HelmetJaw")
    if jaw is not None:
        _scale_about(jaw, _bounds_center(jaw), (0.98, 1.02, 0.99))

    recess = _named(model, "FaceRecess")
    if recess is not None:
        _scale_about(recess, _bounds_center(recess), (0.96, 1.00, 0.98))

    for side in ("L", "R"):
        cheek = _named(model, f"HelmetCheek.{side}")
        if cheek is not None:
            _scale_about(cheek, _bounds_center(cheek), (0.98, 1.0, 0.99))
        crown = _named(model, f"HelmetCrownTrim.{side}")
        if crown is not None:
            _scale_about(crown, _bounds_center(crown), (1.00, 1.0, 1.00))

    visor = _named(model, "Visor")
    _replace_material(visor, materials["DarkSteel"])
    if visor is not None:
        _scale_about(visor, _bounds_center(visor), (0.96, 1.00, 0.98))

    _reshape_named(model, "VisorGlow.Bar", scale=(0.92, 1.0, 0.88))
    _reshape_named(model, "VisorGlow.Stem", scale=(0.86, 1.0, 0.96))
    _reshape_named(model, "Crest", scale=(0.98, 0.96, 0.94))
    _reshape_named(model, "CrimsonScarf", scale=(1.03, 1.05, 1.00))
    _reshape_named(model, "CrimsonScarfFront", scale=(1.00, 1.02, 1.00))


def _torso(model: ModelParts) -> None:
    _reshape_named(model, "Breastplate", scale=(1.03, 1.02, 1.02))
    for side in ("L", "R"):
        _reshape_named(model, f"ChestFacet.{side}", scale=(1.02, 1.00, 1.01))
        _reshape_named(model, f"BreastplateTrim.{side}", scale=(1.00, 1.00, 1.00))
    _reshape_named(model, "BreastplateCollar", scale=(1.00, 1.00, 1.00))
    _reshape_named(model, "BackArmor", scale=(1.01, 1.02, 1.01))
    _reshape_named(model, "WarBelt", scale=(0.95, 0.98, 0.94))


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
                anchor_new=0.52,
                center_compression=SHOULDER_X_COMPRESSION,
                width_scale=1.02,
            )
            _scale_about(obj, _bounds_center(obj), (1.02, 1.00, 0.96))

        for prefix in arm_prefixes:
            obj = _named(model, f"{prefix}{side}")
            if obj is None:
                continue
            _recenter_side_piece(
                obj,
                side=side,
                anchor_old=0.48,
                anchor_new=0.48,
                center_compression=ARM_X_COMPRESSION,
                width_scale=0.98,
            )
            _scale_about(obj, _bounds_center(obj), (0.98, 0.98, 1.02))


def _legs_and_cloth(model: ModelParts) -> None:
    for side in ("L", "R"):
        for name, scale in (
            (f"Cuisse.{side}", (0.98, 0.98, 1.01)),
            (f"CuisseFacet.{side}", (0.98, 0.98, 1.01)),
            (f"KneePlate.{side}", (0.96, 0.96, 0.96)),
            (f"Greave.{side}", (0.96, 0.98, 1.02)),
            (f"GreaveFacet.{side}", (0.96, 0.98, 1.02)),
            (f"Boot.{side}", (0.94, 0.96, 0.96)),
            (f"BootFacet.{side}", (0.94, 0.96, 0.96)),
            (f"BootAnkleTrim.{side}", (0.96, 0.98, 0.96)),
        ):
            obj = _named(model, name)
            if obj is not None:
                _scale_about(obj, _bounds_center(obj), scale)

    front = _named(model, "TabardFront")
    if front is not None:
        _scale_about(front, (0.0, 0.260, 0.725), (0.94, 1.00, 1.06))
    back = _named(model, "TabardBack")
    if back is not None:
        _scale_about(back, (0.0, -0.300, 1.010), (0.88, 1.00, 1.05))

    for side in ("L", "R"):
        for name in (f"TabardTrim.{side}", f"CapeTrim.{side}"):
            obj = _named(model, name)
            if obj is not None:
                _scale_about(
                    obj,
                    _bounds_center(obj),
                    (0.94 if "Tabard" in name else 0.88, 1.00, 1.04),
                )

    _reshape_named(model, "TabardSigil", scale=(0.90, 1.00, 1.02))
    _reshape_named(model, "CapeSigil", scale=(0.84, 1.00, 1.00))


def _weapon_and_magic(model: ModelParts) -> None:
    for name in ("HeroSword", "HeroSword.Guard", "HeroSword.Grip", "HeroSword.Pommel"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (-0.07, 0.035, -0.015))

    for name in ("SorceryCore", "SorceryShard.1", "SorceryShard.2", "SorceryShard.3"):
        obj = _named(model, name)
        if obj is not None:
            _translate_socket_object(obj, (0.10, 0.030, 0.000))


def refine_concept_proportions(model: ModelParts) -> ModelParts:
    """Apply restrained final tuning without overriding the locked hero blueprint."""
    _helmet(model)
    _torso(model)
    _shoulders_and_arms(model)
    _legs_and_cloth(model)
    _weapon_and_magic(model)
    return model
