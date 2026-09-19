#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import struct
import tempfile
from pathlib import Path


GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB is too small")

    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError("GLB magic must be glTF")
    if version != GLB_VERSION:
        raise ValueError(f"GLB version must be {GLB_VERSION}")
    if declared_length != len(data):
        raise ValueError("GLB declared length does not match file size")

    offset = 12
    payload = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(data):
            raise ValueError("GLB chunk exceeds file size")
        if chunk_type == JSON_CHUNK_TYPE and payload is None:
            payload = data[offset:end]
        offset = end

    if offset != len(data):
        raise ValueError("GLB has trailing or truncated chunk data")
    if payload is None:
        raise ValueError("GLB is missing its JSON chunk")

    try:
        return json.loads(payload.rstrip(b" \t\r\n\x00").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"GLB JSON chunk is invalid: {error}") from error


def validate_glb(path: Path, contract: dict | None = None, *, first_person: bool = False) -> list[str]:
    del contract, first_person
    document = read_glb_json(path)
    asset = document.get("asset")
    errors: list[str] = []
    if not isinstance(asset, dict) or asset.get("version") != "2.0":
        errors.append("glTF asset.version must be 2.0")
    return errors


def _write_synthetic_glb(path: Path) -> None:
    payload = json.dumps({"asset": {"version": "2.0"}}, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    total_length = 12 + 8 + len(payload)
    data = struct.pack("<4sII", GLB_MAGIC, GLB_VERSION, total_length)
    data += struct.pack("<II", len(payload), JSON_CHUNK_TYPE)
    data += payload
    path.write_bytes(data)


def self_test() -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "synthetic.glb"
        _write_synthetic_glb(path)
        document = read_glb_json(path)
        if document != {"asset": {"version": "2.0"}}:
            raise SystemExit("GLB parser self-test returned unexpected JSON")
        errors = validate_glb(path)
        if errors:
            raise SystemExit("GLB parser self-test failed: " + "; ".join(errors))
    print("SPELLBLADE_GLB_PARSER_OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Swords & Sorcery Spellblade GLB structure")
    parser.add_argument("path", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.path is None:
        parser.error("path is required unless --self-test is used")

    errors = validate_glb(args.path)
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"SPELLBLADE_GLB_VALID path={args.path}")


if __name__ == "__main__":
    main()
