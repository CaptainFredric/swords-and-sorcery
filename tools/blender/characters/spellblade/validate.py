from __future__ import annotations

import json
from pathlib import Path

import bpy

from .design import BLENDER_FORWARD, BLENDER_UP, BODY_HEIGHT, REQUIRED_BONES, RUNTIME_FORWARD, RUNTIME_UP
from .model import ModelParts, REQUIRED_HERO_PIECES


CONTRACT_PATH = Path(__file__).with_name("contract.json")
_REQUIRED_CLIPS = {
    "Idle", "Run", "Air", "Guard", "Slash_1", "Slash_2", "Slash_3",
    "Cast", "Dash", "Stagger", "Death",
}
_REQUIRED_SOCKETS = {"socket_sword", "socket_sorcery"}
_REQUIRED_MUTABLE_MATERIALS = {"VisorGlow", "SorceryAccent"}


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    validate_contract(value)
    return value


def validate_contract(value: dict) -> None:
    if value.get("version") != 1:
        raise ValueError("Spellblade asset contract version must be 1")
    if value.get("facing") != "-Z" or value.get("up") != "+Y" or value.get("unitMeters") != 1:
        raise ValueError("Spellblade asset contract must use -Z forward, +Y up, and meter units")
    missing_clips = _REQUIRED_CLIPS.difference(value.get("clips", []))
    if missing_clips:
        raise ValueError(f"Spellblade asset contract missing clips: {sorted(missing_clips)}")
    missing_sockets = _REQUIRED_SOCKETS.difference(value.get("sockets", []))
    if missing_sockets:
        raise ValueError(f"Spellblade asset contract missing sockets: {sorted(missing_sockets)}")
    missing_materials = _REQUIRED_MUTABLE_MATERIALS.difference(value.get("mutableMaterials", []))
    if missing_materials:
        raise ValueError(f"Spellblade asset contract missing mutable materials: {sorted(missing_materials)}")
    for label in ("thirdPerson", "firstPerson"):
        budget = value.get(label)
        if not isinstance(budget, dict):
            raise ValueError(f"Spellblade asset contract missing {label} budget")
        for field in ("maxTriangles", "targetBytes"):
            amount = budget.get(field)
            if not isinstance(amount, (int, float)) or amount <= 0:
                raise ValueError(f"{label}.{field} must be positive")


def validate_rig_scene(armature: bpy.types.Object, proxy: bpy.types.Object) -> dict:
    if armature.type != "ARMATURE":
        raise ValueError("Spellblade rig must be an armature")
    if tuple(round(float(value), 6) for value in armature.location) != (0.0, 0.0, 0.0):
        raise ValueError(f"Spellblade armature must stay at world origin, got {tuple(armature.location)}")
    if any(abs(float(value) - 1.0) > 1e-6 for value in armature.scale):
        raise ValueError(f"Spellblade armature must use unit scale, got {tuple(armature.scale)}")

    bone_names = {bone.name for bone in armature.data.bones}
    missing = [name for name in REQUIRED_BONES if name not in bone_names]
    if missing:
        raise ValueError(f"Spellblade rig missing bones: {missing}")
    for socket in ("socket_sword", "socket_sorcery"):
        if armature.data.bones[socket].use_deform:
            raise ValueError(f"{socket} must be a non-deforming attachment bone")

    if proxy.type != "MESH" or not proxy.data.vertices:
        raise ValueError("Spellblade rig proxy must be a non-empty mesh")
    if not any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in proxy.modifiers):
        raise ValueError("Spellblade rig proxy must be skinned to the production armature")

    world_vertices = [proxy.matrix_world @ vertex.co for vertex in proxy.data.vertices]
    min_z = min(vertex.z for vertex in world_vertices)
    max_z = max(vertex.z for vertex in world_vertices)
    height = max_z - min_z
    if abs(min_z) > 1e-4:
        raise ValueError(f"Spellblade proxy must stand on Blender Z=0, got min Z {min_z:.4f}")
    if abs(height - BODY_HEIGHT) > 0.02:
        raise ValueError(f"Spellblade proxy height must be about {BODY_HEIGHT:.2f}m, got {height:.3f}m")

    return {
        "armature": armature.name,
        "boneCount": len(armature.data.bones),
        "proxy": proxy.name,
        "proxyHeightMeters": round(height, 4),
        "authoringAxes": {"up": BLENDER_UP, "forward": BLENDER_FORWARD},
        "runtimeAxes": {"up": RUNTIME_UP, "forward": RUNTIME_FORWARD},
    }


def _triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def validate_production_model(armature: bpy.types.Object, model: ModelParts, contract: dict | None = None) -> dict:
    contract = contract or load_contract()
    names = {obj.name for obj in model.objects}
    missing = [name for name in REQUIRED_HERO_PIECES if name not in names]
    if missing:
        raise ValueError(f"Spellblade production model missing hero pieces: {missing}")

    material_names = {material.name for material in model.materials.values()}
    missing_materials = sorted(_REQUIRED_MUTABLE_MATERIALS.difference(material_names))
    if missing_materials:
        raise ValueError(f"Spellblade production model missing mutable materials: {missing_materials}")

    mesh_objects = [obj for obj in model.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise ValueError("Spellblade production model must contain meshes")

    for obj in mesh_objects:
        scale = tuple(float(value) for value in obj.scale)
        if any(value <= 0.0 for value in scale) or any(abs(value - 1.0) > 1e-6 for value in scale):
            raise ValueError(f"{obj.name} must have applied positive unit scale, got {scale}")
        has_skin = any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in obj.modifiers)
        has_socket_parent = obj.parent == armature and obj.parent_type == "BONE" and obj.parent_bone in _REQUIRED_SOCKETS
        if not has_skin and not has_socket_parent:
            raise ValueError(f"{obj.name} must be skinned or attached through a production socket")

    triangles = sum(_triangle_count(obj) for obj in mesh_objects)
    budget = int(contract["thirdPerson"]["maxTriangles"])
    if triangles > budget:
        raise ValueError(f"Spellblade model exceeds triangle budget: {triangles} > {budget}")

    world_vertices = [obj.matrix_world @ vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
    min_z = min(vertex.z for vertex in world_vertices)
    max_z = max(vertex.z for vertex in world_vertices)
    height = max_z - min_z
    if min_z < -0.02 or min_z > 0.03:
        raise ValueError(f"Spellblade production model must meet ground plane, got min Z {min_z:.3f}")
    if not (1.85 <= height <= 2.25):
        raise ValueError(f"Spellblade production model height must be 1.85..2.25m, got {height:.3f}m")

    return {
        "heroPieces": list(REQUIRED_HERO_PIECES),
        "meshCount": len(mesh_objects),
        "materialCount": len(material_names),
        "materials": sorted(material_names),
        "triangles": triangles,
        "triangleBudget": budget,
        "heightMeters": round(height, 4),
        "groundZ": round(min_z, 4),
    }
