from __future__ import annotations

import bpy

from .authoritative_model_v4 import build_authoritative_spellblade_v4
from .model import ModelParts


def _find_armature(model: ModelParts) -> bpy.types.Object:
    for obj in model.objects:
        for modifier in obj.modifiers:
            if modifier.type == "ARMATURE" and modifier.object is not None:
                return modifier.object
        if obj.parent is not None and obj.parent.type == "ARMATURE":
            return obj.parent
    raise ValueError("Cannot rebuild Spellblade: production armature not found")


def enforce_blueprint_export_bounds(model: ModelParts) -> ModelParts:
    """Replace legacy visual geometry with the current authoritative concept build."""
    armature = _find_armature(model)
    materials = model.materials

    for obj in tuple(model.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    rebuilt = build_authoritative_spellblade_v4(armature, materials)

    for obj in rebuilt.objects:
        if obj.name != "Crest" or obj.type != "MESH":
            continue
        max_z = max(vertex.co.z for vertex in obj.data.vertices)
        overflow = max(0.0, max_z - 2.235)
        if overflow > 0.0:
            for vertex in obj.data.vertices:
                vertex.co.z -= overflow
            obj.data.update()
        break

    return rebuilt
