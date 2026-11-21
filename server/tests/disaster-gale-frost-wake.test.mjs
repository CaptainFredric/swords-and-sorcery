import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {fieldContact,fieldStrength,fieldSeconds,airFieldSeconds}
 from '../../shared/src/oneHitStatus.mjs';
import {galeFrostWakeEnabled,galeFrostWakeRadius,closestWakePoint}
 from '../../shared/src/oneHitTrail.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
const DT=1/30;
const world={floors:[{id:'ground',center:[0,-.1,0],size:[240,.2,240],y:0}],
 solids:[],ramps:[],abyssY:-30,spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
function scene(){
 const room=new Room('WAKE_TEST',{mode:'FFA'});
 room.world=world;
 for(const id of ['a','b'])room.addPlayer({id,token:id,name:id},0);
 for(const id of ['a','b'])room.setReady(id,true,0);
 room.tick(3.1);room.state='PLAYING';
 const a=room.players.get('a'),b=room.players.get('b');
 a.position={x:0,y:0,z:0};b.position={x:7,y:0,z:4};
 a.spawnProtectionUntil=0;b.spawnProtectionUntil=0;
 room.events.length=0;
 return {room,a,b};
}
const tiers={fire:2,frost:2,gale:2,lightning:2,steel:2};
function wakeField(spec=tiers){
 const from={x:0,y:1,z:0};
 return {id:'wake:1',ownerId:'a',trail:true,air:true,position:from,
  radius:galeFrostWakeRadius(spec),direction:{x:1,y:0,z:0},
  trailPoints:[from,{x:12,y:1,z:0}],bornAt:9,activeAt:9.3,
  until:9.3+(spec.steel===2?fieldSeconds(spec):airFieldSeconds(spec)),
  tiers:spec,trailTouched:{},trailBurnNext:{},shakenContact:{},conducted:{}};
}
test('Frost and Full Gale create a server-owned polyline all along real wave flight',()=>{
 const {room,a,b}=scene();
 const wave={id:'real-wake',ownerId:'a',position:{x:0,y:5,z:0},
  direction:{x:1,y:0,z:0},distance:0,bornAt:9,tiers,
  hitIds:[],fromGround:false};
 room.oneHitWaves=[wave];b.position={x:8,y:0,z:5};
 for(let i=0;i<10;i++)stepRoom(room,DT,9+i*DT,world);
 const field=room.oneHitFields.find(f=>f.id==='real-wake:wake');
 assert.ok(field,'persistent wake begins before the eventual explosion');
 assert.ok(field.trailPoints.length>=8,'continues across the actual moving projectile route');
 assert.ok(field.trailPoints.at(-1).x>field.trailPoints[0].x+7);
 assert.equal(field.radius,1.85,'Fire uses existing wave width');
 assert.equal(field.tiers.steel,2,'all infusions retained');
 assert.ok(field.until-field.activeAt>=fieldSeconds(tiers)-1e-8);
 const snap=serializeSnapshot(room,9.35,a.id).oneHitFields.find(f=>f.trail);
 assert.ok(snap?.trailPoints?.length>=8,'both clients see authoritative midair polyline');
 assert.equal(snap.trailPoints.at(-1).x,field.trailPoints.at(-1).x);
});
test('a remote enemy entering the AIR wake gets ALL normal afflictions once, not another decisive HP hit',()=>{
 const {room,b}=scene();const field=wakeField();
 room.oneHitFields=[field];b.position={x:6,y:0,z:0};b.health=1000;
 b.pendingSpell={spell:'fireball',castAt:99};b.spellReadyAt=0;
 stepRoom(room,DT,9.4,world);
 assert.equal(b.health,1000,'initial wake touch has no extra wave HP');
 assert.ok(b.shaken,'Shaken');
 assert.ok(b.blustered,'Blustered');
 assert.ok(b.oneHitFrostSlow,'Frost slow');
 assert.ok(b.oneHitFrozenUntil>9.4,'Full Frost freezing flash');
 assert.ok(b.electricalBacklash,'Shocking Conduct');
 assert.equal(b.pendingSpell,null,'Steel interrupts once');
 assert.ok(b.spellReadyAt>9.4,'Full Steel resets cooldowns once');
 assert.equal(room.events.filter(e=>e.type==='damage'&&e.source==='one_hit_of_wonders').length,0);
 const restarted=b.spellReadyAt,conduct=b.electricalBacklash;
 for(let i=1;i<9;i++)stepRoom(room,DT,9.4+i*DT,world);
 assert.equal(b.spellReadyAt,restarted,'staying in the wake does not repeatedly reset skills');
 assert.deepEqual(b.electricalBacklash,conduct,'no repeat Conduct from same wake');
 assert.ok(b.health<1000,'Full Fire produces its established small burning licks while inside');
 assert.ok(room.events.some(e=>e.type==='damage'&&e.source==='one_hit_air_fire'));
 b.position.z=8;stepRoom(room,DT,9.75,world);
 assert.ok(b.electricalBacklash&&b.oneHitFrostSlow&&b.blustered,
   'the affected player keeps timed statuses after leaving the trail without Full Lightning gating');
});
test('Full Steel wake does not fade before expiry; ordinary Frost-Gale wake loses strength and then expires',()=>{
 const full=wakeField(),ordinary=wakeField({gale:2,frost:1});
 assert.equal(fieldStrength(full,full.until-.001),1);
 assert.equal(fieldStrength(full,full.until+.001),0);
 assert.equal(fieldStrength(ordinary,ordinary.activeAt-.001),1);
 assert.ok(fieldStrength(ordinary,(ordinary.activeAt+ordinary.until)/2)<.6);
 assert.equal(fieldStrength(ordinary,ordinary.until),0);
 assert.ok(full.until-full.activeAt>ordinary.until-ordinary.activeAt);
});
test('the lingering wake is genuinely volumetric; Fire widens it but not infinitely in height',()=>{
 const center=wakeField({frost:1,gale:2,fire:0});
 const widened=wakeField({frost:1,gale:2,fire:1});
 const around={x:7,y:1,z:1.65};
 assert.equal(fieldContact(center,around),0);
 assert.ok(fieldContact(widened,around)>0);
 assert.equal(fieldContact(widened,{x:7,y:15,z:0}),0,'high/low spaces are safe when outside the 3D capsule');
 const near=closestWakePoint(widened.trailPoints,{x:5,y:8,z:0});
 assert.equal(near.y,1);
 assert.equal(galeFrostWakeEnabled({gale:2,frost:0}),false);
 assert.equal(galeFrostWakeEnabled({gale:1,frost:2}),false);
 assert.equal(galeFrostWakeEnabled({gale:2,frost:1}),true);
});
