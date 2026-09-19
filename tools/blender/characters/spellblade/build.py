from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.common.export import export_glb
from tools.blender.common.render import configure_render, look_at, render_still
from tools.blender.characters.spellblade.design import BODY_HEIGHT
from tools.blender.characters.spellblade.rig import build_armature, rigid_skin, validate_armature_names
from tools.blender.characters.spellblade.validate import load_contract, validate_rig_scene


_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build Swords & Sorcery Spellblade assets")
    parser.add_argument("--mode", choices=("bootstrap", "preview", "review"), default="bootstrap")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    return parser.parse_args(argv)


def _validate_revision(revision: str) -> None:
    if not _REVISION_RE.fullmatch(revision):
        raise ValueError("source revision must be a 40-character lowercase Git SHA")


def _write_report(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def bootstrap(args: argparse.Namespace) -> None:
    _validate_revision(args.source_revision)
    contract = load_contract()
    args.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_render(bpy.context.scene, "preview")

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


def _build_proxy(armature: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, BODY_HEIGHT / 2.0))
    proxy = bpy.context.object
    proxy.name = "RigProxy"
    proxy.scale = (0.36, 0.22, BODY_HEIGHT / 2.0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    proxy.data.materials.append(_proxy_material())
    rigid_skin(proxy, armature, "spine")
    return proxy


def _add_diagnostic_stage(scene: bpy.types.Scene) -> tuple[bpy.types.Object, bpy.types.Object]:
    floor_material = bpy.data.materials.new("RigDiagnosticFloor")
    floor_material.diffuse_color = (0.025, 0.03, 0.04, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, -0.002))
    floor = bpy.context.object
    floor.name = "RigDiagnosticFloor"
    floor.data.materials.append(floor_material)

    bpy.ops.object.light_add(type="AREA", location=(3.0, 4.0, 5.0))
    key = bpy.context.object
    key.name = "RigDiagnosticKey"
    key.data.energy = 900
    key.data.shape = "DISK"
    key.data.size = 4.0
    look_at(key, (0.0, 0.0, 1.05))

    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.5, 2.8))
    fill = bpy.context.object
    fill.name = "RigDiagnosticFill"
    fill.data.energy = 450
    fill.data.color = (0.25, 0.55, 1.0)
    fill.data.size = 3.0
    look_at(fill, (0.0, 0.0, 1.0))

    bpy.ops.object.camera_add(location=(0.0, 4.8, 1.18))
    front = bpy.context.object
    front.name = "RigDiagnosticFrontCamera"
    front.data.lens = 55
    look_at(front, (0.0, 0.0, 1.02))

    bpy.ops.object.camera_add(location=(4.8, 0.0, 1.18))
    side = bpy.context.object
    side.name = "RigDiagnosticSideCamera"
    side.data.lens = 55
    look_at(side, (0.0, 0.0, 1.02))

    scene.world.color = (0.012, 0.016, 0.024)
    return front, side


def build_rig_proxy(args: argparse.Namespace) -> None:
    _validate_revision(args.source_revision)
    contract = load_contract()
    args.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_render(bpy.context.scene, args.mode)

    armature = build_armature()
    validate_armature_names(armature)
    proxy = _build_proxy(armature)
    rig_report = validate_rig_scene(armature, proxy)

    glb_path = args.out / "spellblade.glb"
    export_glb(glb_path, objects=(armature, proxy))

    front_camera, side_camera = _add_diagnostic_stage(bpy.context.scene)
    front_path = args.out / "spellblade-rig-front.png"
    side_path = args.out / "spellblade-rig-side.png"
    render_still(bpy.context.scene, front_camera, front_path)
    render_still(bpy.context.scene, side_camera, side_path)

    blend_path = args.out / "spellblade-rig-proxy.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    report_path = args.out / "spellblade-build-report.json"
    _write_report(report_path, {
        "schemaVersion": 1,
        "workerReady": True,
        "mode": args.mode,
        "visualStage": "rig-proxy",
        "sourceRevision": args.source_revision,
        "blenderVersion": bpy.app.version_string,
        "contractVersion": contract["version"],
        "rig": rig_report,
        "outputs": {
            "blend": blend_path.name,
            "thirdPersonGlb": glb_path.name,
            "frontRender": front_path.name,
            "sideRender": side_path.name,
        },
        "sizes": {"thirdPersonGlbBytes": glb_path.stat().st_size},
    })
    print(f"SPELLBLADE_RIG_PROXY_OK report={report_path} glb={glb_path}")


def main() -> None:
    args = parse_args()
    if args.mode == "bootstrap":
        bootstrap(args)
        return
    build_rig_proxy(args)


if __name__ == "__main__":
    main()
