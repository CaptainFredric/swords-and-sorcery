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
  assert.match(view.blade.facts, /19–30 a blow/);
  // Sheathe in Steel is carried in the same slot, with its own plain words
  const steel = view.spells.find((spell) => spell.id === 'steel');
  assert.ok(steel && /glancing/.test(steel.line) && /lands for 19/.test(steel.facts));
  for (const spell of view.spells) assert.ok(spell.line.length > 20, `${spell.id} has words`);
});

test('the Armory offers both ultimates, marks the one carried, and says plainly what each does', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const view = armoryView('fireball', 'vortex');
  assert.deepEqual(view.ultimates.map((u) => u.id), Object.keys(ULTIMATES));
  assert.deepEqual(view.ultimates.map((u) => u.id), ['sunder', 'vortex'], 'Sunder first, the Vortex beside it');
  assert.deepEqual(view.ultimates.filter((u) => u.equipped).map((u) => u.id), ['vortex']);
  const vortex = view.ultimates.find((u) => u.id === 'vortex');
  assert.equal(vortex.name, 'BLAZING VORTEX');
  assert.match(vortex.line, /^Spin into a close-range storm of sword cuts and aimed fire\./);
  assert.match(vortex.facts, new RegExp(`${ULTIMATES.vortex.contact.damage} a cut.*no guard.*${ULTIMATES.vortex.activeSec} s`));
  // with nothing said, Sunder is the one carried
  assert.deepEqual(armoryView('fireball').ultimates.filter((u) => u.equipped).map((u) => u.id), ['sunder']);
  for (const u of view.ultimates) assert.ok(u.line.length > 20 && u.mark, `${u.id} has words and a mark`);
});
