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

test('wavy lines run out along the gust\'s sides, rippling, white and green; wisps curl out through it', async () => {
  const { windWaveData, windWispData } = await import('./galeVolumeModel.mjs');
  const tan = Math.tan(48 * Math.PI / 180);
  const waves = windWaveData(tan, { random: () => 0.5 });
  assert.ok(new Set(waves.tints).size === 2, 'both white and green lines');
  // most of each line lies out toward the cone's edge (filling out its sides)
  let outer = 0;
  let count = 0;
  for (let i = 0; i < waves.positions.length; i += 3) {
    const z = waves.positions[i + 2];
    if (z < 0.2) continue;
    count += 1;
    if (Math.hypot(waves.positions[i], waves.positions[i + 1]) > 0.45 * z * tan) outer += 1;
  }
  assert.ok(outer / count > 0.8, `out along the sides: ${(outer / count).toFixed(2)}`);
  assert.ok(waves.waves.some((w) => Math.abs(w) > 0.01), 'and they ripple');
  const wisps = windWispData(tan, { random: () => 0.5 });
  assert.ok(wisps.positions.length > 0 && new Set(wisps.tints).size === 2);
  for (let i = 0; i < wisps.centers.length; i += 3) assert.ok(wisps.centers[i + 2] > 0.05 && wisps.centers[i + 2] < 1, 'inside the gust');
});
