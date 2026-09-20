import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('final reference pass preserves volumetric base shells', async () => {
  const source = await read('tools/blender/characters/spellblade/reference_match.py');

  for (const name of ['HelmetShell', 'Breastplate', 'BackArmor']) {
    assert.doesNotMatch(source, new RegExp(`_traced\\(\\s*"${name}"`));
    assert.doesNotMatch(source, new RegExp(`_plate\\(\\s*"${name}"`));
  }
  assert.doesNotMatch(source, /_traced\(\s*f"Pauldron\.\{side\}"/);
  assert.doesNotMatch(source, /_traced\(\s*f"Greave\.\{side\}"/);
  assert.doesNotMatch(source, /_traced\(\s*f"Boot\.\{side\}"/);
});
