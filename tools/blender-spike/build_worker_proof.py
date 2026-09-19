from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts" / "blender-spike"
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0, roughness: float = 0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def cube(name: str, location, scale, mat, bevel: float = 0.04):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("LowPolyBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
    obj.data.materials.append(mat)
    return obj


def add_armature():
    arm_data = bpy.data.armatures.new("WorkerProofRig")
    arm = bpy.data.objects.new("WorkerProofRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
        return b

    bone("root", (0, 0, 0.0), (0, 0, 0.75))
    bone("spine", (0, 0, 0.75), (0, 0, 1.55), "root")
    bone("head", (0, 0, 1.55), (0, 0, 2.05), "spine")
    bone("upper_arm.L", (-0.42, 0, 1.47), (-0.78, 0, 1.18), "spine")
    bone("forearm.L", (-0.78, 0, 1.18), (-0.92, 0, 0.82), "upper_arm.L")
    bone("upper_arm.R", (0.42, 0, 1.47), (0.78, 0, 1.18), "spine")
    bone("forearm.R", (0.78, 0, 1.18), (0.92, 0, 0.82), "upper_arm.R")
    bone("thigh.L", (-0.2, 0, 0.78), (-0.22, 0, 0.38), "root")
    bone("shin.L", (-0.22, 0, 0.38), (-0.22, 0, 0.02), "thigh.L")
    bone("thigh.R", (0.2, 0, 0.78), (0.22, 0, 0.38), "root")
    bone("shin.R", (0.22, 0, 0.38), (0.22, 0, 0.02), "thigh.R")

    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    return arm


def skin_rigid(obj, armature, bone_name: str) -> None:
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = armature
    obj.parent = armature


def bone_parent(obj, armature, bone_name: str, matrix_world=None) -> None:
    if matrix_world is None:
        matrix_world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = matrix_world


def look_at(camera, point=(0.0, 0.0, 1.05)) -> None:
    direction = Vector(point) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_scene() -> tuple[bpy.types.Object, bpy.types.Object]:
    clear_scene()

    steel = material("Steel", (0.22, 0.25, 0.31, 1.0), metallic=0.7, roughness=0.38)
    steel_hi = material("SteelHighlight", (0.45, 0.47, 0.54, 1.0), metallic=0.78, roughness=0.28)
    cloth = material("Crimson", (0.36, 0.055, 0.045, 1.0), metallic=0.0, roughness=0.76)
    magic = material("Sorcery", (0.08, 0.65, 1.0, 1.0), metallic=0.05, roughness=0.24)
    magic.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (0.08, 0.65, 1.0, 1.0)
    magic.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 3.0

    rig = add_armature()

    torso = cube("SkinnedTorso", (0, 0, 1.14), (0.43, 0.23, 0.43), steel, 0.065)
    skin_rigid(torso, rig, "spine")

    head = cube("Helmet", (0, -0.005, 1.78), (0.28, 0.27, 0.26), steel, 0.055)
    skin_rigid(head, rig, "head")
    visor = cube("Visor", (0, -0.286, 1.76), (0.21, 0.025, 0.045), magic, 0.018)
    skin_rigid(visor, rig, "head")
    crest = cube("Crest", (0, 0.02, 2.05), (0.075, 0.12, 0.24), cloth, 0.025)
    skin_rigid(crest, rig, "head")

    for suffix, sign in (("L", -1), ("R", 1)):
        upper = cube(f"UpperArm.{suffix}", (sign * 0.61, 0, 1.31), (0.18, 0.19, 0.28), steel, 0.045)
        skin_rigid(upper, rig, f"upper_arm.{suffix}")
        shoulder = cube(f"Pauldron.{suffix}", (sign * 0.57, 0, 1.49), (0.27, 0.24, 0.17), steel_hi, 0.055)
        skin_rigid(shoulder, rig, f"upper_arm.{suffix}")
        fore = cube(f"Forearm.{suffix}", (sign * 0.86, 0, 0.98), (0.15, 0.17, 0.27), steel, 0.04)
        skin_rigid(fore, rig, f"forearm.{suffix}")

        thigh = cube(f"Thigh.{suffix}", (sign * 0.21, 0, 0.59), (0.18, 0.19, 0.25), steel, 0.04)
        skin_rigid(thigh, rig, f"thigh.{suffix}")
        shin = cube(f"Shin.{suffix}", (sign * 0.22, 0, 0.20), (0.18, 0.20, 0.24), steel, 0.04)
        skin_rigid(shin, rig, f"shin.{suffix}")
        boot = cube(f"Boot.{suffix}", (sign * 0.22, -0.08, -0.02), (0.22, 0.31, 0.12), steel_hi, 0.04)
        skin_rigid(boot, rig, f"shin.{suffix}")

    tabard = cube("Tabard", (0, -0.25, 0.83), (0.18, 0.035, 0.46), cloth, 0.018)
    skin_rigid(tabard, rig, "spine")

    sword = cube("ProofSwordBlade", (0.99, 0, 0.72), (0.10, 0.035, 0.63), steel_hi, 0.018)
    sword.rotation_euler[1] = math.radians(-18)
    bone_parent(sword, rig, "forearm.R")

    magic_core = cube("ProofMagicCore", (-0.99, -0.02, 0.69), (0.105, 0.105, 0.105), magic, 0.025)
    magic_core.rotation_euler = (0.5, 0.4, 0.2)
    bone_parent(magic_core, rig, "forearm.L")

    action = bpy.data.actions.new("Proof_Guard")
    rig.animation_data_create()
    rig.animation_data.action = action
    for bone_name in ("upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"):
        rig.pose.bones[bone_name].rotation_mode = "XYZ"

    for frame in (1, 48):
        rig.pose.bones["upper_arm.L"].rotation_euler = (0, 0, 0)
        rig.pose.bones["upper_arm.R"].rotation_euler = (0, 0, 0)
        rig.pose.bones["forearm.L"].rotation_euler = (0, 0, 0)
        rig.pose.bones["forearm.R"].rotation_euler = (0, 0, 0)
        for bone_name in ("upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"):
            rig.pose.bones[bone_name].keyframe_insert("rotation_euler", frame=frame, group="Guard")

    rig.pose.bones["upper_arm.L"].rotation_euler = (math.radians(-35), math.radians(-8), math.radians(-24))
    rig.pose.bones["upper_arm.R"].rotation_euler = (math.radians(-48), math.radians(12), math.radians(28))
    rig.pose.bones["forearm.L"].rotation_euler = (math.radians(-62), 0, math.radians(14))
    rig.pose.bones["forearm.R"].rotation_euler = (math.radians(-78), 0, math.radians(-18))
    for bone_name in ("upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"):
        rig.pose.bones[bone_name].keyframe_insert("rotation_euler", frame=24, group="Guard")

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 48
    bpy.context.scene.frame_set(24)

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.16))
    floor = bpy.context.object
    floor.name = "Floor"
    floor.data.materials.append(material("FloorMat", (0.025, 0.03, 0.038, 1.0), roughness=0.92))

    bpy.ops.object.light_add(type="AREA", location=(3.4, -4.0, 5.6))
    key = bpy.context.object
    key.name = "Key"
    key.data.energy = 950
    key.data.shape = "DISK"
    key.data.size = 4.5
    look_at(key, (0, 0, 1.0))

    bpy.ops.object.light_add(type="AREA", location=(-4.0, 2.0, 3.2))
    fill = bpy.context.object
    fill.name = "Fill"
    fill.data.energy = 600
    fill.data.color = (0.25, 0.62, 1.0)
    fill.data.size = 4.0
    look_at(fill, (0, 0, 1.0))

    bpy.ops.object.camera_add(location=(0, -6.2, 1.55))
    camera = bpy.context.object
    camera.name = "ProofCamera"
    camera.data.lens = 58
    bpy.context.scene.camera = camera
    look_at(camera, (0, 0, 1.0))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.012, 0.015, 0.021)

    return rig, camera


def render_views(camera) -> None:
    views = {
        "front": ((0, -6.2, 1.55), (0, 0, 1.0)),
        "back": ((0, 6.2, 1.55), (0, 0, 1.0)),
        "side": ((6.2, 0, 1.55), (0, 0, 1.0)),
        "quarter": ((4.5, -4.5, 1.75), (0, 0, 1.0)),
    }
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        bpy.context.scene.render.filepath = str(OUT / f"worker-proof-{name}.png")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    rig, camera = build_scene()
    blend_path = OUT / "worker-proof.blend"
    glb_path = OUT / "worker-proof.glb"

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=False,
    )
    render_views(camera)

    print(f"BLENDER_SPIKE_OK blend={blend_path} glb={glb_path} action={rig.animation_data.action.name}")


if __name__ == "__main__":
    main()
