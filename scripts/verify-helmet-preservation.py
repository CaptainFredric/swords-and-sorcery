"""Compare accepted .blend with a helmet-only candidate; never saves either file.

Blender -b --factory-startup --python-exit-code 1 --python THIS -- BASELINE CANDIDATE
Only geometry of HelmetShell, HelmetJaw, Crest and Visor may change. All their
materials remain protected. UI layout, review cameras/lights and current frame
are deliberately outside this data contract.
"""
import hashlib
import json
import sys
from pathlib import Path
import bpy

HELMET = {'HelmetShell', 'HelmetJaw', 'Crest', 'Visor'}
COLLECTION = 'SpellbladeExport'
SKIP_RNA = {'rna_type', 'id_data', 'original', 'users', 'use_fake_user', 'is_embedded_data',
            'is_evaluated', 'is_runtime_data', 'is_library_indirect', 'library', 'library_weak_reference',
            'override_library', 'preview', 'asset_data', 'animation_data', 'tag', 'session_uid'}


def plain(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, bpy.types.ID):
        return {'id_type': v.bl_rna.identifier, 'name': v.name_full}
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in sorted(v.items())}
    if isinstance(v, set):
        return sorted(v)
    if hasattr(v, 'to_list'):
        return plain(v.to_list())
    if hasattr(v, 'to_dict'):
        return plain(v.to_dict())
    try:
        return [plain(x) for x in v]
    except TypeError:
        return str(v)


def custom(v):
    try:
        return {k: plain(v[k]) for k in sorted(v.keys()) if k != '_RNA_UI'}
    except (AttributeError, TypeError):
        return {}


def rna(v, skip=()):
    """Stored scalar/array/pointer properties, excluding transient computed data."""
    out = {'rna': v.bl_rna.identifier}
    for p in v.bl_rna.properties:
        k = p.identifier
        if k in SKIP_RNA or k in skip or p.type == 'COLLECTION' or p.is_readonly:
            continue
        x = getattr(v, k)
        if p.type == 'POINTER' and x is not None and not isinstance(x, bpy.types.ID):
            out[k] = rna(x)
        else:
            out[k] = plain(x)
    out['custom'] = custom(v)
    return out


def curve(c):
    return {'path': c.data_path, 'index': c.array_index, 'extrapolation': c.extrapolation,
            'mute': c.mute, 'lock': c.lock,
            'keys': [{k: plain(getattr(p, k)) for k in
                      ('co', 'handle_left', 'handle_right', 'handle_left_type',
                       'handle_right_type', 'interpolation', 'easing', 'amplitude', 'back', 'period', 'type')}
                     for p in c.keyframe_points],
            'samples': [plain(p.co) for p in c.sampled_points],
            'modifiers': [rna(m) for m in c.modifiers]}


def animation(a):
    layers = []
    for layer in a.layers:
        strips = []
        for strip in layer.strips:
            bags = []
            for slot in a.slots:
                bag = strip.channelbag(slot)
                if bag:
                    bags.append({'slot': slot.identifier,
                                 'curves': sorted([curve(c) for c in bag.fcurves],
                                                  key=lambda x: (x['path'], x['index']))})
            strips.append({'settings': rna(strip), 'bags': bags})
        layers.append({'settings': rna(layer), 'strips': strips})
    return {'settings': rna(a), 'slots': [rna(s) for s in a.slots], 'layers': layers}


def node_tree(tree, seen=None):
    seen = set() if seen is None else seen
    if tree.name in seen:
        return {'name': tree.name, 'recursive_reference': True}
    seen = seen | {tree.name}
    nodes = {}
    for n in tree.nodes:
        item = rna(n)
        item['inputs'] = [{'id': s.identifier, 'name': s.name,
                           'default': plain(s.default_value) if hasattr(s, 'default_value') else None}
                          for s in n.inputs]
        item['outputs'] = [{'id': s.identifier, 'name': s.name,
                            'default': plain(s.default_value) if hasattr(s, 'default_value') else None}
                           for s in n.outputs]
        if hasattr(n, 'color_ramp'):
            item['ramp'] = rna(n.color_ramp)
            item['ramp_elements'] = [(e.position, plain(e.color)) for e in n.color_ramp.elements]
        if getattr(n, 'node_tree', None):
            item['group_tree'] = node_tree(n.node_tree, seen)
        nodes[n.name] = item
    links = sorted([(l.from_node.name, l.from_socket.identifier, l.to_node.name,
                     l.to_socket.identifier, l.is_muted) for l in tree.links])
    return {'nodes': nodes, 'links': links, 'custom': custom(tree)}


def material(m):
    return {'settings': rna(m), 'nodes': node_tree(m.node_tree) if m.use_nodes else None}


def mesh_object(o):
    m = o.data
    attrs = {}
    for a in m.attributes:
        # Selection state is UI; all authored geometry, UV and color attributes are protected.
        if a.name.startswith('.select'):
            continue
        attrs[a.name] = {'type': a.data_type, 'domain': a.domain,
                         'data': [rna(d) for d in a.data]}
    return {'matrix_world': plain(o.matrix_world), 'matrix_parent_inverse': plain(o.matrix_parent_inverse),
            'parent': plain(o.parent), 'parent_type': o.parent_type, 'parent_bone': o.parent_bone,
            'custom': custom(o), 'mesh_custom': custom(m),
            'vertices': [plain(v.co) for v in m.vertices],
            'edges': [plain(e.vertices) for e in m.edges],
            'polygons': [(plain(p.vertices), p.material_index, p.use_smooth) for p in m.polygons],
            'loops': [(l.vertex_index, l.edge_index) for l in m.loops],
            'attributes': attrs,
            'uv_layers': [(u.name, u.active_render, [plain(x.uv) for x in u.data]) for u in m.uv_layers],
            'groups': [(g.name, g.lock_weight) for g in o.vertex_groups],
            'weights': [[(g.group, g.weight) for g in v.groups] for v in m.vertices],
            'materials': [plain(m) for m in o.data.materials],
            'modifiers': [rna(m) for m in o.modifiers],
            'constraints': [rna(c) for c in o.constraints],
            'shape_keys': None if m.shape_keys is None else
                [(k.name, k.value, [plain(v.co) for v in k.data]) for k in m.shape_keys.key_blocks]}


def rig_object(o):
    bones = {}
    for b in o.data.bones:
        bones[b.name] = {'settings': rna(b), 'head': plain(b.head_local), 'tail': plain(b.tail_local),
                         'matrix': plain(b.matrix_local), 'parent': b.parent.name if b.parent else None}
    return {'matrix_world': plain(o.matrix_world), 'custom': custom(o), 'data': rna(o.data),
            'bones': bones, 'constraints': [rna(c) for c in o.constraints],
            'pose_settings': {b.name: {'mode': b.rotation_mode, 'custom': custom(b),
                                      'constraints': [rna(c) for c in b.constraints]}
                              for b in o.pose.bones}}


def fingerprint(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    objects = list(bpy.data.collections[COLLECTION].all_objects)
    present = {o.name for o in objects}
    assert HELMET <= present, 'Expected four helmet objects are missing: ' + str(sorted(HELMET - present))
    return {'export_objects': sorted((o.name, o.type) for o in objects),
            'body': {o.name: mesh_object(o) for o in objects if o.type == 'MESH' and o.name not in HELMET},
            'rigs': {o.name: rig_object(o) for o in objects if o.type == 'ARMATURE'},
            'materials': {m.name: material(m) for m in bpy.data.materials},
            'material_images': {i.name: {'settings': rna(i),
                                        'packed_sha256': hashlib.sha256(bytes(i.packed_file.data)).hexdigest()
                                         if i.packed_file else None}
                                for i in bpy.data.images if i.name in {'KitMatteWear', 'KitMetalWear', 'SpellbladeBanner'}},
            'actions': {a.name: animation(a) for a in bpy.data.actions},
            'units': rna(bpy.context.scene.unit_settings),
            'fps': (bpy.context.scene.render.fps, bpy.context.scene.render.fps_base)}


def differences(a, b, path='', limit=12):
    if a == b:
        return []
    if type(a) != type(b):
        return [path + ' (type differs)']
    if isinstance(a, dict):
        out = []
        for k in sorted(a.keys() | b.keys()):
            p = path + '/' + str(k)
            out += [p + ' (added or missing)'] if k not in a or k not in b else differences(a[k], b[k], p, limit)
            if len(out) >= limit:
                break
        return out[:limit]
    if isinstance(a, (list, tuple)):
        if len(a) != len(b):
            return [path + ' (length differs)']
        out = []
        for k, (x, y) in enumerate(zip(a, b)):
            out += differences(x, y, path + '/' + str(k), limit)
            if len(out) >= limit:
                break
        return out[:limit]
    return [path + ' (value differs)']


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) != 2:
        raise SystemExit('Usage: -- BASELINE.blend CANDIDATE.blend')
    baseline, candidate = [Path(p).resolve() for p in args]
    before = fingerprint(baseline)
    after = fingerprint(candidate)
    errors = differences(before, after)
    result = {'baseline': str(baseline), 'candidate': str(candidate),
              'passed': not errors, 'allowed_geometry_changes': sorted(HELMET),
              'protected_body_meshes': len(before['body']), 'protected_actions': len(before['actions']),
              'protected_materials': len(before['materials']), 'differences': errors,
              'baseline_fingerprint_sha256': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
              'candidate_fingerprint_sha256': hashlib.sha256(json.dumps(after, sort_keys=True).encode()).hexdigest()}
    print('HELMET_PRESERVATION=' + json.dumps(result, sort_keys=True))
    if errors:
        raise AssertionError('Helmet-only preservation failed: ' + '; '.join(errors))
    print('HELMET_PRESERVATION_OK')


if __name__ == '__main__':
    main()
