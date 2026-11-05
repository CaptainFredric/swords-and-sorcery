import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {stepRoom,killPlayer} from '../../shared/sim/combat.mjs';
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
  Object.assign(m,{operatorId:player.id,grounded:false,mode:'AIRBORNE',velocity:{x:0,y:0,z:-1},
    skill:{id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:25}});
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

test('A wall-clock stall advances physical motion but cannot trigger an airborne fuse',()=>{
  const {room,m}=startDive({altitude:12});
  const committed={x:m.x,y:m.y,z:m.z};
  stepRoom(room,1/30,8.5,room.world);
  assert.equal(m.terminalDive.resolved,false,'physical trajectory still has altitude');
  assert.ok(m.terminalDive.simulatedSec>1,'bounded catch-up advances actual flight');
  assert.ok(Math.hypot(m.x-committed.x,m.z-committed.z)>.1);
  assert.equal(room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,0);
  for(let t=10;t<=21&&!m.terminalDive.resolved;t+=1.5)stepRoom(room,1/30,t,room.world);
  assert.equal(m.terminalDive.resolved,true,'eventual ground collision ends the burning run');
  assert.ok(m.terminalDive.impactAt!=null);
  assert.equal(room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
});

test('An airborne bottomless run has no expiry explosion until leaving the kill plane',()=>{
  const {room,m}=startDive({floor:false,altitude:250});
  stepRoom(room,1/30,8.5,room.world);
  assert.equal(m.terminalDive.resolved,false);
  assert.ok(m.terminalDive.simulatedSec>1);
  for(let t=10;t<=17&&!m.terminalDive.resolved;t+=1.5)stepRoom(room,1/30,t,room.world);
  assert.equal(m.terminalDive.resolved,false,'there is no arbitrary five-second fuse');
  m.y=room.world.abyssY-1;
  stepRoom(room,1/30,20,room.world);
  assert.equal(m.terminalDive.resolved,true,'out-of-bounds resolves the terminal outcome');
  assert.equal(room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
  assert.equal(room.flightBurnZones.length,0,'no phantom ground fire beyond the abyss');
});

test('A pilot dying during a throttled dive cannot respawn before its eventual physical outcome',()=>{
  const {room,m,player}=startDive({floor:false,altitude:300});
  assert.equal(killPlayer(room,player.id,null,'test-bolt',2.1),true);
  assert.equal(player.alive,false);
  assert.equal(player.terminalRespawnDeferredFor,m.id);
  assert.ok(player.respawnAt>=m.terminalDive.expiresAt+30,'fatal dive remains pending through its bounded wall-time failsafe');
  stepRoom(room,1/30,8.5,room.world);
  assert.equal(m.terminalDive.resolved,false);
  assert.equal(player.alive,false,'late wall-clock tick must not revive the diving pilot');
  assert.equal(player.terminalRespawnDeferredFor,m.id);
});
