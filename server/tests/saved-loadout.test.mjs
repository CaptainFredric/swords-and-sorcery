import test from 'node:test';
import assert from 'node:assert/strict';
import { applySavedLoadout } from '../src/savedLoadout.mjs';

test('live saved loadout cannot rewrite current spell, cooldown or accepted gather', () => {
  const session = {};
  const player = {spell:'gale', startingSpell:'fireball', preparedSpells:['fireball','frostfire','gale'], pendingSpell:{spell:'fireball'}, spellReadyById:{fireball:8}, ultimate:'chivalry'};
  applySavedLoadout(session, {state:'PLAYING'}, player, {spell:'frostfire',ultimate:'chivalry',preparedSpells:['fireball','frostfire','steel']});
  assert.equal(player.spell,'gale');
  assert.equal(player.startingSpell,'frostfire');
  assert.deepEqual(player.preparedSpells,['fireball','frostfire','gale']);
  assert.deepEqual(session.preparedSpells,['fireball','frostfire','steel']);
  assert.deepEqual(player.spellReadyById,{fireball:8});
  assert.equal(player.pendingSpell.spell,'fireball');
});
test('waiting loadout adopts normalized set, starting/current identity and legal ultimate', () => {
  const session = {}, player = {};
  applySavedLoadout(session,{state:'WAITING'},player,{spell:'steel',ultimate:'sunder',preparedSpells:['fireball','gale','gale','vortexFire']});
  assert.deepEqual(player.preparedSpells,['fireball','gale','steel']);
  assert.equal(player.spell,'steel');
  assert.equal(player.startingSpell,'steel');
  assert.equal(player.ultimate,'sunder');
});
