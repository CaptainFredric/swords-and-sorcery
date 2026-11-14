import test from 'node:test';
import assert from 'node:assert/strict';
import { contactOf, contactWorthDrawing, footfallPlan, groundContactAt, landingPlan } from './groundContact.mjs';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';
import { HIGH_GROUNDS } from '../../shared/worlds/highGrounds.mjs';

test('what is underfoot is read from the floor a knight stands on', () => {
  assert.equal(groundContactAt(CASTLEWARD, 0, 0, 0), 'grass');            // the town green
  assert.equal(groundContactAt(CASTLEWARD, 0, -15, 0), 'earth');          // the south road
  assert.equal(groundContactAt(CASTLEWARD, 0, 21.5, 2.4), 'stone');       // the bailey
  assert.equal(groundContactAt(HIGH_GROUNDS, 0, 57, 12), 'timber');       // a cross-bridge's planks
  assert.equal(groundContactAt(HIGH_GROUNDS, -38, -80, 6), 'timber');     // a camp ascent (High Grounds' ramps are planked)
  assert.equal(groundContactAt(HIGH_GROUNDS, 75, 0, 0), null);            // over the ravine: nothing
  assert.equal(contactOf('limestone'), 'stone');
  assert.equal(contactOf('something new'), 'earth');
});

test('a walking step on grass raises next to nothing; a sprint on a road kicks up a little', () => {
  assert.equal(footfallPlan('grass', 0).puffs, 0);
  assert.equal(footfallPlan('grass', 0).blades, 0);
  const sprint = footfallPlan('earth', 1);
  assert.equal(sprint.puffs, 2);
  assert.ok(sprint.grit > 0);
  // never more than two puffs a step, never large
  for (const c of ['grass', 'earth', 'stone', 'timber']) for (const h of [0, 0.5, 1]) {
    const plan = footfallPlan(c, h);
    assert.ok(plan.puffs <= 2 && plan.size <= 0.4 && plan.life <= 0.6, `${c} ${h}`);
  }
});

test('only a real drop lands with a ring of dust, and only a heavy one leaves a settling pall', () => {
  assert.equal(landingPlan('earth', 0.1), null);
  const hop = landingPlan('earth', 0.3);
  assert.ok(hop.ring >= 4 && hop.settle === 0);
  const heavy = landingPlan('stone', 1);
  assert.ok(heavy.settle > 0 && heavy.ring <= 10 && heavy.radius <= 2.3);
  assert.equal(landingPlan('timber', 1).grit, 0);
});

test('contact effects are drawn only near the eye and only while the effect budget has room', () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  assert.ok(contactWorthDrawing({ x: 5, y: 0, z: 5 }, eye, { range: 24, used: 0.1, budget: 0.55 }));
  assert.ok(!contactWorthDrawing({ x: 30, y: 0, z: 0 }, eye, { range: 24, used: 0.1, budget: 0.55 }));
  assert.ok(!contactWorthDrawing({ x: 1, y: 0, z: 0 }, eye, { range: 24, used: 0.7, budget: 0.55 }));
});
