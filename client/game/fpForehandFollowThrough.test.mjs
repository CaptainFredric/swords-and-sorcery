// The forehand (the first ordinary cut, right to left) as a committed cut: once it is through its contact the blade
// only slows through its follow-through, the hand carrying it on across. Then, opening the falling chain, the arm lifts
// it into a raised guard in front of the body rather than letting it lie flat and still low on the left (the "flop"
// players saw, 2026-11-18), and the backhand is loaded from there. Measured on the shown path (aimed at the server's
// blade), for both chains: the falling chain opens with it, the rising chain's second cut is it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { comboPose } from './fpSlash.mjs';

const DEG = 180 / Math.PI;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * DEG;
const H = 1 / 240;
const bladeRate = (t, v) => angle(comboPose(t - H, v).arm.blade, comboPose(t + H, v).arm.blade) / (2 * H);
const wristSpeed = (t, v) => Math.hypot(...comboPose(t + H, v).arm.wrist.map((x, i) => x - comboPose(t - H, v).arm.wrist[i])) / (2 * H);
const pitch = (t, v) => Math.asin(comboPose(t, v).arm.blade[1]) * DEG;
const samples = (from, to, step = 1 / 120) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

for (const [name, variant, contact, until] of [
  // (the falling chain's follow-through is the server's window after the contact; the lift into the guard follows it)
  ['the falling chain', 0, SWORD_STRIKE_TIMES[0], MELEE_CONTACT.window.late],
  ['the rising chain', 1, SWORD_STRIKE_TIMES[1], 0.16],
]) {
  test(`the forehand of ${name} follows through without stalling`, () => {
    // (before: 700 degrees a second at the contact, 68 a tenth of a second later, then 460 again as the blade fell)
    const rates = samples(contact, contact + until).map((t) => bladeRate(t, variant));
    for (let i = 1; i < rates.length; i += 1) {
      assert.ok(rates[i] <= rates[i - 1] * 1.08 + 12, `the blade speeds up again ${(i / 120).toFixed(3)} s after the contact (${rates[i - 1].toFixed(0)} to ${rates[i].toFixed(0)} deg/s)`);
    }
    // it is still a cut a tenth of a second on (carried through, not checked at the middle)
    assert.ok(bladeRate(contact + 0.1, variant) > 220, `${bladeRate(contact + 0.1, variant).toFixed(0)} deg/s a tenth of a second after the contact`);
  });

  test(`the forehand of ${name} is carried by the hand, never dropped from a still wrist`, () => {
    for (const t of samples(contact + 0.02, contact + until)) {
      const rate = bladeRate(t, variant);
      if (rate < 150) continue;
      assert.ok(wristSpeed(t, variant) > 0.9, `at ${t.toFixed(3)} the blade turns ${rate.toFixed(0)} deg/s on a hand moving ${wristSpeed(t, variant).toFixed(2)} m/s`);
    }
  });
}

const yawLeft = (t) => { const b = comboPose(t, 0).arm.blade; return Math.atan2(-b[0], -b[2]) * DEG; };

test('the forehand finishes in a raised guard in front of the body, never flat and still low on the left', () => {
  const contact = SWORD_STRIKE_TIMES[0];
  // lifted by the arm into a guard: the point well above level, the hand in front, the blade angled up and across
  for (const t of samples(contact + 0.25, contact + 0.32)) {
    assert.ok(pitch(t, 0) > 10, `at ${t.toFixed(3)} the point is ${pitch(t, 0).toFixed(1)} degrees from level`);
    assert.ok(yawLeft(t) < 56, `at ${t.toFixed(3)} the blade points ${yawLeft(t).toFixed(0)} degrees to the left`);
    assert.ok(comboPose(t, 0).arm.wrist[0] > 0.02, 'the hand held in front, not round at the hip');
  }
  // held there a moment (the guard reads), before the backhand takes it down into its load
  const top = samples(contact + 0.25, contact + 0.34).map((t) => bladeRate(t, 0));
  assert.ok(Math.min(...top) < 60, `the guard is held: the blade never slower than ${Math.min(...top).toFixed(0)} deg/s`);
  // from the contact to the backhand's approach the sword never lies flat low on the left
  for (const t of samples(contact, SWORD_STRIKE_TIMES[1] - 0.14)) {
    assert.ok(pitch(t, 0) > -15, `at ${t.toFixed(3)} the point is ${pitch(t, 0).toFixed(1)} degrees below level`);
    assert.ok(yawLeft(t) < 70, `at ${t.toFixed(3)} the blade lies ${yawLeft(t).toFixed(0)} degrees to the left`);
  }
});
