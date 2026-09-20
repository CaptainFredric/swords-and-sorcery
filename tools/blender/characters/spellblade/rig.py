from __future__ import annotations

import bpy

from .design import BONES, REQUIRED_BONES


_V3_OLD_WAIST_Z = 1.075
_V3_NEW_WAIST_Z = 1.205
_V3_TOP_Z = 2.235
_V4_STAGE_WAIST_Z = 1.205
_V4_TARGET_WAIST_Z = 1.310
_V4_STAGE_SHOULDER_Z = 1.650
_V4_TARGET_SHOULDER_Z = 1.670
_V4_TOP_Z = 2.235


def _v3_z(z: float) -> float:
    if z <= _V3_OLD_WAIST_Z:
        return z * (_V3_NEW_WAIST_Z / _V3_OLD_WAIST_Z)
    return _V3_NEW_WAIST_Z + (z - _V3_OLD_WAIST_Z) * (
        (_V3_TOP_Z - _V3_NEW_WAIST_Z) / (_V3_TOP_Z - _V3_OLD_WAIST_Z)
    )


def _concept_z(z: float) -> float:
    z = _v3_z(z)
    if z <= _V4_STAGE_WAIST_Z:
        return z * (_V4_TARGET_WAIST_Z / _V4_STAGE_WAIST_Z)
    if z <= _V4_STAGE_SHOULDER_Z:
        return _V4_TARGET_WAIST_Z + (z - _V4_STAGE_WAIST_Z) * (
            (_V4_TARGET_SHOULDER_Z - _V4_TARGET_WAIST_Z)
            / (_V4_STAGE_SHOULDER_Z - _V4_STAGE_WAIST_Z)
        )
    return _V4_TARGET_SHOULDER_Z + (z - _V4_STAGE_SHOULDER_Z) * (
        (_V4_TOP_Z - _V4_TARGET_SHOULDER_Z) / (_V4_TOP_Z - _V4_STAGE_SHOULDER_Z)
    )


def _concept_point(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return (point[0], point[1], _concept_z(point[2]))


def build_armature() -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("SpellbladeRig")
    armature = bpy.data.objects.new("SpellbladeRig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.location = (0.0, 0.0, 0.0)
    armature.rotation_euler = (0.0, 0.0, 0.0)
    armature.scale = (1.0, 1.0, 1.0)
    armature.show_in_front = True

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    for name, (head, tail, parent_name, deform) in BONES.items():
        bone = armature_data.edit_bones.new(name)
        bone.head = _concept_point(head)
        bone.tail = _concept_point(tail)
        bone.use_deform = deform
        if parent_name is not None:
            bone.parent = armature_data.edit_bones[parent_name]
            # Explicit coordinates are intentional; only connect exact limb chains.
            bone.use_connect = tuple(bone.head) == tuple(bone.parent.tail)

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def validate_armature_names(armature: bpy.types.Object) -> None:
    names = {bone.name for bone in armature.data.bones}
    missing = [name for name in REQUIRED_BONES if name not in names]
    if missing:
        raise ValueError(f"Spellblade armature missing bones: {missing}")


def rigid_skin(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    if bone_name not in armature.data.bones:
        raise ValueError(f"Cannot skin {obj.name}: missing bone {bone_name}")
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("SpellbladeArmature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
