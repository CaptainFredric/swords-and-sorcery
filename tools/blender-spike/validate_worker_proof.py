from __future__ import annotations

import json
import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts" / "blender-spike"


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 20:
        raise AssertionError("GLB is too small")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF", f"unexpected GLB magic {magic!r}"
    assert version == 2, f"expected glTF 2, got {version}"
    assert total_length == len(data), "GLB header length mismatch"
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A, f"first GLB chunk is not JSON: {chunk_type:#x}"
    payload = data[20:20 + chunk_length].rstrip(b" \t\r\n\x00")
    return json.loads(payload.decode("utf-8"))


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name} is not a PNG"
    assert data[12:16] == b"IHDR", f"{path.name} has no IHDR"
    return struct.unpack(">II", data[16:24])


def main() -> None:
    blend = OUT / "worker-proof.blend"
    glb = OUT / "worker-proof.glb"
    assert blend.exists() and blend.stat().st_size > 100_000, "editable .blend output missing or suspiciously small"
    assert glb.exists() and glb.stat().st_size > 5_000, "GLB output missing or suspiciously small"

    doc = read_glb_json(glb)
    assert doc.get("asset", {}).get("version") == "2.0"
    assert len(doc.get("skins", [])) >= 1, "export contains no skin/skeleton"
    assert len(doc.get("animations", [])) >= 1, "export contains no animation clip"

    node_names = {node.get("name") for node in doc.get("nodes", [])}
    for required in ("WorkerProofRig", "spine", "head", "forearm.L", "forearm.R", "SkinnedTorso"):
        assert required in node_names, f"missing exported node/bone {required}"

    animation_names = {anim.get("name") for anim in doc.get("animations", [])}
    assert "Proof_Guard" in animation_names, f"missing Proof_Guard animation: {animation_names}"

    for view in ("front", "back", "side", "quarter"):
        png = OUT / f"worker-proof-{view}.png"
        assert png.exists() and png.stat().st_size > 10_000, f"missing useful {view} preview"
        assert png_dimensions(png) == (640, 640), f"unexpected {view} preview dimensions"

    print(
        "BLENDER_SPIKE_VALID "
        f"blend={blend.stat().st_size}B glb={glb.stat().st_size}B "
        f"skins={len(doc['skins'])} animations={sorted(animation_names)}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"BLENDER_SPIKE_INVALID: {exc}", file=sys.stderr)
        raise
