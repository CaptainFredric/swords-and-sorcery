import assert from 'node:assert/strict';
import test from 'node:test';
import { armoryView } from './armoryView.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

test('the Armory lists every spell from the shared table, marks the one carried, and says plainly what each does', () => {
  const view = armoryView('frostfire');
  assert.deepEqual(view.spells.map((spell) => spell.id), Object.keys(SPELLS));
  assert.deepEqual(view.spells.filter((spell) => spell.equipped).map((spell) => spell.id), ['frostfire']);
  const fire = view.spells.find((spell) => spell.id === 'fireball');
  assert.match(fire.facts, new RegExp(`${SPELLS.fireball.directDamage} impact.*${SPELLS.fireball.burn.damage} burn`));
  const frost = view.spells.find((spell) => spell.id === 'frostfire');
  assert.match(frost.facts, /heavy chill/);
  assert.match(view.blade.facts, /19 to 30 damage/);
  // Sheathe in Steel is carried in the same slot, with its own plain words
  const steel = view.spells.find((spell) => spell.id === 'steel');
  assert.ok(steel && /glance off/.test(steel.line) && /Dash into a foe to ram/.test(steel.line) && /12 ram damage · heavy shove & Balance/.test(steel.facts));
  for (const spell of view.spells) assert.ok(spell.line.length > 20, `${spell.id} has words`);
});

test('the Armory offers both ultimates, marks the one carried, and says plainly what each does', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const view = armoryView('fireball', 'vortex');
  assert.deepEqual(view.ultimates.map((u) => u.id), Object.keys(ULTIMATES));
  assert.deepEqual(view.ultimates.map((u) => u.id), ['sunder', 'vortex', 'chivalry'], 'three ultimate identities');
  assert.deepEqual(view.ultimates.filter((u) => u.equipped).map((u) => u.id), ['vortex']);
  const vortex = view.ultimates.find((u) => u.id === 'vortex');
  assert.equal(vortex.name, 'BLAZING VORTEX');
  assert.match(vortex.line, /^Spin through enemies with your blade and aimed fire\./);
  assert.match(vortex.facts, new RegExp(`${ULTIMATES.vortex.contact.damage} contact damage.*Guard unavailable.*${ULTIMATES.vortex.activeSec}s`));
  // with nothing said, Sunder is the one carried
  assert.deepEqual(armoryView('fireball').ultimates.filter((u) => u.equipped).map((u) => u.id), ['sunder']);
  for (const u of view.ultimates) assert.ok(u.line.length > 20 && u.mark, `${u.id} has words and a mark`);
});

test('Chivalry\'s prepared spells in the Armory: a slot for each key, the starting spell fixed, the others turned among the spells not already prepared', async () => {
  const { preparedArmoryView } = await import('./armoryView.mjs');
  const slots = preparedArmoryView('frostfire', ['fireball', 'frostfire', 'gale']);
  assert.deepEqual(slots.map((s) => [s.key, s.id, s.starting]), [[1, 'fireball', false], [2, 'frostfire', true], [3, 'gale', false]]);
  assert.equal(slots[1].previous, null, 'the starting spell stays where it is');
  assert.equal(slots[1].next, null);
  // a slot turns only among its own spell and the one not prepared anywhere (Steel)
  assert.deepEqual(new Set([slots[0].previous, slots[0].next]), new Set(['steel']));
  assert.deepEqual(new Set([slots[2].previous, slots[2].next]), new Set(['steel']));
  for (const slot of slots) assert.ok(slot.mark && slot.name === SPELLS[slot.id].label.toUpperCase());
  // an outside starting spell takes the last slot, as the shared rule says
  assert.deepEqual(preparedArmoryView('steel', ['fireball', 'frostfire', 'gale']).map((s) => s.id), ['fireball', 'frostfire', 'steel']);
});
