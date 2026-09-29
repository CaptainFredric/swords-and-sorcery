import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS } from './spells.mjs';
import { galeAt, galeRecoil, galeShove } from './gale.mjs';

const gale = SPELLS.gale;
const origin = { x: 0, y: 1.35, z: 0 };
const ahead = { x: 0, y: 0, z: -1 };
const at = (distance, angleDeg = 0) => {
  const a = angleDeg * Math.PI / 180;
  return { x: Math.sin(a) * distance, y: 1.35, z: -Math.cos(a) * distance };
};

test('the gust: its pressure reaches wider and further than its heart, and both fade evenly, with nothing behind', () => {
  const heart = galeAt(gale, origin, ahead, at(2));
  assert.ok(heart.pressure > 0.5 && heart.exposure > 0.3, 'close in front: shoved hard and stung');
  // past the heart's reach, and wider than its angle: still shoved, not stung
  const beyond = galeAt(gale, origin, ahead, at(gale.cone.reach + 1));
  assert.ok(beyond.pressure > 0 && beyond.exposure === 0);
  const wide = galeAt(gale, origin, ahead, at(2.5, gale.cone.halfAngleDeg + 6));
  assert.ok(wide.pressure > 0 && wide.exposure === 0);
  assert.equal(galeAt(gale, origin, ahead, at(3, 180)).pressure, 0, 'nothing behind');
  // no steps anywhere: small moves change it only a little, and it only ever falls moving out
  let last = Infinity;
  for (let d = 0.2; d < gale.cone.pressureReach + 0.5; d += 0.05) {
    const p = galeAt(gale, origin, ahead, at(d)).pressure;
    assert.ok(p <= last + 1e-12, `falls with distance (${d.toFixed(2)})`);
    if (Number.isFinite(last)) assert.ok(last - p < 0.05, `evenly (${d.toFixed(2)})`);
    last = p;
  }
  last = Infinity;
  for (let a = 0; a < gale.cone.pressureHalfAngleDeg + 3; a += 0.5) {
    const p = galeAt(gale, origin, ahead, at(3, a)).pressure;
    assert.ok(p <= last + 1e-12 && (Number.isFinite(last) ? last - p < 0.05 : true), `and with angle (${a})`);
    last = p;
  }
});

test('the shove runs with the gust, lifting a little, harder the closer; a pull is the same field reversed', () => {
  const near = galeShove(gale, origin, ahead, at(1.5), galeAt(gale, origin, ahead, at(1.5)).pressure);
  const far = galeShove(gale, origin, ahead, at(6), galeAt(gale, origin, ahead, at(6)).pressure);
  assert.ok(near.z < 0 && near.y > 0, 'away along the gust, and up');
  assert.ok(Math.hypot(near.x, near.z) > Math.hypot(far.x, far.z) * 2);
  const pull = galeShove(gale, origin, ahead, at(1.5), 0.8, -1);
  const push = galeShove(gale, origin, ahead, at(1.5), 0.8, 1);
  assert.ok(Math.abs(pull.z + push.z) < 1e-9 && pull.z > 0, 'toward the caster');
});

test('driven into the ground close by, the gust throws its caster back off it; into open air, nothing', () => {
  const flat = { floors: [{ id: 'floor', center: [0, -0.15, 0], size: [40, 0.3, 40], y: 0 }], ramps: [], solids: [] };
  const down = galeRecoil(gale, origin, { x: 0, y: -1, z: 0 }, flat);
  assert.ok(down && down.y > 0, 'straight down: up');
  assert.ok(down.y <= gale.recoil.maxUp);
  const n = Math.SQRT1_2;
  const downBehind = galeRecoil(gale, origin, { x: 0, y: -n, z: n }, flat);
  assert.ok(downBehind.z < 0 && downBehind.y > 0, 'down and behind: forward and up');
  assert.equal(galeRecoil(gale, origin, { x: 0, y: 0.6, z: -0.8 }, flat), null, 'into the sky: nothing to push off');
  // the closer the ground, the harder
  const low = galeRecoil(gale, { x: 0, y: 0.6, z: 0 }, { x: 0, y: -1, z: 0 }, flat);
  assert.ok(low.y > down.y);
});
