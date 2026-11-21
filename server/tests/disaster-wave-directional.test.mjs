import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {ONE_HIT_RULES} from '../../shared/src/oneHitOfWondersRules.mjs';
import {airFieldSeconds} from '../../shared/src/oneHitStatus.mjs';

const DT=1/30;
const world={floors:[{id:'wide',center:[0,-.1,0],size:[250,.2,250],y:0}],
  ramps:[],solids:[],spawnPoints:[{x:50,y:0,z:50}],abyssY:-30};
const waveTiers=fire=>({fire,frost:2,gale:2,lightning:2,steel:1});
function setup({fire=0,height=8,direction={x:0,y:0,z:-1}}={}){
 const room=new Room('G-WAVE',{mode:'FFA'});room.world=world;
 for(const id of ['caster','front','rear','side'])
   room.addPlayer({id,token:id,name:id},0);
 for(const id of ['caster','front','rear','side'])room.setReady(id,true,0);
 room.tick(3.1);room.state='PLAYING';
 const caster=room.players.get('caster');
 caster.position={x:50,y:0,z:50};caster.spawnProtectionUntil=0;
 const radius=fire?ONE_HIT_RULES.waveTerminalFireRadius:ONE_HIT_RULES.waveTerminalRadius;
 const offset=radius*1.22;
 for(const [id,x,z] of [['front',0,-offset],['rear',0,offset],['side',offset,0]]){
  const p=room.players.get(id);
  p.position={x,y:height?height-1:0,z};p.health=500;p.spawnProtectionUntil=0;
  p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};p.grounded=!height;
 }
 const position={x:0,y:height||.45,z:0};
 room.oneHitWaves=[{id:'directional-wave',ownerId:caster.id,position,direction,
  tiers:waveTiers(fire),bornAt:9,distance:ONE_HIT_RULES.waveMaxReach-.005,
  hitIds:[],fromGround:false,launchYaw:0}];
 room.events.length=0;
 return {room,radius,position};
}
const impact=room=>room.events.find(e=>e.type==='oneHitImpact'&&e.impactId==='directional-wave');
const direct=(room,id)=>room.events.filter(e=>e.type==='damage'&&
  e.source==='one_hit_of_wonders'&&e.victimId===id);
function tick(room,at=9.1){stepRoom(room,DT,at,world);}

test('a midair Gale terminal gust has a 3D forward-biased area without upgrading its base 2.2m radius',()=>{
 const {room,radius}=setup();
 tick(room);
 const event=impact(room);
 assert.ok(event,'the terminal wave resolved under real room simulation');
 assert.equal(event.groundBlast,false);
 assert.equal(event.radius,radius);
 assert.equal(event.air,true);
 assert.ok(event.struck.includes('front'),'forward 32% blast actually applies elemental statuses');
 assert.ok(!event.struck.includes('rear')&&!event.struck.includes('side'));
 assert.equal(direct(room,'front').length,0,'non-Fire gale gust has no fabricated decisive HP');
 assert.equal(room.oneHitFields.length,1);
 const field=room.oneHitFields[0];
 assert.equal(field.air,true);assert.equal(field.radius,radius);
 assert.ok(field.until-event.at<2,'air pressure expires far sooner than broken ground');
 assert.ok(field.until-event.at>=airFieldSeconds(waveTiers(0))-.0001);
 const snap=serializeSnapshot(room,9.1,'caster');
 assert.equal(snap.oneHitFields[0].air,true);
 assert.deepEqual(snap.oneHitFields[0].direction,{x:0,y:0,z:-1});
});

test('Full Fire aerial detonation widens to its own 3.4m base, burns forward for a short time and not behind',()=>{
 const {room,radius}=setup({fire:2});
 tick(room);
 const event=impact(room);
 assert.ok(event&&event.air);
 assert.equal(event.radius,3.4);
 assert.ok(event.struck.includes('front'));
 assert.ok(!event.struck.includes('rear')&&!event.struck.includes('side'));
 assert.equal(direct(room,'front').length,1,'one decisive hit, never a second wave explosion hit');
 assert.equal(direct(room,'rear').length,0);
 assert.equal(room.oneHitBurnZones.length,1);
 const zone=room.oneHitBurnZones[0];
 assert.equal(zone.air,true);assert.equal(zone.radius,radius);
 assert.ok(zone.until-event.at<2);
 const snap=serializeSnapshot(room,9.1,'caster');
 assert.equal(snap.oneHitBurnZones[0].air,true);
 assert.deepEqual(snap.oneHitBurnZones[0].direction,event.direction);
 // Reposition a target inside the blast after the terminal shove, and
 // maintain the rest at equal distance outside it. Do not inject any damage.
 const span=radius*1.20;
 for(let i=0;i<15;i++){
  const front=room.players.get('front'),rear=room.players.get('rear');
  for(const [p,z] of [[front,-span],[rear,span]]){
   p.position={x:0,y:7,z};p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};
  }
  tick(room,9.1+(i+1)*DT);
 }
 const ticks=room.events.filter(e=>e.type==='damage'&&e.source==='one_hit_air_fire');
 assert.ok(ticks.some(e=>e.victimId==='front'),'suspended Fire keeps a short real HP hazard');
 assert.ok(!ticks.some(e=>e.victimId==='rear'),'rear outside the actual 3D blast takes no Fire ticks');
});

test('ground-contacting Gale explosion uses locked forward footprint and the long-lived ground field',()=>{
 const {room,radius}=setup({height:0});
 tick(room);
 const event=impact(room);
 assert.ok(event?.groundBlast);
 assert.equal(event.radius,radius);
 assert.equal(event.yaw,0);
 assert.ok(event.struck.includes('front'));
 assert.ok(!event.struck.includes('rear')&&!event.struck.includes('side'));
 const field=room.oneHitFields[0];
 assert.equal(Boolean(field.air),false);
 assert.equal(field.yaw,0);
 assert.ok(field.until-event.at>4,'actual broken ground persists unlike free air');
});
