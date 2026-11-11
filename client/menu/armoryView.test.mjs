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

test('the Armory offers the original ultimates and All-Natural Disaster with its own identity', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const view = armoryView('fireball', 'vortex');
  assert.deepEqual(view.ultimates.map((u) => u.id), Object.keys(ULTIMATES));
  assert.deepEqual(view.ultimates.map((u) => u.id), ['sunder', 'vortex', 'chivalry', 'one_hit_of_wonders'], 'four ultimate identities');
  assert.deepEqual(view.ultimates.filter((u) => u.equipped).map((u) => u.id), ['vortex']);
  const disaster = view.ultimates.find((u) => u.id === 'one_hit_of_wonders');
  assert.equal(disaster.name,'ALL-NATURAL DISASTER');
  // its facts are the rules' own figures: 46, and each first infusion's contribution (Gale's 1, not its old 8)
  assert.match(disaster.facts, /^46 DAMAGE · FIRE \+13.*FROST \+11.*GALE \+1,.*LIGHTNING \+12.*STEEL \+2,/);
  assert.doesNotMatch(disaster.facts, /\+8|40 PHYSICAL/);
  assert.match(disaster.line, /Steel/);
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
  // a slot turns among its own spell and any other unprepared spells
  // New spells enter the same carousel; exact neighbours can change as spells are added.
  for(const slot of [slots[0],slots[2]]) {
    assert.ok(slot.previous && slot.next && slot.previous!==slot.next);
    assert.ok(['steel','coreflagration','line_of_conduct'].includes(slot.previous));
    assert.ok(['steel','coreflagration','line_of_conduct'].includes(slot.next));
  }
  for (const slot of slots) assert.ok(slot.mark && slot.name === SPELLS[slot.id].label.toUpperCase());
  // an outside starting spell takes the last slot, as the shared rule says
  assert.deepEqual(preparedArmoryView('steel', ['fireball', 'frostfire', 'gale']).map((s) => s.id), ['fireball', 'frostfire', 'steel']);
});

test('Coreflagration is listed in the Armory, can be equipped, and carries its authored facts', () => {
  const view = armoryView('coreflagration');
  assert.deepEqual(view.spells.filter((spell) => spell.equipped).map((spell) => spell.id), ['coreflagration']);
  const core = view.spells.find((spell) => spell.id === 'coreflagration');
  assert.ok(core, 'coreflagration is present in armory spells');
  assert.equal(core.name, 'COREFLAGRATION');
  assert.match(core.facts, /5 first burst · 20 final blast · 6 burn · 5s cooldown/);
  assert.match(core.line, /burning stone/);
});

test('the longsword is equipment and the two Sword Techniques are training previews', () => {
  const view = armoryView('fireball');
  assert.equal(view.techniques.length, 2);
  assert.match(view.blade.name, /longsword/i);
  assert.match(view.blade.facts, /Three-strike combo/);
  assert.ok(view.techniques.every(technique => !technique.equipped));

  const riposte = view.techniques.find((t) => t.id === 'rigid_riposte');
  assert.equal(riposte.disabled, true);
  assert.equal(riposte.status, 'IN TRAINING');
  assert.match(riposte.line, /Rigid Riposte|forward sword thrust/i);

  const whirl = view.techniques.find((t) => t.id === 'whirl_wind');
  assert.equal(whirl.disabled, true);
  assert.equal(whirl.status, 'IN TRAINING');
  assert.match(whirl.line, /Whirl Like the Wind|360°/i);
});
