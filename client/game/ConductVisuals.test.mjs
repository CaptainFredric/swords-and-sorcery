import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conductBoltSamples} from './conductShape.mjs';

// The browser supplies Three.js through an import map, not npm. Test the
// engine-independent geometry in CI and assert rendering's source contract.
const source=readFileSync(new URL('./ConductVisuals.mjs',import.meta.url),'utf8');
test('Line of Conduct jagged path preserves collision endpoints and deterministic replay',()=>{
 const origin={x:0,y:1,z:0},end={x:32,y:1,z:-12};
 const p=conductBoltSamples(origin,end,{jitter:.3});
 assert.deepEqual(p[0],origin);
 assert.deepEqual(p.at(-1),end);
 assert.ok(p.length>10);
 assert.ok(p.slice(1,-1).some(x=>Math.abs(x.y-1)>.001));
 assert.deepEqual(p,conductBoltSamples(origin,end,{jitter:.3}));
});
test('Vertical discharge has finite vertices, no NaN or unbounded geometry',()=>{
 const p=conductBoltSamples({x:0,y:0,z:0},{x:0,y:180,z:0});
 assert.ok(p.length<=101);
 assert.ok(p.every(x=>[x.x,x.y,x.z].every(Number.isFinite)));
});
test('Discharge layers are dark amber, thick yellow, and pale yellow with branching',()=>{
 assert.match(source,/sheath:0x956008/);
 assert.match(source,/body:0xffcb32/);
 assert.match(source,/highlight:0xfff4a0/);
 assert.match(source,/\.065,CONDUCT_YELLOW\.sheath/);
 assert.match(source,/\.048,CONDUCT_YELLOW\.body/);
 assert.match(source,/\.019,CONDUCT_YELLOW\.highlight/);
 assert.match(source,/group\.add\(tube\(/);
});
test('Hand socket arcs move from equipped idle into pointed cast, with disposal',()=>{
 assert.match(source,/export class ConductHandEffects/);
 assert.match(source,/anchor\.add\(this\.group\)/);
 assert.match(source,/charging\?-/);
 assert.match(source,/charging\?\.014:\.009/);
 assert.match(source,/mesh\.geometry\.dispose\(\)/);
});
