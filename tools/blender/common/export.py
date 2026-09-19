from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import bpy


def validate_export_transforms(objects: Iterable[bpy.types.Object]) -> None:
    """Reject mirrored/zero-scale or non-unit export roots before glTF export."""
    for obj in objects:
        scale = tuple(float(v) for v in obj.scale)
        if any(v <= 0 for v in scale):
            raise ValueError(f"{obj.name} has non-positive export scale {scale}")
        if any(abs(v - 1.0) > 1e-6 for v in scale):
            raise ValueError(f"{obj.name} must have applied unit export scale, got {scale}")


def export_glb(path: Path, *, objects: Iterable[bpy.types.Object]) -> None:
    """Export selected production objects to one Y-up GLB."""
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
        export_skins=True,
        export_morph=False,
        export_yup=True,
        export_def_bones=False,
        export_cameras=False,
        export_lights=False,
    )
