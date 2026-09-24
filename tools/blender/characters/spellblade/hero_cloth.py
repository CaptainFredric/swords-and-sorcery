from __future__ import annotations

from collections.abc import Sequence

import bpy

from .hero_shells import _mesh_object, _replace_named
from .model import ModelParts, _rigid


# Each row is (z, half_width, center_y). The front surface receives a small
# alternating center fold so the cloth reads as faceted fabric in side/quarter
# views rather than a single extruded card.
ClothRow = tuple[float, float, float]


def _folded_panel(
    name: str,
    rows: Sequence[ClothRow],
    *,
    thickness: float,
    center_fold: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    if len(rows) < 2:
        raise ValueError(f"{name} needs at least two cloth rows")

    vertices: list[tuple[float, float, float]] = []
    # Three vertices across each row: left edge, center ridge, right edge.
    for index, (z, half_width, center_y) in enumerate(rows):
        fold = center_fold if index % 2 == 0 else center_fold * 0.45
        vertices.extend((
            (-half_width, center_y, z),
            (0.0, center_y + fold, z),
            (half_width, center_y, z),
        ))
    front_count = len(vertices)
    for index, (z, half_width, center_y) in enumerate(rows):
        fold = center_fold if index % 2 == 0 else center_fold * 0.45
        vertices.extend((
            (-half_width, center_y - thickness, z),
            (0.0, center_y + fold - thickness, z),
            (half_width, center_y - thickness, z),
        ))

    faces: list[tuple[int, ...]] = []
    row_width = 3
    row_count = len(rows)

    # Front and rear strips.
    for row in range(row_count - 1):
        a = row * row_width
        b = (row + 1) * row_width
        faces.extend((
            (a, a + 1, b + 1, b),
            (a + 1, a + 2, b + 2, b + 1),
        ))

        ra = front_count + a
        rb = front_count + b
        faces.extend((
            (ra, rb, rb + 1, ra + 1),
            (ra + 1, rb + 1, rb + 2, ra + 2),
        ))

    # Edge walls and top/bottom caps.
    for row in range(row_count - 1):
        a = row * row_width
        b = (row + 1) * row_width
        ra = front_count + a
        rb = front_count + b
        faces.append((a, b, rb, ra))
        faces.append((a + 2, ra + 2, rb + 2, b + 2))

    top = (row_count - 1) * row_width
    rtop = front_count + top
    faces.extend((
        (0, front_count, front_count + 1, 1),
        (1, front_count + 1, front_count + 2, 2),
        (top, top + 1, rtop + 1, rtop),
        (top + 1, top + 2, rtop + 2, rtop + 1),
    ))

    return _mesh_object(name, vertices, faces, material)


def rebuild_hero_cloth(
    model: ModelParts,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Replace flat tabard/cape slabs with tapered, folded low-poly cloth."""
    front = _folded_panel(
        "TabardFront",
        (
            (0.370, 0.125, 0.292),
            (0.555, 0.145, 0.286),
            (0.790, 0.155, 0.275),
            (1.030, 0.160, 0.258),
        ),
        thickness=0.028,
        center_fold=0.024,
        material=materials["CrimsonCloth"],
    )
    front = _rigid(front, armature, "tabard_front_01")

    back = _folded_panel(
        "TabardBack",
        (
            (0.420, 0.170, -0.330),
            (0.720, 0.195, -0.325),
            (1.050, 0.215, -0.305),
            (1.360, 0.225, -0.270),
            (1.555, 0.215, -0.245),
        ),
        thickness=0.032,
        center_fold=-0.030,
        material=materials["CrimsonCloth"],
    )
    back = _rigid(back, armature, "tabard_back_01")

    return _replace_named(
        model,
        (front, back),
        {"TabardFront", "TabardBack"},
    )
