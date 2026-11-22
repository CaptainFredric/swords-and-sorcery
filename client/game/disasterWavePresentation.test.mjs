import test from 'node:test';
import assert from 'node:assert/strict';
import { windbladeSpeed, windbladeTrailSpan, windbladePosition, windbladeImpactKick, windbladeLevelBasis } from './disasterWavePresentation.mjs';

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

test('Gale projectile impact camera kick is gentle and falls off with 3D distance',()=>{
  const hit={x:0,y:0,z:0};
  const close=windbladeImpactKick(hit,hit);
  assert.ok(close>.09&&close<.2,'nearby wave kick stays well below an actual ground slam');
  assert.ok(windbladeImpactKick({x:6,y:0,z:0},hit)<close);
  assert.ok(windbladeImpactKick({x:12,y:0,z:0},hit)<close*.3);
  assert.ok(windbladeImpactKick({x:0,y:12,z:0},hit)<close*.3,'airborne viewers use 3D distance');
  assert.equal(windbladeImpactKick({x:24,y:0,z:0},hit),0);
  assert.equal(windbladeImpactKick({x:100,y:0,z:0},hit),0);
  assert.equal(windbladeImpactKick(null,hit),0);
});

test('Gale blade remains world-horizontal while traveling along any aimed pitch',()=>{
  const shots=[
    {x:0,y:0,z:1},{x:.4,y:.8,z:.45},
    {x:0,y:-.96,z:.28},{x:0,y:1,z:0},
    {x:0,y:-1,z:0},{x:-.8,y:.1,z:-.4},
  ];
  for(const direction of shots){
    const basis=windbladeLevelBasis(direction);
    assert.equal(basis.right.y,0,'the WIDE axis must be exactly horizontal');
    const length=Math.hypot(direction.x,direction.y,direction.z);
    for(const axis of ['x','y','z'])
      assert.ok(Math.abs(basis.forward[axis]-direction[axis]/length)<1e-8,
        'velocity continues along aimed 3D direction');
    const dot=basis.right.x*basis.forward.x+basis.right.y*basis.forward.y+
      basis.right.z*basis.forward.z;
    assert.ok(Math.abs(dot)<1e-7,'wide axis stays perpendicular to flight');
    const rightLength=Math.hypot(...Object.values(basis.right));
    assert.ok(Math.abs(rightLength-1)<1e-7);
  }
});
test('straight-up or down Gale shots have a stable level fallback',()=>{
  const prior={x:0,y:0,z:-1};
  const up=windbladeLevelBasis({x:0,y:1,z:0},prior);
  const down=windbladeLevelBasis({x:0,y:-1,z:0},prior);
  assert.deepEqual(up.right,prior);
  assert.deepEqual(down.right,prior);
  assert.equal(up.right.y,0);
  assert.equal(down.right.y,0);
});
