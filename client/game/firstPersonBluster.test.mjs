import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepFirstPersonBluster, FIRST_PERSON_BLUSTER } from './firstPersonBluster.mjs';

const status = {at:10,severity:1,sourceId:'caster'};
const frame = (previous, lookYaw, bodyYaw, at, dt=1/60, blustered=status) =>
  stepFirstPersonBluster(previous,{lookYaw,bodyYaw,blustered,nowSec:at,dt});

test('first-person arms rotate behind an unrestricted camera turn, without changing the camera or server aim',()=>{
  const input={lookYaw:0,bodyYaw:0,blustered:status,nowSec:10,dt:1/60};
  const start=stepFirstPersonBluster(null,input);
  assert.equal(start.yaw,0);
  const next=frame(start,Math.PI/2,0,10+1/60);
  assert.ok(next.yaw<-.05,'camera turns left; the arms remain behind on its right');
  assert.ok(next.yaw>=-FIRST_PERSON_BLUSTER.maxArmYaw);
  assert.equal(input.lookYaw,0,'input camera yaw is never modified');
  assert.equal(input.bodyYaw,0,'authoritative fighting yaw is never modified');
  assert.deepEqual(input.blustered,status,'status clock is never modified');
  // Turning the camera the other way is symmetric.
  const opposite=frame(start,-Math.PI/2,0,10+1/60);
  assert.ok(opposite.yaw>.05,'right camera turn leaves arms behind on the other side');
});

test('large turns remain readable in first person, and the arms really catch up to the body',()=>{
  let visual=frame(null,0,0,10);
  for(let i=1;i<=24;i++)visual=frame(visual,Math.PI,0,10+i/60);
  assert.ok(visual.yaw<=0 && visual.yaw>=-FIRST_PERSON_BLUSTER.maxArmYaw-1e-9,
    'even a complete turn never hides the entire weapon rig behind the camera');
  // The host's fighting facing rotates toward the free look until it catches.
  for(let i=25;i<=100;i++)visual=frame(visual,Math.PI,Math.PI,10+i/60);
  assert.ok(Math.abs(visual.yaw)<.004,'arms return to their original carriage after the body reaches the aim');
  assert.ok(Math.abs(visual.lag)<1e-8,'no permanent visual misalignment remains');
});

test('wrapped 180-degree look samples do not flip both hands across the screen',()=>{
  let visual=frame(null,3,3,10);
  visual=frame(visual,3.13,3.01,10+1/60);
  const before=visual.yaw;
  visual=frame(visual,-3.12,3.02,10+2/60);
  assert.ok(visual.yaw<0 && visual.lag<0,
    'crossing the wrapped pi boundary continues moving in the same direction');
  assert.ok(Math.abs(visual.yaw-before)<.06,'no jump at the view yaw boundary');
  // At the genuinely ambiguous +/-180-degree body/head separation, the
  // shortest path may change sides. The visible arms MOVE across the frame;
  // they must never teleport. A completed 360 returns to physical alignment.
  let look=3.13;
  for(let i=3;i<=40;i++){
    const old=visual.yaw;
    look+=.36;
    visual=frame(visual,look,3.02,10+i/60);
    assert.ok(Math.abs(visual.yaw-old)<=FIRST_PERSON_BLUSTER.maxShiftPerSec/60+1e-9,
      'no rendered-frame jump even during a rapid repeated camera spin');
    assert.ok(Math.abs(visual.yaw)<=FIRST_PERSON_BLUSTER.maxArmYaw+1e-9);
  }
  for(let i=41;i<=100;i++)
    visual=frame(visual,3.02+2*Math.PI,3.02,10+i/60);
  assert.equal(visual.yaw,0,'a full camera revolution with matching facing leaves no fictional turning debt');
  assert.ok(Math.abs(visual.lag)<1e-8);
});

test('on expiry, dismount or death the independent arm lag settles fully to zero',()=>{
  let visual=frame(null,0,0,10);
  for(let i=1;i<=20;i++)visual=frame(visual,1.4,0,10+i/60);
  assert.ok(visual.yaw<-.4);
  // The camera yaw stays where the player puts it; only arm carriage returns.
  for(let i=1;i<=30;i++)visual=frame(visual,1.4,0,10.5+i/60,1/60,null);
  assert.equal(visual.yaw,0);
  assert.equal(visual.active,false);
  visual=frame(visual,2,0,15,1/60,status);
  assert.equal(visual.yaw,0,'an expired Blustered status cannot reacquire an offset');
  const invalid=frame(visual,NaN,Infinity,15.1,1/60,status);
  assert.ok(Number.isFinite(invalid.yaw),'invalid network headings never poison the rig');
});

test('actual first-person WeaponView root uses the body lag, not camera rotation or authored IK joints',()=>{
  const weapon=readFileSync(new URL('./WeaponView.mjs',import.meta.url),'utf8');
  const runtime=readFileSync(new URL('./GameRuntime.mjs',import.meta.url),'utf8');
  assert.match(weapon,/this\.blusterFacing\s*=\s*stepFirstPersonBluster\(/);
  assert.match(weapon,/this\.group\.rotation\.y\s*=\s*this\.blusterFacing\.yaw/);
  assert.match(runtime,/bodyYaw:\s*armBluster\s*\?\s*this\.localAuth\.yaw\s*:\s*null/);
  assert.match(runtime,/blustered:\s*armBluster/);
  assert.match(runtime,/mounted:\s*ridingForArmYaw/);
  assert.match(weapon,/if \(mounted\) this\.resetBlusterFacing\(\)/,
    'mounting clears any old on-foot hand lag before drawing the cockpit');
  assert.match(runtime,/this\.weapon\.resetBlusterFacing\(\)/,
    'switching players also resets the first-person arm carriage');
  assert.match(runtime,/this\.camera\.rotation\.y\s*=\s*this\.input\.yaw\s*\+/,
    'the head/crosshair look remains independent of the first-person arm transform');
});
