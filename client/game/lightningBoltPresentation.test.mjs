import test from 'node:test';
import assert from 'node:assert/strict';
import {lightningImpactPath} from './lightningBoltPresentation.mjs';

const aerial=(point,lightningGroundPoint,tiers={gale:2,lightning:1})=>({
  type:'oneHitImpact',impactId:'windblade-1',form:'aerial',air:true,
  groundBlast:false,tiers,point,lightningGroundPoint,
});
test('airborne Gale+Lightning displays a single descent beyond the explosion without any height cap',()=>{
 const event=aerial({x:7,y:10000,z:-4},{x:7,y:-300,z:-4});
 const trace=lightningImpactPath(event);
 assert.equal(trace.descends,true);
 assert.deepEqual(trace.explosion,{x:7,y:10000,z:-4});
 assert.deepEqual(trace.end,{x:7,y:-300,z:-4});
 assert.equal(trace.explosion.x,trace.end.x);
 assert.equal(trace.explosion.z,trace.end.z);
});
test('plain Lightning, non-Gale blasts and grounded impacts never extend to a second terrain location',()=>{
 const point={x:2,y:22,z:3},landing={x:2,y:0,z:3};
 for(const tiers of [{gale:1,lightning:2},{gale:2,lightning:0}]){
  const trace=lightningImpactPath(aerial(point,landing,tiers));
  if(tiers.lightning)assert.equal(trace.descends,false);
  else assert.equal(trace,null);
 }
 const ground={...aerial(point,landing),groundBlast:true,groundPoint:landing};
 const trace=lightningImpactPath(ground);
 assert.equal(trace.descends,false);
 assert.deepEqual(trace.explosion,landing);
});
test('unsupported void, missing endpoint or malformed coordinate never paints a fake downward bolt',()=>{
 const p={x:4,y:90,z:-8};
 assert.equal(lightningImpactPath(aerial(p,undefined)).descends,false);
 const offMap=aerial(p,undefined);
 offMap.lightningVoidPoint={x:4,y:-200,z:-8};
 assert.equal(lightningImpactPath(offMap).descends,true,
   'lightning remains visible down into the void with no ground hit');
 assert.equal(lightningImpactPath(offMap).strikesGround,false);
 assert.equal(lightningImpactPath(offMap).end.y,-200);
 assert.equal(lightningImpactPath(aerial(p,{x:4,y:NaN,z:-8})).descends,false);
 assert.equal(lightningImpactPath(aerial(p,{x:4,y:89,z:-8})).descends,false);
 assert.equal(lightningImpactPath(aerial({x:Infinity,y:90,z:0},{x:0,y:0,z:0})),null);
});
test('only an authoritative aerial wave impact can continue the main visible strike',()=>{
 const impact=aerial({x:4,y:120,z:5},{x:4,y:8,z:5});
 delete impact.impactId;
 assert.equal(lightningImpactPath(impact).descends,false);
 impact.impactId='wave';
 impact.form='ground';
 assert.equal(lightningImpactPath(impact).descends,false);
});
