from __future__ import annotations

import bpy

from .authoritative_accuracy_pass import apply_concept_accuracy_pass
from .authoritative_accuracy_pass_v2 import apply_concept_accuracy_pass_v2
from .authoritative_accuracy_pass_v3 import apply_concept_accuracy_pass_v3
from .authoritative_accuracy_pass_v4 import apply_concept_accuracy_pass_v4
from .authoritative_accuracy_pass_v5 import apply_concept_accuracy_pass_v5
from .authoritative_detail_pass import refine_authoritative_details
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


def _remove_modeled_sorcery(model: ModelParts) -> ModelParts:
    """Keep the off-hand VFX socket, but export no baked spell geometry."""
    kept: list[bpy.types.Object] = []
    for obj in tuple(model.objects):
        if obj.name == "SorceryCore" or obj.name.startswith("SorceryShard"):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        kept.append(obj)
    return ModelParts(objects=tuple(kept), materials=model.materials)


def enforce_blueprint_export_bounds(model: ModelParts) -> ModelParts:
    """Replace legacy visual geometry with the current authoritative concept build."""
    armature = _find_armature(model)
    materials = model.materials

    for obj in tuple(model.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    rebuilt = build_authoritative_spellblade_v4(armature, materials)
    rebuilt = refine_authoritative_details(rebuilt, armature, materials)
    rebuilt = apply_concept_accuracy_pass(rebuilt, armature, materials)
    rebuilt = apply_concept_accuracy_pass_v2(rebuilt, armature, materials)
    rebuilt = apply_concept_accuracy_pass_v3(rebuilt, armature, materials)
    rebuilt = apply_concept_accuracy_pass_v4(rebuilt, armature, materials)
    rebuilt = apply_concept_accuracy_pass_v5(rebuilt, armature, materials)
    rebuilt = _remove_modeled_sorcery(rebuilt)

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
