#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import math
import struct
import tempfile
from pathlib import Path


GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A
CONTRACT_PATH = Path(__file__).resolve().parents[1] / "tools" / "blender" / "characters" / "spellblade" / "contract.json"

REQUIRED_RIG_NODES = (
    "root", "pelvis", "spine", "chest", "neck", "head",
    "clavicle.L", "upper_arm.L", "forearm.L", "hand.L",
    "clavicle.R", "upper_arm.R", "forearm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
    "tabard_root", "tabard_front_01", "tabard_front_02",
    "tabard_back_01", "tabard_back_02",
    "socket_sword", "socket_sorcery",
)
MIN_CHARACTER_HEIGHT = 1.85
MAX_CHARACTER_HEIGHT = 2.25
MIN_GROUND_Y = -0.10
MAX_GROUND_Y = 0.15
SCALE_EPSILON = 1e-4


def _named_string_list(value: dict, key: str) -> list[str]:
    items = value.get(key)
    if not isinstance(items, list) or not items or not all(isinstance(name, str) and name for name in items):
        raise ValueError(f"Spellblade contract {key} must be a non-empty list of names")
    return items


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    _named_string_list(value, "clips")
    _named_string_list(value, "firstPersonClips")
    _named_string_list(value, "firstPersonRigNodes")
    _named_string_list(value, "firstPersonRequiredNodes")
    _named_string_list(value, "firstPersonMutableMaterials")
    return value


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


def _node_index_by_name(document: dict) -> dict[str, int]:
    result: dict[str, int] = {}
    for index, node in enumerate(document.get("nodes", [])):
        if isinstance(node, dict) and isinstance(node.get("name"), str):
            result[node["name"]] = index
    return result


def _material_names(document: dict) -> set[str]:
    return {
        material["name"]
        for material in document.get("materials", [])
        if isinstance(material, dict) and isinstance(material.get("name"), str)
    }


def _position_bounds(document: dict) -> tuple[list[float], list[float]] | None:
    accessors = document.get("accessors", [])
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    found = False

    for mesh in document.get("meshes", []):
        if not isinstance(mesh, dict):
            continue
        for primitive in mesh.get("primitives", []):
            if not isinstance(primitive, dict):
                continue
            attributes = primitive.get("attributes", {})
            accessor_index = attributes.get("POSITION") if isinstance(attributes, dict) else None
            if not isinstance(accessor_index, int) or not (0 <= accessor_index < len(accessors)):
                continue
            accessor = accessors[accessor_index]
            if not isinstance(accessor, dict):
                continue
            low = accessor.get("min")
            high = accessor.get("max")
            if not (
                isinstance(low, list) and isinstance(high, list)
                and len(low) == 3 and len(high) == 3
                and all(isinstance(v, (int, float)) and math.isfinite(v) for v in (*low, *high))
            ):
                continue
            found = True
            for axis in range(3):
                minimum[axis] = min(minimum[axis], float(low[axis]))
                maximum[axis] = max(maximum[axis], float(high[axis]))

    return (minimum, maximum) if found else None


def _triangle_count(document: dict) -> int:
    accessors = document.get("accessors", [])
    total = 0
    for mesh in document.get("meshes", []):
        if not isinstance(mesh, dict):
            continue
        for primitive in mesh.get("primitives", []):
            if not isinstance(primitive, dict):
                continue
            if primitive.get("mode", 4) != 4:
                continue
            accessor_index = primitive.get("indices")
            if not isinstance(accessor_index, int):
                attributes = primitive.get("attributes", {})
                accessor_index = attributes.get("POSITION") if isinstance(attributes, dict) else None
            if not isinstance(accessor_index, int) or not (0 <= accessor_index < len(accessors)):
                continue
            accessor = accessors[accessor_index]
            count = accessor.get("count") if isinstance(accessor, dict) else None
            if isinstance(count, int) and count >= 0:
                total += count // 3
    return total


def _validate_clip_names(document: dict, contract: dict | None, *, first_person: bool) -> list[str]:
    if not isinstance(contract, dict):
        return []
    key = "firstPersonClips" if first_person else "clips"
    required = contract.get(key)
    if not isinstance(required, list):
        return [f"Spellblade contract is missing {key}"]
    actual = {
        animation.get("name")
        for animation in document.get("animations", [])
        if isinstance(animation, dict) and isinstance(animation.get("name"), str)
    }
    missing = [name for name in required if name not in actual]
    return [f"Spellblade GLB missing required animation clips: {', '.join(missing)}"] if missing else []


def _validate_root_motion(document: dict, root_index: int | None) -> list[str]:
    if root_index is None:
        return []
    errors: list[str] = []
    for animation in document.get("animations", []):
        if not isinstance(animation, dict):
            continue
        animation_name = animation.get("name", "<unnamed>")
        for channel in animation.get("channels", []):
            if not isinstance(channel, dict):
                continue
            target = channel.get("target")
            if not isinstance(target, dict):
                continue
            if target.get("node") == root_index and target.get("path") == "translation":
                errors.append(f"animation {animation_name} translates root; gameplay root motion is forbidden")
    return errors


def _validate_budget(document: dict, contract: dict | None, *, first_person: bool) -> list[str]:
    if not isinstance(contract, dict):
        return []
    label = "firstPerson" if first_person else "thirdPerson"
    budget = contract.get(label)
    if not isinstance(budget, dict):
        return [f"Spellblade contract is missing {label} budget"]
    maximum = budget.get("maxTriangles")
    if not isinstance(maximum, (int, float)) or maximum <= 0:
        return [f"Spellblade contract {label}.maxTriangles must be positive"]
    triangles = _triangle_count(document)
    if triangles > int(maximum):
        return [f"Spellblade {label} GLB exceeds triangle budget: {triangles} > {int(maximum)}"]
    return []


def validate_document(document: dict, contract: dict | None = None, *, first_person: bool = False) -> list[str]:
    errors: list[str] = []

    asset = document.get("asset")
    if not isinstance(asset, dict) or asset.get("version") != "2.0":
        errors.append("glTF asset.version must be 2.0")

    skins = document.get("skins")
    if not isinstance(skins, list) or not skins:
        errors.append("Spellblade GLB must contain at least one skin")

    node_indexes = _node_index_by_name(document)
    if first_person and isinstance(contract, dict):
        required_nodes = tuple(contract.get("firstPersonRigNodes", ()))
    elif isinstance(contract, dict):
        required_nodes = tuple(contract.get("rigNodes", REQUIRED_RIG_NODES))
    else:
        required_nodes = REQUIRED_RIG_NODES
    for name in required_nodes:
        if name not in node_indexes:
            errors.append(f"Spellblade rig missing node {name}")

    if first_person and isinstance(contract, dict):
        for name in contract.get("firstPersonRequiredNodes", []):
            if name not in node_indexes:
                errors.append(f"Spellblade first-person GLB missing required node {name}")
        materials = _material_names(document)
        for name in contract.get("firstPersonMutableMaterials", []):
            if name not in materials:
                errors.append(f"Spellblade first-person GLB missing mutable material {name}")

    root_index = node_indexes.get("root")
    if root_index is not None:
        root_node = document.get("nodes", [])[root_index]
        scale = root_node.get("scale", [1.0, 1.0, 1.0]) if isinstance(root_node, dict) else [1.0, 1.0, 1.0]
        if not (
            isinstance(scale, list)
            and len(scale) == 3
            and all(isinstance(value, (int, float)) and math.isfinite(value) for value in scale)
        ):
            errors.append("root scale must be a finite 3-vector")
        else:
            if any(value <= 0 for value in scale):
                errors.append(f"root scale must be positive, got {scale}")
            if any(abs(float(value) - 1.0) > SCALE_EPSILON for value in scale):
                errors.append(f"root scale must be unit [1, 1, 1], got {scale}")

    bounds = _position_bounds(document)
    if bounds is None:
        errors.append("Spellblade GLB must expose POSITION accessor min/max bounds")
    elif not first_person:
        minimum, maximum = bounds
        height = maximum[1] - minimum[1]
        if not (MIN_CHARACTER_HEIGHT <= height <= MAX_CHARACTER_HEIGHT):
            errors.append(
                f"Spellblade character height must be {MIN_CHARACTER_HEIGHT:.2f}..{MAX_CHARACTER_HEIGHT:.2f}m, got {height:.3f}m"
            )
        if not (MIN_GROUND_Y <= minimum[1] <= MAX_GROUND_Y):
            errors.append(
                f"Spellblade ground origin must keep minimum Y near 0m, got {minimum[1]:.3f}m"
            )

    errors.extend(_validate_clip_names(document, contract, first_person=first_person))
    errors.extend(_validate_root_motion(document, root_index))
    errors.extend(_validate_budget(document, contract, first_person=first_person))
    return errors


def validate_glb(path: Path, contract: dict | None = None, *, first_person: bool = False) -> list[str]:
    errors = validate_document(read_glb_json(path), contract, first_person=first_person)
    if isinstance(contract, dict):
        label = "firstPerson" if first_person else "thirdPerson"
        budget = contract.get(label)
        target = budget.get("targetBytes") if isinstance(budget, dict) else None
        if isinstance(target, (int, float)) and target > 0 and path.stat().st_size > int(target):
            errors.append(f"Spellblade {label} GLB exceeds byte budget: {path.stat().st_size} > {int(target)}")
    errors += _validate_rotation_continuity(path)
    return errors


def _validate_rotation_continuity(path: Path) -> list[str]:
    """Neighbouring rotation keys in opposite hemispheres play as a one-frame snap in the runtime."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "blender" / "common"))
    try:
        from gltf_rotation import discontinuities
        found = discontinuities(path)
    except (ValueError, KeyError, IndexError, struct.error):
        return []                      # synthetic fixtures without animation data
    finally:
        sys.path.pop(0)
    return [f"animation {name} flips rotation hemisphere on node {node} at key {key}" for name, node, key in found[:5]]


def _write_synthetic_glb(path: Path, document: dict | None = None) -> None:
    payload = json.dumps(document or {"asset": {"version": "2.0"}}, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    total_length = 12 + 8 + len(payload)
    data = struct.pack("<4sII", GLB_MAGIC, GLB_VERSION, total_length)
    data += struct.pack("<II", len(payload), JSON_CHUNK_TYPE)
    data += payload
    path.write_bytes(data)


def _valid_synthetic_rig_document() -> dict:
    nodes = [{"name": name} for name in REQUIRED_RIG_NODES]
    joints = list(range(len(nodes)))
    return {
        "asset": {"version": "2.0"},
        "nodes": nodes,
        "skins": [{"joints": joints}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [{"type": "VEC3", "componentType": 5126, "count": 8, "min": [-0.55, 0.0, -0.28], "max": [0.55, 2.04, 0.28]}],
        "animations": [],
    }


def _valid_synthetic_first_person_document(contract: dict) -> dict:
    rig_nodes = list(contract["firstPersonRigNodes"])
    required_nodes = list(contract["firstPersonRequiredNodes"])
    nodes = [{"name": name} for name in (*rig_nodes, *required_nodes)]
    return {
        "asset": {"version": "2.0"},
        "nodes": nodes,
        "skins": [{"joints": list(range(len(rig_nodes)))}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [
            {"type": "VEC3", "componentType": 5126, "count": 120, "min": [-0.8, -1.0, -1.8], "max": [0.8, 0.6, -0.1]},
            {"type": "SCALAR", "componentType": 5123, "count": 300},
        ],
        "materials": [{"name": name} for name in contract["firstPersonMutableMaterials"]],
        "animations": [
            {"name": name, "channels": [], "samplers": []}
            for name in contract["firstPersonClips"]
        ],
    }


def self_test() -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "synthetic.glb"
        document = {"asset": {"version": "2.0"}}
        _write_synthetic_glb(path, document)
        if read_glb_json(path) != document:
            raise SystemExit("GLB parser self-test returned unexpected JSON")
    print("SPELLBLADE_GLB_PARSER_OK")


def self_test_rig() -> None:
    valid = _valid_synthetic_rig_document()
    valid_errors = validate_document(valid)
    if valid_errors:
        raise SystemExit("valid rig fixture rejected: " + "; ".join(valid_errors))

    cases: list[tuple[str, dict, str]] = []

    no_skin = copy.deepcopy(valid)
    no_skin["skins"] = []
    cases.append(("missing skin", no_skin, "skin"))

    missing_socket = copy.deepcopy(valid)
    missing_socket["nodes"] = [node for node in missing_socket["nodes"] if node.get("name") != "socket_sword"]
    cases.append(("missing socket", missing_socket, "socket_sword"))

    negative_scale = copy.deepcopy(valid)
    negative_scale["nodes"][0]["scale"] = [-1.0, 1.0, 1.0]
    cases.append(("negative root scale", negative_scale, "positive"))

    non_unit_scale = copy.deepcopy(valid)
    non_unit_scale["nodes"][0]["scale"] = [1.1, 1.0, 1.0]
    cases.append(("non-unit root scale", non_unit_scale, "unit"))

    too_tall = copy.deepcopy(valid)
    too_tall["accessors"][0]["max"][1] = 3.0
    cases.append(("wrong height", too_tall, "height"))

    floating = copy.deepcopy(valid)
    floating["accessors"][0]["min"][1] = 0.5
    floating["accessors"][0]["max"][1] = 2.54
    cases.append(("floating origin", floating, "ground origin"))

    root_motion = copy.deepcopy(valid)
    root_motion["animations"] = [{
        "name": "BadRootMotion",
        "channels": [{"sampler": 0, "target": {"node": 0, "path": "translation"}}],
        "samplers": [{"input": 1, "output": 2}],
    }]
    cases.append(("root motion", root_motion, "root motion"))

    for label, document, expected in cases:
        errors = validate_document(document)
        joined = "\n".join(errors).lower()
        if expected.lower() not in joined:
            raise SystemExit(f"{label} fixture was not rejected correctly: {errors}")

    print("SPELLBLADE_RIG_VALIDATOR_OK")


def self_test_animation() -> None:
    contract = load_contract()
    valid = _valid_synthetic_rig_document()
    valid["animations"] = [
        {"name": name, "channels": [], "samplers": []}
        for name in contract["clips"]
    ]
    valid_errors = validate_document(valid, contract)
    if valid_errors:
        raise SystemExit("valid animation fixture rejected: " + "; ".join(valid_errors))

    missing_clip = copy.deepcopy(valid)
    removed_name = contract["clips"][-1]
    missing_clip["animations"] = [animation for animation in missing_clip["animations"] if animation["name"] != removed_name]
    errors = validate_document(missing_clip, contract)
    if removed_name.lower() not in "\n".join(errors).lower():
        raise SystemExit(f"missing clip fixture was not rejected correctly: {errors}")

    root_motion = copy.deepcopy(valid)
    root_motion["animations"][0]["channels"] = [
        {"sampler": 0, "target": {"node": 0, "path": "translation"}}
    ]
    root_motion["animations"][0]["samplers"] = [{"input": 1, "output": 2}]
    errors = validate_document(root_motion, contract)
    if "root motion" not in "\n".join(errors).lower():
        raise SystemExit(f"root motion fixture was not rejected correctly: {errors}")

    print("SPELLBLADE_ANIMATION_VALIDATOR_OK")


def self_test_first_person() -> None:
    contract = load_contract()
    valid = _valid_synthetic_first_person_document(contract)
    valid_errors = validate_document(valid, contract, first_person=True)
    if valid_errors:
        raise SystemExit("valid first-person fixture rejected: " + "; ".join(valid_errors))

    cases: list[tuple[str, dict, str]] = []

    missing_hand = copy.deepcopy(valid)
    missing_hand["nodes"] = [node for node in missing_hand["nodes"] if node.get("name") != "hand.L"]
    cases.append(("missing hand chain", missing_hand, "hand.L"))

    missing_sword = copy.deepcopy(valid)
    missing_sword["nodes"] = [node for node in missing_sword["nodes"] if node.get("name") != "HeroSword"]
    cases.append(("missing hero sword", missing_sword, "HeroSword"))

    missing_sorcery = copy.deepcopy(valid)
    missing_sorcery["materials"] = []
    cases.append(("missing sorcery material", missing_sorcery, "SorceryAccent"))

    missing_clip = copy.deepcopy(valid)
    removed_name = contract["firstPersonClips"][-1]
    missing_clip["animations"] = [animation for animation in missing_clip["animations"] if animation["name"] != removed_name]
    cases.append(("missing first-person clip", missing_clip, removed_name))

    too_many_triangles = copy.deepcopy(valid)
    too_many_triangles["accessors"][1]["count"] = (int(contract["firstPerson"]["maxTriangles"]) + 1) * 3
    cases.append(("first-person triangle budget", too_many_triangles, "triangle budget"))

    for label, document, expected in cases:
        errors = validate_document(document, contract, first_person=True)
        joined = "\n".join(errors).lower()
        if expected.lower() not in joined:
            raise SystemExit(f"{label} fixture was not rejected correctly: {errors}")

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "first-person.glb"
        _write_synthetic_glb(path, valid)
        tiny_contract = copy.deepcopy(contract)
        tiny_contract["firstPerson"]["targetBytes"] = 1
        errors = validate_glb(path, tiny_contract, first_person=True)
        if "byte budget" not in "\n".join(errors).lower():
            raise SystemExit(f"first-person byte budget fixture was not rejected correctly: {errors}")

    print("SPELLBLADE_FIRST_PERSON_VALIDATOR_OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Swords & Sorcery Spellblade GLB structure")
    parser.add_argument("path", nargs="?", type=Path)
    parser.add_argument("--first-person", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--self-test-rig", action="store_true")
    parser.add_argument("--self-test-animation", action="store_true")
    parser.add_argument("--self-test-first-person", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.self_test_rig:
        self_test_rig()
        return
    if args.self_test_animation:
        self_test_animation()
        return
    if args.self_test_first_person:
        self_test_first_person()
        return
    if args.path is None:
        parser.error("path is required unless a self-test flag is used")

    contract = load_contract()
    errors = validate_glb(args.path, contract, first_person=args.first_person)
    if errors:
        raise SystemExit("\n".join(errors))
    mode = "first-person" if args.first_person else "third-person"
    print(f"SPELLBLADE_GLB_VALID mode={mode} path={args.path}")


if __name__ == "__main__":
    main()
