from __future__ import annotations

import bpy

from .model import ModelParts


def enforce_blueprint_export_bounds(model: ModelParts) -> ModelParts:
    """Keep the locked hero silhouette safely inside the external GLB height contract."""
    for obj in model.objects:
        if obj.name != "Crest" or obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.z -= 0.015
        obj.data.update()
        break
    return model
