import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialCombatCues } from './TutorialCombatCues.mjs';

const actor = { local: true, playerId: 'player', rivalId: 'rival' };
function setup() {
  const beats = ['sword-contact', 'successful-guard', 'guard-lowered', 'player-damaged', 'duel-complete']
    .map(cue => ({ id: cue, kind: 'stage', advanceOn: cue }));
  const director = new TutorialDirector({ beats });
  const cues = new TutorialCombatCues(director, actor);
  director.start();
  return { director, cues };
}
const hit = { type: 'swordHit', playerId: 'player', targetId: 'rival' };
const guard = { type: 'block', attackerId: 'rival', defenderId: 'player' };
const lower = { type: 'guardEnded', playerId: 'player' };
const damage = { type: 'damage', attackerId: 'rival', victimId: 'player', source: 'sword', amount: 12 };

test('tutorial observes real contacts between the two local actors, not input or unrelated fights', () => {
  const { director, cues } = setup();
  assert.throws(() => new TutorialCombatCues(director, { ...actor, local: false }), /local/);
  assert.equal(cues.accept([{ type: 'swordSwing', playerId: 'player' }, { ...hit, targetId: 'other' }]), 0);
  assert.equal(cues.accept([hit]), 1);
  assert.equal(cues.accept([{ type: 'guardStarted', playerId: 'player' }, { ...guard, defenderId: 'other' },
    { ...guard, type: 'guardBreak' }, { ...guard, vortex: true }]), 0);
  assert.equal(cues.accept([guard]), 1);
  assert.equal(director.current.id, 'guard-lowered');
  assert.equal(cues.accept([damage]), 0, 'being hit while Guard remains up cannot satisfy the postscript');
  assert.equal(cues.accept([lower]), 1);
  assert.equal(cues.accept([{ ...damage, source: 'burn' }, { ...damage, amount: 0 },
    { ...damage, attackerId: 'other' }, { ...damage, ultimate: true }]), 0);
  assert.equal(cues.accept([damage]), 1);
  assert.equal(cues.accept([{ type: 'death', victimId: 'other', killerId: 'player' },
    { type: 'matchEnded', winnerId: 'player', reason: 'forfeit' }]), 0);
  assert.equal(cues.accept([{ type: 'death', victimId: 'rival', killerId: 'player' }]), 1);
  assert.deepEqual(cues.outcome, { winnerId: 'player', loserId: 'rival', reason: 'death' });
  assert.equal(director.state, 'complete');
});

test('parry counts as a successful defense; lowering during dialogue is remembered', () => {
  const director = new TutorialDirector({ beats: [
    { id: 'guard', kind: 'stage', advanceOn: 'successful-guard' },
    { id: 'line', kind: 'dialogue', line: 'You blocked my message!', advanceOn: 'continue' },
    { id: 'lower', kind: 'stage', advanceOn: 'guard-lowered' },
    { id: 'hurt', kind: 'stage', advanceOn: 'player-damaged' },
  ] });
  const cues = new TutorialCombatCues(director, actor);
  director.start();
  cues.accept([{ ...guard, type: 'parry' }]);
  cues.accept([lower]);
  director.accept('continue');
  cues.snapshot({ players: [{ id: 'player', guarding: false }] });
  assert.equal(director.current.id, 'hurt');
  cues.accept([{ type: 'guardStarted', playerId: 'player' }, damage]);
  assert.equal(director.current.id, 'hurt', 'reasserting Guard invalidates the lowered condition');
});

test('restart clears previous defense and outcome; a legitimate match completion also works', () => {
  const { director, cues } = setup();
  cues.accept([hit, guard, lower, damage]);
  assert.equal(cues.accept([{ type: 'matchEnded', winnerId: 'rival', reason: 'score' }]), 1);
  assert.equal(cues.outcome.winnerId, 'rival');
  director.start();
  cues.accept([hit, damage]);
  assert.equal(director.current.id, 'successful-guard');
  assert.equal(cues.lowered, false);
  assert.equal(cues.outcome, null);
});

test('an ordinary player sword contacting the rival Guard also earns the attack lesson', () => {
  const { director, cues } = setup();
  assert.equal(cues.accept([{ type: 'block', attackerId: 'player', defenderId: 'rival' }]), 1);
  assert.equal(director.current.id, 'successful-guard');
});
