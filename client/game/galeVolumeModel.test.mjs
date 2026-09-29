import test from 'node:test';
import assert from 'node:assert/strict';
import { GALE_VOLUME, galeVolumeAt, windConeData, windRibbonData } from './galeVolumeModel.mjs';

test('the gust is a body of air: a cone opening from the hand along its way, wrapped in ribbons twisting out', () => {
  const tan = Math.tan(30 * Math.PI / 180);
  const cone = windConeData(tan).positions;
  let far = 0;
  for (let i = 0; i < cone.length; i += 3) {
    const z = cone[i + 2];
    const r = Math.hypot(cone[i], cone[i + 1]);
    assert.ok(z >= 0 && z <= 1 && Math.abs(r - (0.02 + z * tan)) < 1e-6, 'a cone, not a disc on the ground');
    far = Math.max(far, r);
  }
  assert.ok(Math.abs(far - (0.02 + tan)) < 1e-6);
  const ribbons = windRibbonData(tan, { count: 1, random: () => 0.5 }).positions;
  let turned = 0;
  let last = null;
  for (let i = 0; i < ribbons.length; i += 6) {
    const a = Math.atan2(ribbons[i + 1] + ribbons[i + 4], ribbons[i] + ribbons[i + 3]);
    if (last !== null && Math.abs(a - last) < 1) turned += a - last;
    last = a;
  }
  assert.ok(Math.abs(turned) > Math.PI, 'the ribbons swirl round the gust');
});

test('its front races out and slows, the air thins away after, and it is gone within its life', () => {
  const early = galeVolumeAt(0.05);
  const mid = galeVolumeAt(GALE_VOLUME.frontSec);
  assert.ok(early.front > 0.2 && early.front < mid.front, 'fast from the hand');
  assert.ok(mid.front >= 1, 'out to the end of the gust by then');
  assert.ok(galeVolumeAt(0.1).front - galeVolumeAt(0.05).front > galeVolumeAt(0.25).front - galeVolumeAt(0.2).front, 'and slowing');
  assert.equal(mid.fade, 1);
  assert.ok(galeVolumeAt(GALE_VOLUME.life - 0.1).fade < 0.5);
  assert.equal(galeVolumeAt(GALE_VOLUME.life).fade, 0);
  assert.ok(galeVolumeAt(GALE_VOLUME.life).done);
});
