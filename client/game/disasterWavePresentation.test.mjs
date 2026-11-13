import test from 'node:test';
import assert from 'node:assert/strict';
import { windbladeSpeed, windbladeTrailSpan, windbladePosition } from './disasterWavePresentation.mjs';

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

test('a Gale pressure front travels smoothly in actual 3D space between network snapshots',()=>{
  const wave={id:'gale',position:{x:5,y:3,z:-7},
    direction:{x:.6,y:.8,z:0},tiers:{gale:2}};
  const a=windbladePosition(wave,10,10);
  const b=windbladePosition(wave,10,10.05);
  const c=windbladePosition(wave,10,10.10);
  assert.deepEqual(a,wave.position);
  assert.ok(b.x>a.x&&b.y>a.y&&c.x>b.x&&c.y>b.y);
  assert.equal(b.z,-7);
  assert.ok(Math.abs(Math.hypot(c.x-a.x,c.y-a.y)-2.8)<1e-8);
  const shock=windbladePosition({...wave,tiers:{gale:2,lightning:2}},10,10.05);
  assert.ok(shock.y>b.y,'Lightning speeds up the SAME 3D projectile');
  const capped=windbladePosition(wave,10,110);
  assert.ok(Math.abs(capped.y-(3+28*.10*.8))<1e-8,'a stale snapshot cannot send the rendered wave infinitely far');
  assert.deepEqual(windbladePosition(wave,NaN,10.05),a);
  assert.deepEqual(windbladePosition(wave,10,NaN),a);
});
