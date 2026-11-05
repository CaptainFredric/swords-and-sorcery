import test from 'node:test';
import assert from 'node:assert/strict';
import { SECONDARY, SecondaryMotion } from './spellbladeSecondary.mjs';

const dt = 1 / 60;
const angleOf = (turns, bone, axis) => turns.filter((t) => t.bone === bone && t.axis[axis] === 1).reduce((s, t) => s + t.angle, 0);
// run a body along a path: position(t), yaw(t), for `seconds`; returns each frame's turns
function run(motion, { seconds, at, yaw = () => 0, riding = false, from = 0 }) {
  const frames = [];
  for (let t = from; t < from + seconds; t += dt) frames.push(motion.update(dt, { at: at(t), yaw: yaw(t), riding }));
  return frames;
}
const trunkPitch = (turns) => angleOf(turns, 'spine', 0) + angleOf(turns, 'chest', 0);
const trunkRoll = (turns) => angleOf(turns, 'spine', 2) + angleOf(turns, 'chest', 2);

test('standing, or running steadily, the trunk holds still', () => {
  const m = new SecondaryMotion();
  for (const turns of run(m, { seconds: 2, at: () => ({ x: 0, z: 0 }) })) assert.equal(turns.length, 0);
  const steady = run(new SecondaryMotion(), { seconds: 3, at: (t) => ({ x: 0, z: -5 * t }) });
  assert.ok(Math.abs(trunkPitch(steady.at(-1))) < 0.002);
});

test('braking hard, the trunk carries on forward a little, then settles back without bouncing', () => {
  const m = new SecondaryMotion();
  run(m, { seconds: 1.5, at: (t) => ({ x: 0, z: -6 * t }) });
  // stop dead at z = -9
  const frames = run(m, { seconds: 2.5, at: () => ({ x: 0, z: -9 }), from: 1.5 });
  const pitches = frames.map(trunkPitch);
  const most = Math.min(...pitches);
  assert.ok(most < -0.03, `leans forward: ${most}`);
  assert.ok(most >= -SECONDARY.pitchMax * 1.25, `bounded: ${most}`);
  // settled by the end, and never swung back further than a small overshoot
  assert.ok(Math.abs(pitches.at(-1)) < 0.003);
  assert.ok(Math.max(...pitches) < Math.abs(most) * 0.3, `overshoot ${Math.max(...pitches)}`);
});

test('turning at speed, the trunk banks into the turn, and the helmet leads it and stays level', () => {
  const left = new SecondaryMotion();
  // a circle to the left at 5 m/s (yaw rising: turning left)
  const r = 4, v = 5, w = v / r;
  const frames = run(left, { seconds: 2, at: (t) => ({ x: -r + r * Math.cos(w * t), z: -r * Math.sin(w * t) }), yaw: (t) => w * t });
  const last = frames.at(-1);
  assert.ok(trunkRoll(last) > 0.02, `banks left: ${trunkRoll(last)}`);
  assert.ok(trunkRoll(last) <= SECONDARY.rollMax * 1.01);
  assert.ok(angleOf(last, 'head', 1) > 0, 'the helmet leads to the left');
  assert.ok(Math.abs(angleOf(last, 'head', 2) + trunkRoll(last) * SECONDARY.steady) < 1e-6, 'and takes back most of the bank');
});

test('riding, all of it is halved; a teleport or a reappearance is not a lurch', () => {
  const brake = (riding) => {
    const m = new SecondaryMotion();
    run(m, { seconds: 1.5, at: (t) => ({ x: 0, z: -6 * t }), riding });
    return Math.min(...run(m, { seconds: 1, at: () => ({ x: 0, z: -9 }), from: 1.5, riding }).map(trunkPitch));
  };
  assert.ok(Math.abs(brake(true) - brake(false) * SECONDARY.riding) < 0.004);
  const m = new SecondaryMotion();
  run(m, { seconds: 1, at: () => ({ x: 0, z: 0 }) });
  // 40 m in one frame (a respawn): bounded by the believable acceleration, so a twitch at most
  const jump = run(m, { seconds: 1, at: () => ({ x: 40, z: 0 }), from: 1 });
  assert.ok(Math.max(...jump.map((t) => Math.abs(trunkPitch(t)))) <= SECONDARY.pitchMax * 1.25);
  // a long gap (drawn again after a while hidden): starts afresh
  const fresh = new SecondaryMotion();
  fresh.update(dt, { at: { x: 0, z: 0 }, yaw: 0 });
  assert.deepEqual(fresh.update(5, { at: { x: 30, z: 0 }, yaw: 1 }), []);
  // still (dead, spun by a Vortex): nothing
  assert.deepEqual(new SecondaryMotion().update(dt, { at: { x: 0, z: 0 }, yaw: 0, still: true }), []);
});

test('a loosed bolt jolts the seated knight back and lets him settle: nothing before it, nothing left after', async () => {
  const { RECOIL, recoilTurns } = await import('./spellbladeSecondary.mjs');
  assert.deepEqual(recoilTurns(-0.01), []);
  assert.deepEqual(recoilTurns(RECOIL.seconds + 0.01), []);
  const at = (t, bone) => recoilTurns(t).find((u) => u.bone === bone).angle;
  // the chest back first, the helmet a beat after it, then a little forward as he settles
  assert.ok(at(0.07, 'chest') > 0.9 * RECOIL.chest);
  assert.ok(at(0.03, 'head') < at(0.11, 'head'));
  assert.ok(at(0.4, 'head') < 0, 'settling forward');
  for (let t = 0; t <= RECOIL.seconds; t += 0.01) for (const u of recoilTurns(t)) assert.ok(Math.abs(u.angle) <= 4 * Math.PI / 180, `${u.bone} ${t}`);
  assert.ok(Math.abs(at(RECOIL.seconds - 0.01, 'chest')) < 0.15 * RECOIL.chest, 'all but gone by its end');
});
