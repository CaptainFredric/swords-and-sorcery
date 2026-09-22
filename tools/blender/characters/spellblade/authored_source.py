"""Read artist-owned Blender data without regenerating geometry or actions."""
from pathlib import Path
import bpy
from .model import ModelParts


def load_authored_source(path: Path, collection_name: str):
    path = path.resolve()
    if not path.is_file():
        raise ValueError(f"Missing authored Spellblade source: {path}")
    bpy.ops.wm.open_mainfile(filepath=str(path))
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        raise ValueError(f"Source must contain {collection_name} export collection")
    objects = tuple(collection.all_objects)
    rigs = [obj for obj in objects if obj.type == 'ARMATURE']
    if len(rigs) != 1:
        raise ValueError(f"{collection_name} must contain exactly one armature")
    armature = rigs[0]
    meshes = tuple(obj for obj in objects if obj.type == 'MESH')
    if not meshes:
        raise ValueError(f"{collection_name} has no mesh geometry")
    materials = {mat.name: mat for obj in meshes for mat in obj.data.materials if mat}
    actions = {action.name: action for action in bpy.data.actions}
    return armature, ModelParts(objects=meshes, materials=materials), actions


def validate_output_paths(sources: tuple[Path, ...], out: Path) -> None:
    """Fail before export if an evidence copy could overwrite an artist input."""
    inputs = {path.resolve() for path in sources}
    for filename in ("spellblade-third-person.blend", "spellblade-first-person.blend"):
        destination = (out / filename).resolve()
        if destination in inputs:
            raise ValueError(f"Export would overwrite authored source: {destination}")
