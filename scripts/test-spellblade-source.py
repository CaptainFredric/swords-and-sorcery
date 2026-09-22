"""Blender integration test: source edits, rig/action contracts and roundtrip export.
Run with blender --background --factory-startup --python-exit-code 1 --python this-file.
"""
import hashlib
import sys
import tempfile
import shutil
from types import SimpleNamespace
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.blender.characters.spellblade.authored_source import load_authored_source, validate_output_paths
from tools.blender.characters.spellblade.build import build_character_assets
from tools.blender.characters.spellblade.validate import load_contract, validate_production_model
from tools.blender.common.export import export_glb

SOURCE = ROOT / 'tools/blender/characters/spellblade/source'
contract = load_contract()
original_hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.glob('*.blend')}
with tempfile.TemporaryDirectory() as tmp:
    for filename, collection, clip_key in [
        ('spellblade-third-person.blend', 'SpellbladeExport', 'clips'),
        ('spellblade-first-person.blend', 'SpellbladeFirstPersonExport', 'firstPersonClips'),
    ]:
        rig, model, actions = load_authored_source(SOURCE / filename, collection)
        assert set(actions) == set(contract[clip_key]), actions.keys()
        assert {'socket_sword', 'socket_sorcery'} <= set(rig.data.bones.keys())
        if clip_key == 'clips':
            validate_production_model(rig, model, contract)
        # No review lights, floor or cameras may enter the export collection.
        assert all(obj.type in ('MESH', 'ARMATURE') for obj in bpy.data.collections[collection].all_objects)
        assert all(not obj.name.startswith('SpellbladeReview') for obj in model.objects)
        for name, frames in [('Slash_1', (13,23)), ('Slash_2', (12,23)), ('Slash_3', (12,20))]:
            action = actions[name]
            assert round(action.frame_range[1]) == frames[1]
            bag = action.layers[0].strips[0].channelbag(action.slots[0])
            assert any(abs(k.co.x - frames[0]) < 1e-5 for curve in bag.fcurves for k in curve.keyframe_points)
            assert not any(c.data_path.startswith('pose.bones["root"]') for c in bag.fcurves)
        ob = next(obj for obj in model.objects if obj.name == 'HeroSword')
        ob.data.vertices[0].co.x += .0123
        expected = [tuple(v.co) for v in ob.data.vertices]
        count = len(model.objects)
        copied_source = Path(tmp) / filename
        bpy.ops.wm.save_as_mainfile(filepath=str(copied_source))
        rig, model, actions = load_authored_source(copied_source, collection)
        assert len(model.objects) == count
        ob = bpy.data.objects['HeroSword']
        assert [tuple(v.co) for v in ob.data.vertices] == expected, 'Saved vertex edit was reconstructed'
        out = Path(tmp) / (filename + '.glb')
        export_glb(out, objects=(rig, *model.objects))
        assert [tuple(v.co) for v in ob.data.vertices] == expected, 'Export mutated geometry'
        assert out.stat().st_size > 1000
        # Re-import and confirm the edited mesh position data really reached GLB.
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(out))
        candidates = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('HeroSword')]
        assert candidates, 'HeroSword missing after GLB roundtrip'
        # Export splits vertices by material and hard normal. Compare coordinate sets.
        imported = [v.co for o in candidates for v in o.data.vertices]
        for point in expected:
            assert any(sum((point[i]-v[i])**2 for i in range(3)) < 1e-10 for v in imported), f'Edited vertex missing: {point}'
        print('SOURCE_ROUNDTRIP_OK', filename, count)
    # Exercise the public build entrypoint against a disposable source copy.
    collision = Path(tmp) / 'collision'
    collision.mkdir()
    copied = collision / 'spellblade-third-person.blend'
    shutil.copy2(SOURCE / copied.name, copied)
    before = hashlib.sha256(copied.read_bytes()).hexdigest()
    try:
        build_character_assets(SimpleNamespace(source=copied, out=collision, mode='preview', source_revision='d' * 40))
    except ValueError as error:
        assert 'overwrite' in str(error)
    else:
        raise AssertionError('Export must reject source/output collisions')
    assert hashlib.sha256(copied.read_bytes()).hexdigest() == before
    assert not (collision / 'spellblade.glb').exists(), 'Collision detected after processing began'
    # A symlinked output must receive the same protection.
    alias = Path(tmp) / 'alias'
    alias.symlink_to(collision, target_is_directory=True)
    try:
        validate_output_paths((copied,), alias)
    except ValueError:
        pass
    else:
        raise AssertionError('Symlink output bypassed source protection')
    bad = Path(tmp) / 'missing.blend'
    try:
        load_authored_source(bad, 'SpellbladeExport')
    except ValueError:
        pass
    else:
        raise AssertionError('Missing source must fail instead of silently rebuilding')
for path, sha in original_hashes.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, 'Test changed the artist source'
print('SPELLBLADE_SOURCE_TESTS_OK')
