import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conductBoltSamples,conductVisualPhase,CONDUCT_VISUAL} from './conductShape.mjs';

// Three.js is loaded by the browser's import map. Test pure timing/geometry
// in Node and the renderer's critical invariants with source contracts.
const source=readFileSync(new URL('./ConductVisuals.mjs',import.meta.url),'utf8');
const effects=readFileSync(new URL('./OneHitLiveEffects.mjs',import.meta.url),'utf8');
const weapon=readFileSync(new URL('./WeaponView.mjs',import.meta.url),'utf8');

test('Conduct arc preserves both server endpoints with reproducible fractures',()=>{
  const origin={x:0,y:1,z:0},end={x:32,y:1,z:-12};
  const p=conductBoltSamples(origin,end,{jitter:.25});
  assert.deepEqual(p[0],origin);
  assert.deepEqual(p.at(-1),end);
  assert.ok(p.length>10);
  assert.ok(p.slice(1,-1).some(x=>Math.abs(x.y-1)>.001));
  assert.deepEqual(p,conductBoltSamples(origin,end,{jitter:.25}));
});

test('Conduct handles vertical, near-zero and maximum-reach casts without NaNs',()=>{
  for(const [a,b] of [
    [{x:0,y:0,z:0},{x:0,y:180,z:0}],
    [{x:5,y:3,z:2},{x:5,y:3,z:2}],
    [{x:0,y:1,z:0},{x:240,y:1,z:0}],
  ]){
    const p=conductBoltSamples(a,b);
    assert.ok(p.length<=101);
    assert.deepEqual(p[0],a);
    assert.deepEqual(p.at(-1),b);
    assert.ok(p.every(x=>[x.x,x.y,x.z].every(Number.isFinite)));
  }
  assert.match(source,/distance<\.001\)return group/);
});

test('Initial flash is distinct, bolder, and dissipates into a thin wire',()=>{
  assert.match(source,/\.164,CONDUCT_YELLOW\.sheath/);
  assert.match(source,/\.110,CONDUCT_YELLOW\.body/);
  assert.match(source,/\.044,CONDUCT_YELLOW\.highlight/);
  assert.match(source,/\.027,CONDUCT_YELLOW\.sheath/);
  assert.match(source,/\.015,CONDUCT_YELLOW\.body/);
  assert.match(source,/\.006,CONDUCT_YELLOW\.highlight/);
  assert.match(source,/group\.userData\.conductLayers\.push\(mesh\)/);
  assert.match(source,/group\.userData\.conductRemnants\.push\(remnant\)/);
  assert.equal(CONDUCT_VISUAL.wireEndSec,1);
  const beginning=conductVisualPhase(0);
  const travel=conductVisualPhase(.16);
  const afterImpact=conductVisualPhase(.40);
  const end=conductVisualPhase(1);
  assert.equal(beginning.growth,0);
  assert.equal(beginning.impact,1);
  assert.equal(beginning.residual,0);
  assert.equal(travel.growth,1);
  assert.ok(afterImpact.residual>.9);
  assert.equal(afterImpact.impact,0);
  assert.equal(end.residual,0);
  assert.equal(end.impact,0);
});

test('The wire remains at server coordinates and cannot shrink off the hit corridor',()=>{
  assert.match(source,/const straight=\[vec\(origin\),vec\(end\)\]/);
  assert.match(source,/group\.userData\.authoritativeOrigin=vec\(origin\)/);
  assert.match(source,/group\.userData\.authoritativeEnd=vec\(end\)/);
  assert.match(source,/mesh\.geometry\.setDrawRange\(0,revealed\*radial\*6\)/);
  assert.match(source,/export function updateConductAppearance/);
  assert.doesNotMatch(source,/strand\.scale\.setScalar/);
  assert.match(effects,/this\.#conduct\(event\.origin,event\.end,/);
  assert.match(effects,/updateConductAppearance\(t\.mesh,t\.ttl-t\.life\)/);
  assert.match(effects,/this\.#add\(bolt,1\)/);
  assert.match(source,/new THREE\.LineCurve3\(points\[i-1\],points\[i\]\)/,
    'straight connected segments keep lightning fractured rather than rounded');
});

test('Hand electricity is more restrained but still gathers into a pointed bolt',()=>{
  assert.match(source,/export class ConductHandEffects/);
  assert.match(source,/anchor\.add\(this\.group\)/);
  assert.match(source,/conductPhase=charging\?'gathering':'equipped'/);
  assert.match(source,/const gather=clamp\(progress,0,1\),n=3/);
  assert.match(source,/charging\?idle\.lerp\(spear,\.16\+\.84\*gather\):idle/);
  assert.match(source,/this\.lastUpdate<\.08/);
  assert.match(source,/mesh\.geometry\.dispose\(\);mesh\.geometry=geo/);
  assert.match(weapon,/this\.magicLight\.intensity\+=\.18\+\(casting\?\.48:0\)/);
  assert.match(source,/this\.group\.removeFromParent\(\)/);
});

test('Damage and one-second danger remain simulation owned',()=>{
  const sim=readFileSync(new URL('../../shared/sim/combat.mjs',import.meta.url),'utf8');
  assert.match(sim,/origin,end:stop,until:nowSec\+1,inside:new Set\(\)/);
  assert.match(sim,/lineOfConductDamage\(dist\)/);
  assert.match(sim,/distance<=\.18 && !wire\.inside\.has\(target\.id\)/);
});
