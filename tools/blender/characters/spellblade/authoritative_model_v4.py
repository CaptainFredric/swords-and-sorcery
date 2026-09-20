from __future__ import annotations

import bpy

from .authoritative_model_v3 import build_authoritative_spellblade_v3, _scale_mesh
from .model import ModelParts


def _scale_x_from_origin(obj: bpy.types.Object, factor: float) -> None:
    for vertex in obj.data.vertices:
        vertex.co.x *= factor
    obj.data.update()


def _shift_x(obj: bpy.types.Object, amount: float) -> None:
    for vertex in obj.data.vertices:
        vertex.co.x += amount
    obj.data.update()


def build_authoritative_spellblade_v4(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> ModelParts:
    """Lock the measured front-view stance into the hard-surface rebuild."""
    model = build_authoritative_spellblade_v3(armature, materials)
    parts = list(model.objects)

    upper_prefixes = (
        "Pauldron.", "PauldronFacet.", "PauldronTrim.", "PauldronLower.", "ShoulderBadge.",
        "ArmUnder.", "UpperArmPlate.", "ForearmUnder.", "Vambrace.", "VambraceTrim.",
        "Gauntlet.", "GauntletCuff.",
    )
    chest_prefixes = (
        "Breastplate", "TorsoUnder", "BackArmor", "ChestFacet.", "BreastplateTrim.",
    )
    leg_prefixes = (
        "ThighUnder.", "Cuisse.", "CuisseOuter.", "KneePlate.", "KneeTrim.",
        "ShinUnder.", "Greave.", "GreaveTrim.", "Boot.", "BootAnkleTrim.",
    )

    # The reference is compact through the shoulders/arms.  Compress the entire
    # upper-limb construction about the spine, not each part about itself, so the
    # armor and limb centers move inward together.
    for obj in parts:
        if obj.name.startswith(upper_prefixes):
            _scale_x_from_origin(obj, 0.82)
        elif obj.name.startswith(chest_prefixes) or obj.name in {"BreastplateCollar", "BreastplateRidge"}:
            _scale_x_from_origin(obj, 0.90)
        elif obj.name == "CrimsonScarf":
            _scale_x_from_origin(obj, 0.96)

    # In contrast, the concept's knees/ankles are clearly splayed beyond the hip
    # centers.  Move the complete armored leg assemblies outward to the rig's
    # revised planted landmarks while preserving their hard-surface widths.
    for obj in parts:
        if not obj.name.startswith(leg_prefixes):
            continue
        if obj.name.endswith(".L"):
            _shift_x(obj, -0.040)
        elif obj.name.endswith(".R"):
            _shift_x(obj, 0.040)

    # Socket props follow the narrower hand landmarks.  Keep their authored world
    # silhouette centered on the new hands before animation is evaluated.
    for obj in parts:
        if obj.name in {"HeroSword", "SwordBladeFacet", "SwordGuard", "SwordGrip", "SwordPommel", "SwordGem"}:
            _shift_x(obj, -0.075)
        elif obj.name == "SorceryCore" or obj.name.startswith("SorceryShard."):
            _shift_x(obj, 0.095)

    # The sheet's sword is intentionally oversized and readable at gameplay zoom.
    for obj in parts:
        if obj.name in {"HeroSword", "SwordBladeFacet"}:
            _scale_mesh(obj, sx=1.16, sy=1.00, sz=1.10)

    return ModelParts(objects=tuple(parts), materials=materials)
