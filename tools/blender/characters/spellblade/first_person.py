from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import bpy
from tools.blender.common.export import export_glb
from tools.blender.common.render import configure_render, render_still
from .authored_source import load_authored_source, validate_output_paths
from .animations import ANIMATION_FPS, SLASH_CONTACT_SECONDS

_REVIEW_FRAMES = {
    "fp-neutral": ("Idle", 1),
    "fp-guard": ("Guard", 8),
    "fp-slash": ("Slash_1", 1 + round(SLASH_CONTACT_SECONDS[0] * ANIMATION_FPS)),
    "fp-cast": ("Cast", 8),
}

@dataclass(frozen=True)
class FirstPersonBuild:
    glb: Path
    blend: Path
    triangles: int
    triangle_budget: int
    glb_bytes: int
    target_bytes: int
    animations: tuple[str, ...]
    renders: dict[str, Path]


def _seconds_to_frame(seconds: float) -> int:
    return 1 + int(round(seconds * ANIMATION_FPS))


def _triangle_count(objects: list[bpy.types.Object]) -> int:
    triangles = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return triangles


def _render_reviews(
    scene: bpy.types.Scene,
    armature: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
    camera: bpy.types.Object,
    out: Path,
) -> dict[str, Path]:
    animation_data = armature.animation_data
    if animation_data is None:
        raise ValueError("First-person review requires animation data")
    paths: dict[str, Path] = {}
    for label, (action_name, frame) in _REVIEW_FRAMES.items():
        animation_data.action = actions[action_name]
        scene.frame_set(frame)
        path = out / f"spellblade-{label}.png"
        render_still(scene, camera, path)
        paths[label] = path
    animation_data.action = actions["Idle"]
    scene.frame_set(1)
    return paths


def build_first_person_asset(out: Path, contract: dict, mode: str) -> FirstPersonBuild:
    source = Path(__file__).with_name("source") / "spellblade-first-person.blend"
    validate_output_paths((source, source.with_name("spellblade-third-person.blend")), out)
    armature, model, actions = load_authored_source(source, "SpellbladeFirstPersonExport")
    if set(actions) != set(contract["firstPersonClips"]):
        raise ValueError("Authored first person actions must match the runtime contract")
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(1)
    objects = list(model.objects)
    scene = bpy.context.scene
    configure_render(scene, mode)
    scene.render.fps = ANIMATION_FPS
    scene.render.fps_base = 1.0
    scene.render.resolution_x = 960 if mode == "review" else 640
    scene.render.resolution_y = scene.render.resolution_x * 9 // 16

    glb = out / "spellblade-fp.glb"
    export_glb(glb, objects=(armature, *objects))
    glb_bytes = glb.stat().st_size
    target_bytes = int(contract["firstPerson"]["targetBytes"])
    if glb_bytes > target_bytes:
        raise ValueError(f"First-person Spellblade GLB exceeds target byte budget: {glb_bytes} > {target_bytes}")

    triangles = _triangle_count(objects)
    triangle_budget = int(contract["firstPerson"]["maxTriangles"])
    if triangles > triangle_budget:
        raise ValueError(f"First-person Spellblade exceeds triangle budget: {triangles} > {triangle_budget}")

    camera = bpy.data.objects.get("SpellbladeFirstPersonCamera")
    if camera is None:
        raise ValueError("Authored first person source requires its review camera")
    renders = _render_reviews(scene, armature, actions, camera, out)
    blend = out / "spellblade-first-person.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    return FirstPersonBuild(
        glb=glb,
        blend=blend,
        triangles=triangles,
        triangle_budget=triangle_budget,
        glb_bytes=glb_bytes,
        target_bytes=target_bytes,
        animations=tuple(actions.keys()),
        renders=renders,
    )
