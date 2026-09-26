from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import bpy

from .gltf_rotation import fix_rotation_continuity


def validate_export_transforms(objects: Iterable[bpy.types.Object]) -> None:
    """Reject mirrored/zero-scale or non-unit export roots before glTF export."""
    for obj in objects:
        scale = tuple(float(v) for v in obj.scale)
        if any(v <= 0 for v in scale):
            raise ValueError(f"{obj.name} has non-positive export scale {scale}")
        if any(abs(v - 1.0) > 1e-6 for v in scale):
            raise ValueError(f"{obj.name} must have applied unit export scale, got {scale}")


def export_glb(path: Path, *, objects: Iterable[bpy.types.Object]) -> None:
    """Export selected production objects to one Y-up GLB with independent authored actions."""
    selected = list(objects)
    if not selected:
        raise ValueError("export_glb requires at least one object")
    validate_export_transforms(selected)
    path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = selected[0]

    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=True,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_frame_range=False,
        # Do not force-sample all bone TRS channels. Blender otherwise emits
        # constant root translation tracks even though gameplay owns movement.
        export_force_sampling=False,
        export_anim_slide_to_zero=True,
        export_merge_animation="ACTION",
        export_skins=True,
        # Preserve authored non-armature modifiers, including bevels and cloth thickness.
        export_apply=True,
        export_morph=False,
        export_yup=True,
        export_def_bones=False,
        export_cameras=False,
        export_lights=False,
    )
    # the exporter can leave neighbouring rotation keys in opposite hemispheres with unflipped tangents, which the
    # runtime plays as a one-frame snap (the Spellblade's thighs in Run and Dash); keep every curve continuous
    fix_rotation_continuity(path)
