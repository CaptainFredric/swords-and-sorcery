import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightCameraMotion } from './FlightCameraMotion.mjs';

test('FlightCameraMotion produces zero offsets when cameraMotion is 0', () => {
  const motion = new FlightCameraMotion();
  const machine = { velocity: { x: 5, y: 2, z: 0 }, grounded: false, lastShotAt: 1 };
  const result = motion.update(0.016, machine, 0);
  assert.equal(result.offset.x, 0);
  assert.equal(result.offset.y, 0);
  assert.equal(result.offset.z, 0);
  assert.equal(result.pitch, 0);
  assert.equal(result.roll, 0);
});

test('FlightCameraMotion reacts to landing impact with downward compression', () => {
  const motion = new FlightCameraMotion();
  // Falling at -5 m/s
  motion.update(0.016, { velocity: { x: 0, y: -5, z: 0 }, grounded: false }, 1);
  // Contacts ground
  const result = motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  assert.ok(result.offset.y < 0, 'Landing compression should push offset downward');
});

test('FlightCameraMotion reacts to bolt firing with recoil kick', () => {
  const motion = new FlightCameraMotion();
  motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  const result = motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true, lastShotAt: 1.5 }, 1);
  assert.ok(result.offset.z > 0, 'Recoil kick should push offset backward in local z');
  assert.ok(result.pitch > 0, 'Recoil should produce slight upward pitch kick');
});

test('FlightCameraMotion dampens back toward rest after disturbance', () => {
  const motion = new FlightCameraMotion();
  motion.update(0.016, { velocity: { x: 0, y: -4, z: 0 }, grounded: false }, 1);
  motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  // Let it settle over 1 second
  let finalResult;
  for (let i = 0; i < 60; i++) {
    finalResult = motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  }
  assert.ok(Math.abs(finalResult.offset.y) < 0.005, 'Offset should settle back near 0');
});

test('FlightCameraMotion reacts to takeoff surge when leaving ground', () => {
  const motion = new FlightCameraMotion();
  // On ground
  motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  // Lifts off with positive vertical velocity
  const result = motion.update(0.016, { velocity: { x: 0, y: 1.5, z: 0 }, grounded: false }, 1);
  assert.ok(result.offset.y < 0, 'Takeoff inertia should produce downward harness surge');
  assert.ok(result.pitch > 0, 'Takeoff should produce upward pitch response');
});

test('FlightCameraMotion reacts to horizontal acceleration with settling reaction', () => {
  const motion = new FlightCameraMotion();
  motion.update(0.016, { velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 1);
  // Rapid acceleration forward
  const result = motion.update(0.016, { velocity: { x: 4, y: 0, z: 0 }, grounded: true }, 1);
  assert.ok(result.pitch > 0, 'Acceleration should produce settling pitch back');
});
