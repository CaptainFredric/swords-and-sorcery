import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreparedSpells, preparedSpellMember, replacePreparedSpell } from './preparedSpells.mjs';

test('prepared spells are three distinct legal equals, preserving order when starting moves within set', () => {
  assert.deepEqual(normalizePreparedSpells('frostfire', ['fireball','frostfire','gale']), ['fireball','frostfire','gale']);
  assert.deepEqual(normalizePreparedSpells('steel', ['fireball','frostfire','gale']), ['fireball','frostfire','steel']);
  assert.deepEqual(normalizePreparedSpells('fireball', ['steel','steel','conjured','frostfire']), ['steel','frostfire','fireball']);
  assert.deepEqual(normalizePreparedSpells('invalid', null), ['fireball','frostfire','gale']);
  assert.equal(preparedSpellMember({preparedSpells:['fireball','frostfire','gale']}, 'vortexFire'), false);
});
test('Armory replacement keeps exactly three distinct identities and cannot remove starting spell', () => {
  const set = ['fireball','frostfire','gale'];
  assert.deepEqual(replacePreparedSpell('fireball',set,1,'steel'), ['fireball','steel','gale']);
  assert.deepEqual(replacePreparedSpell('fireball',set,0,'steel'), set);
  assert.deepEqual(replacePreparedSpell('fireball',set,1,'gale'), set);
  assert.deepEqual(replacePreparedSpell('fireball',set,8,'steel'), set);
});
