"""Materials and textures for the game's lighting (stage 4 of build_source.py).

Rodin's one material becomes the materials the runtime looks for by name:

- GameBody: every armour part and the sword. The runtime (client/game/plateEnvironment.mjs) gives this material a soft
  sky to reflect and raises its metalness by 1.25, expecting the build to have cut the source's metalness to a sixth;
  steelSheen.mjs hardens it when the knight is sheathed in steel.
- CapeBanner: the cape (TabardBack). The same atlas, so it adds no bytes; emblemBanner.mjs swaps its map for an
  emblem's cape texture (made from this atlas by emblems.py).
- VisorGlow: the visor glass, emissive with its own painted glow; the runtime sets its emissive intensity.
- SorceryAccent: the kit's palm rune keeps it.

The atlas is cut to 1024 px. Its diffuse is lifted for the game's light (no environment map in most scenes, a
hemisphere and a sun): Rodin painted shading into the diffuse, which read muddy and dark in game.

Bytes: the textures are WebP (EXT_texture_webp, which three.js reads), a third smaller than JPEG at the same quality;
the metal-roughness map is smooth and goes to 256 px; Rodin's normal map is dropped (nine texels in ten tilt the
surface by under 2.6 degrees, so it carried almost nothing). The gzipped character stays inside the 800 KB the
static server test allows.
"""
from __future__ import annotations

from pathlib import Path

import bpy
import numpy as np

SIZE = {"RodinDiffuse": 1024, "RodinMetalRough": 256}
QUALITY = {"RodinDiffuse": 85, "RodinMetalRough": 85}      # WebP
GAMMA, GAIN = 0.8, 1.12          # diffuse lift: rgb ** GAMMA * GAIN
METAL_SCALE = 1 / 6              # the runtime multiplies metalness back up by 1.25
VISOR_EMISSION = 1.6


def _pixels(image) -> np.ndarray:
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)


def _finish(image, name: str, pixels: np.ndarray, work: Path, colorspace: str) -> bpy.types.Image:
    """Write processed pixels as a WebP and pack that file, so the GLB carries it as it is."""
    height, width = pixels.shape[:2]
    scratch = bpy.data.images.new(name + "_scratch", width, height, alpha=False, float_buffer=False)
    scratch.colorspace_settings.name = colorspace
    scratch.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    path = work / f"{name}.webp"
    # (Image.save writes the pixels as they are; save_render would pass them through the scene's view transform)
    scratch.filepath_raw = str(path)
    scratch.file_format = "WEBP"
    scratch.save(filepath=str(path), quality=QUALITY[name])
    bpy.data.images.remove(scratch)
    packed = bpy.data.images.load(str(path), check_existing=False)
    packed.name = name
    packed.colorspace_settings.name = colorspace
    packed.pack()
    packed.filepath_raw = f"//{name}.webp"
    return packed


def _resized(image, name: str) -> np.ndarray:
    image.scale(SIZE[name], SIZE[name])
    return _pixels(image)


def build_look(work: Path) -> dict:
    work.mkdir(parents=True, exist_ok=True)
    body = bpy.data.objects["Breastplate"].data.materials[0]
    body.name = "GameBody"
    nodes = body.node_tree.nodes
    links = body.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")

    def source(socket):
        link = next(l for l in links if l.to_socket == socket)
        node = link.from_node
        while node.type != "TEX_IMAGE":
            node = next(l.from_node for l in links if l.to_node == node)
        return node

    diffuse_node = source(bsdf.inputs["Base Color"])
    metal_node = source(bsdf.inputs["Metallic"])
    normal_node = source(bsdf.inputs["Normal"])
    old = {diffuse_node.image, metal_node.image, normal_node.image}

    diffuse = _resized(diffuse_node.image, "RodinDiffuse")
    diffuse[..., :3] = np.clip(diffuse[..., :3] ** GAMMA * GAIN, 0.0, 1.0)
    diffuse_node.image = _finish(diffuse_node.image, "RodinDiffuse", diffuse, work, "sRGB")
    metal = _resized(metal_node.image, "RodinMetalRough")
    metal[..., 2] *= METAL_SCALE                     # glTF: metalness in blue, roughness in green
    metal_node.image = _finish(metal_node.image, "RodinMetalRough", metal, work, "Non-Color")
    # the normal map goes, with the node that read it
    map_node = next(l.from_node for l in links if l.to_socket == bsdf.inputs["Normal"])
    nodes.remove(normal_node)
    nodes.remove(map_node)
    for image in old:
        if image.users == 0:
            bpy.data.images.remove(image)

    cape = body.copy()
    cape.name = "CapeBanner"
    bpy.data.objects["TabardBack"].data.materials[0] = cape

    visor = bpy.data.materials["VisorGlow"]
    visor.use_nodes = True
    tree = visor.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = diffuse_node.image
    tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    tree.links.new(texture.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = VISOR_EMISSION
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.5
    tree.links.new(shader.outputs["BSDF"], out.inputs["Surface"])
    bpy.data.objects["Visor"].data.materials[0] = visor

    # the kit's own materials and textures are no longer used by anything exported
    for material in [m for m in bpy.data.materials if m.name in ("KitMetal", "KitMatte", "KitBanner")]:
        bpy.data.materials.remove(material)
    for image in [i for i in bpy.data.images if i.name in ("KitMetalWear", "KitMatteWear", "SpellbladeBanner")]:
        bpy.data.images.remove(image)
    return {"textures": SIZE, "grade": [GAMMA, GAIN], "metalScale": round(METAL_SCALE, 4),
            "materials": sorted({m.name for o in bpy.data.collections["SpellbladeExport"].all_objects
                                 if o.type == "MESH" for m in o.data.materials if m})}
