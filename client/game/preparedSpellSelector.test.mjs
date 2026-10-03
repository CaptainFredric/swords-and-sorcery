import test from 'node:test';
import assert from 'node:assert/strict';
import { PreparedSpellSelector, preparedSpellView } from './preparedSpellSelector.mjs';

const local = { alive: true, spell: 'fireball', preparedSpells: ['fireball', 'frostfire', 'gale'],
  ultimateState: { id: 'chivalry', phase: 'active', until: 19 }, spellReadyById: { fireball: 15, frostfire: 14, gale: 16 }, chivalryProjectileReadyAt: 10.72 };

test('prepared HUD uses the shared active projectile gate and each utility spell cooldown', () => {
  const view = preparedSpellView(local, 10);
  assert.equal(view.visible, true);
  assert.equal(view.left, 9);
  assert.deepEqual(view.spells.map(({ id, remaining }) => [id, remaining]), [['fireball', 0.7200000000000006], ['frostfire', 0.7200000000000006], ['gale', 6]]);
  assert.equal(preparedSpellView(local, 19).visible, false);
  assert.equal(preparedSpellView({ ...local, alive: false }, 10).visible, false);
  const startup = preparedSpellView({ ...local, ultimateState: { id: 'chivalry', phase: 'startup', commitAt: 10.65 } }, 10);
  assert.equal(startup.phase, 'startup');
  assert.ok(startup.spells.every((spell) => !spell.available));
});

test('desktop selector tolerates jitter, highlights an alternate, and cancels outside its local region', () => {
  const selector = new PreparedSpellSelector(['fireball', 'frostfire', 'gale'], 'fireball');
  assert.equal(selector.move(12, 4), 'fireball');
  assert.equal(selector.move(-60, 0), 'frostfire');
  assert.equal(selector.move(-40, 0), 'frostfire', 'hysteresis keeps the highlighted spell near its edge');
  assert.equal(selector.move(160, 0), null);
  assert.equal(selector.move(60, 0), 'gale');
});

test('mobile fan permits a local drag and rejects release beyond the fan', () => {
  const selector = new PreparedSpellSelector(['fireball', 'frostfire', 'gale'], 'fireball', { touch: true });
  const alternate = selector.slots[1];
  assert.equal(selector.move(alternate.x, alternate.y), 'frostfire');
  assert.equal(selector.move(200, 150), null);
  assert.equal(selector.move(5, 5), 'fireball');
});

test('an accepted gather stays unavailable across selection while its authoritative timer runs', () => {
  const gathering = preparedSpellView({ ...local, spell: 'gale', castingSpell: 'fireball', castEndsAt: 10.3, chivalryProjectileReadyAt: 0 }, 10);
  assert.equal(gathering.current, 'gale');
  assert.ok(gathering.spells.every((spell) => !spell.available));
  assert.equal(gathering.spells.find((spell) => spell.id === 'frostfire').busy, true);
});
