import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRemoteSpellbladePose } from './remoteSpellbladePose.mjs';

const basePlayer = {
  velocity: { x: 0, y: 0, z: 0 },
  attackStartedAt: 10,
  attackNextStrike: 0,
  staggerUntil: 0,
};

function pose(state, player = basePlayer, serverNow = 10.2, localTime = 0.5) {
  return resolveRemoteSpellbladePose({ state, player, serverNow, localTime });
}

test('idle pose keeps a restrained ready stance', () => {
  const idle = pose('idle');
  assert.ok(Math.abs(idle.visual.rx) < 0.1);
  assert.ok(Math.abs(idle.torso.ry) < 0.1);
  assert.ok(idle.sword.z < -2);
  assert.ok(idle.magicScale > 0.85 && idle.magicScale < 1.15);
});

test('guard raises the sword and closes the armored stance', () => {
  const idle = pose('idle');
  const guard = pose('guard');
  assert.ok(guard.sword.z > idle.sword.z + 1.2);
  assert.ok(guard.rightUpperArm.z < -0.45);
  assert.ok(guard.rightForearm.x < -0.8);
  assert.ok(Math.abs(guard.torso.ry) > Math.abs(idle.torso.ry));
});

test('cast clearly opens the off hand and amplifies sorcery', () => {
  const cast = pose('cast', basePlayer, 10.2, 0.2);
  assert.ok(cast.leftUpperArm.x < -1.0);
  assert.ok(cast.leftUpperArm.z > 0.1);
  assert.ok(cast.magicScale > 1.4);
  assert.ok(cast.torso.ry < -0.1);
});

test('run alternates legs and counterswings the arms', () => {
  const moving = { ...basePlayer, velocity: { x: 7.5, y: 0, z: 0 } };
  const run = pose('run', moving, 10.2, Math.PI / (2 * 9.4));
  assert.ok(run.leftThigh.x > 0.5);
  assert.ok(run.rightThigh.x < -0.5);
  assert.ok(run.leftUpperArm.x < 0);
  assert.ok(run.rightUpperArm.x > 0);
});

test('dash compresses the silhouette into a forward committed burst', () => {
  const dash = pose('dash');
  assert.ok(dash.visual.rx < -0.2);
  assert.ok(dash.leftUpperArm.x > 0.5);
  assert.ok(dash.rightUpperArm.x > 0.5);
  assert.ok(dash.rightShin.x < -0.4);
  assert.ok(dash.tabardX < -0.25);
});

test('death pose visibly collapses and suppresses magic', () => {
  const dead = pose('dead');
  assert.ok(dead.visual.y < -0.25);
  assert.ok(dead.visual.rz > 1.1);
  assert.ok(dead.magicScale < 0.7);
  assert.ok(dead.sword.z < -2.7);
});

test('stagger breaks symmetry without using the death collapse', () => {
  const stagger = pose('stagger', { ...basePlayer, staggerUntil: 10.35 }, 10.2, 0.5);
  assert.ok(Math.abs(stagger.visual.rz) > 0.02);
  assert.ok(stagger.leftUpperArm.z > 0.5);
  assert.ok(stagger.rightUpperArm.z < -0.5);
  assert.ok(Math.abs(stagger.visual.rz) < 0.3);
});
