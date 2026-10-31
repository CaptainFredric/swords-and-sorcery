import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createFightFlight,mountFightFlight} from '../../shared/sim/fightFlight.mjs';
import {advanceFlightAmmo,flightMuzzle,flightDirection,flightRepeaterAim,requestFightFlightFire,stepFightFlightWeapons,stepFightFlightProjectiles,FLIGHT_REPEATER} from '../../shared/sim/fightFlightWeapons.mjs';
import {callSteel} from '../../shared/src/steel.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={floors:[{id:'g',center:[0,0,0],size:[100,.1,100],y:0}],solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 room.state='PLAYING';
 const p=room.addPlayer({id:'flying',token:'flying',name:'Flier'},0);
 const m=createFightFlight({id:'test-faf'});room.fightFlight=m;room.fightFlightProjectiles=new Map();
 p.position={x:0,y:0,z:1};
 assert.equal(mountFightFlight(room,m,p,1),true);
 return {room,m,p};
}
test('Flight crossbow physically releases from left-side authored muzzle with authority and 7Hz cap',()=>{
 const {room,m,p}=setup();
 const muzzle=flightMuzzle(m);assert.ok(muzzle.x<0&&muzzle.z<0&&muzzle.y>1);
 assert.deepEqual(applyRoomCommand(room,p,{type:'fightFlightFire',down:true},2),{});
 assert.equal(m.ammo,17);assert.equal(room.fightFlightProjectiles.size,1);
 assert.equal(applyRoomCommand(room,p,{type:'fightFlightFire',down:true},2.01).rejected,undefined);
 assert.equal(room.fightFlightProjectiles.size,1,'a repeated key-down cannot duplicate a bolt');
 for(let tick=1;tick<=15;tick++)stepFightFlightWeapons(room,m,1/30,2+tick/30);
 assert.equal(m.shotSeq,4,'7Hz cap over half a second: shots at 0,.143,.286,.429');
 assert.equal(m.ammo>=0,true);
 assert.equal(serializeSnapshot(room,2.5).fightFlightProjectiles.length,4);
 requestFightFlightFire(room,m,p,false,2.5);
 const noMore=m.shotSeq;stepFightFlightWeapons(room,m,1/30,2.7);assert.equal(m.shotSeq,noMore);
});
test('Fractional 30Hz ammunition production first repays retained debt before fresh usable bolts',()=>{
 const m=createFightFlight();
 m.ammo=0;m.ammoDebt=3;m.ammoProduction=0;
 for(let i=0;i<45;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammoDebt,0);assert.equal(m.ammo,0);
 for(let i=0;i<15;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammo,1);assert.equal(m.ammoDebt,0);
 for(let i=0;i<300;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammo,FLIGHT_REPEATER.capacity);
 assert.ok(m.ammoProduction>=0&&m.ammoProduction<1);
});
test('No negative reserve under prolonged held 7Hz fire and no full magazine prerequisite after depletion',()=>{
 const {room,m,p}=setup();m.ammo=1;
 requestFightFlightFire(room,m,p,true,2);
 assert.equal(m.ammo,0);
 const seq=m.shotSeq;
 for(let i=1;i<=15;i++)stepFightFlightWeapons(room,m,1/30,2+i/30);
 assert.ok(m.shotSeq>seq,'one newly generated bolt is independently fireable');
 assert.ok(m.ammo>=0);
 for(let i=16;i<=300;i++)stepFightFlightWeapons(room,m,1/30,2+i/30);
 assert.ok(m.ammo>=0&&m.ammo<=FLIGHT_REPEATER.capacity);
 assert.ok(m.shotSeq<=1+Math.floor(300/30*2+.001),'depleted production cannot conjure extra ammo');
});
test('Unauthorized fire cannot create a projectile or change another pilot machine reserve',()=>{
 const {room,m,p}=setup();
 const guest=room.addPlayer({id:'guest',token:'guest',name:'Intruder'},0);
 guest.alive=true;guest.position={x:0,y:0,z:1};
 assert.ok(applyRoomCommand(room,guest,{type:'fightFlightFire',down:true},2).rejected);
 assert.equal(room.fightFlightProjectiles.size,0);assert.equal(m.ammo,FLIGHT_REPEATER.capacity);
 assert.deepEqual(applyRoomCommand(room,p,{type:'fightFlightFire',down:true},2),{});
 assert.ok(room.fightFlightProjectiles.size===1);
});
test('Actual swept bolt hits body along authoritative world line, not a radius-based pulse',()=>{
 const {room,m,p}=setup();
 const victim=room.addServerActor({id:'target',name:'Target',actorKind:'dummy'},0);
 victim.position={x:-.65,y:0,z:-7};victim.spawnProtectionUntil=0;victim.alive=true;victim.guarding=false;
 const health=victim.health;
 assert.equal(requestFightFlightFire(room,m,p,true,2),true);
 for(let i=1;i<=7;i++)stepFightFlightProjectiles(room,1/30,2+i/30);
 assert.equal(victim.health,health-4);
 assert.ok(room.events.some(e=>e.type==='fightFlightBoltImpact'&&e.victimId===victim.id));
});

test('Repeater damage is 4 close, 2 far; fully active Sheathe reduces close contact to exactly 2',()=>{
  for(const [distance,armored,expected] of [[7,false,4],[28,false,2],[7,true,2],[28,true,2]]){
    const {room,m,p}=setup();
    const victim=room.addServerActor({id:'target',name:'Target',actorKind:'dummy'},0);
    victim.position={x:-.65,y:0,z:-distance};victim.spawnProtectionUntil=0;victim.alive=true;
    if(armored)victim.steel=callSteel(2);
    requestFightFlightFire(room,m,p,true,2);
    for(let i=1;i<=20;i++)stepFightFlightProjectiles(room,1/30,2+i/30);
    assert.equal(victim.health,100-expected,`distance ${distance}, Steel ${armored}`);
    assert.equal(room.events.find(e=>e.type==='fightFlightBoltImpact'&&e.victimId===victim.id)?.damage,expected);
  }
});
test('Server projectile starts at the v2.6 articulated muzzle and follows its pitched aim',()=>{
  const {room,m,p}=setup();
  m.x=4;m.y=5;m.z=-2;m.heading=-.7;m.runPitch=.24;
  p.input.yaw=-.35;p.input.pitch=.1;
  const aim=flightRepeaterAim(m,p.input);
  assert.ok(aim.pitch<=FLIGHT_REPEATER.maxPitch);
  requestFightFlightFire(room,m,p,true,2);
  const q=[...room.fightFlightProjectiles.values()][0];
  const origin=flightMuzzle(m,aim),direction=flightDirection(m,aim);
  for(const axis of ['x','y','z']){
    assert.ok(Math.abs(q.position[axis]-origin[axis])<1e-8,`muzzle ${axis}`);
    assert.ok(Math.abs(q.velocity[axis]/FLIGHT_REPEATER.speed-direction[axis])<1e-8,`vector ${axis}`);
  }
  assert.ok(Math.abs(Math.hypot(...Object.values(direction))-1)<1e-8);
  assert.equal(m.crossbowYaw,aim.yaw);assert.equal(m.crossbowPitch,aim.pitch);
});
test('Offensive machine pitch compensates within joint limits, never shoots through an invented turret angle',()=>{
  const m=createFightFlight({heading:0});m.runPitch=.3;
  const aim=flightRepeaterAim(m,{yaw:0,pitch:0});
  assert.ok(Math.abs(flightDirection(m,aim).y)<1e-9,'horizontal reticle stays level when crossbow can compensate');
  const limit=flightRepeaterAim(m,{yaw:Math.PI,pitch:1});
  assert.ok(Math.abs(limit.yaw-FLIGHT_REPEATER.maxTraverse)<1e-8);
  assert.equal(limit.pitch,FLIGHT_REPEATER.maxPitch);
  m.terminalDive={heading:0};m.runPitch=.65;
  const committed=flightRepeaterAim(m,{yaw:0,pitch:1});
  assert.ok(committed.pitch<0,'a terminal dive cannot point its crossbow upward');
  assert.ok(flightDirection(m,committed).y<0,'actual launch vector also descends');
});

test('Visual aim, muzzle calculation, projectile trajectory, and close target hit agree across nonzero heading, pitch, and traverse limits', () => {
  const { room, m, p } = setup();
  // Set arbitrary nonzero heading and run pitch
  m.x = 2.5; m.y = 1.8; m.z = -5.0;
  m.heading = 1.15; // ~66 deg
  m.runPitch = 0.18; // ~10 deg

  // 1. Aim within traverse and elevation limits
  p.input.yaw = 1.30; // ~74 deg (delta +0.15 rad, within maxTraverse 0.436 rad)
  p.input.pitch = -0.05;

  const aim = flightRepeaterAim(m, p.input);
  const muzzle = flightMuzzle(m, aim);
  const dir = flightDirection(m, aim);

  // Place a close target directly along the muzzle line at distance 3.5m
  const victim = room.addServerActor({ id: 'close-target', name: 'Close Target', actorKind: 'dummy' }, 0);
  victim.alive = true;
  victim.position = {
    x: muzzle.x + dir.x * 3.5,
    y: muzzle.y + dir.y * 3.5 - 0.9, // standing body center
    z: muzzle.z + dir.z * 3.5,
  };
  victim.spawnProtectionUntil = 0;
  const healthBefore = victim.health;

  assert.equal(requestFightFlightFire(room, m, p, true, 2), true);
  const bolt = [...room.fightFlightProjectiles.values()][0];
  assert.ok(bolt);

  // Muzzle agreement
  assert.ok(Math.hypot(bolt.position.x - muzzle.x, bolt.position.y - muzzle.y, bolt.position.z - muzzle.z) < 1e-6);

  // Step projectile forward to hit the close target
  for (let i = 1; i <= 5; i++) stepFightFlightProjectiles(room, 1 / 30, 2 + i / 30);
  assert.equal(victim.health, healthBefore - 4, 'Close target receives full 4 damage');
  assert.ok(room.events.some(e => e.type === 'fightFlightBoltImpact' && e.victimId === victim.id));

  // 2. Aim beyond traverse limit (attempting +0.8 rad, limited to maxTraverse = 25 deg = 0.4363 rad)
  p.input.yaw = m.heading + 0.8;
  const limitedAim = flightRepeaterAim(m, p.input);
  const traverseOffset = Math.atan2(Math.sin(limitedAim.yaw - m.heading), Math.cos(limitedAim.yaw - m.heading));
  assert.ok(Math.abs(traverseOffset - FLIGHT_REPEATER.maxTraverse) < 1e-6, 'Traverse clamped to exact limit');

  // 3. Multiplayer latency and snapshot replication:
  // Serialize snapshot and verify remote client receives exact crossbowYaw and crossbowPitch
  const snap = serializeSnapshot(room, 2.5);
  assert.ok(snap.fightFlight);
  assert.equal(snap.fightFlight.crossbowYaw, m.crossbowYaw);
  assert.equal(snap.fightFlight.crossbowPitch, m.crossbowPitch);
});


test('Near-range camera ray is converged from the genuine physical offset muzzle, not substituted for it',()=>{
 const m=createFightFlight({x:0,y:0,z:0,heading:0});
 const target={x:0,y:1.60,z:-5};
 const aim=flightRepeaterAim(m,{yaw:0,pitch:0,siegeTarget:target});
 assert.equal(aim.limited,false);
 const muzzle=flightMuzzle(m,aim),dir=flightDirection(m,aim);
 const toTarget={x:target.x-muzzle.x,y:target.y-muzzle.y,z:target.z-muzzle.z};
 assert.ok(Math.hypot(...Object.values(toTarget))>0);
 const length=Math.hypot(...Object.values(toTarget));
 assert.ok(Math.abs(dir.x-toTarget.x/length)<.015);
 assert.ok(Math.abs(dir.y-toTarget.y/length)<.015);
 assert.ok(Math.abs(dir.z-toTarget.z/length)<.015);
 assert.ok(Math.hypot(muzzle.x,muzzle.y-1.60,muzzle.z+5)>1);
});
test('Unreachable near/parallax aim is bounded and exports the reachable physical aim point',()=>{
 const m=createFightFlight({x:0,y:0,z:0,heading:0});
 const aim=flightRepeaterAim(m,{yaw:0,pitch:0,siegeTarget:{x:0,y:2.5,z:-.8}});
 assert.equal(aim.limited,true);
 assert.ok(aim.missDistance>.08);
 assert.ok(Math.abs(aim.yaw-m.heading)<=FLIGHT_REPEATER.maxTraverse+1e-9);
 assert.ok(aim.pitch<=FLIGHT_REPEATER.maxPitch);
 assert.ok(Number.isFinite(aim.reachableAimPoint.x));
});
