from __future__ import annotations

# Authoring coordinates are Blender-native: +Z up, +Y character-forward.
# Blender's glTF exporter converts that to the runtime contract: +Y up, -Z forward.
BLENDER_UP = "+Z"
BLENDER_FORWARD = "+Y"
RUNTIME_UP = "+Y"
RUNTIME_FORWARD = "-Z"

BODY_HEIGHT = 2.04
SHOULDER_SPAN = 1.18
CHEST_TOP_WIDTH = 0.82
WAIST_WIDTH = 0.55
HELMET_WIDTH = 0.50
VISOR_WIDTH = 0.34
BOOT_WIDTH = 0.36
SHIN_WIDTH = 0.27

# Explicit edit-bone endpoints in meters. Left/right are character-local X.
BONES = {
    "root": ((0.0, 0.0, 0.0), (0.0, 0.0, 0.14), None, False),
    "pelvis": ((0.0, 0.0, 0.78), (0.0, 0.0, 1.00), "root", True),
    "spine": ((0.0, 0.0, 0.96), (0.0, 0.0, 1.29), "pelvis", True),
    "chest": ((0.0, 0.0, 1.25), (0.0, 0.0, 1.56), "spine", True),
    "neck": ((0.0, 0.0, 1.53), (0.0, 0.0, 1.69), "chest", True),
    "head": ((0.0, 0.0, 1.66), (0.0, 0.0, 2.02), "neck", True),

    "clavicle.L": ((-0.08, 0.0, 1.49), (-0.42, 0.0, 1.49), "chest", True),
    "upper_arm.L": ((-0.42, 0.0, 1.49), (-0.72, 0.0, 1.23), "clavicle.L", True),
    "forearm.L": ((-0.72, 0.0, 1.23), (-0.90, 0.035, 0.94), "upper_arm.L", True),
    "hand.L": ((-0.90, 0.035, 0.94), (-0.96, 0.09, 0.79), "forearm.L", True),
    "socket_sorcery": ((-0.96, 0.09, 0.79), (-0.96, 0.25, 0.79), "hand.L", False),

    "clavicle.R": ((0.08, 0.0, 1.49), (0.42, 0.0, 1.49), "chest", True),
    "upper_arm.R": ((0.42, 0.0, 1.49), (0.72, 0.0, 1.23), "clavicle.R", True),
    "forearm.R": ((0.72, 0.0, 1.23), (0.90, 0.035, 0.94), "upper_arm.R", True),
    "hand.R": ((0.90, 0.035, 0.94), (0.96, 0.09, 0.79), "forearm.R", True),
    "socket_sword": ((0.96, 0.09, 0.79), (0.96, 0.25, 0.79), "hand.R", False),

    "thigh.L": ((-0.20, 0.0, 0.82), (-0.21, 0.0, 0.46), "pelvis", True),
    "shin.L": ((-0.21, 0.0, 0.46), (-0.21, 0.0, 0.12), "thigh.L", True),
    "foot.L": ((-0.21, 0.0, 0.12), (-0.21, 0.27, 0.07), "shin.L", True),
    "thigh.R": ((0.20, 0.0, 0.82), (0.21, 0.0, 0.46), "pelvis", True),
    "shin.R": ((0.21, 0.0, 0.46), (0.21, 0.0, 0.12), "thigh.R", True),
    "foot.R": ((0.21, 0.0, 0.12), (0.21, 0.27, 0.07), "shin.R", True),

    "tabard_root": ((0.0, 0.015, 1.04), (0.0, 0.04, 0.87), "pelvis", True),
    "tabard_front_01": ((0.0, 0.085, 0.87), (0.0, 0.10, 0.58), "tabard_root", True),
    "tabard_front_02": ((0.0, 0.10, 0.58), (0.0, 0.12, 0.29), "tabard_front_01", True),
    "tabard_back_01": ((0.0, -0.075, 0.87), (0.0, -0.09, 0.58), "tabard_root", True),
    "tabard_back_02": ((0.0, -0.09, 0.58), (0.0, -0.11, 0.31), "tabard_back_01", True),
}

REQUIRED_BONES = tuple(BONES.keys())
