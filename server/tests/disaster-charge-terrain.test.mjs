import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,releaseOneHitCharge,stepRoom} from '../../shared/sim/combat.mjs';
import {ONE_HIT_RULES} from '../../shared/src/oneHitOfWondersRules.mjs';
import {oneHitChargingLightning} from '../../shared/src/oneHitInfusions.mjs';
const DT=1/30;
const world={
  floors:[{id:'ground',center:[0,-.1,0],size:[200,.2,200],y:0}],
  ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:3,y:0,z:0,yaw:Math.PI/2}],abyssY:-9,
};
function setup(tiers={}){
  const room=new Room('DRIG',{mode:'FFA'});
  room.world=world;
  room.addPlayer({id:'a',token:'aa',name:'Caster'},0);
  room.addPlayer({id:'b',token:'bb',name:'Target'},0);
  room.setReady('a',true,0);room.setReady('b',true,0);room.tick(3.1);
  const a=room.players.get('a'),b=room.players.get('b');
  a.ultimate='one_hit_of_wonders';a.position={x:0,y:0,z:0};a.velocity={x:0,y:0,z:0};a.grounded=true;
  a.yaw=-Math.PI/2;a.input.yaw=a.yaw;a.input.pitch=0;
  b.position={x:40,y:0,z:0};a.spawnProtectionUntil=0;b.spawnProtectionUntil=0;
  Object.assign(a.oneHitInfusions,tiers);
  a.prowess=100;
  room.events.length=0;
  return {room,a,b};
}
function tick(room,start,end,terrain=world){
  for(let t=start;t<end-1e-6;t+=DT)stepRoom(room,DT,t,terrain);
}
test('Half Lightning can be tapped without bypassing its minimum 0.36-second commitment',()=>{
  const {room,a}=setup({lightning:1});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  assert.equal(oneHitChargingLightning(a,9.05),true);
  assert.equal(releaseOneHitCharge(room,'a',9.05),true);
  assert.equal(a.ultimateState.commitAt,9+ONE_HIT_RULES.halfLightningStartupSec);
  tick(room,9.06,9.33);
  assert.equal(a.ultimateState.phase,'startup');
  tick(room,9.34,9.5);
  assert.equal(a.ultimateState.phase,'active');
  assert.equal(room.events.filter(e=>e.type==='oneHitImpact'&&e.form==='ground').length,1);
  assert.equal(room.events.some(e=>e.type==='oneHitTeleport'),false,'Half Lightning does not teleport');
});
test('Half Lightning can freely move/turn while held and release at a chosen later time',()=>{
  const {room,a}=setup({lightning:1});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  a.input.forward=1;a.input.pitch=.48;
  tick(room,9,9.75);
  assert.equal(a.ultimateState.phase,'startup');
  assert.ok(a.position.x>1.8,'the knight can still reposition deliberately while charging');
  assert.equal(a.pitch,.48,'camera look is not frozen');
  assert.equal(oneHitChargingLightning(a,9.74),true);
  assert.equal(releaseOneHitCharge(room,'a',10.6),true);
  assert.equal(a.ultimateState.phase,'active');
  assert.equal(a.ultimateState.commitAt,10.6);
  assert.equal(room.events.filter(e=>e.type==='oneHitImpact'&&e.form==='ground').length,1);
});
test('Half Lightning auto-releases after a short bounded hold without making the Ultimate permanent',()=>{
  const {room,a}=setup({lightning:1});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  assert.equal(a.ultimateState.commitAt,9+ONE_HIT_RULES.halfLightningHoldMaxSec);
  tick(room,9,9+ONE_HIT_RULES.halfLightningHoldMaxSec-.05);
  assert.equal(a.ultimateState.phase,'startup');
  tick(room,9+ONE_HIT_RULES.halfLightningHoldMaxSec-.05,11.15);
  assert.equal(room.events.filter(e=>e.type==='oneHitCommitted').length,1);
  assert.equal(room.events.filter(e=>e.type==='oneHitImpact'&&e.form==='ground').length,1);
});
test('Full Lightning retains its freely steerable charge and vertical aim',()=>{
  const {room,a}=setup({lightning:2,gale:2});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  a.input.forward=1;a.input.pitch=.7;
  tick(room,9,9.65);
  assert.ok(a.position.x>.8);
  assert.equal(a.pitch,.7);
  assert.equal(oneHitChargingLightning(a,9.5),true);
  assert.equal(a.ultimateState.phase,'startup');
});
test('A non-Gale Ultimate falling during windup PLUNGES to actual ground, not an aerial Gale wave',()=>{
  const {room,a}=setup();
  assert.equal(tryUltimate(room,'a',9),true);
  tick(room,9,9.8);
  // An enemy pushed the caster clear of a ledge near the end of windup.
  a.position={x:5,y:6,z:0};a.velocity={x:0,y:0,z:0};a.grounded=false;
  tick(room,9.8,10.08);
  assert.equal(room.events.find(e=>e.type==='oneHitCommitted')?.form,'plunge');
  assert.equal(a.ultimateState.oneHit.form,'plunge');
  assert.equal(room.events.filter(e=>e.type==='oneHitWave').length,0);
  tick(room,10.08,11.15);
  assert.equal(room.events.filter(e=>e.type==='oneHitPlungeLanded').length,1);
  assert.equal(room.events.filter(e=>e.type==='oneHitImpact'&&e.form==='ground').length,1);
  assert.equal(room.events.filter(e=>e.type==='oneHitWave').length,0);
  assert.equal(room.oneHitFields.length,1,'field appears at actual landing');
});
test('Non-Fire terminal gust inflicts ALL infusion statuses without inventing decisive HP',()=>{
  const {room,a,b}=setup();
  b.position={x:6.3,y:0,z:1.4};
  b.pendingSpell={spell:'fireball',castAt:99};
  b.spellReadyAt=0;
  const tiers={fire:0,frost:2,gale:2,lightning:2,steel:2};
  room.oneHitWaves=[{id:'one-terminal',ownerId:a.id,position:{x:5,y:.65,z:0},
    direction:{x:1,y:0,z:0},tiers,bornAt:9,distance:5,hitIds:[]}];
  const wall={...world,solids:[{id:'wall',center:[7,2,0],size:[.2,6,10]}]};
  tick(room,9,9.3,wall);
  const event=room.events.find(e=>e.type==='oneHitImpact'&&e.impactId==='one-terminal');
  assert.ok(event?.groundBlast);
  assert.equal(event.radius,2.2);
  assert.ok(event.fieldId);
  assert.equal(b.health,100,'no Fire: status and pressure, not an additional HP strike');
  assert.ok(b.shaken,'Shaken');
  assert.ok(b.blustered,'Blustered even on non-Fire terminal gust');
  assert.ok(b.electricalBacklash,'Shocking Conduct');
  assert.ok(b.oneHitFrozenUntil>9,'Flash Freeze');
  assert.equal(b.pendingSpell,null,'Steel interruption');
  assert.ok(b.spellReadyAt>9,'Full Steel resets Skill cooldown');
  assert.equal(room.oneHitFields.length,1);
  assert.deepEqual(room.oneHitFields[0].tiers,tiers);
  assert.equal(room.oneHitFields[0].radius,event.radius);
  assert.equal(room.events.some(e=>e.type==='damage'&&e.victimId===b.id&&e.source==='one_hit_of_wonders'),false);
});
test('An untouched enemy entering the base field gets decaying Shaken once, without re-entry farming',()=>{
  const {room,a,b}=setup();
  assert.equal(tryUltimate(room,'a',9),true);
  tick(room,9,10.05);
  assert.equal(room.oneHitFields.length,1);
  assert.equal(b.shaken,null);
  b.position={x:2.95,y:0,z:0};
  tick(room,10.06,10.16);
  assert.ok(b.shaken,'even zero-infused terrain now Shakes a fresh entrant');
  assert.equal(b.health,100,'the field itself does no HP damage');
  assert.equal(room.events.filter(e=>e.type==='oneHitFieldShaken'&&e.playerId===b.id).length,1);
  const first=b.shaken.at;
  b.position={x:40,y:0,z:0};
  tick(room,10.17,10.29);
  b.position={x:2.95,y:0,z:0};
  tick(room,10.30,10.42);
  assert.equal(room.events.filter(e=>e.type==='oneHitFieldShaken'&&e.playerId===b.id).length,1,
    'a second step into the same weaker field cannot restart Shaken');
  assert.ok(b.shaken.at>=first,'Shaken can be held back by the field itself');
  assert.ok(room.oneHitFields[0].shakenContact[b.id]>0);
});

test('Base-field rock fracture telegraph persists, fades with field strength and is cleaned up',()=>{
  const effects=readFileSync(new URL('../../client/game/DisasterElementEffects.mjs',import.meta.url),'utf8');
  assert.match(effects,/name='disaster-shaken-ground-field'/);
  assert.match(effects,/this\.#rockField\(field\)/);
  assert.match(effects,/this\.#poseRockField\(entry\.rock,field,strength,now\)/);
  assert.match(effects,/shaken-scattered-pebbles/);
  assert.match(effects,/shaken-fissures/);
  assert.match(effects,/if \(entry\.rock\) this\.#disposeIce\(entry\.rock\)/);
  assert.match(effects,/const radius=field\.radius/);
});
