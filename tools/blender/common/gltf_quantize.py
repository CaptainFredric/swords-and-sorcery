"""Smaller vertex data for exported GLBs (pure Python, no bpy).

Blender writes every vertex attribute as 32-bit floats. Normals, texture coordinates and skin weights don't need that
precision, and float normals barely compress, so the character GLBs were mostly normals. This rewrites them as
normalized integers (KHR_mesh_quantization, which three.js reads natively):

- NORMAL: signed bytes (4 per vertex with padding, from 12): direction error under half a degree.
- TEXCOORD_n with every coordinate in 0..1: unsigned shorts (4 per vertex, from 8): 1/65535 of the texture.
- WEIGHTS_0: unsigned bytes that still sum to exactly 255 (4 per vertex, from 16).

Positions stay floats: the validators read their bounds, and exact positions survive a round trip.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

_JSON = 0x4E4F534A
_BIN = 0x004E4942
_FLOAT, _BYTE, _UBYTE, _USHORT = 5126, 5120, 5121, 5123
_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
EXTENSION = "KHR_mesh_quantization"


def _read(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != _JSON:
        raise ValueError("GLB first chunk must be JSON")
    document = json.loads(data[20:20 + json_length].rstrip(b" \x00"))
    offset = 20 + json_length
    if offset + 8 > len(data):
        return document, b""
    bin_length, bin_type = struct.unpack_from("<II", data, offset)
    if bin_type != _BIN:
        raise ValueError("GLB second chunk must be BIN")
    return document, data[offset + 8:offset + 8 + bin_length]


def _write(path: Path, document: dict, binary: bytes) -> None:
    payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    payload += b" " * (-len(payload) % 4)
    binary += b"\x00" * (-len(binary) % 4)
    total = 12 + 8 + len(payload) + 8 + len(binary)
    out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(payload), _JSON) + payload
    out += struct.pack("<II", len(binary), _BIN) + binary
    path.write_bytes(out)


def _floats(document: dict, binary: bytes, index: int) -> list[tuple[float, ...]]:
    accessor = document["accessors"][index]
    if accessor.get("componentType") != _FLOAT or "sparse" in accessor or "bufferView" not in accessor:
        raise ValueError("not a dense float accessor")
    view = document["bufferViews"][accessor["bufferView"]]
    width = _COMPONENTS[accessor["type"]]
    stride = view.get("byteStride") or 4 * width
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from(f"<{width}f", binary, start + i * stride) for i in range(accessor["count"])]


def _normals(values) -> bytes:
    out = bytearray()
    for x, y, z in values:
        length = math.sqrt(x * x + y * y + z * z) or 1.0
        out += struct.pack("<3bx", *(max(-127, min(127, round(c / length * 127))) for c in (x, y, z)))
    return bytes(out)


def _texcoords(values) -> bytes:
    return b"".join(struct.pack("<2H", round(u * 65535), round(v * 65535)) for u, v in values)


def _weights(values) -> bytes:
    out = bytearray()
    for weights in values:
        total = sum(weights)
        if total <= 0:
            out += bytes(4)
            continue
        scaled = [w / total * 255 for w in weights]
        whole = [math.floor(s) for s in scaled]
        # the largest remainders take the missing units, so every vertex still sums to exactly one
        for k in sorted(range(4), key=lambda k: scaled[k] - whole[k], reverse=True)[:255 - sum(whole)]:
            whole[k] += 1
        out += struct.pack("<4B", *whole)
    return bytes(out)


def quantize_attributes(path: Path) -> dict:
    """Rewrite a GLB's normals, texture coordinates and skin weights as normalized integers. Returns bytes saved."""
    document, binary = _read(path)
    views = document.get("bufferViews", [])
    before = len(binary)
    replaced: dict[int, tuple[bytes, int, int, int]] = {}      # accessor -> (data, componentType, stride, target)
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            for name, index in primitive.get("attributes", {}).items():
                if index in replaced:
                    continue
                accessor = document["accessors"][index]
                if accessor.get("componentType") != _FLOAT or "sparse" in accessor:
                    continue
                if name == "NORMAL":
                    replaced[index] = (_normals(_floats(document, binary, index)), _BYTE, 4, 34962)
                elif name.startswith("TEXCOORD_"):
                    values = _floats(document, binary, index)
                    if all(0.0 <= c <= 1.0 for uv in values for c in uv):
                        replaced[index] = (_texcoords(values), _USHORT, 4, 34962)
                elif name == "WEIGHTS_0":
                    replaced[index] = (_weights(_floats(document, binary, index)), _UBYTE, 4, 34962)
    if not replaced:
        return {"accessors": 0, "bytesSaved": 0}

    # every view still in use, in order, followed by the new ones; each 4-byte aligned in a rebuilt buffer
    kept_views = set()
    for i, accessor in enumerate(document.get("accessors", [])):
        if i not in replaced and "bufferView" in accessor:
            kept_views.add(accessor["bufferView"])
        for part in ("indices", "values"):
            if isinstance(accessor.get("sparse", {}).get(part), dict):
                kept_views.add(accessor["sparse"][part]["bufferView"])
    for image in document.get("images", []):
        if "bufferView" in image:
            kept_views.add(image["bufferView"])
    new_views, chunks, remap = [], [], {}
    offset = 0

    def append(data: bytes, view: dict) -> int:
        nonlocal offset
        pad = -offset % 4
        chunks.append(b"\x00" * pad)
        offset += pad
        view = {**view, "buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        chunks.append(data)
        offset += len(data)
        new_views.append(view)
        return len(new_views) - 1

    for i, view in enumerate(views):
        if i in kept_views:
            start = view.get("byteOffset", 0)
            remap[i] = append(binary[start:start + view["byteLength"]], {k: v for k, v in view.items() if k not in ("byteOffset",)})
    for i, accessor in enumerate(document["accessors"]):
        if i in replaced:
            data, component, stride, target = replaced[i]
            accessor["bufferView"] = append(data, {"byteStride": stride, "target": target})
            accessor["componentType"] = component
            accessor["normalized"] = True
            accessor.pop("byteOffset", None)
            accessor.pop("min", None)
            accessor.pop("max", None)
        elif "bufferView" in accessor:
            accessor["bufferView"] = remap[accessor["bufferView"]]
        for part in ("indices", "values"):
            sparse = accessor.get("sparse", {}).get(part)
            if isinstance(sparse, dict):
                sparse["bufferView"] = remap[sparse["bufferView"]]
    for image in document.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = remap[image["bufferView"]]
    document["bufferViews"] = new_views
    binary = b"".join(chunks)
    document["buffers"] = [{"byteLength": len(binary)}]
    for key in ("extensionsUsed", "extensionsRequired"):
        names = document.setdefault(key, [])
        if EXTENSION not in names:
            names.append(EXTENSION)
    _write(path, document, binary)
    return {"accessors": len(replaced), "bytesSaved": before - len(binary)}


if __name__ == "__main__":
    import sys
    for arg in sys.argv[1:]:
        print(arg, quantize_attributes(Path(arg)))
