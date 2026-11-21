import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,releaseOneHitCharge,detonateOneHitWave,stepRoom} from '../../shared/sim/combat.mjs';
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
test('Full Lightning tracks a changed yaw and pitch at RELEASE, not at start',()=>{
  const {room,a}=setup({lightning:2,gale:2});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  a.input.yaw=-Math.PI/2;
  a.input.pitch=.1;
  a.input.sprint=true;
  a.input.forward=1;
  tick(room,9,9.35);
  assert.equal(a.sprinting,false,'Lightning charge must refuse Sprint');
  assert.ok(a.sprintBlend<.001);
  // Turn all the way toward the opposite side and look up AFTER starting.
  a.input.yaw=Math.PI/2;
  a.input.pitch=.7;
  a.input.forward=0;
  tick(room,9.35,9.55);
  const before={...a.position};
  assert.equal(releaseOneHitCharge(room,'a',9.55),true);
  const teleport=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(teleport,'the release commits a teleport');
  assert.ok(teleport.to.x<before.x-3,
    'the current westward facing wins over the original eastward facing');
  assert.ok(teleport.to.y>before.y+2,
    'the current upward look determines height with Full Gale');
});

test('atomic final-look release overrides a stale movement packet during Full Gale teleport',()=>{
  const {room,a}=setup({lightning:2,gale:2});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  a.input.yaw=-Math.PI/2;a.input.pitch=0;
  tick(room,9,9.5);
  const before={...a.position};
  // No intervening 'input' movement packet arrives. The release itself
  // contains the player's new view from immediately before the key came up.
  assert.equal(releaseOneHitCharge(room,'a',9.5,{yaw:Math.PI/2,pitch:.65}),true);
  const impact=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(impact);
  assert.ok(impact.to.x<before.x-3,'destination uses release yaw, not older eastward input');
  assert.ok(impact.to.y>before.y+2,'destination uses release elevation');
  assert.equal(a.input.yaw,Math.PI/2);
  assert.equal(a.input.pitch,.65);
});

test('Lightning without Full Gale remains ground-bound even if looking high',()=>{
  const {room,a}=setup({lightning:2});
  a.input.pitch=1.3;
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  tick(room,9,9.35);
  assert.equal(releaseOneHitCharge(room,'a',9.35),true);
  const teleport=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(teleport);
  assert.equal(teleport.grounded,true);
  assert.ok(Math.abs(teleport.to.y)<1e-5);
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
test('Non-Fire terminal Gale explosion damages through its whole ground AOE and carries every infusion',()=>{
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
  assert.ok(b.health<100,'a nearby defender takes real radial HP damage even without Fire');
  assert.ok(b.shaken,'Shaken');
  assert.ok(b.blustered,'Blustered even on non-Fire terminal gust');
  assert.ok(b.electricalBacklash,'Shocking Conduct');
  assert.ok(b.oneHitFrozenUntil>9,'Flash Freeze');
  assert.equal(b.pendingSpell,null,'Steel interruption');
  assert.ok(b.spellReadyAt>9,'Full Steel resets Skill cooldown');
  assert.equal(room.oneHitFields.length,1);
  assert.deepEqual(room.oneHitFields[0].tiers,tiers);
  assert.equal(room.oneHitFields[0].radius,event.radius);
  assert.equal(room.events.filter(e=>e.type==='damage'&&e.victimId===b.id&&e.source==='one_hit_of_wonders').length,1,'one guarded-or-hurt decisive contact per cast');
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

test('Gale terminal ground AOE hurts an off-line target, but Guard blocks HP while statuses still reach them',()=>{
  const encounter=guard=>{
    const {room,a,b}=setup({gale:2,lightning:1});
    b.position={x:6.2,y:0,z:1.45};b.health=100;
    b.guarding=guard;b.guardStartedAt=0;b.yaw=-.4;b.guardStamina=100;
    room.oneHitWaves=[{id:'radial-contact',ownerId:a.id,position:{x:5,y:.65,z:0},
      direction:{x:1,y:0,z:0},tiers:{gale:2,lightning:1},bornAt:9,distance:5,hitIds:[]}];
    const terrain={...world,solids:[{id:'wall',center:[7,2,0],size:[.2,6,10]}]};
    tick(room,9,9.3,terrain);
    const impact=room.events.find(e=>e.type==='oneHitImpact'&&e.impactId==='radial-contact');
    assert.ok(impact?.groundBlast,'the wave really detonates against terrain');
    assert.ok(impact.radius>=2.2);
    return {room,b};
  };
  const bare=encounter(false);
  assert.ok(bare.b.health<100,'side-step misses the travelling blade but not its circular ground explosion');
  assert.ok(bare.b.electricalBacklash,'the missed blade still delivers Conduct');
  const guarded=encounter(true);
  assert.equal(guarded.b.health,100,'Guard prevents the radial HP hit');
  assert.ok(guarded.b.electricalBacklash,'a guarded victim still feels elemental Conduct');
  assert.ok(guarded.b.blustered,'radial pressure still Blusters through Guard');
});

test('Gale+Lightning sky burst sends one independent bolt straight to distant ground without other infusions',()=>{
  const {room,a,b}=setup();
  b.position={x:6.1,y:0,z:.8};b.health=100;
  const tiers={fire:0,frost:0,gale:2,lightning:1,steel:0};
  room.oneHitWaves=[{id:'sky-bolt',ownerId:a.id,position:{x:5,y:7,z:0},
    direction:{x:1,y:0,z:0},tiers,bornAt:9,distance:5,hitIds:[]}];
  const wall={...world,solids:[{id:'high-wall',center:[7,5,0],size:[.2,10,10]}]};
  tick(room,9,9.3,wall);
  const impact=room.events.find(e=>e.type==='oneHitImpact'&&e.impactId==='sky-bolt');
  const bolt=room.events.find(e=>e.type==='oneHitLightningGroundStrike'&&e.waveId==='sky-bolt');
  assert.ok(impact?.air,'blade explodes in free air');
  assert.ok(bolt,'lightning falls from the airborne detonation to solid ground');
  assert.ok(bolt.origin.y-bolt.point.y>5,'ground height is independent of blast height');
  assert.equal(bolt.point.y,0);
  assert.ok(b.health<100,'target below the wave takes one independent lightning strike');
  assert.ok(b.electricalBacklash,'it carries Shocking Conduct');
  assert.ok(!room.events.some(e=>e.type==='rupture'),'an air blast does not split the ground merely because lightning travels down');
});

test('Gale+Lightning reaches modeled ground arbitrarily far below; other infusion effects stay in midair',()=>{
  const {room,a,b}=setup();
  b.position={x:6,y:0,z:0};b.health=100;b.spellReadyAt=0;
  const tiers={fire:2,frost:2,gale:2,lightning:1,steel:2};
  room.oneHitWaves=[{id:'very-high-bolt',ownerId:a.id,
    position:{x:6,y:160,z:0},direction:{x:1,y:0,z:0},
    tiers,bornAt:9,distance:5,hitIds:[]}];
  assert.equal(detonateOneHitWave(room,a.id,'very-high-bolt',9.1),true);
  const blast=room.events.find(e=>e.type==='oneHitImpact'&&e.impactId==='very-high-bolt');
  const bolt=room.events.find(e=>e.type==='oneHitLightningGroundStrike'&&e.waveId==='very-high-bolt');
  assert.equal(blast?.air,true);
  assert.equal(blast.point.y,160,'the Gale explosion must not be dragged down to the target');
  assert.equal(bolt?.origin.y,160);
  assert.equal(bolt?.point.y,0,'the independent bolt reaches ground with no height cutoff');
  assert.ok(b.health<100&&b.electricalBacklash,'only Lightning hits the knight below');
  assert.equal(b.blustered??null,null,'the Gale explosion remains high above');
  assert.equal(b.oneHitFrostSlow??null,null,'Frost does not follow the bolt');
  assert.equal(b.spellReadyAt,0,'Steel does not reset cooldowns through the bolt');
  assert.equal(room.oneHitFields.at(-1).position.y,160,'lingering field stays at explosion altitude');
  assert.equal(room.oneHitBurnZones.at(-1).position.y,160,'Fire remains suspended at the explosion');
  assert.equal(room.events.some(e=>e.type==='rupture'),false,'the bolt does not fracture ground as a Steel slam');
});

test('airborne Gale+Lightning targets the highest supported surface below, never empty space',()=>{
  const run=(floors,footY)=>{
    const {room,a,b}=setup();
    room.world={...world,floors,ramps:[]};
    b.position={x:6,y:footY,z:0};b.health=100;
    room.oneHitWaves=[{id:'long-drop',ownerId:a.id,
      position:{x:6,y:300,z:0},direction:{x:1,y:0,z:0},
      tiers:{gale:2,lightning:1},bornAt:9,distance:7,hitIds:[]}];
    assert.equal(detonateOneHitWave(room,a.id,'long-drop',9.1),true);
    return {room,b,bolt:room.events.find(e=>e.type==='oneHitLightningGroundStrike')};
  };
  const low={id:'ground',center:[0,-.1,0],size:[200,.2,200],y:0};
  const high={id:'platform',center:[6,41.9,0],size:[4,.2,4],y:42};
  const platform=run([low,high],42);
  assert.equal(platform.bolt?.point.y,42,'bolt stops at the highest floor, not the bottom of the world');
  assert.ok(platform.b.health<100);
  const voidWorld=run([],0);
  assert.equal(voidWorld.bolt,undefined,'nothing is conjured beneath an unsupported void');
  assert.equal(voidWorld.b.health,100);
});
