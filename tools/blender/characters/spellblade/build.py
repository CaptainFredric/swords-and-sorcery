from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.common.export import export_glb
from tools.blender.characters.spellblade.authored_source import load_authored_source, validate_output_paths
from tools.blender.common.render import configure_render, look_at, render_still
from tools.blender.characters.spellblade.design import BODY_HEIGHT
from tools.blender.characters.spellblade.first_person import build_first_person_asset
from tools.blender.characters.spellblade.rig import rigid_skin, validate_armature_names
from tools.blender.characters.spellblade.validate import load_contract, validate_production_model, validate_rig_scene


_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
_FIRST_PERSON_GLB = "spellblade-fp.glb"
_ACTION_REVIEW_FRAMES = {
    "action-guard": ("Guard", 8, "front"),
    "action-slash-1": ("Slash_1", 13, "quarter"),
    "action-slash-2": ("Slash_2", 12, "quarter"),
    "action-slash-3": ("Slash_3", 12, "quarter"),
    "action-cast": ("Cast", 16, "front"),
    "action-dash": ("Dash", 4, "side"),
    "action-stagger": ("Stagger", 5, "front"),
    "action-death": ("Death", 36, "quarter"),
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build Swords & Sorcery Spellblade assets")
    parser.add_argument("--mode", choices=("bootstrap", "preview", "review"), default="bootstrap")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("source") / "spellblade-third-person.blend")
    return parser.parse_args(argv)


def _validate_revision(revision: str) -> None:
    if not _REVISION_RE.fullmatch(revision):
        raise ValueError("source revision must be a 40-character lowercase Git SHA")


def _write_report(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _ensure_world(scene: bpy.types.Scene, name: str) -> bpy.types.World:
    if scene.world is None:
        scene.world = bpy.data.worlds.new(name)
    return scene.world


def bootstrap(args: argparse.Namespace) -> None:
    _validate_revision(args.source_revision)
    contract = load_contract()
    args.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_render(bpy.context.scene, "preview")
    _ensure_world(bpy.context.scene, "SpellbladeBootstrapWorld")

    blend_path = args.out / "spellblade-worker-bootstrap.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    report_path = args.out / "spellblade-build-report.json"
    _write_report(report_path, {
        "schemaVersion": 1,
        "workerReady": True,
        "mode": "bootstrap",
        "visualStage": "worker-bootstrap",
        "sourceRevision": args.source_revision,
        "blenderVersion": bpy.app.version_string,
        "contractVersion": contract["version"],
        "outputs": {"blend": blend_path.name},
    })
    print(f"SPELLBLADE_WORKER_READY report={report_path} blender={bpy.app.version_string}")


def _proxy_material() -> bpy.types.Material:
    material = bpy.data.materials.new("RigProxyMaterial")
    material.use_nodes = True
    material.diffuse_color = (0.22, 0.29, 0.38, 1.0)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = material.diffuse_color
        bsdf.inputs["Metallic"].default_value = 0.35
        bsdf.inputs["Roughness"].default_value = 0.58
    return material


def _build_validation_proxy(armature: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, BODY_HEIGHT / 2.0))
    proxy = bpy.context.object
    proxy.name = "RigValidationProxy"
    proxy.scale = (0.36, 0.22, BODY_HEIGHT / 2.0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    proxy.data.materials.append(_proxy_material())
    rigid_skin(proxy, armature, "spine")
    return proxy


def _add_review_stage(scene: bpy.types.Scene) -> dict[str, bpy.types.Object]:
    world = _ensure_world(scene, "SpellbladeReviewWorld")
    world.color = (0.012, 0.016, 0.024)

    floor_material = bpy.data.materials.new("SpellbladeReviewFloor")
    floor_material.diffuse_color = (0.022, 0.026, 0.032, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, -0.002))
    floor = bpy.context.object
    floor.name = "SpellbladeReviewFloor"
    floor.data.materials.append(floor_material)

    bpy.ops.object.light_add(type="AREA", location=(3.3, 4.2, 5.1))
    key = bpy.context.object
    key.name = "SpellbladeReviewKey"
    key.data.energy = 1050
    key.data.shape = "DISK"
    key.data.size = 4.5
    look_at(key, (0.0, 0.0, 1.05))

    bpy.ops.object.light_add(type="AREA", location=(-3.2, 1.0, 3.0))
    fill = bpy.context.object
    fill.name = "SpellbladeReviewFill"
    fill.data.energy = 520
    fill.data.color = (0.28, 0.52, 1.0)
    fill.data.size = 3.5
    look_at(fill, (0.0, 0.0, 1.0))

    bpy.ops.object.light_add(type="AREA", location=(0.0, -3.5, 3.3))
    rim = bpy.context.object
    rim.name = "SpellbladeReviewRim"
    rim.data.energy = 700
    rim.data.color = (0.75, 0.18, 0.12)
    rim.data.size = 3.0
    look_at(rim, (0.0, 0.0, 1.2))

    cameras: dict[str, bpy.types.Object] = {}
    camera_specs = {
        "front": (0.0, 5.8, 1.25),
        "back": (0.0, -5.8, 1.25),
        "side": (5.8, 0.0, 1.25),
        "quarter": (4.25, 4.25, 1.35),
    }
    for label, location in camera_specs.items():
        bpy.ops.object.camera_add(location=location)
        camera = bpy.context.object
        camera.name = f"SpellbladeReviewCamera.{label}"
        camera.data.lens = 58
        look_at(camera, (0.0, 0.0, 1.03))
        cameras[label] = camera
    return cameras


def _render_action_evidence(
    scene: bpy.types.Scene,
    armature: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
    cameras: dict[str, bpy.types.Object],
    out: Path,
) -> dict[str, Path]:
    animation_data = armature.animation_data
    if animation_data is None:
        raise ValueError("Spellblade action evidence requires armature animation data")

    old_resolution = (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage)
    old_samples = None
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        old_samples = scene.eevee.taa_render_samples
        scene.eevee.taa_render_samples = min(int(old_samples), 12)
    scene.render.resolution_x = 288
    scene.render.resolution_y = 288
    scene.render.resolution_percentage = 100

    paths: dict[str, Path] = {}
    try:
        for label, (action_name, frame, camera_name) in _ACTION_REVIEW_FRAMES.items():
            action = actions[action_name]
            animation_data.action = action
            scene.frame_set(frame)
            path = out / f"spellblade-{label}.png"
            render_still(scene, cameras[camera_name], path)
            paths[label] = path
    finally:
        animation_data.action = actions["Idle"]
        scene.frame_set(1)
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = old_resolution
        if old_samples is not None:
            scene.eevee.taa_render_samples = old_samples
    return paths


def build_character_assets(args: argparse.Namespace) -> None:
    _validate_revision(args.source_revision)
    contract = load_contract()
    first_person_source = Path(__file__).with_name("source") / "spellblade-first-person.blend"
    validate_output_paths((args.source, first_person_source), args.out)
    args.out.mkdir(parents=True, exist_ok=True)
    blender_version = bpy.app.version_string

    source_hash = hashlib.sha256(args.source.read_bytes()).hexdigest()
    armature, model, actions = load_authored_source(args.source, "SpellbladeExport")
    scene = bpy.context.scene
    configure_render(scene, args.mode)
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    validate_armature_names(armature)
    if set(actions) != set(contract["clips"]):
        raise ValueError("Authored third person actions must match the runtime contract")
    armature.animation_data.action = actions["Idle"]
    scene.frame_set(1)
    validation_proxy = _build_validation_proxy(armature)
    rig_report = validate_rig_scene(armature, validation_proxy)
    bpy.data.objects.remove(validation_proxy, do_unlink=True)
    model_report = validate_production_model(armature, model, contract)
    third_person_animations = list(actions.keys())

    glb_path = args.out / "spellblade.glb"
    export_glb(glb_path, objects=(armature, *model.objects))
    glb_bytes = glb_path.stat().st_size
    if glb_bytes > int(contract["thirdPerson"]["targetBytes"]):
        raise ValueError(
            f"Spellblade GLB exceeds target byte budget: {glb_bytes} > {contract['thirdPerson']['targetBytes']}"
        )

    cameras = {label: bpy.data.objects.get(f"SpellbladeReviewCamera.{label}") for label in ("front", "back", "side", "quarter")}
    if not all(cameras.values()):
        raise ValueError("Authored source requires fixed front, back, side and quarter review cameras")
    scene.frame_set(1)
    render_paths: dict[str, Path] = {}
    for label, camera in cameras.items():
        path = args.out / f"spellblade-neutral-{label}.png"
        render_still(scene, camera, path)
        render_paths[label] = path
    action_paths = _render_action_evidence(scene, armature, actions, cameras, args.out)

    blend_path = args.out / "spellblade-third-person.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    first_person = build_first_person_asset(args.out, contract, args.mode)
    if first_person.glb.name != _FIRST_PERSON_GLB:
        raise ValueError(f"unexpected first-person GLB name: {first_person.glb.name}")

    report_path = args.out / "spellblade-build-report.json"
    _write_report(report_path, {
        "schemaVersion": 1,
        "workerReady": True,
        "mode": args.mode,
        "visualStage": "authored-third-person-animated-with-first-person",
        "sourceRevision": args.source_revision,
        "authoredSource": {"file": args.source.name, "sha256": source_hash},
        "firstPersonSource": {"file": "spellblade-first-person.blend", "sha256": hashlib.sha256((Path(__file__).with_name("source") / "spellblade-first-person.blend").read_bytes()).hexdigest()},
        "blenderVersion": blender_version,
        "contractVersion": contract["version"],
        "rig": rig_report,
        "model": model_report,
        "animations": third_person_animations,
        "firstPerson": {
            "triangles": first_person.triangles,
            "triangleBudget": first_person.triangle_budget,
            "animations": list(first_person.animations),
        },
        "outputs": {
            "blend": blend_path.name,
            "thirdPersonGlb": glb_path.name,
            "firstPersonBlend": first_person.blend.name,
            "firstPersonGlb": first_person.glb.name,
            "frontRender": render_paths["front"].name,
            "backRender": render_paths["back"].name,
            "sideRender": render_paths["side"].name,
            "quarterRender": render_paths["quarter"].name,
            "actionRenders": {label: path.name for label, path in action_paths.items()},
            "firstPersonRenders": {label: path.name for label, path in first_person.renders.items()},
        },
        "sizes": {
            "thirdPersonGlbBytes": glb_bytes,
            "thirdPersonTargetBytes": int(contract["thirdPerson"]["targetBytes"]),
            "firstPersonGlbBytes": first_person.glb_bytes,
            "firstPersonTargetBytes": first_person.target_bytes,
        },
    })
    print(
        f"SPELLBLADE_CHARACTER_ASSETS_OK report={report_path} thirdPerson={glb_path} "
        f"firstPerson={first_person.glb} tpTriangles={model_report['triangles']} "
        f"fpTriangles={first_person.triangles} tpBytes={glb_bytes} fpBytes={first_person.glb_bytes}"
    )


def main() -> None:
    args = parse_args()
    if args.mode == "bootstrap":
        bootstrap(args)
        return
    build_character_assets(args)


if __name__ == "__main__":
    main()
