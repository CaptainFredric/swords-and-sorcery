import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const boundsPath = path.join(root, 'tools/blender/characters/spellblade/blueprint_bounds.py');
const detailPath = path.join(root, 'tools/blender/characters/spellblade/authoritative_detail_pass.py');

test('final production handoff refines the authoritative Spellblade before validation', () => {
  const bounds = fs.readFileSync(boundsPath, 'utf8');
  assert.match(bounds, /from \.authoritative_detail_pass import refine_authoritative_details/);
  assert.match(bounds, /rebuilt = build_authoritative_spellblade_v4\(armature, materials\)/);
  assert.match(bounds, /rebuilt = refine_authoritative_details\(rebuilt, armature, materials\)/);
});

test('detail pass explicitly rebuilds the concept-critical equipment areas', () => {
  const source = fs.readFileSync(detailPath, 'utf8');
  for (const symbol of [
    'Boot.L', 'Boot.R', 'BootToePlate.L', 'BootToePlate.R',
    'Belt', 'BeltBuckle', 'BeltMedallion', 'BeltPouch.L', 'BeltPouch.R',
    'Gauntlet.L', 'Gauntlet.R', 'GauntletKnuckles.L', 'GauntletKnuckles.R',
    'HeroSword', 'SwordBladeFacet', 'SwordGuard', 'SwordGrip', 'SwordGem', 'SwordPommel',
  ]) {
    assert.ok(source.includes(`\"${symbol}\"`), `missing ${symbol}`);
  }
  assert.match(source, /def refine_authoritative_details\(/);
  assert.match(source, /_retune_palette\(materials\)/);
});
