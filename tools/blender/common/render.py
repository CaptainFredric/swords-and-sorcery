from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector


_RENDER_MODES = {
    "preview": {"resolution": 384, "percentage": 100, "samples": 24},
    "review": {"resolution": 640, "percentage": 100, "samples": 64},
}


def configure_render(scene: bpy.types.Scene, mode: str = "preview") -> None:
    """Configure deterministic Eevee output without owning model content."""
    settings = _RENDER_MODES.get(mode)
    if settings is None:
        raise ValueError(f"Unknown render mode: {mode}")

    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = settings["resolution"]
    scene.render.resolution_y = settings["resolution"]
    scene.render.resolution_percentage = settings["percentage"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = settings["samples"]


def look_at(obj: bpy.types.Object, point: tuple[float, float, float]) -> None:
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_still(scene: bpy.types.Scene, camera: bpy.types.Object, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.camera = camera
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
