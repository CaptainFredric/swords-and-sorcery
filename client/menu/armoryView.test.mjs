import assert from 'node:assert/strict';
import test from 'node:test';
import { armoryView } from './armoryView.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

test('the Armory lists every spell from the shared table, marks the one carried, and says plainly what each does', () => {
  const view = armoryView('frostfire');
  assert.deepEqual(view.spells.map((spell) => spell.id), Object.keys(SPELLS));
  assert.deepEqual(view.spells.filter((spell) => spell.equipped).map((spell) => spell.id), ['frostfire']);
  const fire = view.spells.find((spell) => spell.id === 'fireball');
  assert.match(fire.facts, new RegExp(`Hits for ${SPELLS.fireball.directDamage}, burns for ${SPELLS.fireball.burn.damage} more`));
  const frost = view.spells.find((spell) => spell.id === 'frostfire');
  assert.match(frost.facts, /chills them heavy/);
  assert.match(view.blade.facts, /28 a blow/);
  for (const spell of view.spells) assert.ok(spell.line.length > 20, `${spell.id} has words`);
});
