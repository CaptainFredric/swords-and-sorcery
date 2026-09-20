from __future__ import annotations

import bpy

from .authoritative_model import build_authoritative_spellblade
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
    """Replace legacy visual geometry with the single authoritative concept build.

    The older construction passes remain upstream temporarily because they also
    exercise historical regression coverage, but none of their visible meshes
    survive into the production model.  This function is the final handoff before
    validation/export and therefore guarantees one coherent geometry source.
    """
    armature = _find_armature(model)
    materials = model.materials

    for obj in tuple(model.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    rebuilt = build_authoritative_spellblade(armature, materials)

    # External contract permits at most 2.25m.  Keep a small deterministic margin
    # on the decorative crest without scaling the character or changing the rig.
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
