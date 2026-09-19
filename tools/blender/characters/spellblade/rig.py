from __future__ import annotations

import bpy

from .design import BONES, REQUIRED_BONES


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
        bone.head = head
        bone.tail = tail
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
