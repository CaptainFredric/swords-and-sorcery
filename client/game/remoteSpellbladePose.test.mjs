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

function numbers(value) {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(numbers);
}

test('idle pose keeps a restrained ready stance', () => {
  const idle = pose('idle');
  assert.ok(Math.abs(idle.visual.rx) < 0.1);
  assert.ok(Math.abs(idle.torso.ry) < 0.1);
  assert.ok(idle.sword.rz < -2);
  assert.ok(idle.magicScale > 0.85 && idle.magicScale < 1.15);
});

test('guard raises the sword and closes the armored stance', () => {
  const idle = pose('idle');
  const guard = pose('guard');
  assert.ok(guard.sword.rz > idle.sword.rz + 1.2);
  assert.ok(guard.rightUpperArm.rz < -0.45);
  assert.ok(guard.rightForearm.rx < -0.8);
  assert.ok(Math.abs(guard.torso.ry) > Math.abs(idle.torso.ry));
});

test('cast clearly opens the off hand and amplifies sorcery', () => {
  const cast = pose('cast', basePlayer, 10.2, 0.2);
  assert.ok(cast.leftUpperArm.rx < -1.0);
  assert.ok(cast.leftUpperArm.rz > 0.1);
  assert.ok(cast.magicScale > 1.4);
  assert.ok(cast.torso.ry < -0.1);
});

test('run alternates legs and counterswings the arms', () => {
  const moving = { ...basePlayer, velocity: { x: 7.5, y: 0, z: 0 } };
  const run = pose('run', moving, 10.2, Math.PI / (2 * 9.4));
  assert.ok(run.leftThigh.rx > 0.5);
  assert.ok(run.rightThigh.rx < -0.5);
  assert.ok(run.leftUpperArm.rx < 0);
  assert.ok(run.rightUpperArm.rx > 0);
});

test('dash compresses the silhouette into a forward committed burst', () => {
  const dash = pose('dash');
  assert.ok(dash.visual.rx < -0.2);
  assert.ok(dash.leftUpperArm.rx > 0.5);
  assert.ok(dash.rightUpperArm.rx > 0.5);
  assert.ok(dash.rightShin.rx < -0.4);
  assert.ok(dash.tabardX < -0.25);
});

test('death pose visibly collapses and suppresses magic', () => {
  const dead = pose('dead');
  assert.ok(dead.visual.y < -0.25);
  assert.ok(dead.visual.rz > 1.1);
  assert.ok(dead.magicScale < 0.7);
  assert.ok(dead.sword.rz < -2.7);
});

test('stagger breaks symmetry without using the death collapse', () => {
  const stagger = pose('stagger', { ...basePlayer, staggerUntil: 10.35 }, 10.2, 0.5);
  assert.ok(Math.abs(stagger.visual.rz) > 0.02);
  assert.ok(stagger.leftUpperArm.rz > 0.5);
  assert.ok(stagger.rightUpperArm.rz < -0.5);
  assert.ok(Math.abs(stagger.visual.rz) < 0.3);
});

test('every remote pose target stays finite for every visual state', () => {
  for (const state of ['idle', 'run', 'air', 'guard', 'attack', 'cast', 'dash', 'stagger', 'dead']) {
    const value = pose(state, {
      ...basePlayer,
      velocity: state === 'run' ? { x: 7.5, y: 0, z: 0 } : basePlayer.velocity,
      staggerUntil: state === 'stagger' ? 10.35 : 0,
    });
    const allNumbers = numbers(value);
    assert.ok(allNumbers.length > 10, `${state} should expose a complete pose`);
    assert.ok(allNumbers.every(Number.isFinite), `${state} contained a non-finite target`);
  }
});
