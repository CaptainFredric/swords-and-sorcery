import test from 'node:test';
import assert from 'node:assert/strict';
import { compensatedInputTime, recordTransform, sampleTransform } from '../src/game/history.mjs';

test('transform history keeps only the latest half second and interpolates position/yaw', () => {
  const player = { position: { x: 0, y: 0, z: 0 }, yaw: 3.10, pitch: 0, history: [] };
  recordTransform(player, 10.0);
  player.position = { x: 2, y: 0, z: 0 };
  player.yaw = -3.10;
  recordTransform(player, 10.2);
  player.position = { x: 5, y: 0, z: 0 };
  recordTransform(player, 10.6);

  assert.ok(player.history.every((sample) => sample.at >= 10.1));
  const sample = sampleTransform(player, 10.4);
  assert.ok(Math.abs(sample.position.x - 3.5) < 1e-9);
  assert.ok(Math.abs(Math.abs(sample.yaw) - Math.PI) < 0.05);
});

test('sampling without history returns the current transform', () => {
  const player = { position: { x: 4, y: 2, z: -3 }, yaw: 0.7, pitch: -0.2 };
  assert.deepEqual(sampleTransform(player, 99), {
    position: { x: 4, y: 2, z: -3 }, yaw: 0.7, pitch: -0.2,
  });
});


test('input event time accepts a small server-clock backdate but clamps forged timestamps', () => {
  assert.equal(compensatedInputTime(9.92, 10), 9.92);
  assert.equal(compensatedInputTime(5, 10), 9.8);
  assert.equal(compensatedInputTime(11, 10), 10);
  assert.equal(compensatedInputTime(Number.NaN, 10), 10);
});
