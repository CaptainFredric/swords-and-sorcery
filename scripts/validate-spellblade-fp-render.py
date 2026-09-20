#!/usr/bin/env python3
"""Validate that first-person review renders keep the hero sword readable."""

from __future__ import annotations

import argparse
import math
import struct
import zlib
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DEFAULT_SLASH = Path("artifacts/spellblade-assets/spellblade-fp-slash.png")
MIN_SWORD_VISIBILITY_PIXELS = 100


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _decode_rgb_rows(path: Path) -> tuple[int, int, int, list[bytearray]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"not a PNG: {path}")

    offset = len(PNG_SIGNATURE)
    header = None
    compressed = bytearray()
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError(f"truncated PNG chunk in {path}")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"IDAT":
            compressed.extend(payload)
        elif chunk_type == b"IEND":
            break

    if header is None:
        raise ValueError(f"PNG has no IHDR: {path}")
    width, height, bit_depth, color_type, compression, filter_method, interlace = header
    if bit_depth != 8 or color_type not in (2, 6):
        raise ValueError(f"unsupported PNG format in {path}: depth={bit_depth} color={color_type}")
    if compression != 0 or filter_method != 0 or interlace != 0:
        raise ValueError(f"unsupported PNG encoding in {path}")

    channels = 3 if color_type == 2 else 4
    stride = width * channels
    raw = zlib.decompress(bytes(compressed))
    expected = height * (stride + 1)
    if len(raw) != expected:
        raise ValueError(f"unexpected PNG payload size in {path}: {len(raw)} != {expected}")

    rows: list[bytearray] = []
    previous = bytearray(stride)
    cursor = 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        scan = raw[cursor:cursor + stride]
        cursor += stride
        reconstructed = bytearray(stride)
        for index, value in enumerate(scan):
            left = reconstructed[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = (value + left) & 0xFF
            elif filter_type == 2:
                decoded = (value + above) & 0xFF
            elif filter_type == 3:
                decoded = (value + ((left + above) // 2)) & 0xFF
            elif filter_type == 4:
                decoded = (value + _paeth(left, above, upper_left)) & 0xFF
            else:
                raise ValueError(f"unsupported PNG filter {filter_type} in {path}")
            reconstructed[index] = decoded
        rows.append(reconstructed)
        previous = reconstructed
    return width, height, channels, rows


def sword_visibility_pixels(path: Path) -> int:
    """Count bright, low-chroma hero-sword pixels in the useful right-side gameplay region."""
    width, height, channels, rows = _decode_rgb_rows(path)
    x_start = math.ceil(width * 0.52)
    y_end = math.floor(height * 0.90)
    visible = 0
    for y in range(y_end):
        row = rows[y]
        for x in range(x_start, width):
            start = x * channels
            red, green, blue = row[start:start + 3]
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            chroma = max(red, green, blue) - min(red, green, blue)
            if luminance >= 115 and chroma <= 90:
                visible += 1
    return visible


def validate_sword_visibility(path: Path) -> int:
    visible = sword_visibility_pixels(path)
    if visible < MIN_SWORD_VISIBILITY_PIXELS:
        raise ValueError(
            f"first-person sword visibility too low in {path}: "
            f"{visible} < {MIN_SWORD_VISIBILITY_PIXELS} bright steel pixels"
        )
    return visible


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate first-person Spellblade render readability")
    parser.add_argument("image", nargs="?", type=Path, default=DEFAULT_SLASH)
    args = parser.parse_args()
    visible = validate_sword_visibility(args.image)
    print(f"SPELLBLADE_FP_SWORD_VISIBILITY_OK path={args.image} pixels={visible}")


if __name__ == "__main__":
    main()
