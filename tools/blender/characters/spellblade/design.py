from __future__ import annotations

# Authoring coordinates are Blender-native: +Z up, +Y character-forward.
# Blender's glTF exporter converts that to the runtime contract: +Y up, -Z forward.
BLENDER_UP = "+Z"
BLENDER_FORWARD = "+Y"
RUNTIME_UP = "+Y"
RUNTIME_FORWARD = "-Z"

BODY_HEIGHT = 2.04
SHOULDER_SPAN = 0.84
CHEST_TOP_WIDTH = 0.62
WAIST_WIDTH = 0.55
HELMET_WIDTH = 0.38
VISOR_WIDTH = 0.24
BOOT_WIDTH = 0.30
SHIN_WIDTH = 0.24

# Concept-sheet silhouette anchors.
SWORD_BLADE_WIDTH = 0.34
CREST_HEIGHT = 0.18
PAULDRON_WIDTH = 0.30
BREASTPLATE_UPPER_WIDTH = 0.60
PAULDRON_CENTER_X = 0.40

# Secondary hero-shape anchors.
BOOT_SILHOUETTE_WIDTH = 0.30
SWORD_GUARD_WIDTH = 0.58
GAUNTLET_CUFF_WIDTH = 0.22
FOREARM_ARMOR_WIDTH = 0.22
THIGH_ARMOR_WIDTH = 0.30
SORCERY_ACCENT_RADIUS = 0.15
UPPER_ARM_ARMOR_WIDTH = 0.22
PAULDRON_DROP_HEIGHT = 0.20
BOOT_ARMOR_CENTER_X = 0.28
SORCERY_EMISSION_STRENGTH = 2.2

# Final-space concept landmarks.  These match the two-stage geometry remap used
# by the authoritative model: high belt, long planted legs, compact upper body.
# Keeping the rig in the same final coordinate space prevents armor from looking
# correct in neutral but pivoting around obsolete blockout joints in actions.
BONES = {
    "root": ((0.0, 0.0, 0.0), (0.0, 0.0, 0.1706), None, False),
    "pelvis": ((0.0, 0.0, 1.1942), (0.0, 0.0, 1.3783), "root", True),
    "spine": ((0.0, 0.0, 1.3280), (0.0, 0.0, 1.5363), "pelvis", True),
    "chest": ((0.0, 0.0, 1.5004), (0.0, 0.0, 1.6733), "spine", True),
    "neck": ((0.0, 0.0, 1.6512), (0.0, 0.0, 1.7676), "chest", True),
    "head": ((0.0, 0.0, 1.7419), (0.0, 0.0, 2.0592), "neck", True),

    "clavicle.L": ((-0.07, 0.0, 1.6368), (-0.30, 0.0, 1.6368), "chest", True),
    "upper_arm.L": ((-0.30, 0.0, 1.6368), (-0.43, 0.0, 1.4500), "clavicle.L", True),
    "forearm.L": ((-0.43, 0.0, 1.4500), (-0.53, 0.035, 1.1942), "upper_arm.L", True),
    "hand.L": ((-0.53, 0.035, 1.1942), (-0.59, 0.09, 1.0236), "forearm.L", True),
    "socket_sorcery": ((-0.59, 0.09, 1.0236), (-0.59, 0.25, 1.0236), "hand.L", False),

    "clavicle.R": ((0.07, 0.0, 1.6368), (0.30, 0.0, 1.6368), "chest", True),
    "upper_arm.R": ((0.30, 0.0, 1.6368), (0.43, 0.0, 1.4500), "clavicle.R", True),
    "forearm.R": ((0.43, 0.0, 1.4500), (0.53, 0.035, 1.1942), "upper_arm.R", True),
    "hand.R": ((0.53, 0.035, 1.1942), (0.59, 0.09, 1.0236), "forearm.R", True),
    "socket_sword": ((0.59, 0.09, 1.0236), (0.59, 0.25, 1.0236), "hand.R", False),

    "thigh.L": ((-0.19, 0.0, 1.2429), (-0.25, 0.0, 0.7799), "pelvis", True),
    "shin.L": ((-0.25, 0.0, 0.7799), (-0.28, 0.0, 0.1706), "thigh.L", True),
    "foot.L": ((-0.28, 0.0, 0.1706), (-0.28, 0.30, 0.0975), "shin.L", True),
    "thigh.R": ((0.19, 0.0, 1.2429), (0.25, 0.0, 0.7799), "pelvis", True),
    "shin.R": ((0.25, 0.0, 0.7799), (0.28, 0.0, 0.1706), "thigh.R", True),
    "foot.R": ((0.28, 0.0, 0.1706), (0.28, 0.30, 0.0975), "shin.R", True),

    "tabard_root": ((0.0, 0.015, 1.3567), (0.0, 0.04, 1.1942), "pelvis", True),
    "tabard_front_01": ((0.0, 0.085, 1.1942), (0.0, 0.10, 0.8653), "tabard_root", True),
    "tabard_front_02": ((0.0, 0.10, 0.8653), (0.0, 0.12, 0.5362), "tabard_front_01", True),
    "tabard_back_01": ((0.0, -0.075, 1.2064), (0.0, -0.09, 0.8774), "tabard_root", True),
    "tabard_back_02": ((0.0, -0.09, 0.8774), (0.0, -0.11, 0.5484), "tabard_back_01", True),
}

REQUIRED_BONES = tuple(BONES.keys())
