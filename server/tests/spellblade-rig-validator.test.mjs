import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('../../scripts/validate-spellblade-glb.py', import.meta.url));

test('external GLB validator rejects broken Spellblade rig contracts', () => {
  const result = spawnSync('python3', [validator, '--self-test-rig'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SPELLBLADE_RIG_VALIDATOR_OK/);
});

test('external GLB validator requires every named Spellblade clip and rejects root translation', () => {
  const result = spawnSync('python3', [validator, '--self-test-animation'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SPELLBLADE_ANIMATION_VALIDATOR_OK/);
});

test('external GLB validator enforces the compact first-person rig, hero sword, sorcery material, clips and budgets', () => {
  const result = spawnSync('python3', [validator, '--self-test-first-person'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SPELLBLADE_FIRST_PERSON_VALIDATOR_OK/);
});
