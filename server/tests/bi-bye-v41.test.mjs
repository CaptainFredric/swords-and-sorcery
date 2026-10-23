import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBiByeLlista, getBiByeMuzzlePosition, getBiByeOperatorTransform } from '../../shared/sim/biByeLlista.mjs';
import { biByeFrames, biByeHitVolumes } from '../../shared/sim/biByeComponents.mjs';
import { BI_BYE_WEAPONS, stepBiByeWeapons, setBiByeWeaponFocus } from '../../shared/sim/biByeWeapons.mjs';
const bytes=readFileSync(new URL('../../client/assets/props/bibye-ballista/bi-bye-llista-v4.1.glb',import.meta.url));
const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const index=new Map(g.nodes.map((n,i)=>[n.name,i]));
const parents=new Map(g.nodes.flatMap((n,i)=>(n.children??[]).map(c=>[c,i])));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rotate=([x,y,z],yaw,pitch=0)=>{const py=y*Math.cos(pitch)-z*Math.sin(pitch),pz=y*Math.sin(pitch)+z*Math.cos(pitch);return [x*Math.cos(yaw)+pz*Math.sin(yaw),py,-x*Math.sin(yaw)+pz*Math.cos(yaw)];};
function exported(b,name){
 let p=[0,0,0];
 for(let i=index.get(name);i!==undefined;i=parents.get(i)){
  const n=g.nodes[i];
  if(n.name==='Upper_Turret_Mount')p=rotate(p,b.upperYaw-b.mainYaw,-b.upperPitch);
  if(n.name==='Elevation_Cradle')p=rotate(p,0,-b.mainPitch);
  if(n.name==='Traverse_Mount')p=rotate(p,b.mainYaw-b.heading);
  p=p.map((v,k)=>v+(n.translation?.[k]??0));
 }
 p=rotate(p,b.heading+Math.PI);return p.map((v,k)=>v+[b.x,b.y,b.z][k]);
}
test('v4.1 binary identity and independent hierarchy',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'4641af412cf83d497f6f6059aa3d7c319b71bdcd44770f92bf90c65e2eccb31a');
 assert.equal(g.nodes.length,65);assert.equal(g.meshes.length,46);assert.equal(g.animations.length,21);
 assert.equal(g.nodes[parents.get(index.get('Upper_Turret_Mount'))].name,'Traverse_Mount');
 for(const clip of g.animations.filter(a=>/^(17|18)_/.test(a.name)))for(const c of clip.channels)assert.ok([51,52].includes(c.target.node));
 const reload=g.animations.find(a=>a.name.startsWith('19_'));
 assert.equal(reload.extras.duration_sec,4.5);
 assert.ok(reload.channels.every(c=>c.target.node<23||c.target.node>29));
});
test('shared muzzle points match the actual v4.1 exported chain throughout both aiming envelopes',()=>{
 for(const heading of [-2.4,0,1.7])for(const traverse of [-.7,0,.7])for(const mainPitch of [-.15,0,.35])for(const turn of [-Math.PI,-1,0,1,Math.PI])for(const upperPitch of [-.15,0,.35]){
  const b={x:7,y:2,z:-11,heading,mainYaw:heading+traverse,mainPitch,upperYaw:heading+turn,upperPitch,mode:'DEPLOYED'};
  for(const [kind,name] of [['conditioning','small_bolt_muzzle'],['siege','main_bolt_muzzle']]){
   const actual=Object.values(getBiByeMuzzlePosition(b,kind)),expected=exported(b,name);actual.forEach((v,i)=>near(v,expected[i]));
  }
 }
});
test('upper pivot remains level when the main cradle pitches',()=>{
 const a={mode:'DEPLOYED',heading:.4,mainYaw:.7,upperYaw:2,upperPitch:0,mainPitch:-.15};
 assert.deepEqual(biByeFrames(a).upper.center,biByeFrames({...a,mainPitch:.35}).upper.center);
});
test('compact winch and cockpit have localized authoritative volumes',()=>{
 const boxes=biByeHitVolumes(createBiByeLlista({x:0,z:0,baseYaw:0}));
 assert.ok(boxes.some(b=>b.id.includes('cockpit')));
 assert.ok(boxes.some(b=>b.id.includes('winch')));
});
test('independent yaw and firing wait for the visible clutch to finish releasing',()=>{
 const b=createBiByeLlista({x:0,z:0,baseYaw:0});Object.assign(b,{mode:'DEPLOYED',coupling:'RELEASING',couplingStartedAt:1,couplingEndsAt:1.6,operatorId:'p'});
 const p={id:'p',alive:true,input:{yaw:2,pitch:.3}},room={players:new Map([['p',p]]),events:[]};
 setBiByeWeaponFocus(b,'UPPER',1.01);stepBiByeWeapons(room,b,1/30,1.3);near(b.upperYaw,0);near(b.upperPitch,0);
 stepBiByeWeapons(room,b,1/30,1.6);assert.equal(b.coupling,'INDEPENDENT');
 stepBiByeWeapons(room,b,1/30,1.64);assert.ok(b.upperYaw>0);
 near(BI_BYE_WEAPONS.latchDuration,.6);near(BI_BYE_WEAPONS.releaseDuration,.6);
});
test('operator root seats the production pelvis at the cockpit anchor in every mode',()=>{
 for(const mode of ['MOBILE','DEPLOYING','DEPLOYED','RETRACTING']){
  const b={x:0,y:0,z:0,heading:0,mode},p=getBiByeOperatorTransform(b).position;
  near(p.x,0);near(p.y+1.03,.98);near(-p.z+.02,-1.86);
 }
});
test('cancelling partial engagement releases before aim can rotate and retains ammunition',()=>{
 const b=createBiByeLlista({x:0,z:0,baseYaw:0});Object.assign(b,{mode:'DEPLOYED',weaponFocus:'MAIN',coupling:'ENGAGING',couplingStartedAt:1,couplingEndsAt:1.6,operatorId:'p',pendingVolley:{yaw:0,pitch:0,operatorId:'p'}});
 const p={id:'p',alive:true,input:{yaw:2,pitch:0}},room={players:new Map([['p',p]]),events:[]};
 setBiByeWeaponFocus(b,'UPPER',1.3);assert.equal(b.coupling,'RELEASING');near(b.couplingReleaseFrom,.5);
 stepBiByeWeapons(room,b,1/30,1.5);near(b.upperYaw,0);assert.ok(b.mainBoltLoaded);assert.equal(b.smallBoltReadyAt,0);
 stepBiByeWeapons(room,b,1/30,1.61);assert.equal(b.coupling,'INDEPENDENT');
});
