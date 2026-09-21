import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const polishPath = new URL('../../tools/blender/characters/spellblade/authoritative_final_polish.py', import.meta.url);
const boundsPath = new URL('../../tools/blender/characters/spellblade/blueprint_bounds.py', import.meta.url);

test('final Spellblade polish is concept-driven and wired after final form', () => {
  const polish = fs.readFileSync(polishPath, 'utf8');
  const bounds = fs.readFileSync(boundsPath, 'utf8');

  assert.match(polish, /def apply_authoritative_final_polish\(/);
  assert.match(polish, /def _retune_palette\(/);
  assert.match(polish, /def _rebuild_boots\(/);
  assert.match(polish, /def _bulk_gauntlets\(/);
  assert.match(polish, /def _rebuild_sword\(/);
  assert.match(polish, /TabardBackTrim\.L/);
  assert.match(polish, /SwordGuardCap\.L/);
  assert.doesNotMatch(polish, /SorceryCore|SorceryShard/);

  assert.match(bounds, /from \.authoritative_final_polish import apply_authoritative_final_polish/);
  const finalForm = bounds.indexOf('apply_authoritative_final_form(rebuilt');
  const finalPolish = bounds.indexOf('apply_authoritative_final_polish(rebuilt');
  assert.ok(finalForm >= 0 && finalPolish > finalForm, 'polish must run after final form');
});
