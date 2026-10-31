import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {stepTerminalPreparation,terminalFlightSteps,TERMINAL} from '../../shared/sim/fightFlightTerminal.mjs';

function startDive({floor=true,altitude=1.7}={}){
  const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
  room.world={floors:floor?[{id:'grass',center:[0,-.1,0],size:[200,.2,200],y:0}]:[],
    solids:[],ramps:[],abyssY:-500,spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
  room.state='PLAYING';
  const player=room.addPlayer({id:'terminal-pilot',token:'token',name:'Pilot'},0);
  Object.assign(player,{alive:true,prowess:100,ultimate:'chivalry',ultimateState:null,spawnProtectionUntil:0,
    position:{x:0,y:altitude,z:0},operatingFightFlightId:'test-flight'});
  player.input={yaw:0,pitch:0,jump:false,crouch:false,forward:0,right:0};
  const m=createFightFlight({id:'test-flight',x:0,y:altitude,z:0,heading:0});
  Object.assign(m,{operatorId:player.id,grounded:false,mode:'AIRBORNE',velocity:{x:0,y:0,z:-1}});
  room.fightFlight=m;
  const command=(type,down,at)=>applyRoomCommand(room,player,{type,down},at);
  assert.deepEqual(command('flightDash',true,1),{});
  assert.deepEqual(command('flightUltimateHold',true,1.04),{});
  stepTerminalPreparation(room,m,1.04);
  stepTerminalPreparation(room,m,2.08);
  assert.ok(m.terminalDive);
  return {room,player,m};
}

test('One ordinary 30Hz host tick remains one physical step; stalls never spawn unbounded work',()=>{
  const {m}=startDive();
  assert.equal(terminalFlightSteps(m.terminalDive,2.08+1/30,1/30),1);
  assert.equal(terminalFlightSteps(m.terminalDive,8.5,1/30),45);
  assert.equal(terminalFlightSteps(m.terminalDive,8.5+1/30,1/30),1);
});

test('A six-second LocalHost wall-clock stall cannot detonate a dive in midair before physical ground contact',()=>{
  const {room,m}=startDive({altitude:1.7});
  const committed={x:m.x,y:m.y,z:m.z};
  // Deliberately jump past the nominal wall-clock expiration while delivering
  // only ONE fixed 1/30s room update: the actual Chrome failure mode.
  stepRoom(room,1/30,8.5,room.world);
  assert.equal(m.terminalDive.resolved,true,'the catch-up trajectory meets actual ground');
  assert.ok(m.terminalDive.impactAt!=null,'actual physical contact, not expired wall time');
  assert.ok(m.terminalDive.simulatedSec<=2,'should resolve on descent, not an arbitrary fuse');
  assert.equal(m.mode,'DESTROYED');
  assert.equal(m.y,0);
  assert.ok(Math.hypot(m.x-committed.x,m.z-committed.z)>.1,'the machine travels under momentum');
  assert.equal(room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
  assert.equal(room.flightBurnZones.length,1);
  assert.equal(room.flightBurnZones[0].point.y,0);
});

test('A genuine bottomless trajectory still resolves after bounded simulated flight rather than wall-clock expiry',()=>{
  const {room,m}=startDive({floor:false,altitude:250});
  stepRoom(room,1/30,8.5,room.world);
  assert.equal(m.terminalDive.resolved,false,'no phantom impact on non-existent ground');
  assert.ok(m.terminalDive.simulatedSec>1);
  for(let t=10;t<=15&&!m.terminalDive.resolved;t+=1.5)
    stepRoom(room,1/30,t,room.world);
  assert.equal(m.terminalDive.resolved,true,'still enforces finite simulated timeout');
  assert.equal(m.terminalDive.impactAt,null);
  assert.equal(room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
  assert.equal(room.flightBurnZones.length,0,'an explosion above a bottomless abyss cannot leave hovering ground fire');
});
