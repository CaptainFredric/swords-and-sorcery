// Full Gale/Lightning All-Natural Disaster: finish as the knight actually
// arrives, aim a distinct sword wave, explode at range and close Full Steel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,releaseOneHitCharge,stepRoom,applyDamage} from '../../shared/sim/combat.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {PROWESS} from '../../shared/src/prowess.mjs';
import {ONE_HIT_RULES} from '../../shared/src/oneHitOfWondersRules.mjs';
import {planOneHitTeleport} from '../../shared/src/oneHitTrajectory.mjs';

const DT=1/30;
const world={
  floors:[{id:'ground',center:[0,-.1,0],size:[200,.2,200],y:0}],
  ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:3,y:0,z:0,yaw:Math.PI/2}],
  abyssY:-9,
};
function battle(tiers={}){
  const room=new Room('DAIM',{mode:'FFA'});room.world=world;
  room.addPlayer({id:'a',token:'aa',name:'Caster'},0);
  room.addPlayer({id:'b',token:'bb',name:'Target'},0);
  room.setReady('a',true,0);room.setReady('b',true,0);room.tick(3.1);
  const a=room.players.get('a'),b=room.players.get('b');
  a.ultimate='one_hit_of_wonders';
  a.position={x:0,y:0,z:0};a.grounded=true;a.velocity={x:0,y:0,z:0};
  a.yaw=-Math.PI/2;a.input.yaw=a.yaw;a.pitch=0;a.input.pitch=0;
  b.position={x:1.8,y:0,z:0};b.spawnProtectionUntil=0;a.spawnProtectionUntil=0;
  Object.assign(a.oneHitInfusions,tiers);
  a.prowess=PROWESS.full;
  room.events.length=0;
  return {room,a,b};
}
function run(room,start,end) {
  for(let t=start;t<end-1e-6;t+=DT)stepRoom(room,DT,t,world);
}
const commits=(room)=>room.events.filter(e=>e.type==='oneHitCommitted');
const waves=(room)=>room.events.filter(e=>e.type==='oneHitWave');
const impacts=(room)=>room.events.filter(e=>e.type==='oneHitImpact'&&e.impactId);
const damage=(room,id)=>room.events.filter(e=>e.type==='damage'&&e.source==='one_hit_of_wonders'&&e.victimId===id);

test('Grounded Full Gale gets the slam AND one shared-registry travelling wave',()=>{
  const {room,b}=battle({gale:2});
  assert.equal(tryUltimate(room,'a',9),true);
  run(room,9,11.3);
  assert.equal(commits(room)[0].form,'ground');
  assert.equal(room.events.filter(e=>e.type==='oneHitImpact'&&e.form==='ground').length,1);
  assert.equal(waves(room).length,1);
  assert.equal(waves(room)[0].fromGround,true);
  assert.equal(damage(room,b.id).length,1,'the slam victim cannot be struck twice');
  const terminal=impacts(room);
  assert.equal(terminal.length,1,'a missed/undetonated wave MUST explode at range');
  assert.equal(terminal[0].cause,'range');
  assert.equal(terminal[0].radius,ONE_HIT_RULES.waveTerminalRadius);
  assert.equal(terminal[0].groundBlast,true);
});
test('a guarding defender stops and detonates Gale wave without duplicate HP or Guard loss',()=>{
  const {room,a,b}=battle({gale:2});
  b.position={x:10,y:0,z:0};
  b.yaw=Math.PI/2;b.input.yaw=b.yaw;
  b.guarding=true;b.guardStartedAt=0;b.guardStamina=100;
  assert.equal(tryUltimate(room,'a',9),true);
  run(room,9,10.8);
  const explosion=impacts(room).find(e=>e.cause==='guard');
  assert.ok(explosion,'the wave explodes on a defended sword contact');
  assert.ok(explosion.point.x>7&&explosion.point.x<12,
    'impact is near the guard, not the far 22m range limit');
  assert.equal(damage(room,b.id).length,0,'guarded victim has no decisive HP hit');
  assert.equal(b.guardStamina,60,'one guard contact costs exactly 40 stamina');
  assert.equal(waves(room).length,1,'one wave launched');
  assert.equal(room.events.filter(e=>e.type==='oneHitWaveResolved').length,1,
    'guarded wave resolves once');
});

test('Fire terminal wave explosion equals a plain grounded slam, smaller than a Fire slam',()=>{
  const {room,b}=battle({gale:2,fire:1});
  assert.equal(tryUltimate(room,'a',9),true);
  run(room,9,11.3);
  assert.equal(damage(room,b.id).length,1);
  const terminal=impacts(room);
  assert.equal(terminal.length,1);
  assert.equal(terminal[0].radius,3.4);
  assert.equal(room.events.find(e=>e.type==='oneHitImpact'&&e.form==='ground').radius,4.6);
});
test('Full Gale plus Lightning teleports UP from the ground, then aims the wave independently',()=>{
  const {room,a}=battle({gale:2,lightning:2});
  a.input.pitch=.85;
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  run(room,9,10.20);
  assert.equal(releaseOneHitCharge(room,'a',10.2),true);
  const teleport=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(teleport&&!teleport.grounded&&teleport.to.y>6);
  assert.equal(commits(room)[0].form,'aerial');
  assert.equal(waves(room).length,0,'there is a brief real-time aiming interval');
  const snap=serializeSnapshot(room,10.2,'a').players.find(p=>p.id==='a');
  assert.ok(snap.ultimateState.oneHit.aimUntil>10.2);
  a.input.yaw=0;a.input.pitch=-.6;
  run(room,10.2,10.93);
  assert.equal(waves(room).length,0,'one-second post-arrival vortex is still turning');
  run(room,10.93,11.25);
  assert.equal(waves(room).length,1);
  assert.ok(waves(room)[0].direction.y<-.5,'wave follows the NEW pitch, not upward teleport pitch');
  assert.ok(waves(room)[0].direction.z<-.7,'independent yaw is live');
});

test('the final dragged 3D look reaches the authoritative teleport, overriding stale facing on every axis',()=>{
  const directions=[
    {name:'up-forward',yaw:0,pitch:.85,axis:'z',sign:-1},
    {name:'up-right',yaw:-Math.PI/2,pitch:.65,axis:'x',sign:1},
    {name:'up-behind',yaw:Math.PI,pitch:.82,axis:'z',sign:1},
    {name:'up-left',yaw:Math.PI/2,pitch:.65,axis:'x',sign:-1},
    {name:'straight-up',yaw:1.5,pitch:Math.PI/2,axis:'y',sign:1},
  ];
  for(const {name,yaw,pitch,axis,sign} of directions){
    const {room,a}=battle({gale:2,lightning:2});
    a.input.yaw=0;a.input.pitch=0; // stale snapshot still faces forward
    assert.equal(tryUltimate(room,'a',9,{held:true}),true,name);
    run(room,9,9.75);
    const origin={...a.position};
    const expected=planOneHitTeleport({
      origin,yaw,pitch,aerial:false,allowVertical:true,holdSec:.75,world,
    });
    assert.ok(expected.legal,name+' has a real valid 3D destination');
    assert.equal(releaseOneHitCharge(room,'a',9.75,{yaw,pitch}),true,name);
    const arrived=room.events.find(e=>e.type==='oneHitTeleport');
    assert.ok(arrived,name+' teleports; not just a decorative 3D guide');
    assert.ok(Math.abs(arrived.to.x-expected.end.x)<.04,name+' x matches preview');
    assert.ok(Math.abs(arrived.to.y-expected.end.y)<.04,name+' y matches preview');
    assert.ok(Math.abs(arrived.to.z-expected.end.z)<.04,name+' z matches preview');
    assert.ok((arrived.to[axis]-origin[axis])*sign>6,name+' goes in the newly dragged direction');
    assert.ok(arrived.to.y>origin.y+5,name+' gains actual altitude');
    assert.equal(commits(room)[0].form,'aerial',name+' acquires the aerial wave from ground ascent');
    assert.equal(a.input.yaw,yaw,name+' final release yaw was accepted');
    assert.equal(a.input.pitch,pitch,name+' final release pitch was accepted');
  }
});

test('Full Lightning WITHOUT Full Gale still cannot gain height by sending a 3D drag',()=>{
  const {room,a}=battle({lightning:2,gale:1});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  run(room,9,9.8);
  assert.equal(releaseOneHitCharge(room,'a',9.8,{yaw:-Math.PI/2,pitch:Math.PI/2}),true);
  const arrived=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(arrived&&arrived.grounded,'Gale tier two is necessary for 3D teleport');
  assert.ok(Math.abs(arrived.to.y)<1e-8);
  assert.ok(arrived.to.x>5,'without Full Gale the same input still aims horizontally');
});

test('Landing from an airborne teleport chooses the ground slam, not the aerial wave',()=>{
  const {room,a}=battle({gale:2,lightning:2});
  a.position.y=7;a.grounded=false;a.input.pitch=-1.1;
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  run(room,9,10.2);
  assert.equal(releaseOneHitCharge(room,'a',10.2),true);
  const teleport=room.events.find(e=>e.type==='oneHitTeleport');
  assert.ok(teleport&&teleport.grounded);
  assert.equal(commits(room)[0].form,'ground');
  assert.equal(impacts(room).length,0,'the outgoing wave is not an instantaneous second blast');
  assert.equal(a.ultimateState.oneHit.aimUntil,null);
  run(room,10.2,11.5);
  assert.equal(waves(room)[0].fromGround,true);
});
test('A caster shoved off a ledge DURING a held charge can arrive in air and re-aim',()=>{
  const {room,a}=battle({gale:2,lightning:2});
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  a.position={x:0,y:3,z:0};a.grounded=false;a.input.pitch=.6;
  run(room,9,9.9);
  assert.equal(releaseOneHitCharge(room,'a',9.9),true);
  assert.equal(commits(room)[0].form,'aerial');
  assert.ok(a.ultimateState.oneHit.aimUntil>9.9);
});
test('The second press fires early during aim, not as another Ultimate or a detonation',()=>{
  const {room,a}=battle({gale:2,lightning:2});
  a.input.pitch=.65;
  assert.equal(tryUltimate(room,'a',9,{held:true}),true);
  run(room,9,9.6);
  assert.equal(releaseOneHitCharge(room,'a',9.6),true);
  a.input.pitch=-.35;
  assert.deepEqual(applyRoomCommand(room,a,{type:'oneHitFire'},9.68),{});
  assert.equal(waves(room).length,1);
  assert.equal(waves(room)[0].direction.y<0,true);
  run(room,9.7,10.5);
  assert.equal(waves(room).length,1,'automatic fire does not launch a duplicate');
});
test('Full Steel keeps the last HP after the airborne wave expires; future damage is still lethal',()=>{
  const {room,a}=battle({gale:2,steel:2});
  a.position.y=10;a.grounded=false;
  assert.equal(tryUltimate(room,'a',9),true);
  run(room,9,10.12);
  assert.equal(commits(room)[0].form,'aerial');
  applyDamage(room,'b','a',200,'sword',10.12);
  assert.equal(a.health,1);
  assert.equal(a.alive,true);
  assert.equal(a.ultimateState.deferredLethal,undefined);
  run(room,10.13,11.9);
  assert.equal(impacts(room).length,1);
  assert.equal(impacts(room)[0].cause,'range');
  assert.equal(room.events.filter(e=>e.type==='oneHitWaveResolved').length,1);
  assert.equal(room.events.some(e=>e.type==='oneHitLastStandEnded'),false);
  assert.equal(a.alive,true,'the expiry of the wave does not kill the survivor');
  assert.equal(a.health,1);
  applyDamage(room,'b','a',10,'sword',12);
  assert.equal(a.alive,false,'a NEW blow outside the protected interval can kill');
});
