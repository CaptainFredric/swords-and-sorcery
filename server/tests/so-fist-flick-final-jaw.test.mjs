import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,fireSoFistication,
  flickSoFistication,stepSoFistication,damageSoFistication} from '../../shared/sim/soFistication.mjs';
import {flickTipWorld,FLICK} from '../../shared/sim/soFistFlick.mjs';

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
