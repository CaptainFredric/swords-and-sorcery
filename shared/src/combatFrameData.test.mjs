import test from 'node:test';
import assert from 'node:assert/strict';
import { CADENCE, CUTS, CUT_ORDER, DEFENCE, cutClipTime, cutMarkers, hitStopFor, judgeCadence, judgeDefence, nextCutDelay } from './combatFrameData.mjs';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from './combat.mjs';

test('a press on the beat is perfect; in the window, good; before it, early; after it, late', () => {
  assert.equal(judgeCadence(CADENCE.beat).grade, 'perfect');
  assert.equal(judgeCadence(CADENCE.beat + CADENCE.perfect).grade, 'perfect');
  assert.equal(judgeCadence(CADENCE.beat + CADENCE.perfect + 0.01).grade, 'good');
  assert.equal(judgeCadence(CADENCE.open - 0.01).grade, 'early');
  assert.equal(judgeCadence(-0.2).grade, 'early');
  assert.equal(judgeCadence(CADENCE.close + 0.01).grade, 'late');
});

test('rhythm is faster than holding, and holding keeps the old chain', () => {
  assert.ok(nextCutDelay('perfect') < nextCutDelay('good'));
  assert.ok(nextCutDelay('good') < nextCutDelay('held'));
  // an early press earns nothing over holding: mashing is not rhythm
  assert.equal(nextCutDelay('early'), nextCutDelay('held'));
  assert.equal(nextCutDelay('late'), null);
  // the held cadence is the shipped chain: next cut 0.32 s after the forehand's contact (0.72 - 0.4)
  assert.ok(Math.abs(CADENCE.next.held - (SWORD_CHAIN.starts[1] - SWORD_STRIKE_TIMES[0])) < 1e-9);
  assert.ok(Math.abs(CUTS.forehand.startup.fresh - SWORD_STRIKE_TIMES[0]) < 1e-9);
});

test('the window opens after contact and the beat lies inside it', () => {
  assert.ok(CADENCE.open > 0 && CADENCE.open < CADENCE.beat && CADENCE.beat < CADENCE.close);
  assert.ok(CADENCE.beat - CADENCE.perfect > CADENCE.open);
  // the chain lapses no sooner than the window closes
  assert.ok(CADENCE.lapse >= CADENCE.close);
});

test('defence tiers by when the guard went up', () => {
  const contactAt = 10;
  assert.equal(judgeDefence({ guarding: true, guardedAt: contactAt - 0.03, contactAt }).tier, 'perfect');
  assert.equal(judgeDefence({ guarding: true, guardedAt: contactAt - DEFENCE.perfect - 0.01, contactAt }).tier, 'parry');
  assert.equal(judgeDefence({ guarding: true, guardedAt: contactAt - DEFENCE.parry - 0.01, contactAt }).tier, 'block');
  assert.equal(judgeDefence({ guarding: false, guardedAt: contactAt - 0.03, contactAt }).tier, 'none');
  // a guard held through (raised at -Infinity) only blocks
  assert.equal(judgeDefence({ guarding: true, guardedAt: -Infinity, contactAt }).tier, 'none');
});

test('hit-stop grows with the quality of the moment', () => {
  const hit = hitStopFor({ outcome: 'hit', quality: 0.5 });
  const clean = hitStopFor({ outcome: 'hit', quality: 0.9 });
  const onBeat = hitStopFor({ outcome: 'hit', quality: 0.9, grade: 'perfect' });
  const riposte = hitStopFor({ outcome: 'hit', riposte: true });
  assert.ok(hit < clean && clean < onBeat && onBeat < riposte);
  assert.ok(hitStopFor({ outcome: 'block' }) < hitStopFor({ outcome: 'parry' }));
  assert.ok(hitStopFor({ outcome: 'parry' }) < hitStopFor({ outcome: 'perfect' }));
  for (const v of [hit, clean, onBeat, riposte, hitStopFor({ outcome: 'perfect' })]) assert.ok(v >= 0.04 && v <= 0.13);
});

test("a cut's clip lands its contact frame on the cut's contact, fresh or linked", () => {
  for (const name of CUT_ORDER) {
    const cut = CUTS[name];
    for (const linked of [false, true]) {
      const startup = linked ? cut.startup.linked : cut.startup.fresh;
      assert.ok(Math.abs(cutClipTime(cut, startup, { linked, startup }) - cut.clipContact) < 1e-9);
      assert.equal(cutClipTime(cut, 0, { linked, startup }), linked ? cut.linkEntry : 0);
      // never past its last frame
      assert.ok(cutClipTime(cut, 5, { linked, startup }) <= cut.clipEnd + 1e-9);
      const m = cutMarkers(name, { linked });
      assert.ok(m.tell < m.activeFrom && m.activeFrom < m.contact && m.contact < m.activeTo && m.activeTo < m.beat);
    }
  }
});
