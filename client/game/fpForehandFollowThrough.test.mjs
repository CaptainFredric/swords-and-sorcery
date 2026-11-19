// The forehand (the first ordinary cut, right to left) as a committed cut: once it is through its contact the blade
// only slows through its follow-through, the hand carrying it on across. Then, opening the falling chain, it cuts on
// down past the left hip and out of the view rather than slowing to lie across it (the "flop" players saw,
// 2026-11-18); once the backhand is committed the hand brings it back into view, point hanging, and the backhand
// rises out of that low guard. Measured on the shown path (aimed at the server's
// blade), for both chains: the falling chain opens with it, the rising chain's second cut is it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
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

const LATE_WINDOW = MELEE_CONTACT.window.late;

// how much of the blade (grip to point) is on a 16:9 screen with the game's 78-degree view, ignoring the look's lean
const VERTICAL = Math.tan(39 * Math.PI / 180), HORIZONTAL = VERTICAL * 16 / 9;
const onScreen = (t) => {
  const { wrist, blade } = comboPose(t, 0).arm;
  let seen = 0;
  for (let i = 0; i <= 20; i += 1) {
    const p = wrist.map((v, k) => v + blade[k] * (0.08 + 1.05 * i / 20));
    if (p[2] < -0.05 && Math.abs(p[0] / -p[2]) < HORIZONTAL && Math.abs(p[1] / -p[2]) < VERTICAL) seen += 1;
  }
  return seen / 21;
};

test('the forehand cuts on down past the left hip and out of the view; the backhand winds up back in view once committed', () => {
  const contact = SWORD_STRIKE_TIMES[0];
  // still cutting until it has gone: no slow, sideways blade parked in view (the "flop" players saw, 2026-11-18)
  for (const t of samples(contact + LATE_WINDOW, contact + 0.26)) {
    assert.ok(bladeRate(t, 0) > 150 || onScreen(t) < 0.35, `at ${t.toFixed(3)} the blade slows to ${bladeRate(t, 0).toFixed(0)} deg/s with ${(onScreen(t) * 100).toFixed(0)}% of it in view`);
  }
  // ...down past the hip, the point toward the ground, below the view, as the next cut is committed
  for (const t of samples(contact + 0.28, SWORD_CHAIN.starts[1])) {
    assert.ok(pitch(t, 0) < -40 && onScreen(t) < 0.35, `at ${t.toFixed(3)}: ${pitch(t, 0).toFixed(1)} degrees, ${(onScreen(t) * 100).toFixed(0)}% in view`);
    assert.ok(comboPose(t, 0).arm.wrist[0] < 0, 'the hand carried across to the left');
  }
  // once the backhand is committed it is wound up where it can be seen (before, the blade came back only 0.12 s
  // before the contact and the 0.4 s between the cuts read as the attack having stopped, 2026-11-19): the hilt in
  // view by 0.13 s after the commit, the point still hanging (a loaded low guard, never laid flat across the view)
  const windup = samples(SWORD_CHAIN.starts[1] + 0.13, SWORD_STRIKE_TIMES[1] - 0.12);
  for (const t of windup) {
    assert.ok(onScreen(t) > 0.2, `at ${t.toFixed(3)} only ${(onScreen(t) * 100).toFixed(0)}% of the blade is in view`);
    assert.ok(pitch(t, 0) < -15, `at ${t.toFixed(3)} the point has risen to ${pitch(t, 0).toFixed(1)} degrees: laid across the view`);
  }
  // the backhand comes up out of it at speed, from the low left
  assert.ok(bladeRate(SWORD_STRIKE_TIMES[1] - MELEE_CONTACT.window.early, 0) > 400, 'the backhand already driving as its window opens');
});
