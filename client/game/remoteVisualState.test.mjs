import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRemoteVisualShell,
  disposeRemoteVisualShell,
  setRemoteVisualPlan,
  upgradeRemoteVisual,
} from './remoteVisualState.mjs';

function rootStub() {
  return {
    children: [],
    position: { x: 4, y: 2, z: -7 },
    rotation: { y: 1.25 },
    add(child) { if (!this.children.includes(child)) this.children.push(child); },
    remove(child) { this.children = this.children.filter((value) => value !== child); },
  };
}

function fallbackStub(name = 'fallback') {
  return { name, parent: null };
}

function instanceStub(name = 'glb') {
  const calls = { dispose: 0, apply: [] };
  return {
    root: { name },
    animator: { apply(plan) { calls.apply.push(plan); } },
    sourceRevision: 'a'.repeat(40),
    dispose() { calls.dispose += 1; },
    calls,
  };
}

test('fallback shell keeps network position/yaw on a stable outer root when visual is replaced', () => {
  const root = rootStub();
  const fallback = fallbackStub();
  const shell = createRemoteVisualShell({ root, fallback });
  const token = shell.generation;
  const instance = instanceStub();

  const before = { x: root.position.x, y: root.position.y, z: root.position.z, yaw: root.rotation.y };
  assert.equal(upgradeRemoteVisual(shell, instance, token), true);

  assert.deepEqual(
    { x: root.position.x, y: root.position.y, z: root.position.z, yaw: root.rotation.y },
    before,
  );
  assert.equal(shell.visualKind, 'glb');
  assert.equal(shell.visual, instance.root);
  assert.deepEqual(root.children, [instance.root]);
});

test('asset resolving after player removal is ignored and disposed', () => {
  const shell = createRemoteVisualShell({ root: rootStub(), fallback: fallbackStub() });
  const token = shell.generation;
  disposeRemoteVisualShell(shell);
  const late = instanceStub('late');

  assert.equal(upgradeRemoteVisual(shell, late, token), false);
  assert.equal(late.calls.dispose, 1);
  assert.equal(shell.active, false);
});

test('remove and recreate cannot let an old generation replace the new visual', () => {
  const oldShell = createRemoteVisualShell({ root: rootStub(), fallback: fallbackStub('old') });
  const oldToken = oldShell.generation;
  disposeRemoteVisualShell(oldShell);

  const newShell = createRemoteVisualShell({ root: rootStub(), fallback: fallbackStub('new') });
  const fresh = instanceStub('fresh');
  assert.equal(upgradeRemoteVisual(newShell, fresh, newShell.generation), true);

  const stale = instanceStub('stale');
  assert.equal(upgradeRemoteVisual(oldShell, stale, oldToken), false);
  assert.equal(stale.calls.dispose, 1);
  assert.equal(newShell.visual, fresh.root);
});

test('latest gameplay animation plan is applied immediately when GLB arrives', () => {
  const shell = createRemoteVisualShell({ root: rootStub(), fallback: fallbackStub() });
  const plan = { clip: 'Guard', time: 0, loop: false, weight: 1 };
  setRemoteVisualPlan(shell, plan);

  const instance = instanceStub();
  assert.equal(upgradeRemoteVisual(shell, instance, shell.generation), true);
  assert.deepEqual(instance.calls.apply, [plan]);
});

test('disposing an upgraded shell disposes its owned GLB instance once', () => {
  const shell = createRemoteVisualShell({ root: rootStub(), fallback: fallbackStub() });
  const instance = instanceStub();
  upgradeRemoteVisual(shell, instance, shell.generation);

  disposeRemoteVisualShell(shell);
  disposeRemoteVisualShell(shell);
  assert.equal(instance.calls.dispose, 1);
  assert.equal(shell.root.children.length, 0);
});
