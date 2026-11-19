import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_TECHNIQUE_CONTRACTS } from '../../shared/src/swordTechniqueContracts.mjs';
import { riposteBraceClipTime, swordTechniqueAnimationPlan } from './spellbladeAnimationPlan.mjs';

const startedAt = 1;
const action = { id: 'rigid_riposte', phase: 'brace', startedAt };
const guardSeenAt = startedAt - .05;

test('grounded Riposte out of Guard rejoins the existing contact clock in time for interception', () => {
  const sample = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte.track.find(row => row.time === .166);
  const late = swordTechniqueAnimationPlan(action, startedAt + sample.time, false, true, guardSeenAt);
  const neutral = swordTechniqueAnimationPlan(action, startedAt + sample.time, false, true);
  assert.equal(late.clip, 'Technique_RigidRiposte_Interception');
  assert.equal(late.time, neutral.time);
  assert.equal(late.braceBlade.weight, 1);
  for (const key of ['base', 'tip']) {
    const actual = late.braceBlade[key];
    const expected = Object.values(sample[key]);
    assert.ok(Math.hypot(...actual.map((v, i) => v - expected[i])) < 1e-9, key);
  }

  const first = swordTechniqueAnimationPlan(action, startedAt, false, true, guardSeenAt);
  assert.ok(first.time > riposteBraceClipTime(.12) - .1, 'start beyond the authored forearm exchange');
  assert.equal(first.braceBlade, null, 'protect the initial Guard handover');
  for (const other of [
    neutral,
    swordTechniqueAnimationPlan(action, startedAt + sample.time, true, true, guardSeenAt),
    swordTechniqueAnimationPlan({ ...action, aerial: true }, startedAt + sample.time, false, false, guardSeenAt),
    swordTechniqueAnimationPlan(action, startedAt + .221, false, true, guardSeenAt),
  ]) assert.equal(other.braceBlade, undefined, other.clip);
});
