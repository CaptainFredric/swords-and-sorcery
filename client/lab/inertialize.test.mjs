import test from 'node:test';
import assert from 'node:assert/strict';
import { Inertializer, decay, quatExp, quatLog, quatMul, quatInv } from './inertialize.mjs';

const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
const about = (axis, rad) => quatExp(axis.map((c) => c * rad));

test('log and exp are inverses', () => {
  const q = about([0, 0.6, 0.8], 1.1);
  const back = quatExp(quatLog(q));
  assert.ok(angle(q, back) < 1e-9);
  assert.ok(angle(quatMul(q, quatInv(q)), [0, 0, 0, 1]) < 1e-9);
});

test('the decay halves an offset at rest within about its halflife, without overshoot', () => {
  let x = [1, 0, 0], v = [0, 0, 0];
  const h = 0.1, dt = 1 / 120;
  let min = 1;
  for (let t = 0; t < 0.6; t += dt) { [x, v] = decay(x, v, h, dt); min = Math.min(min, x[0]); }
  assert.ok(min > -1e-6, 'no overshoot from rest');
  let y = [1, 0, 0], w = [0, 0, 0];
  for (let t = 0; t < h * 1.7; t += dt) [y, w] = decay(y, w, h, dt);
  assert.ok(y[0] < 0.5);
});

test('a transition shows the old pose first and arrives at the new one', () => {
  const inert = new Inertializer(1, { halflife: 0.08 });
  const dt = 1 / 60;
  const a = about([0, 1, 0], 0), b = about([0, 1, 0], 1.2);
  for (let i = 0; i < 5; i += 1) inert.apply([a], new Map(), dt);
  inert.transition([b], new Map(), dt);
  const first = inert.apply([b], new Map(), dt).rot[0];
  // the first frame after the switch is still close to the old pose: no pop
  assert.ok(angle(first, a) < 0.15, `first frame ${angle(first, a)} rad from the old pose`);
  let shown = first;
  for (let i = 0; i < 40; i += 1) shown = inert.apply([b], new Map(), dt).rot[0];
  assert.ok(angle(shown, b) < 0.01, 'and it arrives');
});

test('a body moving into the switch keeps its speed for a moment (no dead stop)', () => {
  const inert = new Inertializer(1, { halflife: 0.1 });
  const dt = 1 / 60;
  const at = (i) => about([0, 0, 1], i * 0.05);
  for (let i = 0; i < 6; i += 1) inert.apply([at(i)], new Map(), dt);
  const target = at(5);
  inert.transition([target], new Map(), dt);
  const next = inert.apply([target], new Map(), dt).rot[0];
  // it carried on past the last shown pose in the direction it was turning
  assert.ok(quatLog(quatMul(next, quatInv(at(5))))[2] > 0);
});

test('positions decay the same way', () => {
  const inert = new Inertializer(0, { halflife: 0.08 });
  const dt = 1 / 60;
  for (let i = 0; i < 3; i += 1) inert.apply([], new Map([['pelvis', [0, 1, 0]]]), dt);
  inert.transition([], new Map([['pelvis', [0, 0.8, 0]]]), dt);
  const p = inert.apply([], new Map([['pelvis', [0, 0.8, 0]]]), dt).pos.get('pelvis');
  assert.ok(p[1] > 0.95);
});
