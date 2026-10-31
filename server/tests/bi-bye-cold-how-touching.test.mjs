import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,dismountBiByeLlista,
  fireBiByeMobile,fireBiByeFullVolley,stepBiByeLlista,stepBiByeProjectiles} from '../../shared/sim/biByeLlista.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {earliestFrostProximity,sweptNearBox,FROST_EFFECTIVE_PROXIMITY} from '../../shared/sim/biByeProximity.mjs';
const ground=()=>({floors:[{id:'ground',y:0,center:[0,-.1,0],size:[120,.2,120]}],solids:[],ramps:[],abyssY:-20});
function setup(){
 const room=new Room('FROST',{mode:'PRACTICE'});room.world=ground();room.state='PLAYING';
 const op=room.addPlayer({id:'op',token:'o',name:'operator',
   siegeLoadout:{biBye:'coldHowTouching'}},0);
 op.position={x:0,y:0,z:0};op.spawnProtectionUntil=0;
 const ballista=room.biByeLlista=createBiByeLlista({id:'bow',x:0,y:0,z:0,baseYaw:0});
 assert.ok(mountBiByeLlista(ballista,op,0));
 return {room,op,ballista};
}
function target(room,x,z,y=0){
 const p=room.addPlayer({id:'victim',token:'v',name:'victim'},0);
 p.position={x,y,z};p.spawnProtectionUntil=0;p.velocity={x:0,y:0,z:0};return p;
}
function projectile(room,{x=0,z=0,flag=true}={}){
 // The fired bolt survives departure or destruction of its launch carriage.
 // Keep the source machine out of this already-airborne collision fixture.
 room.biByeLlista=null;
 const p={id:'cold-test',subKind:'conditioning',ballistaId:'bow',ownerId:'op',
 position:{x,y:.9,z},velocity:{x:0,y:0,z:-48},bornAt:0,
 radius:.6,blastRadius:2,directDamage:18,edgeDamage:12,maxStaminaDrain:22,
 proximityFrost:flag};
 room.bibyeProjectiles.set(p.id,p);return p;
}
const skill=(s,at=1)=>applyRoomCommand(s.room,s.op,{type:'siegeSkill'},at);
test('Cold activates using the ordinary U input without spending ammunition or starting cooldown',()=>{
 const s=setup();assert.equal(skill(s).rejected,undefined);
 assert.equal(s.ballista.skill.phase,'active');assert.equal(s.ballista.skill.id,'coldHowTouching');
 assert.equal(s.ballista.skill.readyAt,0);assert.equal(s.ballista.mainBoltLoaded,true);
 assert.ok(skill(s,2).rejected);assert.equal(s.ballista.skill.phase,'active');
 assert.ok(s.room.events.some(e=>e.type==='siegeSkill'&&e.action==='activated'));
});
test('A newly physically fired upper bolt captures the enhancement; its normal recocking survives',()=>{
 const s=setup();skill(s);assert.ok(fireBiByeMobile(s.room,s.ballista,1.1));
 stepBiByeLlista(s.room,s.ballista,1/30,1.31);
 const p=[...s.room.bibyeProjectiles.values()][0];
 assert.equal(p?.proximityFrost,true);
 assert.ok(s.ballista.smallBoltReadyAt>1.31);
 assert.equal(s.ballista.mainBoltLoaded,true);
});
test('Swept near miss detonates at real travel position with continuous falloff, not a free direct hit',()=>{
 const s=setup(),p=target(s.room,1.5,-8),bolt=projectile(s.room);
 stepBiByeProjectiles(s.room,.25,.25);
 assert.equal(s.room.bibyeProjectiles.size,0);
 const burst=s.room.events.find(e=>e.type==='bibyeFrostProximity');
 assert.equal(burst.targetKind,'player');assert.ok(burst.point.x===0);
 assert.ok(burst.point.z>-8&&burst.point.z<0);
 assert.ok(p.health<100&&p.health>82,'not full 18 damage for a near miss');
 const contact=s.room.events.find(e=>e.type==='bibyeFrostContact'&&e.defenderId===p.id);
 assert.ok(contact?.exposure>0&&contact.exposure<1);
});
test('Non-enhanced near miss and exposure outside meaningful radius do not explode',()=>{
 for(const [x,flag]of [[1.5,false],[1.89,true]]){
  const s=setup(),victim=target(s.room,x,-8);projectile(s.room,{flag});
  stepBiByeProjectiles(s.room,.25,.25);
  assert.equal(s.room.bibyeProjectiles.size,1);
  assert.equal(victim.health,100);
  assert.equal(s.room.events.some(e=>e.type==='bibyeFrostProximity'),false);
 }
});
test('Wall between swept bolt and target prevents proximity trigger and damage',()=>{
 const s=setup(),p=target(s.room,1.5,-8);
 s.room.world.solids=[{id:'wall',center:[.83,1,-8],size:[.3,2.5,3]}];
 projectile(s.room);
 stepBiByeProjectiles(s.room,.25,.25);
 assert.equal(p.health,100);
 assert.equal(s.room.events.some(e=>e.type==='bibyeFrostProximity'),false);
});
test('Flight machine uses actual component volumes; one frost budget, protected pilot, no ghost hits',()=>{
 const s=setup();
 const m=s.room.fightFlight=createFightFlight({id:'fly',x:2,y:0,z:-8,heading:0});
 const pilot=s.room.addPlayer({id:'pilot',token:'pilot',name:'pilot'},0);
 pilot.position={x:2,y:0,z:-8};pilot.spawnProtectionUntil=0;
 m.operatorId=pilot.id;pilot.operatingFightFlightId=m.id;
 projectile(s.room);stepBiByeProjectiles(s.room,.25,.25);
 const burst=s.room.events.find(e=>e.type==='bibyeFrostProximity');
 assert.equal(burst?.targetKind,'flight');
 const hits=s.room.events.filter(e=>e.type==='fightFlightComponentHit'&&e.source==='bibye-conditioning');
 assert.ok(hits.length>0);assert.ok(hits.reduce((sum,e)=>sum+e.damage,0)<=18+1e-6);
 assert.equal(pilot.health,100);
});
test('An enhanced Bolt I keeps its proximity behavior after operator handoff; cooldown stays on chassis',()=>{
 const s=setup();skill(s,1);assert.ok(fireBiByeMobile(s.room,s.ballista,1.1));
 stepBiByeLlista(s.room,s.ballista,1/30,1.31);
 const bolt=[...s.room.bibyeProjectiles.values()][0];assert.equal(bolt.proximityFrost,true);
 dismountBiByeLlista(s.ballista,s.op,false,s.room.world,2);
 assert.equal(s.ballista.skill.readyAt,26);
 const b=s.room.addPlayer({id:'b',token:'b',name:'new rider'},0);
 b.position={x:0,y:0,z:0};assert.ok(mountBiByeLlista(s.ballista,b,3));
 assert.equal(s.ballista.skill.id,'boltToTheOccasion');
 assert.equal(s.ballista.skill.readyAt,26);
 assert.ok(applyRoomCommand(s.room,b,{type:'siegeSkill'},4).rejected);
 assert.equal(bolt.proximityFrost,true);
});
test('The actual coupled Bolt II release ends Cold and starts its 24-second chassis cooldown',()=>{
 const s=setup();skill(s,1);
 s.ballista.mode='DEPLOYED';s.ballista.weaponFocus='MAIN';
 assert.ok(fireBiByeFullVolley(s.room,s.ballista,2));
 for(let i=1;i<=100;i++)stepBiByeLlista(s.room,s.ballista,1/30,2+i/30);
 assert.equal(s.ballista.mainBoltLoaded,false,'real coupled heavy launcher discharged');
 assert.equal(s.ballista.skill.phase,'idle');
 assert.ok(s.ballista.skill.readyAt>=26);
 assert.ok(s.room.events.some(e=>e.type==='siegeSkill'&&e.action==='ended'&&e.reason==='boltII'));
 assert.ok(s.room.events.some(e=>e.type==='bibyeFired'&&e.shot==='II'));
});

test('Moving airborne Fight-and-Flight is an actual proximity target, not a grounded proxy',()=>{
 const s=setup();const m=s.room.fightFlight=createFightFlight({id:'airborne',
  x:2,y:5,z:-8,heading:0});m.grounded=false;m.mode='FLYING';
 const rider=s.room.addPlayer({id:'air-rider',token:'r',name:'rider'},0);
 rider.position={x:2,y:5,z:-8};rider.spawnProtectionUntil=0;
 rider.operatingFightFlightId=m.id;m.operatorId=rider.id;
 // Bolt I remains an ordinary non-homing horizontal flight at an aimed
 // altitude. Crossing the machine's component volume creates proximity.
 const bolt=projectile(s.room);bolt.position.y=6.4;
 const before={...bolt.position},after={x:0,y:6.4,z:-12};
 const near=earliestFrostProximity(s.room,bolt,before,after,s.room.world,.25,.25);
 assert.equal(near?.targetKind,'flight');
 assert.ok(near.t>0&&near.t<1);
 stepBiByeProjectiles(s.room,.25,.25);
 assert.ok(s.room.events.some(e=>e.type==='bibyeFrostProximity'&&e.targetKind==='flight'));
 const hits=s.room.events.filter(e=>e.type==='fightFlightComponentHit');
 assert.ok(hits.length>0);
 assert.ok(hits.reduce((sum,e)=>sum+e.damage,0)<=18+1e-6);
});

test('Operator transfer cannot erase a physically committed independent Bolt II',()=>{
 const room=new Room('HANDOFF',{mode:'PRACTICE'});room.world=ground();room.state='PLAYING';
 const first=room.addPlayer({id:'first',token:'first',name:'first',
   siegeLoadout:{biBye:'boltToTheOccasion'}},0);
 const second=room.addPlayer({id:'second',token:'second',name:'second',
   siegeLoadout:{biBye:'coldHowTouching'}},0);
 const b=room.biByeLlista=createBiByeLlista({id:'handoff',x:0,y:0,z:0,baseYaw:0});
 first.position={x:0,y:0,z:0};assert.ok(mountBiByeLlista(b,first,1));
 assert.deepEqual(applyRoomCommand(room,first,{type:'siegeSkill'},1),{});
 assert.deepEqual(applyRoomCommand(room,first,{type:'siegeSkill'},1.1),{});
 assert.equal(b.skill.phase,'releasing');assert.equal(b.skill.readyAt,25.1);
 dismountBiByeLlista(b,first,false,room.world,1.11);
 assert.ok(b.heavySkill,'committed real bow release persists without its operator');
 second.position={x:0,y:0,z:0};assert.ok(mountBiByeLlista(b,second,1.12));
 assert.equal(b.skill.phase,'releasing');
 stepBiByeLlista(room,b,1/30,1.16);
 assert.ok([...room.bibyeProjectiles.values()].some(p=>
   p.subKind==='siege'&&p.ownerId==='first'));
 assert.equal(b.mainBoltLoaded,false);
 assert.equal(b.skill.id,'coldHowTouching');
 assert.equal(b.skill.readyAt,25.1);
 assert.ok(applyRoomCommand(room,second,{type:'siegeSkill'},2).rejected);
});
