from __future__ import annotations

import json
from pathlib import Path


CONTRACT_PATH = Path(__file__).with_name("contract.json")
_REQUIRED_CLIPS = {
    "Idle", "Run", "Air", "Guard", "Slash_1", "Slash_2", "Slash_3",
    "Cast", "Dash", "Stagger", "Death",
}
_REQUIRED_SOCKETS = {"socket_sword", "socket_sorcery"}
_REQUIRED_MUTABLE_MATERIALS = {"VisorGlow", "SorceryAccent"}


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    validate_contract(value)
    return value


def validate_contract(value: dict) -> None:
    if value.get("version") != 1:
        raise ValueError("Spellblade asset contract version must be 1")
    if value.get("facing") != "-Z" or value.get("up") != "+Y" or value.get("unitMeters") != 1:
        raise ValueError("Spellblade asset contract must use -Z forward, +Y up, and meter units")
    missing_clips = _REQUIRED_CLIPS.difference(value.get("clips", []))
    if missing_clips:
        raise ValueError(f"Spellblade asset contract missing clips: {sorted(missing_clips)}")
    missing_sockets = _REQUIRED_SOCKETS.difference(value.get("sockets", []))
    if missing_sockets:
        raise ValueError(f"Spellblade asset contract missing sockets: {sorted(missing_sockets)}")
    missing_materials = _REQUIRED_MUTABLE_MATERIALS.difference(value.get("mutableMaterials", []))
    if missing_materials:
        raise ValueError(f"Spellblade asset contract missing mutable materials: {sorted(missing_materials)}")
    for label in ("thirdPerson", "firstPerson"):
        budget = value.get(label)
        if not isinstance(budget, dict):
            raise ValueError(f"Spellblade asset contract missing {label} budget")
        for field in ("maxTriangles", "targetBytes"):
            amount = budget.get(field)
            if not isinstance(amount, (int, float)) or amount <= 0:
                raise ValueError(f"{label}.{field} must be positive")
