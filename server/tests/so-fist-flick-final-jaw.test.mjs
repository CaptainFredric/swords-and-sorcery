import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,fireSoFistication,
  flickSoFistication,stepSoFistication,damageSoFistication} from '../../shared/sim/soFistication.mjs';
import {flickTipWorld,FLICK} from '../../shared/sim/soFistFlick.mjs';
import {createStructureState} from '../../shared/sim/structures.mjs';
import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {biByeHitVolumes} from '../../shared/sim/biByeComponents.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {fightFlightHitVolumes} from '../../shared/sim/fightFlightComponents.mjs';

function setup(skill='beatToThePunch'){
  const room=new Room('FINGER_FLICK',{mode:'PRACTICE'});room.state='PLAYING';
  room.world={solids:[],ramps:[],floors:[{id:'ground',center:[0,-.1,0],size:[120,.2,120],y:0}],spawnPoints:[{x:0,y:0,z:0}],abyssY:-30};
  const p=room.addPlayer({id:'operator',token:'operator',name:'Operator',siegeLoadout:{soFist:skill}},0);
  const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
  p.position=soFistEntry(b,room.world);p.spawnProtectionUntil=0;
  assert.equal(mountSoFistication(room,b,p,0),true);
  return {room,p,b};
}
function run(s,start,end){
  for(let t=start+1/30;t<=end+1e-8;t+=1/30)
    stepSoFistication(s.room,s.b,1/30,t,s.room.world);
}
test('flick and normal piston are mutually exclusive through a single 4s cycle',()=>{
  const s=setup();
  assert.equal(flickSoFistication(s.room,s.b,0),true);
  assert.equal(fireSoFistication(s.room,s.b,.2),false);
  assert.equal(flickSoFistication(s.room,s.b,.3),false);
  assert.equal(fireSoFistication(s.room,s.b,4.01),true);
  assert.equal(flickSoFistication(s.room,s.b,4.1),false);
  assert.equal(flickSoFistication(s.room,s.b,8.02),true);
});
test('the flick is a fingertip sweep with one budgeted contact, not an AoE',()=>{
  const s=setup(),a=s.room.addPlayer({id:'foe',token:'foe',name:'Foe'},0);
  const tip=flickTipWorld(s.b,.75);
  a.position={x:tip[0],y:0,z:tip[2]};a.spawnProtectionUntil=0;
  const initialHealth=a.health;
  assert.equal(flickSoFistication(s.room,s.b,0),true);
  run(s,0,.91);
  const impacts=s.room.events.filter(e=>e.type==='soFistFlickImpact');
  assert.equal(impacts.length,1,'an actually reachable fingertip inflicts exactly one contact');
  assert.equal(impacts[0].victimId,a.id);
  assert.equal(impacts[0].damage,80,'not merely an asset or input test');
  assert.equal(a.health,initialHealth-80,'server owns the complete 80 HP damage');
  assert.ok(Math.hypot(a.impulse.x,a.impulse.z)>=25,'server launched the hit body');
  assert.equal(s.b.flickContactUsed,true,'one hit budget, even across many swept substeps');
  assert.equal(FLICK.damage,80);
  assert.equal(FLICK.cycle,4);
});
test('Flick hits an actual timber obstacle, removes structural HP and physically recoils the ram',()=>{
 const s=setup();
 const tip=flickTipWorld(s.b,.75);
 const wall={id:'cover-practice-pal',center:[tip[0],tip[1],tip[2]],
  size:[.68,1.1,.20],material:'timber'};
 s.room.world.solids=[wall];s.room.structures=createStructureState(s.room.world);
 assert.ok(s.room.structures.entities['reforming-cover-practice-pal']);
 assert.equal(flickSoFistication(s.room,s.b,0),true);
 run(s,0,.91);
 const entity=s.room.structures.entities['reforming-cover-practice-pal'];
 assert.equal(entity.health,160,'real 80-damage contact against the temporary cover');
 assert.equal(s.room.events.filter(e=>e.type==='soFistFlickBlocked').length,1);
 assert.ok(s.b.recoilVelocity<0,'contact must shove the actual carriage solver backward');
 assert.ok(s.room.events.some(e=>e.type==='siegeImpact'&&e.kind==='flick-wall'));
 assert.equal(s.b.flickContactUsed,true,'the collision spends the single contact');
});
test('a facing guard reduces the flick and costs stamina without creating a second hit',()=>{
  const s=setup(),foe=s.room.addPlayer({id:'guard',token:'guard',name:'Guard'},0);
  const point=flickTipWorld(s.b,.75);
  foe.position={x:point[0],y:0,z:point[2]};
  foe.spawnProtectionUntil=0;
  // Forward from yaw is (-sin(yaw),-cos(yaw)); face the attacking carriage.
  const dx=s.b.x-foe.position.x,dz=s.b.z-foe.position.z;
  foe.yaw=Math.atan2(-dx,-dz);
  foe.guarding=true;foe.guardStamina=100;
  const initialHealth=foe.health;
  assert.equal(flickSoFistication(s.room,s.b,0),true);
  run(s,0,.91);
  const impacts=s.room.events.filter(e=>e.type==='soFistFlickImpact');
  assert.equal(impacts.length,1);
  assert.equal(impacts[0].guarded,true);
  assert.equal(impacts[0].damage,Math.round(FLICK.damage*FLICK.guardDamageFactor));
  assert.equal(foe.health,initialHealth-impacts[0].damage);
  assert.equal(foe.guardStamina,100-FLICK.guardDrain);
});
test('Finger Flick contacts real ballista and aircraft component volumes, transferring machine impulses',()=>{
  // Each case uses a separate authority-owned Practice room. Position a real
  // component in the measured fingertip arc rather than invoking hit handlers.
  const ballistaScenario=setup();
  const ballista=createBiByeLlista({x:0,y:0,z:0,baseYaw:0});
  const point=flickTipWorld(ballistaScenario.b,.75);
  const ballistaTarget=biByeHitVolumes(ballista).find(v=>v.id==='bibye-hit-hull-3');
  assert.ok(ballistaTarget,'the real vertical carriage/turret collision volume exists');
  ballista.x+=point[0]-ballistaTarget.center[0];
  ballista.z+=point[2]-ballistaTarget.center[2];
  ballistaScenario.room.biByeLlista=ballista;
  const oldBallistaHP=ballista.health;
  assert.equal(flickSoFistication(ballistaScenario.room,ballistaScenario.b,0),true);
  run(ballistaScenario,0,.91);
  assert.equal(ballistaScenario.room.events.filter(e=>e.type==='soFistFlickMachineImpact'&&e.kind==='ballista').length,1);
  assert.ok(ballista.health<oldBallistaHP,'the swept fingertip damaged the real ballista hull');
  assert.ok(Math.hypot(ballista.externalVelocity.x,ballista.externalVelocity.z)>0,
    'mobile ballista received a physical movement impulse');
  assert.ok(ballistaScenario.b.recoilVelocity<0,'striking the machine recoils the ram as well');

  const flightScenario=setup();
  const flight=createFightFlight();
  const flightPoint=flickTipWorld(flightScenario.b,.75);
  const flightTarget=fightFlightHitVolumes(flight).find(v=>v.componentId==='main'&&v.size[1]>1);
  assert.ok(flightTarget,'the aircraft has a real vertical frame volume');
  flight.x+=flightPoint[0]-flightTarget.center[0];
  flight.z+=flightPoint[2]-flightTarget.center[2];
  flight.position={x:flight.x,y:flight.y,z:flight.z};
  flightScenario.room.fightFlight=flight;
  const beforeHP=[flight.health,flight.rotorHP,flight.braceLHP,flight.braceRHP];
  assert.equal(flickSoFistication(flightScenario.room,flightScenario.b,0),true);
  run(flightScenario,0,.91);
  assert.equal(flightScenario.room.events.filter(e=>e.type==='soFistFlickMachineImpact'&&e.kind==='flight').length,1);
  assert.ok([flight.health,flight.rotorHP,flight.braceLHP,flight.braceRHP]
    .some((hp,i)=>hp<beforeHP[i]),'a real aircraft component was damaged');
  assert.ok(Math.hypot(flight.externalFlickImpulse?.x??0,flight.externalFlickImpulse?.z??0)>0,
    'a one-time external impulse is queued for the aircraft movement solver');
});

test('death attack ignores cooldown but requires Long Arm equipped and a mounted fist',()=>{
  const s=setup('longArmToTheJaw');
  s.b.skill.readyAt=999;s.b.strikeAt=.9;
  assert.equal(damageSoFistication(s.room,s.b,20000,'enemy','ram',1,{componentId:'hull'}),true);
  assert.equal(s.b.health,0);
  assert.equal(s.b.finalJaw?.phase,'aiming');
  assert.equal(s.b.finalJaw.variant,'intact');
  stepSoFistication(s.room,s.b,1/30,1.2,s.room.world);
  assert.equal(s.b.detachedFist,null);
  stepSoFistication(s.room,s.b,1/30,1.45,s.room.world);
  assert.equal(s.b.finalJaw.phase,'released');
  assert.equal(s.b.detachedFist?.isFinal,true);
  assert.equal(s.b.fistMounted,false);
});
test('an absent fist cannot be conjured into a second death projectile',()=>{
  const s=setup('longArmToTheJaw');
  s.b.fistMounted=false;s.b.components.Fist.health=0;
  assert.equal(damageSoFistication(s.room,s.b,20000,'enemy','ram',1,{componentId:'hull'}),true);
  stepSoFistication(s.room,s.b,1/30,1.6,s.room.world);
  assert.equal(s.b.finalJaw,undefined);
  assert.equal(s.b.detachedFist,null);
});
test('fist shattered in the same fatal moment may eject fragments, but no new fist HP',()=>{
  const s=setup('longArmToTheJaw');
  s.b.components.Fist.health=0;s.b.fistBrokenAt=1;
  assert.equal(damageSoFistication(s.room,s.b,20000,'enemy','ram',1,{componentId:'hull'}),true);
  assert.equal(s.b.finalJaw?.variant,'damaged');
  stepSoFistication(s.room,s.b,1/30,1.45,s.room.world);
  assert.equal(s.b.detachedFist?.fragment,true);
  assert.equal(s.b.detachedFist?.healthAtLaunch,0);
});
