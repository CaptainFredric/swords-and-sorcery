from __future__ import annotations

from math import radians

import bpy


# Root and attachment sockets deliberately never receive keyed translation/rotation.
_ANIMATED_BONES = (
    "pelvis", "spine", "chest", "neck", "head",
    "clavicle.L", "upper_arm.L", "forearm.L", "hand.L",
    "clavicle.R", "upper_arm.R", "forearm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
    "tabard_root", "tabard_front_01", "tabard_front_02",
    "tabard_back_01", "tabard_back_02",
)


def _pose(**values: tuple[float, float, float]) -> dict[str, tuple[float, float, float]]:
    return values


def _reset_pose(armature: bpy.types.Object) -> None:
    for name in _ANIMATED_BONES:
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def _apply_rotations(armature: bpy.types.Object, rotations: dict[str, tuple[float, float, float]]) -> None:
    for name, degrees in rotations.items():
        bone = armature.pose.bones.get(name)
        if bone is None:
            raise ValueError(f"Spellblade animation references missing bone {name}")
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = tuple(radians(value) for value in degrees)


def _key_frame(armature: bpy.types.Object, frame: int, rotations: dict[str, tuple[float, float, float]]) -> None:
    _reset_pose(armature)
    _apply_rotations(armature, rotations)
    for name in _ANIMATED_BONES:
        bone = armature.pose.bones.get(name)
        if bone is not None:
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)


def _stash_action(armature: bpy.types.Object, action: bpy.types.Action) -> None:
    animation_data = armature.animation_data
    if animation_data is None:
        raise ValueError("Spellblade armature has no animation data")
    start = max(1, int(round(action.frame_range[0])))
    track = animation_data.nla_tracks.new()
    track.name = f"{action.name}__STASH"
    strip = track.strips.new(action.name, start, action)
    strip.action_frame_start = action.frame_range[0]
    strip.action_frame_end = action.frame_range[1]
    # Stashed clips are export sources, not simultaneously evaluated poses.
    track.mute = True


def _build_action(
    armature: bpy.types.Object,
    name: str,
    keyframes: tuple[tuple[int, dict[str, tuple[float, float, float]]], ...],
) -> bpy.types.Action:
    animation_data = armature.animation_data_create()
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    animation_data.action = action

    for frame, rotations in keyframes:
        _key_frame(armature, frame, rotations)

    _stash_action(armature, action)
    animation_data.action = None
    return action


def _clip_poses() -> dict[str, tuple[tuple[int, dict[str, tuple[float, float, float]]], ...]]:
    neutral = _pose(
        **{
            "upper_arm.L": (2, 0, -5), "forearm.L": (3, 0, 4),
            "upper_arm.R": (2, 0, 5), "forearm.R": (5, 0, -4),
            "tabard_front_01": (2, 0, 0), "tabard_back_01": (-2, 0, 0),
        }
    )

    return {
        "Idle": (
            (1, neutral),
            (30, _pose(**{**neutral, "chest": (1.5, 0, 1.5), "head": (-1.0, 0, -1.2), "hand.L": (0, 0, -4)})),
            (60, neutral),
        ),
        "Run": (
            (1, _pose(**{"chest": (7, 0, -4), "upper_arm.L": (-28, 0, -10), "upper_arm.R": (30, 0, 10), "thigh.L": (31, 0, 0), "shin.L": (-12, 0, 0), "thigh.R": (-30, 0, 0), "shin.R": (28, 0, 0), "tabard_front_01": (-10, 0, 0), "tabard_back_01": (15, 0, 0)})),
            (6, _pose(**{"chest": (9, 0, 3), "upper_arm.L": (7, 0, -7), "upper_arm.R": (-8, 0, 7), "thigh.L": (3, 0, 0), "shin.L": (17, 0, 0), "thigh.R": (-3, 0, 0), "shin.R": (12, 0, 0), "tabard_front_01": (3, 0, 0), "tabard_back_01": (-4, 0, 0)})),
            (11, _pose(**{"chest": (7, 0, 4), "upper_arm.L": (30, 0, -10), "upper_arm.R": (-28, 0, 10), "thigh.L": (-30, 0, 0), "shin.L": (28, 0, 0), "thigh.R": (31, 0, 0), "shin.R": (-12, 0, 0), "tabard_front_01": (-10, 0, 0), "tabard_back_01": (15, 0, 0)})),
            (16, _pose(**{"chest": (9, 0, -3), "upper_arm.L": (-8, 0, -7), "upper_arm.R": (7, 0, 7), "thigh.L": (-3, 0, 0), "shin.L": (12, 0, 0), "thigh.R": (3, 0, 0), "shin.R": (17, 0, 0), "tabard_front_01": (3, 0, 0), "tabard_back_01": (-4, 0, 0)})),
            (21, _pose(**{"chest": (7, 0, -4), "upper_arm.L": (-28, 0, -10), "upper_arm.R": (30, 0, 10), "thigh.L": (31, 0, 0), "shin.L": (-12, 0, 0), "thigh.R": (-30, 0, 0), "shin.R": (28, 0, 0), "tabard_front_01": (-10, 0, 0), "tabard_back_01": (15, 0, 0)})),
        ),
        "Air": (
            (1, _pose(**{"chest": (9, 0, 0), "upper_arm.L": (-8, 0, -12), "upper_arm.R": (-4, 0, 12), "thigh.L": (18, 0, -5), "shin.L": (24, 0, 0), "thigh.R": (10, 0, 5), "shin.R": (18, 0, 0), "foot.L": (-10, 0, 0), "foot.R": (-10, 0, 0), "tabard_front_01": (-14, 0, 0), "tabard_back_01": (18, 0, 0)})),
            (18, _pose(**{"chest": (6, 0, 0), "upper_arm.L": (-4, 0, -8), "upper_arm.R": (0, 0, 8), "thigh.L": (13, 0, -4), "shin.L": (18, 0, 0), "thigh.R": (7, 0, 4), "shin.R": (14, 0, 0), "foot.L": (-5, 0, 0), "foot.R": (-5, 0, 0), "tabard_front_01": (-8, 0, 0), "tabard_back_01": (10, 0, 0)})),
        ),
        "Guard": (
            (1, neutral),
            (8, _pose(**{"chest": (-3, 0, -9), "head": (2, 0, 7), "clavicle.R": (0, -10, -10), "upper_arm.R": (-38, -18, 30), "forearm.R": (-58, 10, -22), "hand.R": (0, -18, 20), "clavicle.L": (0, 8, 10), "upper_arm.L": (-20, 18, -28), "forearm.L": (-40, -6, 18), "thigh.L": (8, 0, -4), "thigh.R": (-6, 0, 4)})),
            (24, _pose(**{"chest": (-3, 0, -9), "head": (2, 0, 7), "upper_arm.R": (-38, -18, 30), "forearm.R": (-58, 10, -22), "hand.R": (0, -18, 20), "upper_arm.L": (-20, 18, -28), "forearm.L": (-40, -6, 18), "thigh.L": (8, 0, -4), "thigh.R": (-6, 0, 4)})),
        ),
        "Slash_1": (
            (1, _pose(**{"chest": (0, 0, -18), "upper_arm.R": (-58, -12, 38), "forearm.R": (-50, 8, -28), "hand.R": (0, -12, 24), "upper_arm.L": (8, 0, -10)})),
            (8, _pose(**{"chest": (4, 0, 20), "upper_arm.R": (52, 12, -35), "forearm.R": (34, -6, 22), "hand.R": (0, 16, -24), "upper_arm.L": (-12, 0, 12), "tabard_front_01": (8, 0, 0)})),
            (16, _pose(**{"chest": (2, 0, 9), "upper_arm.R": (24, 4, -18), "forearm.R": (16, 0, 10), "upper_arm.L": (-5, 0, 5)})),
            (24, neutral),
        ),
        "Slash_2": (
            (1, _pose(**{"chest": (0, 0, 18), "upper_arm.R": (-28, 22, -42), "forearm.R": (-46, -10, 30), "hand.R": (0, 14, -28), "upper_arm.L": (4, 0, 12)})),
            (8, _pose(**{"chest": (5, 0, -23), "upper_arm.R": (48, -18, 36), "forearm.R": (36, 8, -24), "hand.R": (0, -12, 22), "upper_arm.L": (-10, 0, -12), "tabard_front_01": (8, 0, 0)})),
            (17, _pose(**{"chest": (2, 0, -8), "upper_arm.R": (20, -5, 16), "forearm.R": (14, 0, -9)})),
            (24, neutral),
        ),
        "Slash_3": (
            (1, _pose(**{"chest": (-8, 0, 0), "upper_arm.R": (-72, -8, 10), "forearm.R": (-65, 0, -8), "hand.R": (0, -12, 5), "upper_arm.L": (-20, 0, -10), "forearm.L": (-28, 0, 14)})),
            (9, _pose(**{"chest": (17, 0, 0), "upper_arm.R": (58, 5, -4), "forearm.R": (48, 0, 6), "upper_arm.L": (8, 0, 8), "thigh.L": (8, 0, 0), "thigh.R": (8, 0, 0), "tabard_front_01": (12, 0, 0)})),
            (19, _pose(**{"chest": (6, 0, 0), "upper_arm.R": (24, 0, 0), "forearm.R": (18, 0, 0)})),
            (28, neutral),
        ),
        "Cast": (
            (1, neutral),
            (9, _pose(**{"chest": (-5, 0, 10), "head": (0, 0, -8), "clavicle.L": (0, 8, -8), "upper_arm.L": (-48, 12, -44), "forearm.L": (-38, -8, -22), "hand.L": (0, 12, -18), "upper_arm.R": (8, 0, 8), "tabard_front_01": (-5, 0, 0)})),
            (16, _pose(**{"chest": (6, 0, -13), "head": (-2, 0, 10), "upper_arm.L": (18, -8, -58), "forearm.L": (8, 5, -18), "hand.L": (0, -18, -32), "upper_arm.R": (-6, 0, 5), "tabard_front_01": (8, 0, 0)})),
            (30, neutral),
        ),
        "Dash": (
            (1, neutral),
            (4, _pose(**{"pelvis": (10, 0, 0), "spine": (16, 0, 0), "chest": (18, 0, 0), "head": (-14, 0, 0), "upper_arm.L": (28, 0, -16), "upper_arm.R": (34, 0, 16), "forearm.L": (18, 0, 0), "forearm.R": (18, 0, 0), "thigh.L": (14, 0, -4), "thigh.R": (14, 0, 4), "tabard_front_01": (-22, 0, 0), "tabard_back_01": (28, 0, 0)})),
            (12, _pose(**{"pelvis": (8, 0, 0), "spine": (14, 0, 0), "chest": (16, 0, 0), "head": (-12, 0, 0), "upper_arm.L": (24, 0, -14), "upper_arm.R": (30, 0, 14), "thigh.L": (10, 0, -3), "thigh.R": (10, 0, 3), "tabard_front_01": (-18, 0, 0), "tabard_back_01": (24, 0, 0)})),
        ),
        "Stagger": (
            (1, neutral),
            (5, _pose(**{"pelvis": (-5, 0, 10), "spine": (-9, 0, 18), "chest": (-16, 0, 25), "head": (12, 0, -18), "upper_arm.L": (-18, 0, -24), "upper_arm.R": (22, 0, 28), "forearm.L": (20, 0, 10), "forearm.R": (-16, 0, -12), "thigh.L": (-8, 0, -8), "thigh.R": (11, 0, 8), "tabard_front_01": (10, 0, 5)})),
            (11, _pose(**{"pelvis": (3, 0, -5), "spine": (4, 0, -9), "chest": (8, 0, -12), "head": (-5, 0, 9), "upper_arm.L": (8, 0, 10), "upper_arm.R": (-10, 0, -12)})),
            (18, neutral),
        ),
        "Death": (
            (1, neutral),
            (10, _pose(**{"pelvis": (12, 0, 8), "spine": (22, 0, 14), "chest": (32, 0, 18), "head": (-20, 0, -15), "upper_arm.L": (24, 0, -34), "upper_arm.R": (18, 0, 30), "forearm.L": (28, 0, 15), "forearm.R": (20, 0, -12), "thigh.L": (22, 0, -8), "thigh.R": (8, 0, 12), "shin.L": (-28, 0, 0), "shin.R": (16, 0, 0)})),
            (24, _pose(**{"pelvis": (48, 0, 18), "spine": (35, 0, 12), "chest": (48, 0, 18), "head": (-32, 0, -18), "upper_arm.L": (52, 0, -42), "upper_arm.R": (45, 0, 38), "forearm.L": (34, 0, 12), "forearm.R": (26, 0, -10), "thigh.L": (44, 0, -12), "thigh.R": (18, 0, 15), "shin.L": (-52, 0, 0), "shin.R": (-22, 0, 0), "tabard_front_01": (22, 0, 0), "tabard_back_01": (-16, 0, 0)})),
            (36, _pose(**{"pelvis": (62, 0, 20), "spine": (42, 0, 8), "chest": (55, 0, 15), "head": (-38, 0, -12), "upper_arm.L": (64, 0, -48), "upper_arm.R": (56, 0, 42), "forearm.L": (42, 0, 14), "forearm.R": (32, 0, -8), "thigh.L": (58, 0, -15), "thigh.R": (26, 0, 18), "shin.L": (-66, 0, 0), "shin.R": (-34, 0, 0), "tabard_front_01": (28, 0, 0), "tabard_back_01": (-22, 0, 0)})),
        ),
    }


def build_actions(armature: bpy.types.Object, contract: dict) -> dict[str, bpy.types.Action]:
    required = tuple(contract.get("clips", ()))
    poses = _clip_poses()
    missing_specs = [name for name in required if name not in poses]
    if missing_specs:
        raise ValueError(f"Spellblade animation source missing clip poses: {missing_specs}")

    actions: dict[str, bpy.types.Action] = {}
    for name in required:
        actions[name] = _build_action(armature, name, poses[name])

    # Keep Idle active for neutral review renders; every other action remains stashed.
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60
    bpy.context.scene.frame_set(1)
    return actions
