from __future__ import annotations

from dataclasses import dataclass
from math import radians
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

from tools.blender.common.export import export_glb
from tools.blender.common.render import configure_render, look_at, render_still
from tools.blender.characters.spellblade.animations import (
    ANIMATION_FPS,
    SLASH_CONTACT_SECONDS,
    SLASH_DURATIONS_SECONDS,
)
from tools.blender.characters.spellblade.model import (
    _beveled_box,
    _bone_parent_keep_world,
    _cylinder_between,
    _wedge,
    build_hero_sword,
    build_materials,
)
from tools.blender.characters.spellblade.rig import rigid_skin


FIRST_PERSON_BONES = {
    "root": ((0.0, 0.0, 0.0), (0.0, 0.10, 0.0), None, False),
    "upper_arm.L": ((-0.52, 0.12, -0.50), (-0.47, 0.31, -0.44), "root", True),
    "forearm.L": ((-0.47, 0.31, -0.44), (-0.40, 0.52, -0.34), "upper_arm.L", True),
    "hand.L": ((-0.40, 0.52, -0.34), (-0.34, 0.62, -0.29), "forearm.L", True),
    "socket_sorcery": ((-0.34, 0.62, -0.29), (-0.34, 0.78, -0.29), "hand.L", False),
    "upper_arm.R": ((0.52, 0.12, -0.48), (0.48, 0.32, -0.42), "root", True),
    "forearm.R": ((0.48, 0.32, -0.42), (0.43, 0.55, -0.31), "upper_arm.R", True),
    "hand.R": ((0.43, 0.55, -0.31), (0.40, 0.65, -0.24), "forearm.R", True),
    "socket_sword": ((0.40, 0.65, -0.24), (0.40, 0.81, -0.24), "hand.R", False),
}

FIRST_PERSON_CLIPS = (
    "Idle", "Guard", "Slash_1", "Slash_2", "Slash_3", "Cast", "Dash", "Stagger",
)

_ANIMATED_FP_BONES = (
    "upper_arm.L", "forearm.L", "hand.L",
    "upper_arm.R", "forearm.R", "hand.R",
)

_REVIEW_FRAMES = {
    "fp-neutral": ("Idle", 1),
    "fp-guard": ("Guard", 8),
    "fp-slash": ("Slash_1", 1 + round(SLASH_CONTACT_SECONDS[0] * ANIMATION_FPS)),
    "fp-cast": ("Cast", 8),
}


@dataclass(frozen=True)
class FirstPersonBuild:
    glb: Path
    blend: Path
    triangles: int
    triangle_budget: int
    glb_bytes: int
    target_bytes: int
    animations: tuple[str, ...]
    renders: dict[str, Path]


def _seconds_to_frame(seconds: float) -> int:
    return 1 + int(round(seconds * ANIMATION_FPS))


def _build_armature() -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("SpellbladeFirstPersonRig")
    armature = bpy.data.objects.new("SpellbladeFirstPersonRig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.location = (0.0, 0.0, 0.0)
    armature.rotation_euler = (0.0, 0.0, 0.0)
    armature.scale = (1.0, 1.0, 1.0)

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent_name, deform) in FIRST_PERSON_BONES.items():
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = deform
        if parent_name is not None:
            bone.parent = armature_data.edit_bones[parent_name]
            bone.use_connect = tuple(bone.head) == tuple(bone.parent.tail)
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def _skin_segment(
    name: str,
    armature: bpy.types.Object,
    bone_name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    obj = _cylinder_between(name, start, end, radius, material, vertices=8)
    rigid_skin(obj, armature, bone_name)
    return obj


def _build_arm_geometry(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side in ("L", "R"):
        upper = FIRST_PERSON_BONES[f"upper_arm.{side}"]
        forearm = FIRST_PERSON_BONES[f"forearm.{side}"]
        hand = FIRST_PERSON_BONES[f"hand.{side}"]

        objects.append(_skin_segment(
            f"FPUpperArm.{side}", armature, f"upper_arm.{side}",
            upper[0], upper[1], 0.105, materials["Leather"],
        ))
        objects.append(_skin_segment(
            f"FPBracer.{side}", armature, f"forearm.{side}",
            forearm[0], forearm[1], 0.125, materials["DarkSteel"],
        ))
        objects.append(_skin_segment(
            f"FPGauntlet.{side}", armature, f"hand.{side}",
            hand[0], hand[1], 0.13, materials["DarkSteel"],
        ))
        knuckle_center = Vector(hand[1]) + Vector((0.0, 0.025, 0.012))
        knuckle = _beveled_box(
            f"FPKnuckle.{side}", tuple(knuckle_center), (0.23, 0.12, 0.095),
            materials["SteelEdge"], bevel=0.018,
        )
        rigid_skin(knuckle, armature, f"hand.{side}")
        objects.append(knuckle)
    return objects


def _place_shared_sword(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    sword_parts = build_hero_sword(armature, materials)
    source_socket = Vector((0.96, 0.09, 0.79))
    target_socket = Vector(FIRST_PERSON_BONES["socket_sword"][0])
    transform = (
        Matrix.Translation(target_socket)
        @ Matrix.Rotation(radians(-35.0), 4, "X")
        @ Matrix.Rotation(radians(-10.0), 4, "Y")
        @ Matrix.Translation(-source_socket)
    )
    for obj in sword_parts:
        obj.matrix_world = transform @ obj.matrix_world
    return sword_parts


def _build_sorcery(
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    center = Vector(FIRST_PERSON_BONES["socket_sorcery"][0])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.075, location=center)
    core = bpy.context.object
    core.name = "FPSorceryCore"
    core.data.materials.append(materials["SorceryAccent"])
    _bone_parent_keep_world(core, armature, "socket_sorcery")
    objects = [core]

    offsets = ((-0.075, 0.025, 0.055), (0.070, 0.035, 0.030), (-0.020, 0.020, -0.070))
    for index, offset in enumerate(offsets, start=1):
        shard = _wedge(
            f"FPSorceryShard.{index}",
            center=tuple(center + Vector(offset)),
            width=0.040,
            depth=0.050,
            height=0.105,
            material=materials["SorceryAccent"],
            forward_tip=0.016,
        )
        _bone_parent_keep_world(shard, armature, "socket_sorcery")
        objects.append(shard)
    return objects


def _reset_pose(armature: bpy.types.Object) -> None:
    for name in _ANIMATED_FP_BONES:
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def _key_pose(
    armature: bpy.types.Object,
    frame: int,
    rotations: dict[str, tuple[float, float, float]],
) -> None:
    _reset_pose(armature)
    for name, degrees in rotations.items():
        bone = armature.pose.bones.get(name)
        if bone is None:
            raise ValueError(f"First-person animation references missing bone {name}")
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = tuple(radians(value) for value in degrees)
    for name in _ANIMATED_FP_BONES:
        bone = armature.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)


def _stash_action(armature: bpy.types.Object, action: bpy.types.Action) -> None:
    animation_data = armature.animation_data
    if animation_data is None:
        raise ValueError("First-person armature has no animation data")
    start = max(1, int(round(action.frame_range[0])))
    track = animation_data.nla_tracks.new()
    track.name = f"{action.name}__STASH"
    strip = track.strips.new(action.name, start, action)
    strip.action_frame_start = action.frame_range[0]
    strip.action_frame_end = action.frame_range[1]
    track.mute = True


def _make_action(
    armature: bpy.types.Object,
    name: str,
    keyframes: tuple[tuple[int, dict[str, tuple[float, float, float]]], ...],
) -> bpy.types.Action:
    animation_data = armature.animation_data_create()
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    animation_data.action = action
    for frame, rotations in keyframes:
        _key_pose(armature, frame, rotations)
    _stash_action(armature, action)
    animation_data.action = None
    return action


def _build_actions(armature: bpy.types.Object, contract: dict) -> dict[str, bpy.types.Action]:
    neutral = {
        "upper_arm.L": (-4, 0, 6), "forearm.L": (-5, 0, -3), "hand.L": (2, 0, 3),
        "upper_arm.R": (-2, 0, -5), "forearm.R": (-4, 0, 4), "hand.R": (2, 0, -2),
    }
    slash_end = [_seconds_to_frame(value) for value in SLASH_DURATIONS_SECONDS]
    slash_contact = [_seconds_to_frame(value) for value in SLASH_CONTACT_SECONDS]
    specs = {
        "Idle": ((1, neutral), (30, {**neutral, "hand.L": (4, 0, 6), "hand.R": (0, 0, -4)}), (60, neutral)),
        "Guard": (
            (1, neutral),
            (8, {"upper_arm.R": (-35, -12, 24), "forearm.R": (-42, 8, -20), "hand.R": (-12, -18, 18),
                 "upper_arm.L": (-24, 8, -20), "forearm.L": (-30, -5, 12), "hand.L": (-8, 10, -8)}),
            (24, {"upper_arm.R": (-35, -12, 24), "forearm.R": (-42, 8, -20), "hand.R": (-12, -18, 18),
                  "upper_arm.L": (-24, 8, -20), "forearm.L": (-30, -5, 12), "hand.L": (-8, 10, -8)}),
        ),
        "Slash_1": (
            (1, {"upper_arm.R": (-48, -12, 28), "forearm.R": (-36, 8, -24), "hand.R": (-10, -12, 18),
                 "upper_arm.L": (-5, 0, 6), "forearm.L": (-4, 0, -3)}),
            (slash_contact[0], {"upper_arm.R": (38, 12, -32), "forearm.R": (24, -8, 18), "hand.R": (12, 14, -18),
                                "upper_arm.L": (-8, 0, -6), "forearm.L": (-2, 0, 4)}),
            (slash_end[0], neutral),
        ),
        "Slash_2": (
            (1, {"upper_arm.R": (-30, 16, -34), "forearm.R": (-42, -6, 24), "hand.R": (-6, 12, -20),
                 "upper_arm.L": (-4, 0, 8), "forearm.L": (-4, 0, -4)}),
            (slash_contact[1], {"upper_arm.R": (34, -16, 30), "forearm.R": (22, 8, -20), "hand.R": (10, -12, 16),
                                "upper_arm.L": (-6, 0, -8), "forearm.L": (-2, 0, 4)}),
            (slash_end[1], neutral),
        ),
        "Slash_3": (
            (1, {"upper_arm.R": (-64, -6, 8), "forearm.R": (-54, 0, -8), "hand.R": (-14, -8, 2),
                 "upper_arm.L": (-16, 0, -8), "forearm.L": (-20, 0, 10)}),
            (slash_contact[2], {"upper_arm.R": (46, 5, -4), "forearm.R": (34, 0, 6), "hand.R": (16, 2, -4),
                                "upper_arm.L": (4, 0, 8), "forearm.L": (-8, 0, -4)}),
            (slash_end[2], neutral),
        ),
        "Cast": (
            (1, neutral),
            (5, {"upper_arm.L": (-38, 12, -36), "forearm.L": (-34, -8, -18), "hand.L": (-12, 10, -14),
                 "upper_arm.R": (4, 0, -4), "forearm.R": (-2, 0, 3), "hand.R": (0, 0, -2)}),
            (8, {"upper_arm.L": (12, -8, -50), "forearm.L": (8, 4, -14), "hand.L": (12, -16, -26),
                 "upper_arm.R": (0, 0, -2), "forearm.R": (0, 0, 2), "hand.R": (0, 0, -2)}),
            (12, neutral),
        ),
        "Dash": (
            (1, neutral),
            (3, {"upper_arm.L": (22, 0, -12), "forearm.L": (12, 0, 0), "hand.L": (0, 0, 0),
                 "upper_arm.R": (28, 0, 12), "forearm.R": (14, 0, 0), "hand.R": (0, 0, 0)}),
            (7, neutral),
        ),
        "Stagger": (
            (1, neutral),
            (4, {"upper_arm.L": (-18, 0, -24), "forearm.L": (16, 0, 8), "hand.L": (6, 0, 8),
                 "upper_arm.R": (20, 0, 28), "forearm.R": (-14, 0, -12), "hand.R": (-8, 0, -6)}),
            (10, neutral),
        ),
    }
    required = tuple(contract.get("firstPersonClips", ()))
    missing = [name for name in required if name not in specs]
    if missing:
        raise ValueError(f"First-person animation source missing clip poses: {missing}")
    actions = {name: _make_action(armature, name, specs[name]) for name in required}
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60
    bpy.context.scene.frame_set(1)
    return actions


def _triangle_count(objects: list[bpy.types.Object]) -> int:
    triangles = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return triangles


def _add_review_stage(scene: bpy.types.Scene) -> bpy.types.Object:
    if scene.world is None:
        scene.world = bpy.data.worlds.new("SpellbladeFirstPersonWorld")
    scene.world.color = (0.008, 0.011, 0.018)

    bpy.ops.object.light_add(type="AREA", location=(1.8, -0.2, 1.1))
    key = bpy.context.object
    key.data.energy = 850
    key.data.size = 2.4
    look_at(key, (0.0, 0.60, -0.30))

    bpy.ops.object.light_add(type="AREA", location=(-1.5, 0.2, 0.7))
    fill = bpy.context.object
    fill.data.energy = 420
    fill.data.color = (0.28, 0.50, 1.0)
    fill.data.size = 2.0
    look_at(fill, (0.0, 0.58, -0.32))

    bpy.ops.object.camera_add(location=(0.0, -0.04, 0.0))
    camera = bpy.context.object
    camera.name = "SpellbladeFirstPersonCamera"
    camera.data.lens = 22
    camera.data.sensor_width = 36
    camera.data.clip_start = 0.03
    camera.data.clip_end = 50.0
    look_at(camera, (0.0, 1.0, -0.22))
    return camera


def _render_reviews(
    scene: bpy.types.Scene,
    armature: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
    camera: bpy.types.Object,
    out: Path,
) -> dict[str, Path]:
    animation_data = armature.animation_data
    if animation_data is None:
        raise ValueError("First-person review requires animation data")
    paths: dict[str, Path] = {}
    for label, (action_name, frame) in _REVIEW_FRAMES.items():
        animation_data.action = actions[action_name]
        scene.frame_set(frame)
        path = out / f"spellblade-{label}.png"
        render_still(scene, camera, path)
        paths[label] = path
    animation_data.action = actions["Idle"]
    scene.frame_set(1)
    return paths


def build_first_person_asset(out: Path, contract: dict, mode: str) -> FirstPersonBuild:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_render(scene, mode)
    scene.render.fps = ANIMATION_FPS
    scene.render.fps_base = 1.0
    scene.render.resolution_x = min(scene.render.resolution_x, 384)
    scene.render.resolution_y = min(scene.render.resolution_y, 384)

    materials = build_materials()
    armature = _build_armature()
    objects = _build_arm_geometry(armature, materials)
    objects.extend(_place_shared_sword(armature, materials))
    objects.extend(_build_sorcery(armature, materials))
    actions = _build_actions(armature, contract)

    glb = out / "spellblade-fp.glb"
    export_glb(glb, objects=(armature, *objects))
    glb_bytes = glb.stat().st_size
    target_bytes = int(contract["firstPerson"]["targetBytes"])
    if glb_bytes > target_bytes:
        raise ValueError(f"First-person Spellblade GLB exceeds target byte budget: {glb_bytes} > {target_bytes}")

    triangles = _triangle_count(objects)
    triangle_budget = int(contract["firstPerson"]["maxTriangles"])
    if triangles > triangle_budget:
        raise ValueError(f"First-person Spellblade exceeds triangle budget: {triangles} > {triangle_budget}")

    camera = _add_review_stage(scene)
    renders = _render_reviews(scene, armature, actions, camera, out)
    blend = out / "spellblade-first-person.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    return FirstPersonBuild(
        glb=glb,
        blend=blend,
        triangles=triangles,
        triangle_budget=triangle_budget,
        glb_bytes=glb_bytes,
        target_bytes=target_bytes,
        animations=tuple(actions.keys()),
        renders=renders,
    )
