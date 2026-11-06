"""Cape textures for the earned emblems (run after build_source.py, on the built source).

    blender <source.blend> --background --factory-startup --python-exit-code 1 \
      --python tools/blender/characters/spellblade/rodin/emblems.py -- --out client/assets/heraldry

The cape (TabardBack, material CapeBanner) is laid out in the body atlas. client/game/emblemBanner.mjs swaps the cape
material's map for an emblem's texture (shared/src/heraldry.mjs, banners.CapeBanner), so each emblem texture is the
atlas with the cape alone kept: its old painted charge replaced by the emblem, everything outside the cape's UV islands a
flat grey that costs almost nothing to store.

On the cape's outer face each texel is placed back on the cloth (its position across and down the cape), so the
trident is found and the emblem drawn in the cape's own proportions, however Rodin's islands are cut and turned.
"""
from __future__ import annotations

import argparse
import sys
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
# emblem id: (its mark, the cape texture heraldry.mjs names for it)
EMBLEMS = {
    "grimoirelee": (ROOT / "client/assets/heraldry/grimoirelee.svg", "grimoirelee-cape.jpg"),
    "seize_thy_slayer": (ROOT / "client/assets/heraldry/seize-thy-slayer.png", "seize-thy-slayer-cape.jpg"),
    "st_perry_the_plain": (HERE / "emblem-st-perry-the-plain.png", "st-perry-the-plain-cape.jpg"),
}
BORDER = 0.06      # the cape's painted border, kept clear (m)
MARK_HEIGHT = 1.2  # the emblem's height against the trident's
JPEG_QUALITY = 88


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Write the emblem cape textures")
    parser.add_argument("--out", type=Path, default=ROOT / "client/assets/heraldry")
    return parser.parse_args(argv)


def load_svg_rgba(path: Path) -> np.ndarray:
    """Rasterize official vector contours in Blender's Python without installing SVG/Pillow addons.

    Input uses the approved artwork's unmodified 520x880 viewBox and even-odd
    holes (sword groove, two scars, page linework, bookmark diamond).
    Return bottom-up float32 RGBA, like bpy.data.images.
    """
    root = ET.parse(path).getroot()
    svg_path = root.find(".//{http://www.w3.org/2000/svg}g/{http://www.w3.org/2000/svg}path")
    if svg_path is None:
        raise ValueError("Official Grimoirelee vector path not found")
    width, height = 520, 880
    mask = np.zeros((height, width), dtype=bool)
    for fragment in re.findall(r"M([^Z]+)Z", svg_path.attrib["d"]):
        points = np.array([(int(x) - 250, int(y) - 75)
                           for x, y in re.findall(r"(-?\d+),(-?\d+)", fragment)], dtype=np.float64)
        if len(points) < 3:
            continue
        low = max(0, int(np.floor(points[:, 1].min())))
        high = min(height, int(np.ceil(points[:, 1].max())))
        for row in range(low, high):
            scan_y = row + .5
            xs = []
            for a, b in zip(points, np.roll(points, -1, axis=0)):
                if (a[1] <= scan_y < b[1]) or (b[1] <= scan_y < a[1]):
                    xs.append(a[0] + (scan_y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
            xs.sort()
            for left, right in zip(xs[::2], xs[1::2]):
                x0, x1 = max(0, int(np.ceil(left))), min(width, int(np.ceil(right)))
                if x1 > x0:
                    mask[row, x0:x1] ^= True
    out = np.zeros((height, width, 4), dtype=np.float32)
    out[..., :3] = np.array([0.90, 0.78, 0.53], dtype=np.float32)
    out[..., 3] = mask
    return out[::-1].copy()  # Blender stores its image bottom row first


def load_rgba(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".svg":
        return load_svg_rgba(path)
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)          # bottom row first, as Blender stores it


def rasterize(uv_px: np.ndarray, values: np.ndarray, size: int):
    """Per texel (bottom-up rows): covered?, and the per-corner values interpolated there."""
    covered = np.zeros((size, size), dtype=bool)
    out = np.zeros((size, size, values.shape[-1]))
    for (a, b, c), vals in zip(uv_px, values):
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-3) & (l2 >= -1e-3) & (l3 >= -1e-3)
        if not inside.any():
            continue
        rows, cols = (ys[inside] - 0.5).astype(int), (xs[inside] - 0.5).astype(int)
        covered[rows, cols] = True
        out[rows, cols] = (l1[inside, None] * vals[0] + l2[inside, None] * vals[1] + l3[inside, None] * vals[2])
    return covered, out


def dilate(mask: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def sample(image: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Bilinear RGBA of an image (bottom-up rows) at 0..1 coordinates (v up)."""
    height, width = image.shape[:2]
    x = np.clip(u * width - 0.5, 0, width - 1.001)
    y = np.clip(v * height - 0.5, 0, height - 1.001)
    x0, y0 = x.astype(int), y.astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return ((image[y0, x0] * (1 - fx) + image[y0, x0 + 1] * fx) * (1 - fy)
            + (image[y0 + 1, x0] * (1 - fx) + image[y0 + 1, x0 + 1] * fx) * fy)


def main() -> None:
    args = parse_args()
    cape = bpy.data.objects["TabardBack"]
    mesh = cape.data
    atlas_image = next(n.image for n in bpy.data.materials["CapeBanner"].node_tree.nodes
                       if n.type == "TEX_IMAGE" and n.image.name == "RodinDiffuse")
    size = atlas_image.size[0]
    atlas = np.empty(size * size * 4, dtype=np.float32)
    atlas_image.pixels.foreach_get(atlas)
    atlas = atlas.reshape(size, size, 4)

    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ np.array(cape.matrix_world)[:3, :3].T + np.array(cape.matrix_world)[:3, 3]
    loop_vertex = np.empty(len(mesh.loops), dtype=int)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    uv = np.empty(len(mesh.loops) * 2)
    mesh.uv_layers.active.data.foreach_get("uv", uv)
    tris = loop_vertex.reshape(-1, 3)
    uv_px = uv.reshape(-1, 3, 2) * size
    normals = np.empty(len(mesh.polygons) * 3)
    mesh.polygons.foreach_get("normal", normals)
    normals = normals.reshape(-1, 3)
    centres = co[tris].mean(1)
    # the outer face: turned away from the body's axis
    outer = np.einsum("ij,ij->i", normals[:, :2], centres[:, :2] - np.array([0.0, 0.02])) > 0

    everything, _ = rasterize(uv_px, np.zeros((len(tris), 3, 1)), size)
    on_cloth, place = rasterize(uv_px[outer], co[tris[outer]][:, :, [0, 2]], size)     # (x across, z down the cape)
    keep = dilate(everything, 6)

    rgb = atlas[..., :3]
    lum = rgb.mean(-1)
    x, z = place[..., 0], place[..., 1]
    rows = np.round(z / 0.02)
    edges = {r: (x[on_cloth][rows[on_cloth] == r].min(), x[on_cloth][rows[on_cloth] == r].max())
             for r in np.unique(rows[on_cloth])}
    low = np.vectorize(lambda r: edges.get(r, (np.inf, -np.inf))[0])(rows)
    high = np.vectorize(lambda r: edges.get(r, (np.inf, -np.inf))[1])(rows)
    top, hem = z[on_cloth].max(), z[on_cloth].min()
    interior = on_cloth & (x > low + BORDER) & (x < high - BORDER) & (z < top - 0.02) & (z > hem + 0.25)
    field = np.median(rgb[interior], axis=0)
    cream = interior & (lum > field.mean() * 1.55) & (rgb[..., 0] / np.maximum(rgb[..., 1], 1e-3) < 1.5)
    # the trident: the largest connected cream shape on the cloth (on a 1 cm grid across and down the cape)
    cell = np.floor(np.c_[x[cream], z[cream]] / 0.01).astype(int)
    cells = {tuple(c) for c in cell}
    best: set = set()
    seen: set = set()
    for start in cells:
        if start in seen:
            continue
        stack, blob = [start], set()
        seen.add(start)
        while stack:
            cx, cz = stack.pop()
            blob.add((cx, cz))
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    other = (cx + dx, cz + dz)
                    if other in cells and other not in seen:
                        seen.add(other)
                        stack.append(other)
        if len(blob) > len(best):
            best = blob
    if len(best) < 20:
        raise ValueError("the cape's trident was not found")
    blob = np.array(sorted(best)) * 0.01
    x0, z0 = blob.min(0)
    x1, z1 = blob.max(0) + 0.01
    sign_height = z1 - z0
    centre = np.array([(x0 + x1) / 2, (z0 + z1) / 2])
    sign = cream & (x >= x0) & (x <= x1) & (z >= z0) & (z <= z1)
    sign_colour = np.median(rgb[sign], axis=0)
    width_here = float(np.median((high - low)[interior & (np.abs(z - centre[1]) < 0.05)])) - 2 * BORDER

    # the trident painted out: everything lighter than the cloth around it, with a margin, and the surrounding
    # cloth diffused in, keeping its shading's gradients
    # (up to the cloth's top edge: the trident's top prong reaches into the strip the interior leaves clear)
    across = on_cloth & (x > low + BORDER) & (x < high - BORDER) & (z > hem + 0.25)
    box = across & (x >= x0 - 0.03) & (x <= x1 + 0.03) & (z >= z0 - 0.03) & (z <= z1 + 0.08)
    # (lighter than the cloth, or less red than it: the trident's shaded and anti-aliased edges are both)
    redness = rgb[..., 0] / np.maximum(rgb[..., 1], 1e-3)
    unlike = (lum > field.mean() * 1.2) | (redness < field[0] / max(field[1], 1e-3) * 0.85)
    hole = dilate(box & unlike, 4) & across
    filled = rgb.copy()
    filled[hole] = field
    for _ in range(400):
        blur = filled.copy()
        blur[1:-1, 1:-1] = (filled[:-2, 1:-1] + filled[2:, 1:-1] + filled[1:-1, :-2] + filled[1:-1, 2:]) / 4
        filled[hole] = blur[hole]

    report = {}
    for emblem, (mark_path, name) in EMBLEMS.items():
        mark = load_rgba(mark_path)
        mark_h, mark_w = mark.shape[:2]
        height = sign_height * MARK_HEIGHT
        scale = min(height / mark_h, width_here / mark_w)            # metres per mark pixel
        # (where the trident was, kept inside the cloth's interior)
        middle = min(centre[1], top - 0.04 - mark_h * scale / 2)
        u = (x - centre[0]) / (mark_w * scale) + 0.5
        v = (z - middle) / (mark_h * scale) + 0.5
        inside = on_cloth & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        stamp = sample(mark, u[inside], v[inside])
        colours = stamp[:, :3]
        solid = stamp[:, 3] > 0.5
        if colours[solid].std(0).max() < 0.06:                       # a one-colour mark: in the trident's colour
            colours = np.broadcast_to(sign_colour, colours.shape)
        else:                                                        # artwork: as bright against this cloth
            colours = np.clip(colours * np.clip(field.mean() / 0.17, 0.8, 1.25), 0, 1)
        out = np.full((size, size, 4), 0.5, dtype=np.float32)
        out[..., 3] = 1.0
        out[keep, :3] = filled[keep]
        alpha = stamp[:, 3:4]
        out[inside, :3] = out[inside, :3] * (1 - alpha) + colours * alpha
        image = bpy.data.images.new(f"cape_{emblem}", size, size, alpha=False)
        image.pixels.foreach_set(out.ravel())
        path = args.out / name
        image.filepath_raw = str(path)
        image.file_format = "JPEG"
        image.save(filepath=str(path), quality=JPEG_QUALITY)
        bpy.data.images.remove(image)
        report[emblem] = {"file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
                          "markMeters": [round(mark_w * scale, 3), round(mark_h * scale, 3)]}
    print("RODIN_EMBLEMS", {"trident": {"centre": centre.round(3).tolist(), "height": round(float(sign_height), 3),
                                        "width": round(float(x1 - x0), 3)},
                            **report})


if __name__ == "__main__":
    main()
