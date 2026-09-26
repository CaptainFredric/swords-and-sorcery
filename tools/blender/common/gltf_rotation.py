"""Quaternion continuity for exported glTF rotation curves (pure Python, no bpy).

Blender's glTF exporter writes each rotation key with a non-negative w. A bone whose rotation sits near w = 0 (a
thigh pointing down, for example) then gets neighbouring keys in opposite hemispheres while the CUBICSPLINE
tangents stay in the original one, so the runtime's cubic interpolation swings through a wild rotation for a
frame. q and -q are the same rotation, so these helpers keep neighbouring keys in one hemisphere and rebuild the
tangents of any curve they had to touch.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

_JSON = 0x4E4F534A
_BIN = 0x004E4942
_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def _chunks(data: bytes) -> tuple[dict, int, int]:
    """(document, bin_start, bin_length) of a GLB."""
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != _JSON:
        raise ValueError("GLB first chunk must be JSON")
    document = json.loads(data[20:20 + json_length].rstrip(b" \x00"))
    offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<II", data, offset)
    if bin_type != _BIN:
        raise ValueError("GLB second chunk must be BIN")
    return document, offset + 8, bin_length


def _accessor_span(document: dict, index: int, bin_start: int) -> tuple[int, int, int]:
    accessor = document["accessors"][index]
    if accessor.get("componentType") != 5126:
        raise ValueError("rotation curves must be float")
    view = document["bufferViews"][accessor["bufferView"]]
    if view.get("byteStride") not in (None, 4 * _COMPONENTS[accessor["type"]]):
        raise ValueError("interleaved animation data is not supported")
    start = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return start, accessor["count"], _COMPONENTS[accessor["type"]]


def _read(data: bytes | bytearray, span: tuple[int, int, int]) -> list[list[float]]:
    start, count, comps = span
    flat = struct.unpack_from(f"<{count * comps}f", data, start)
    return [list(flat[i * comps:(i + 1) * comps]) for i in range(count)]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def rotation_curves(document: dict):
    """(animation name, node index, sampler) for every rotation channel."""
    for animation in document.get("animations", []):
        for channel in animation.get("channels", []):
            target = channel.get("target", {})
            if target.get("path") == "rotation":
                yield animation.get("name", "<unnamed>"), target.get("node"), animation["samplers"][channel["sampler"]]


def discontinuities(path: Path) -> list[tuple[str, int, int]]:
    """(animation, node, key index) wherever a rotation key sits in the opposite hemisphere from the previous one."""
    data = path.read_bytes()
    document, bin_start, _ = _chunks(data)
    found = []
    for name, node, sampler in rotation_curves(document):
        cubic = sampler.get("interpolation") == "CUBICSPLINE"
        values = _read(data, _accessor_span(document, sampler["output"], bin_start))
        keys = [values[3 * i + 1] for i in range(len(values) // 3)] if cubic else values
        for i in range(1, len(keys)):
            if _dot(keys[i - 1], keys[i]) < 0:
                found.append((name, node, i))
    return found


def _clamped_tangents(times: list[float], keys: list[list[float]]) -> list[list[float]]:
    """per-component derivative (value per second), flat at the ends and wherever a component turns around --
    the same shape as Blender's auto-clamped handles."""
    n = len(keys)
    tangents = []
    for i in range(n):
        if i == 0 or i == n - 1:
            tangents.append([0.0] * len(keys[i]))
            continue
        row = []
        for c in range(len(keys[i])):
            before, here, after = keys[i - 1][c], keys[i][c], keys[i + 1][c]
            if (here - before) * (after - here) <= 0:
                row.append(0.0)
            else:
                row.append((after - before) / max(1e-6, times[i + 1] - times[i - 1]))
        tangents.append(row)
    return tangents


def fix_rotation_continuity(path: Path) -> int:
    """Rewrite the GLB in place so every rotation curve is hemisphere-continuous. Returns the curves changed."""
    data = bytearray(path.read_bytes())
    document, bin_start, _ = _chunks(bytes(data))
    changed = 0
    for _name, _node, sampler in rotation_curves(document):
        cubic = sampler.get("interpolation") == "CUBICSPLINE"
        out_span = _accessor_span(document, sampler["output"], bin_start)
        values = _read(data, out_span)
        times = [t[0] for t in _read(data, _accessor_span(document, sampler["input"], bin_start))]
        keys = [values[3 * i + 1] for i in range(len(values) // 3)] if cubic else values
        flipped = False
        for i in range(1, len(keys)):
            if _dot(keys[i - 1], keys[i]) < 0:
                keys[i] = [-x for x in keys[i]]
                flipped = True
        if not flipped:
            continue
        changed += 1
        if cubic:
            tangents = _clamped_tangents(times, keys)
            values = []
            for key, tangent in zip(keys, tangents):
                values += [tangent, key, tangent]
        else:
            values = keys
        start, count, comps = out_span
        struct.pack_into(f"<{count * comps}f", data, start, *[x for row in values for x in row])
    if changed:
        path.write_bytes(bytes(data))
    return changed


if __name__ == "__main__":
    import sys
    for arg in sys.argv[1:]:
        print(arg, "curves fixed:", fix_rotation_continuity(Path(arg)), "remaining:", len(discontinuities(Path(arg))))
