import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const boundsPath = path.join(root, 'tools/blender/characters/spellblade/blueprint_bounds.py');
const modelPath = path.join(root, 'tools/blender/characters/spellblade/authoritative_model_v4.py');

test('final production handoff discards legacy meshes and builds the current authoritative Spellblade', () => {
  const bounds = fs.readFileSync(boundsPath, 'utf8');
  assert.match(bounds, /from \.authoritative_model_v4 import build_authoritative_spellblade_v4/);
  assert.match(bounds, /for obj in tuple\(model\.objects\):/);
  assert.match(bounds, /bpy\.data\.objects\.remove\(obj, do_unlink=True\)/);
  assert.match(bounds, /rebuilt = build_authoritative_spellblade_v4\(armature, materials\)/);
  assert.match(bounds, /return rebuilt/);
});

test('stance pass compresses upper body and splays the armored legs', () => {
  const source = fs.readFileSync(modelPath, 'utf8');
  assert.match(source, /_scale_x_from_origin\(obj, 0\.82\)/);
  assert.match(source, /_shift_x\(obj, -0\.040\)/);
  assert.match(source, /_shift_x\(obj, 0\.040\)/);
  assert.match(source, /_scale_mesh\(obj, sx=1\.16, sy=1\.00, sz=1\.10\)/);
  assert.match(source, /build_authoritative_spellblade_v3\(armature, materials\)/);
});
