// The Sword Techniques in first person and on the body: drawn from the server's own moment of the technique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_TECHNIQUES, WHIRL_TURN, techniqueMoment } from '../../shared/src/swordTechniques.mjs';
import { techniqueArmsWeight, techniqueBladeTurn, techniquePose } from './fpTechnique.mjs';
import { resolveSpellbladeState } from './spellbladePose.mjs';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { blendSeconds } from './spellbladeBlend.mjs';

const R = SWORD_TECHNIQUES.rigid_riposte, W = SWORD_TECHNIQUES.whirl_like_the_wind;
const DEG = 180 / Math.PI;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * DEG;
const riposte = { id: R.id, startedAt: 10 };
const at = (state, t) => techniqueMoment(state, state.startedAt + t);

test('the Riposte in my arms: up across the front, then the point on the aim and driven out, without a jump', () => {
  const brace = techniquePose(at(riposte, R.enterSec + 0.1)).arm;
  assert.ok(brace.blade[1] > 0.2 && brace.blade[0] < 0, 'held up and across to the left');
  const out = techniquePose(at(riposte, R.enterSec + R.braceSec + 0.16)).arm;
  assert.ok(angle(out.blade, [0, 0, -1]) < 6, `the point is ${angle(out.blade, [0, 0, -1]).toFixed(1)} deg off the aim`);
  assert.ok(out.wrist[2] < brace.wrist[2] - 0.25, 'the arm is driven out');
  let previous = null;
  const end = R.enterSec + R.braceSec + R.thrustSec + R.recoverySec;
  for (let t = 0; t <= end; t += 1 / 120) {
    const state = t >= end - R.recoverySec ? { ...riposte, endAt: 10 + end - R.recoverySec, end: 'done' } : riposte;
    const pose = techniquePose(at(state, t), state);
    if (previous) {
      assert.ok(angle(pose.arm.blade, previous.arm.blade) < 9, `the blade jumps ${angle(pose.arm.blade, previous.arm.blade).toFixed(1)} deg at ${t.toFixed(3)}`);
      assert.ok(Math.hypot(...pose.arm.wrist.map((v, i) => v - previous.arm.wrist[i])) < 0.05, `the hand jumps at ${t.toFixed(3)}`);
    }
    previous = pose;
  }
  // turned by a parry, the arms come home from where the thrust was
  const parried = { ...riposte, endAt: 10.4, end: 'parried' };
  assert.ok(techniquePose(at(parried, 0.41), parried));
  assert.equal(techniqueArmsWeight(at(parried, 0.4 + R.parriedSec)), 0);
});

test('the Whirl in my arms goes round as the server\'s blade does, the other way to a Vortex', () => {
  const spin = { id: W.id, startedAt: 10, spinAt: 10 + W.enterSec };
  const a = techniqueBladeTurn(W.clips.revolution, 0.1), b = techniqueBladeTurn(W.clips.revolution, 0.15);
  // (+ to the right: clockwise from above)
  assert.ok(Math.sin(b - a) > 0);
  assert.equal(WHIRL_TURN, -1);
  // in front of me as the server's blade is in front of the knight
  const front = techniquePose(at(spin, W.enterSec + 0.001)).arm;
  assert.ok(front.blade[2] < -0.8);
  const behind = techniquePose(at(spin, W.enterSec + W.revolutionSec / 2)).arm;
  assert.ok(behind.blade[2] > 0.3);
});

test('the body plays the technique\'s own clip at the server\'s moment, before anything else it might show', () => {
  const player = { alive: true, velocity: { x: 0, y: 0, z: -20 }, staggerUntil: 0, techniqueState: riposte };
  const now = 10 + R.enterSec + R.braceSec + 0.1;
  assert.equal(resolveSpellbladeState(player, now), 'technique');
  const plan = resolveSpellbladeAnimationPlan({ state: 'technique', player, serverNow: now });
  assert.equal(plan.clip, R.clips.thrust);
  assert.ok(Math.abs(plan.time - 0.1) < 1e-9);
  assert.equal(plan.fallback, 'Slash_3');
  // staggered by a parry, it is the technique's own recoil that shows
  const parried = { ...player, staggerUntil: now + 1, techniqueState: { ...riposte, endAt: now - 0.1, end: 'parried' } };
  assert.equal(resolveSpellbladeState(parried, now), 'technique');
  assert.equal(resolveSpellbladeAnimationPlan({ state: 'technique', player: parried, serverNow: now }).clip, R.clips.parried);
  // and once it is over, the ordinary states again
  assert.equal(resolveSpellbladeState({ ...player, techniqueState: null }, now), 'run');
  // a Whirl's clip loops on its own turn
  const whirl = { alive: true, techniqueState: { id: W.id, startedAt: 10, spinAt: 10.2 } };
  const second = resolveSpellbladeAnimationPlan({ state: 'technique', player: whirl, serverNow: 10.2 + W.revolutionSec + 0.25 });
  assert.equal(second.clip, W.clips.revolution);
  assert.ok(Math.abs(second.time - 0.25) < 1e-9);
  // the technique's clips meet end to end; it is eased into, and out of
  assert.equal(blendSeconds(R.clips.enter, R.clips.brace), 0);
  assert.equal(blendSeconds(W.clips.revolution, W.clips.revolution), 0);
  assert.ok(blendSeconds('Idle', R.clips.enter) > 0);
  assert.ok(blendSeconds(R.clips.recovery, 'Idle') > 0.1);
});
