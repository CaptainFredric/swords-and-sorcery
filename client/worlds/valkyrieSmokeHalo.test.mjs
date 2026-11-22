import test from 'node:test';
import assert from 'node:assert/strict';
import {valkyrieHaloExpiry,valkyrieSmokeHaloState} from './valkyrieSmokeHalo.mjs';

test('Valkyrie smoke halo expires on exactly the same authoritative instant as ground fire',()=>{
 for(const duration of [7,9.5,12]){
  const at=100,expiresAt=at+duration;
  assert.equal(valkyrieHaloExpiry(at,duration,expiresAt),expiresAt);
  const initial=valkyrieSmokeHaloState(at+.1,at,expiresAt,8,.9);
  const middle=valkyrieSmokeHaloState(at+duration*.5,at,expiresAt,8,.9);
  const late=valkyrieSmokeHaloState(at+duration*.95,at,expiresAt,8,.9);
  assert.ok(initial&&middle&&late);
  assert.ok(middle.elevation>initial.elevation&&late.elevation>middle.elevation,
    'the ring must KEEP rising, not hover as an expanding 2D decal');
  assert.ok(middle.ringRadius>initial.ringRadius&&late.ringRadius>middle.ringRadius,
    'the ring must keep widening as the flame burns down');
  assert.ok(late.smokeOpacity<middle.smokeOpacity,
    'smoke must gradually dissipate as the actual fire expires');
  assert.ok(late.rimOpacity<middle.rimOpacity);
  assert.equal(valkyrieSmokeHaloState(expiresAt,at,expiresAt,8,.9),null);
  assert.equal(valkyrieSmokeHaloState(expiresAt+1,at,expiresAt,8,.9),null);
 }
});

test('A detonation over the abyss has only brief smoke: never invent a damaging ground fire',()=>{
 const at=41;
 const until=valkyrieHaloExpiry(at,12,null);
 assert.equal(until,at+1.8);
 assert.ok(valkyrieSmokeHaloState(at+.5,at,until,12,1));
 assert.equal(valkyrieSmokeHaloState(until,at,until,12,1),null);
});

test('Late explosion events do not rewind smoke and effects remain bounded',()=>{
 const at=50,until=57;
 const state=valkyrieSmokeHaloState(54,at,until,500,100);
 assert.ok(state.ringRadius<=13*1.32);
 assert.ok(state.smokeOpacity<=.33);
 assert.ok(state.elevation>2);
 assert.equal(valkyrieSmokeHaloState(Infinity,at,until),null);
 assert.equal(valkyrieHaloExpiry(at,12,undefined),62,
  'older servers retain their supplied fire duration');
});
