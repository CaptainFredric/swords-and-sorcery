import test from 'node:test';
import assert from 'node:assert/strict';
import { windbladeSpeed, windbladeTrailSpan } from './disasterWavePresentation.mjs';

test('Windblade trail samples the same flight speed as the authoritative projectile',()=>{
  assert.equal(windbladeSpeed({}),28);
  assert.equal(windbladeSpeed({gale:2,frost:2,fire:2}),28);
  assert.equal(windbladeSpeed({gale:2,lightning:1}),48);
  assert.equal(windbladeSpeed({lightning:2}),48);
  assert.ok(windbladeTrailSpan(1/60,{lightning:2})>
    windbladeTrailSpan(1/60,{gale:2}));
  assert.ok(Math.abs(windbladeTrailSpan(1/30,{})-28/30)<1e-8);
});

test('Windblade trail remains bounded through frame stalls and invalid dt',()=>{
  assert.equal(windbladeTrailSpan(Infinity,{lightning:2}),0);
  assert.equal(windbladeTrailSpan(-1,{lightning:2}),0);
  assert.equal(windbladeTrailSpan(NaN,{}),0);
  assert.ok(windbladeTrailSpan(1,{lightning:2})<=2.5);
  assert.ok(windbladeTrailSpan(.01,{gale:2,lightning:2})>0);
});
