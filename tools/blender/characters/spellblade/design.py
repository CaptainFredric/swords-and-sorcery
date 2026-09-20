from __future__ import annotations

# Authoring coordinates are Blender-native: +Z up, +Y character-forward.
# Blender's glTF exporter converts that to the runtime contract: +Y up, -Z forward.
BLENDER_UP = "+Z"
BLENDER_FORWARD = "+Y"
RUNTIME_UP = "+Y"
RUNTIME_FORWARD = "-Z"

BODY_HEIGHT = 2.04
SHOULDER_SPAN = 0.96
CHEST_TOP_WIDTH = 0.74
WAIST_WIDTH = 0.55
HELMET_WIDTH = 0.42
VISOR_WIDTH = 0.30
BOOT_WIDTH = 0.32
SHIN_WIDTH = 0.25

# Concept-sheet silhouette anchors.
SWORD_BLADE_WIDTH = 0.34
CREST_HEIGHT = 0.20
PAULDRON_WIDTH = 0.34
BREASTPLATE_UPPER_WIDTH = 0.70
PAULDRON_CENTER_X = 0.49

# Secondary hero-shape anchors.
BOOT_SILHOUETTE_WIDTH = 0.32
SWORD_GUARD_WIDTH = 0.66
GAUNTLET_CUFF_WIDTH = 0.25
FOREARM_ARMOR_WIDTH = 0.25
THIGH_ARMOR_WIDTH = 0.30
SORCERY_ACCENT_RADIUS = 0.18
UPPER_ARM_ARMOR_WIDTH = 0.25
PAULDRON_DROP_HEIGHT = 0.20
BOOT_ARMOR_CENTER_X = 0.20
SORCERY_EMISSION_STRENGTH = 2.2

# Concept-sheet landmarks. The stance is intentionally planted and slightly
# splayed: knees and ankles sit farther from the centerline than the hips.
BONES = {
    "root": ((0.0, 0.0, 0.0), (0.0, 0.0, 0.14), None, False),
    "pelvis": ((0.0, 0.0, 0.98), (0.0, 0.0, 1.17), "root", True),
    "spine": ((0.0, 0.0, 1.10), (0.0, 0.0, 1.39), "pelvis", True),
    "chest": ((0.0, 0.0, 1.34), (0.0, 0.0, 1.58), "spine", True),
    "neck": ((0.0, 0.0, 1.55), (0.0, 0.0, 1.69), "chest", True),
    "head": ((0.0, 0.0, 1.66), (0.0, 0.0, 2.03), "neck", True),

    "clavicle.L": ((-0.07, 0.0, 1.53), (-0.34, 0.0, 1.53), "chest", True),
    "upper_arm.L": ((-0.34, 0.0, 1.53), (-0.53, 0.0, 1.27), "clavicle.L", True),
    "forearm.L": ((-0.53, 0.0, 1.27), (-0.68, 0.035, 0.98), "upper_arm.L", True),
    "hand.L": ((-0.68, 0.035, 0.98), (-0.74, 0.09, 0.84), "forearm.L", True),
    "socket_sorcery": ((-0.74, 0.09, 0.84), (-0.74, 0.25, 0.84), "hand.L", False),

    "clavicle.R": ((0.07, 0.0, 1.53), (0.34, 0.0, 1.53), "chest", True),
    "upper_arm.R": ((0.34, 0.0, 1.53), (0.53, 0.0, 1.27), "clavicle.R", True),
    "forearm.R": ((0.53, 0.0, 1.27), (0.68, 0.035, 0.98), "upper_arm.R", True),
    "hand.R": ((0.68, 0.035, 0.98), (0.74, 0.09, 0.84), "forearm.R", True),
    "socket_sword": ((0.74, 0.09, 0.84), (0.74, 0.25, 0.84), "hand.R", False),

    "thigh.L": ((-0.19, 0.0, 1.02), (-0.25, 0.0, 0.60), "pelvis", True),
    "shin.L": ((-0.25, 0.0, 0.60), (-0.28, 0.0, 0.14), "thigh.L", True),
    "foot.L": ((-0.28, 0.0, 0.14), (-0.28, 0.30, 0.08), "shin.L", True),
    "thigh.R": ((0.19, 0.0, 1.02), (0.25, 0.0, 0.60), "pelvis", True),
    "shin.R": ((0.25, 0.0, 0.60), (0.28, 0.0, 0.14), "thigh.R", True),
    "foot.R": ((0.28, 0.0, 0.14), (0.28, 0.30, 0.08), "shin.R", True),

    "tabard_root": ((0.0, 0.015, 1.14), (0.0, 0.04, 0.98), "pelvis", True),
    "tabard_front_01": ((0.0, 0.085, 0.98), (0.0, 0.10, 0.71), "tabard_root", True),
    "tabard_front_02": ((0.0, 0.10, 0.71), (0.0, 0.12, 0.44), "tabard_front_01", True),
    "tabard_back_01": ((0.0, -0.075, 0.99), (0.0, -0.09, 0.72), "tabard_root", True),
    "tabard_back_02": ((0.0, -0.09, 0.72), (0.0, -0.11, 0.45), "tabard_back_01", True),
}

REQUIRED_BONES = tuple(BONES.keys())
