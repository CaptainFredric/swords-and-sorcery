"""Report exactly what changed between two Spellblade source files.

Run from the repository root, comparing the working source with a committed one:

    git show HEAD:tools/blender/characters/spellblade/source/spellblade-third-person.blend > /tmp/before.blend
    blender --background --factory-startup --python-exit-code 1 \
      --python tools/blender/characters/spellblade/review/scope_diff.py -- \
      /tmp/before.blend tools/blender/characters/spellblade/source/spellblade-third-person.blend \
      [--expect HelmetShell,HelmetCrownBand]

Each object is fingerprinted by transform, parent, modifiers, vertex groups,
vertex positions, weights, topology and materials; each action by its curves
and keys; each image by its packed bytes; bones by rest head, tail and parent.
With --expect, the run fails when anything outside the named objects changed,
so a focused art pass proves it left rig, animation and other armor untouched.
"""
from __future__ import annotations

import hashlib
import sys

import bpy


def _digest(value) -> str:
    return hashlib.sha256(repr(value).encode()).hexdigest()[:16]


def fingerprint(path: str) -> dict:
    bpy.ops.wm.open_mainfile(filepath=path)
    result = {}
    for obj in bpy.data.objects:
        entry = {
            "transform": _digest([round(x, 6) for row in obj.matrix_world for x in row]),
            "parent": (obj.parent.name if obj.parent else None, obj.parent_type, obj.parent_bone),
            "modifiers": _digest([(m.name, m.type) for m in obj.modifiers]),
            "groups": [g.name for g in obj.vertex_groups],
            "collections": sorted(c.name for c in obj.users_collection),
        }
        if obj.type == "MESH":
            mesh = obj.data
            entry["positions"] = _digest([tuple(round(c, 6) for c in v.co) for v in mesh.vertices])
            entry["weights"] = _digest([[(g.group, round(g.weight, 6)) for g in v.groups] for v in mesh.vertices])
            entry["topology"] = _digest([tuple(p.vertices) for p in mesh.polygons])
            entry["materials"] = _digest(([m.name if m else None for m in mesh.materials], [p.material_index for p in mesh.polygons]))
        if obj.type == "ARMATURE":
            entry["bones"] = _digest([(b.name, b.parent.name if b.parent else None,
                                       [round(x, 6) for x in b.head_local], [round(x, 6) for x in b.tail_local])
                                      for b in obj.data.bones])
        result[f"object:{obj.name}"] = entry
    for action in bpy.data.actions:
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    for curve in bag.fcurves if bag else []:
                        curves.append((curve.data_path, curve.array_index,
                                       [(round(k.co.x, 5), round(k.co.y, 6), k.interpolation) for k in curve.keyframe_points]))
        result[f"action:{action.name}"] = {"curves": _digest(curves)}
    for image in bpy.data.images:
        packed = image.packed_file
        result[f"image:{image.name}"] = {"packed": _digest(bytes(packed.data)) if packed else None, "fakeUser": image.use_fake_user}
    return result


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    expect = None
    if "--expect" in args:
        index = args.index("--expect")
        expect = {name for name in args[index + 1].split(",") if name}
        args = args[:index] + args[index + 2:]
    before, after = fingerprint(args[0]), fingerprint(args[1])
    changed = []
    for key in sorted(set(before) | set(after)):
        if key not in before or key not in after:
            changed.append((key, ["added" if key in after else "removed"]))
        elif before[key] != after[key]:
            changed.append((key, [field for field in before[key] if before[key][field] != after[key].get(field)]))
    for key, fields in changed:
        print(f"SCOPE_CHANGED {key}: {', '.join(fields)}")
    print(f"SCOPE_SUMMARY {len(changed)} changed of {len(set(before) | set(after))}")
    if expect is not None:
        unexpected = [key for key, _ in changed if key.split(":", 1)[1] not in expect]
        if unexpected:
            raise SystemExit(f"Changes outside the expected scope: {unexpected}")
        print("SCOPE_OK")


if __name__ == "__main__":
    main()
