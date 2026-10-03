import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedSwordArm, ownershipBlendSeconds } from './chivalryMotion.mjs';

test('action entry stays responsive while idle and Guard recover more gently', () => {
  assert.equal(ownershipBlendSeconds('Guard', 'Slash_1'), 0.1);
  assert.equal(ownershipBlendSeconds('Slash_1', 'Slash_2'), 0.06);
  assert.equal(ownershipBlendSeconds('Cast', 'Guard'), 0.16);
  assert.equal(ownershipBlendSeconds('Cast', 'Idle'), 0.24);
  assert.equal(ownershipBlendSeconds('Run', 'Sprint'), 0.16);
});

test('guarded swing wrist correction blends continuously without changing blade orientation', () => {
  const arm = { wrist: [0.5, -0.25, -0.6], blade: [0, 1, 0], edge: [1, 0, 0] };
  assert.deepEqual(guardedSwordArm(arm, 0), arm);
  let previous = arm;
  for (let i = 1; i <= 14; i += 1) {
    const next = guardedSwordArm(arm, i / 14);
    assert.ok(Math.hypot(...next.wrist.map((v,j) => v - previous.wrist[j])) < 0.006);
    assert.deepEqual(next.blade, arm.blade);
    previous = next;
  }
  assert.deepEqual(arm.wrist, [0.5, -0.25, -0.6]);
});
