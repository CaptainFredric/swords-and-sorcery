import test from 'node:test';
import assert from 'node:assert/strict';
import { biByeHudView } from './biByeHudView.mjs';
const b = { id: 'siege', position: { x: 0, y: 0, z: 0 }, health: 400, maxHealth: 400, mode: 'MOBILE', state: 'LOADED', smallBoltReady: true };
const local = { alive: true, position: { x: 0, z: 3.1 } };
test('one interaction prompt uses the actual 3.2 m range and excludes an occupied machine', () => {
  assert.ok(biByeHudView(local, { bibyeBallista: b }, 0));
  assert.equal(biByeHudView({ ...local, position: { x: 0, z: 3.3 } }, { bibyeBallista: b }, 0), null);
  assert.equal(biByeHudView(local, { bibyeBallista: { ...b, operatorId: 'another' } }, 0), null);
});
test('mounted controls use rebound keys or touch labels', () => {
  const operator = { ...local, operatingBallistaId: b.id };
  const desktop = biByeHudView(operator, { bibyeBallista: b }, 0, { bindings: { attack: ['KeyF'], deploy: ['KeyH'], siegeView: ['KeyJ'], interact: ['KeyK'] } });
  assert.match(desktop.controls, /\[F\] Fire.*\[H\] Deploy.*\[J\] View.*\[K\] Leave/);
  assert.equal(biByeHudView(operator, { bibyeBallista: b }, 0, { touch: true }).controls, 'SIEGE VIEW · ATTACK to fire');
});
