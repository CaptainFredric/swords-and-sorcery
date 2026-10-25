import test from 'node:test';import assert from 'node:assert/strict';
import {clearOptics,sightPlanePoint,sightLimits,sightWeaponRay} from './biByeSight.mjs';
import {createBiByeLlista,getBiByeMuzzleDirection,getBiByeMuzzlePosition} from '../../shared/sim/biByeLlista.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} vs ${b}`);
test('CLEAR has consistent perspective magnification and blends both zoom and angular gain',()=>{
 for(const base of [65,78,100]){
  let v={blend:0};for(let i=0;i<60;i++)v=clearOptics(v.blend,base,true,1/60);
  if(base===78)near(v.fov,48);
  near(Math.tan(v.fov*Math.PI/360)/Math.tan(base*Math.PI/360),v.gain);
  assert.ok(v.fov<base&&v.gain>.45&&v.gain<.65);
  const leaving=clearOptics(v.blend,base,false,1/60);assert.ok(leaving.fov>v.fov&&leaving.fov<base);
  for(let i=0;i<60;i++)v=clearOptics(v.blend,base,false,1/60);
  near(v.fov,base);near(v.gain,1);
 }
 const first=clearOptics(0,78,true,1/60);assert.ok(first.fov>65&&first.fov<78);
});
test('straight muzzle ray projects against the actual camera aim plane without changing direction',()=>{
 const muzzle=[1,2,0],direction=[0,0,-1];
 assert.deepEqual(sightPlanePoint(muzzle,direction,[0,2,1],[0,0,-1],10),[1,2,-9]);
 assert.equal(sightPlanePoint(muzzle,[0,0,1],[0,2,1],[0,0,-1],10),null);
});
test('sight reads exact muzzle rays, including mechanically committed coupled directions',()=>{
 const b=createBiByeLlista({x:3,z:2,mode:'DEPLOYED',weaponFocus:'MAIN',mainYaw:.2,mainPitch:.1,upperYaw:.3,upperPitch:0});
 for(const kind of ['siege','conditioning']){
  const r=sightWeaponRay(b,kind);assert.deepEqual(r.origin,Object.values(getBiByeMuzzlePosition(b,kind)));assert.deepEqual(r.direction,Object.values(getBiByeMuzzleDirection(b,kind)));
 }
 b.coupling='FIRING';b.committedAim={yaw:.4,pitch:.15,upperYaw:.45,upperPitch:.12};b.mainReleasedAt=null;
 const r=sightWeaponRay(b,'siege');assert.deepEqual(r.direction,Object.values(getBiByeMuzzleDirection(b,'siege',b.committedAim)));
});
test('joint stop cues use real limits and never imply a 360 degree upper traverse stop',()=>{
 const b=createBiByeLlista({mode:'DEPLOYED',weaponFocus:'MAIN',baseYaw:0,heading:0});
 assert.deepEqual(sightLimits(b,{yaw:0,pitch:0},false),[]);
 assert.ok(sightLimits(b,{yaw:Math.PI/4,pitch:0},false).includes('right'));
 assert.ok(sightLimits(b,{yaw:0,pitch:.35},false).includes('up'));
 assert.ok(sightLimits(b,{yaw:0,pitch:-.15},false).includes('down'));
 for(const yaw of [-Math.PI,Math.PI,-2,2])assert.ok(!sightLimits(b,{yaw,pitch:0},true).some(x=>x==='left'||x==='right'));
});

test('the physical axis remains projectable beyond scene draw distance and rejects rays behind the lens',async()=>{
 const {sightScreenPoint}=await import('./biByeSight.mjs');
 assert.deepEqual(sightScreenPoint([0,0,-1000],48,1.6),{x:0,y:0});
 assert.equal(sightScreenPoint([0,0,1],48,1.6),null);
 assert.equal(sightScreenPoint([100,0,-2],48,1.6),null);
});
