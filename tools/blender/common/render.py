from __future__ import annotations

import bpy


_RENDER_MODES = {
    "preview": {"resolution": 384, "percentage": 100},
    "review": {"resolution": 640, "percentage": 100},
}


def configure_render(scene: bpy.types.Scene, mode: str = "preview") -> None:
    """Configure deterministic Eevee output without owning cameras or model content."""
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
