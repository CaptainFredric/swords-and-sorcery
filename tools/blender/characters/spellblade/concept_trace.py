from __future__ import annotations

from collections.abc import Sequence

import bpy

from .concept_refinement import _profile_slab
from .model import ModelParts, _rigid


# Source image supplied/approved for the Spellblade reconstruction. Coordinates
# below are measured in pixels from that exact 1448x1086 concept sheet rather
# than invented directly in Blender world space.
CONCEPT_REFERENCE_SIZE = (1448, 1086)
FRONT_VIEW_CROP_PX = (10, 20, 540, 720)
SIDE_VIEW_CROP_PX = (560, 10, 835, 370)
BACK_VIEW_CROP_PX = (560, 365, 835, 715)

# The front panel places the crest at about y=0 and the boot sole at y=690.
# Calibrating that pixel span to the authored hero height lets vertical armor
# landmarks come from the drawing itself. X is measured locally around each
# traced piece and then re-anchored to the stable skeleton, so the posed concept
# does not bake a wide combat stance into the neutral mesh.
_FRONT_WORLD_TOP_Z = 2.16
_FRONT_SOLE_Y_PX = 690.0
_FRONT_PX_TO_M = _FRONT_WORLD_TOP_Z / _FRONT_SOLE_Y_PX


FRONT_TRACE_PX: dict[str, tuple[tuple[float, float], ...]] = {
    "helmet_mask": (
        (300, 55), (383, 55), (405, 76), (410, 108), (393, 137),
        (368, 154), (345, 156), (320, 148), (296, 130), (286, 92),
    ),
    "breastplate": (
        (303, 170), (384, 168), (406, 194), (402, 232), (386, 280),
        (351, 301), (316, 283), (300, 242), (296, 203),
    ),
    "tabard": (
        (333, 292), (397, 292), (403, 508), (388, 536),
        (366, 548), (341, 530), (334, 510),
    ),
    # Left/image-side pauldron is the clearest shoulder drawing. It is mirrored
    # for the other side after preserving the traced local contour.
    "pauldron": (
        (212, 145), (253, 136), (282, 151), (292, 178), (281, 207),
        (250, 235), (207, 228), (181, 207), (190, 172),
    ),
    "greave": (
        (210, 474), (249, 481), (264, 519), (257, 565),
        (247, 611), (208, 613), (193, 557), (198, 503),
    ),
    "boot": (
        (190, 608), (249, 608), (266, 637), (261, 667),
        (247, 684), (186, 690), (165, 662), (171, 629),
    ),
}

# Side/back traces are kept alongside the front calibration so depth work can
# use the same source rather than a separate set of eyeballed proportions.
SIDE_TRACE_PX: dict[str, tuple[tuple[float, float], ...]] = {
    "helmet": ((102, 18), (154, 31), (174, 65), (165, 100), (126, 112), (96, 91), (91, 47)),
    "torso": ((84, 99), (153, 96), (176, 154), (163, 218), (105, 221), (82, 173)),
    "cape": ((70, 84), (96, 88), (101, 252), (82, 263), (67, 249)),
    "boot": ((82, 286), (145, 286), (169, 311), (158, 330), (88, 331), (75, 315)),
}

BACK_TRACE_PX: dict[str, tuple[tuple[float, float], ...]] = {
    "cape": ((92, 82), (179, 82), (188, 227), (169, 254), (139, 269), (108, 252), (89, 228)),
    "shoulder": ((69, 87), (94, 70), (116, 84), (112, 124), (83, 136), (62, 118)),
    "boot": ((62, 286), (109, 284), (119, 323), (103, 333), (55, 328), (48, 310)),
}


def _front_px_to_world(
    points: Sequence[tuple[float, float]],
    *,
    anchor_x_px: float,
    world_center_x: float,
    mirror_x: bool = False,
) -> tuple[tuple[float, float], ...]:
    """Convert traced front-view pixels into an authored X/Z profile."""
    sign = -1.0 if mirror_x else 1.0
    return tuple(
        (
            world_center_x + (x - anchor_x_px) * _FRONT_PX_TO_M * sign,
            _FRONT_WORLD_TOP_Z - y * _FRONT_PX_TO_M,
        )
        for x, y in points
    )


def _side_px_to_world(
    points: Sequence[tuple[float, float]],
    *,
    anchor_y_px: float,
    world_center_y: float,
    top_y_px: float = 18.0,
    sole_y_px: float = 331.0,
    world_top_z: float = 2.14,
) -> tuple[tuple[float, float], ...]:
    """Convert traced side-view pixels into Y/Z coordinates for depth checks."""
    scale = world_top_z / (sole_y_px - top_y_px)
    return tuple(
        (
            world_center_y + (x - anchor_y_px) * scale,
            world_top_z - (y - top_y_px) * scale,
        )
        for x, y in points
    )


def _replace_material(obj: bpy.types.Object | None, material: bpy.types.Material) -> None:
    if obj is None or obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _named(model: ModelParts, name: str) -> bpy.types.Object | None:
    return next((obj for obj in model.objects if obj.name == name), None)


def _trace_shell(
    name: str,
    profile_px: Sequence[tuple[float, float]],
    *,
    anchor_x_px: float,
    world_center_x: float,
    mirror_x: bool,
    center_y: float,
    thickness: float,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
) -> bpy.types.Object:
    profile = _front_px_to_world(
        profile_px,
        anchor_x_px=anchor_x_px,
        world_center_x=world_center_x,
        mirror_x=mirror_x,
    )
    shell = _profile_slab(
        name,
        profile,
        center_y=center_y,
        thickness=thickness,
        material=material,
    )
    return _rigid(shell, armature, bone)


def _retire_blockout_read(model: ModelParts) -> None:
    # Required legacy objects remain in the GLB for migration/validation, but
    # their bright materials no longer get to define the visible silhouette.
    # The traced shells sit in front of them and the old front-facing accents are
    # darkened so a slightly larger blockout piece does not win visually.
    for name in (
        "Breastplate", "BreastplateRidge",
        "Pauldron.L", "Pauldron.R", "PauldronLayer.L", "PauldronLayer.R",
        "Greave.L", "Greave.R", "Boot.L", "Boot.R", "BootToe.L", "BootToe.R",
    ):
        _replace_material(_named(model, name), model.materials["DarkSteel"])


def refine_traced_concept_geometry(armature: bpy.types.Object, model: ModelParts) -> ModelParts:
    """Overlay pixel-calibrated hero geometry measured from the concept sheet."""
    _retire_blockout_read(model)
    materials = model.materials
    additions: list[bpy.types.Object] = []

    additions.append(_trace_shell(
        "TracedHelmetMask", FRONT_TRACE_PX["helmet_mask"],
        anchor_x_px=348.0, world_center_x=0.0, mirror_x=False,
        center_y=0.345, thickness=0.042, material=materials["DarkSteel"],
        armature=armature, bone="head",
    ))
    additions.append(_trace_shell(
        "TracedBreastplate", FRONT_TRACE_PX["breastplate"],
        anchor_x_px=351.0, world_center_x=0.0, mirror_x=False,
        center_y=0.338, thickness=0.060, material=materials["SteelEdge"],
        armature=armature, bone="chest",
    ))
    additions.append(_trace_shell(
        "TracedTabardFront", FRONT_TRACE_PX["tabard"],
        anchor_x_px=366.0, world_center_x=0.0, mirror_x=False,
        center_y=0.365, thickness=0.030, material=materials["CrimsonCloth"],
        armature=armature, bone="tabard_front_01",
    ))

    pauldron_names = (("TracedPauldron.L", -0.535, False, "clavicle.L"),
                      ("TracedPauldron.R", 0.535, True, "clavicle.R"))
    for name, center_x, mirror, bone in pauldron_names:
        additions.append(_trace_shell(
            name, FRONT_TRACE_PX["pauldron"],
            anchor_x_px=236.0, world_center_x=center_x, mirror_x=mirror,
            center_y=0.260, thickness=0.165, material=materials["DarkSteel"],
            armature=armature, bone=bone,
        ))

    greave_names = (("TracedGreave.L", -0.210, False, "shin.L"),
                    ("TracedGreave.R", 0.210, True, "shin.R"))
    for name, center_x, mirror, bone in greave_names:
        additions.append(_trace_shell(
            name, FRONT_TRACE_PX["greave"],
            anchor_x_px=228.0, world_center_x=center_x, mirror_x=mirror,
            center_y=0.285, thickness=0.165, material=materials["DarkSteel"],
            armature=armature, bone=bone,
        ))

    boot_names = (("TracedBoot.L", -0.210, False, "foot.L"),
                  ("TracedBoot.R", 0.210, True, "foot.R"))
    for name, center_x, mirror, bone in boot_names:
        additions.append(_trace_shell(
            name, FRONT_TRACE_PX["boot"],
            anchor_x_px=216.0, world_center_x=center_x, mirror_x=mirror,
            center_y=0.455, thickness=0.105, material=materials["DarkSteel"],
            armature=armature, bone=bone,
        ))

    return ModelParts(objects=(*model.objects, *additions), materials=model.materials)
