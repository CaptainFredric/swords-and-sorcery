from __future__ import annotations

from pathlib import Path
from collections.abc import Iterable

import bpy


def validate_export_transforms(objects: Iterable[bpy.types.Object]) -> None:
    """Reject mirrored/zero-scale roots before glTF export."""
    for obj in objects:
        scale = tuple(float(v) for v in obj.scale)
        if any(v <= 0 for v in scale):
            raise ValueError(f"{obj.name} has non-positive export scale {scale}")


def export_glb(path: Path, *, objects: Iterable[bpy.types.Object] = ()) -> None:
    """Export one GLB after the caller has selected/constructed the production scene."""
    validate_export_transforms(objects)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=False,
    )
