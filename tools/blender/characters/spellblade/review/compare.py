"""Concept comparison sheets and a proportion report for the Spellblade source.

Run from the repository root:

    blender --background --factory-startup --python-exit-code 1 \
      --python tools/blender/characters/spellblade/review/compare.py -- \
      --out artifacts/spellblade-review [--views front,side,back,helmet] [--engine CYCLES]

For each view it renders the saved source through a camera matched to the
concept panel and writes `<view>.png`: concept crop | model render | concept
with the model silhouette traced over it. The trace is registered on the
helmet top and the ground, so size and proportion differences read directly.
`proportions.json` compares landmark ratios measured on the rest-pose meshes
with the hand-annotated concept landmarks in `concept_views.json`.

This is review evidence only. It never saves the source file.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[5]
SOURCE = ROOT / "tools/blender/characters/spellblade/source/spellblade-third-person.blend"
VIEWS = Path(__file__).with_name("concept_views.json")
SHEET_HEIGHT = 720
BACKGROUND = np.array([0.075, 0.085, 0.11, 1.0], dtype=np.float32)
TRACE = np.array([0.2, 1.0, 1.0, 1.0], dtype=np.float32)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render Spellblade concept comparison sheets")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--views", default="front,side,back,helmet")
    parser.add_argument("--engine", default="BLENDER_EEVEE_NEXT", help="CYCLES works without a GPU context")
    parser.add_argument("--samples", type=int, default=32)
    return parser.parse_args(argv)


# Image helpers: Blender stores pixels bottom-up as float RGBA.
def load_rgba(path: Path) -> np.ndarray:
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)[::-1].copy()


def save_rgba(array: np.ndarray, path: Path) -> None:
    height, width = array.shape[:2]
    image = bpy.data.images.new(path.stem, width, height, alpha=True)
    image.pixels.foreach_set(np.ascontiguousarray(array[::-1]).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def resize(array: np.ndarray, height: int) -> np.ndarray:
    scale = height / array.shape[0]
    width = max(1, round(array.shape[1] * scale))
    ys = np.clip(((np.arange(height) + 0.5) / scale).astype(int), 0, array.shape[0] - 1)
    xs = np.clip(((np.arange(width) + 0.5) / scale).astype(int), 0, array.shape[1] - 1)
    return array[ys][:, xs]


def over_background(render: np.ndarray) -> np.ndarray:
    alpha = render[..., 3:4]
    out = render * alpha + BACKGROUND * (1.0 - alpha)
    out[..., 3] = 1.0
    return out


def outline(mask: np.ndarray) -> np.ndarray:
    inner = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        inner &= np.roll(np.roll(mask, dy, 0), dx, 1)
    edge = mask & ~inner
    return edge | np.roll(edge, 1, 0) | np.roll(edge, 1, 1)


# Scene setup
def mesh_objects(collection: str = "SpellbladeExport") -> list[bpy.types.Object]:
    return [obj for obj in bpy.data.collections[collection].all_objects if obj.type == "MESH"]


def place_camera(scene: bpy.types.Scene, spec: dict) -> bpy.types.Object:
    data = bpy.data.cameras.new("ConceptMatch")
    data.lens = spec["lens"]
    camera = bpy.data.objects.new("ConceptMatch", data)
    scene.collection.objects.link(camera)
    azimuth = math.radians(spec["azimuth"])
    camera.location = (math.sin(azimuth) * spec["distance"], math.cos(azimuth) * spec["distance"], spec["height"])
    direction = Vector((0.0, 0.0, spec["target"])) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def evaluated_bounds(objects, depsgraph):
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    return points


def projected_registration(scene, camera, depsgraph, width, height):
    """Pixel positions (top-down) of the posed helmet top and the ground under it."""
    shell = evaluated_bounds([bpy.data.objects["HelmetShell"]], depsgraph)
    top = max(shell, key=lambda p: p.z)
    head = Vector((sum(p.x for p in shell) / len(shell), sum(p.y for p in shell) / len(shell), top.z))
    ground = Vector((head.x, head.y, 0.0))

    def pixel(point):
        ndc = world_to_camera_view(scene, camera, point)
        return ndc.x * width, (1.0 - ndc.y) * height

    return pixel(head), pixel(ground)


def render_view(scene, spec, out: Path, engine: str, samples: int) -> np.ndarray:
    scene.render.engine = engine
    if engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    elif hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = samples
    crop = spec["crop"]
    aspect = (crop[2] - crop[0]) / (crop[3] - crop[1])
    scene.render.resolution_y = 900
    scene.render.resolution_x = max(64, round(900 * aspect))
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.camera = place_camera(scene, spec["camera"])
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    return load_rgba(out)


def sheet_for_view(name, spec, concept, render, registration) -> np.ndarray:
    x0, y0, x1, y1 = spec["crop"]
    panel = concept[y0:y1, x0:x1]
    marks = spec["landmarks"]
    trace = panel * 0.55
    trace[..., 3] = 1.0
    if {"top", "ground", "headX"} <= set(marks):
        (head_x, head_y), (_, ground_y) = registration
        scale = (marks["ground"] - marks["top"]) / max(1e-6, ground_y - head_y)
        mask = render[..., 3] > 0.5
        ys, xs = np.mgrid[0:panel.shape[0], 0:panel.shape[1]]
        src_y = ((ys + y0 - marks["top"]) / scale + head_y).astype(int)
        src_x = ((xs + x0 - marks["headX"]) / scale + head_x).astype(int)
        valid = (src_y >= 0) & (src_y < mask.shape[0]) & (src_x >= 0) & (src_x < mask.shape[1])
        warped = np.zeros(panel.shape[:2], dtype=bool)
        warped[valid] = mask[src_y[valid], src_x[valid]]
        trace[outline(warped)] = TRACE
    parts = [resize(panel, SHEET_HEIGHT), resize(over_background(render), SHEET_HEIGHT), resize(trace, SHEET_HEIGHT)]
    gap = np.tile(BACKGROUND, (SHEET_HEIGHT, 8, 1))
    return np.concatenate([parts[0], gap, parts[1], gap, parts[2]], axis=1)


# Proportions
def rest_bounds(names):
    points = [bpy.data.objects[n].matrix_world @ v.co for n in names for v in bpy.data.objects[n].data.vertices]
    return (Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)]))


def model_ratios() -> dict:
    rig = bpy.data.objects["SpellbladeRig"]
    ground = min((o.matrix_world @ v.co).z for o in mesh_objects() for v in o.data.vertices)
    top = rest_bounds(["HelmetShell"])[1].z
    height = top - ground
    chin = rest_bounds(["HelmetJaw", "HelmetCheek.L", "HelmetCheek.R"])[0].z
    belt = sum(rest_bounds(["Belt"])[i].z for i in range(2)) / 2
    knee = (rig.matrix_world @ rig.data.bones["shin.L"].head_local).z
    shoulders = rest_bounds(["Pauldron.L", "Pauldron.R"])
    tabard = rest_bounds(["TabardFront"])
    banner = rest_bounds(["TabardBack"])
    return {
        "headHeights": height / (top - chin),
        "beltHeight": (belt - ground) / height,
        "kneeHeight": (knee - ground) / height,
        "shoulderSpan": (shoulders[1].x - shoulders[0].x) / height,
        "tabardWidth": (tabard[1].x - tabard[0].x) / height,
        "tabardHem": (tabard[0].z - ground) / height,
        "bannerWidth": (banner[1].x - banner[0].x) / height,
        "bannerHem": (banner[0].z - ground) / height,
    }


def concept_ratios(marks: dict) -> dict:
    height = marks["ground"] - marks["top"]
    ratios = {"headHeights": height / (marks["chin"] - marks["top"])}
    for key, name in (("belt", "beltHeight"), ("knee", "kneeHeight"), ("tabardHem", "tabardHem"), ("bannerHem", "bannerHem")):
        if key in marks:
            ratios[name] = (marks["ground"] - marks[key]) / height
    for key, name in (("shoulders", "shoulderSpan"), ("tabard", "tabardWidth"), ("banner", "bannerWidth")):
        if key in marks:
            ratios[name] = (marks[key][1] - marks[key][0]) / height
    return ratios


def main() -> None:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    spec = json.loads(VIEWS.read_text())
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    scene = bpy.context.scene
    floor = bpy.data.objects.get("SpellbladeReviewFloor")
    if floor:
        floor.hide_render = True
    concept = load_rgba(ROOT / spec["concept"])
    depsgraph = bpy.context.evaluated_depsgraph_get()

    for name in [v.strip() for v in args.views.split(",") if v.strip()]:
        view = spec["views"][name]
        render = render_view(scene, view, args.out / f"{name}-render.png", args.engine, args.samples)
        registration = projected_registration(scene, scene.camera, depsgraph, render.shape[1], render.shape[0])
        save_rgba(sheet_for_view(name, view, concept, render, registration), args.out / f"{name}.png")
        print(f"SPELLBLADE_REVIEW_SHEET {args.out / f'{name}.png'}")

    model = model_ratios()
    report = {"model": {k: round(v, 3) for k, v in model.items()}, "concept": {}}
    for name, view in spec["views"].items():
        marks = view["landmarks"]
        if {"top", "chin", "ground"} <= set(marks):
            report["concept"][name] = {k: round(v, 3) for k, v in concept_ratios(marks).items()}
    (args.out / "proportions.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{'ratio':<14}{'model':>8}" + "".join(f"{v:>9}" for v in report["concept"]))
    for key, value in report["model"].items():
        row = "".join(f"{report['concept'][v].get(key, float('nan')):>9.3f}" for v in report["concept"])
        print(f"{key:<14}{value:>8.3f}{row}")


if __name__ == "__main__":
    main()
