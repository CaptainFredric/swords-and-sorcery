import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeCopy } from './challengeCard.mjs';

const roster = [
  { id: 'a', name: 'MAN OF STEEL VALOR', team: 'ATTACKERS', alive: true },
  { id: 'b', name: 'Blue Two', team: 'ATTACKERS', actorKind: 'bot', alive: true },
  { id: 'c', name: 'Blue Three', team: 'ATTACKERS', alive: true },
  { id: 'd', name: 'Red One', team: 'DEFENDERS', actorKind: 'bot', alive: true },
  { id: 'e', name: 'Red Two', team: 'DEFENDERS', alive: true },
  { id: 'f', name: 'Red Three', team: 'DEFENDERS', alive: true },
  { id: 'dummy', name: 'Dummy', actorKind: 'dummy', team: 'DEFENDERS' },
];
test('each teammate is the hero of their own team introduction, including AI participants', () => {
  const a = challengeCopy({ mode: 'BREAKTHROUGH', localId: 'a', players: roster, teamSize: 3 });
  assert.equal(a.you, 'MAN OF STEEL VALOR');
  assert.equal(a.squires, '& 2 SQUIRES');
  assert.equal(a.foe, 'VS. 3 RIVALS');
  const red = challengeCopy({ mode: 'BREAKTHROUGH', localId: 'd', players: roster, teamSize: 3 });
  assert.equal(red.you, 'Red One');
  assert.equal(red.squires, '& 2 SQUIRES');
  assert.equal(red.foe, 'VS. 3 RIVALS');
  assert.match(red.kicker, /DEFEND/);
});
test('deaths do not change the roster counts; singular and zero allies render properly', () => {
  const dead = roster.map(p => ({ ...p, alive: false }));
  const a = challengeCopy({ mode: 'HIGH_GROUNDS', localId: 'a', players: dead });
  assert.equal(a.squires, '& 2 SQUIRES');
  assert.equal(a.foe, 'VS. 3 RIVALS');
  const solo = challengeCopy({ mode: 'BREAKTHROUGH', localId: 'a', players: [roster[0], roster[3]] });
  assert.equal(solo.squires, '');
  assert.equal(solo.foe, 'VS. 1 RIVAL');
  const pair = challengeCopy({ mode: 'BREAKTHROUGH', localId: 'a', players: roster.slice(0, 2).concat(roster[3]) });
  assert.equal(pair.squires, '& 1 SQUIRE');
});
test('FFA, duel and bot duel remain distinct from team-only Squires wording', () => {
  const ffa = challengeCopy({ mode: 'FFA', localId: 'a', players: roster.slice(0, 3) });
  assert.equal(ffa.foe, '2 RIVALS');
  assert.equal(ffa.squires, undefined);
  const duel = challengeCopy({ mode: 'BOT_DUEL', localId: 'a', players: [roster[0], roster[3]] });
  assert.equal(duel.foe, 'Red One');
  assert.equal(duel.squires, undefined);
});
