// The forehand (the first ordinary cut, right to left) as a committed cut: once it is through its contact the blade
// only slows, the hand carrying it on across, to where the returning cut is loaded from. Measured on the shown path
// (aimed at the server's blade), for both chains: the falling chain opens with it, the rising chain's second cut is it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { comboPose } from './fpSlash.mjs';

const DEG = 180 / Math.PI;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * DEG;
const H = 1 / 240;
const bladeRate = (t, v) => angle(comboPose(t - H, v).arm.blade, comboPose(t + H, v).arm.blade) / (2 * H);
const wristSpeed = (t, v) => Math.hypot(...comboPose(t + H, v).arm.wrist.map((x, i) => x - comboPose(t - H, v).arm.wrist[i])) / (2 * H);
const pitch = (t, v) => Math.asin(comboPose(t, v).arm.blade[1]) * DEG;
const samples = (from, to, step = 1 / 120) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

for (const [name, variant, contact, until] of [
  ['the falling chain', 0, SWORD_STRIKE_TIMES[0], 0.3],
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

test('the forehand comes to rest where the backhand is loaded, with no rebound and no second dip', () => {
  const contact = SWORD_STRIKE_TIMES[0];
  // from the end of the follow-through to the backhand's approach: the blade all but still, low on the left
  const held = samples(contact + 0.3, SWORD_STRIKE_TIMES[1] - 0.14);
  const pitches = held.map((t) => pitch(t, 0));
  assert.ok(Math.max(...pitches) - Math.min(...pitches) < 6, `the blade bobs ${(Math.max(...pitches) - Math.min(...pitches)).toFixed(1)} degrees while it is held`);
  for (const t of held) assert.ok(bladeRate(t, 0) < 80, `at ${t.toFixed(3)} the held blade turns ${bladeRate(t, 0).toFixed(0)} deg/s`);
  // the whole fall from the contact to the chamber is one way: the point never comes back up before the backhand
  const fall = samples(contact, SWORD_STRIKE_TIMES[1] - 0.14).map((t) => pitch(t, 0));
  for (let i = 1; i < fall.length; i += 1) assert.ok(fall[i] <= fall[i - 1] + 0.35, `the point rises again ${(i / 120).toFixed(3)} s after the contact`);
  assert.ok(fall.at(-1) > -20 && fall.at(-1) < -8, `the chamber holds the blade ${fall.at(-1).toFixed(1)} degrees below level`);
});
