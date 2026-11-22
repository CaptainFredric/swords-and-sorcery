import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalHost} from './LocalHost.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {tryUltimate,releaseOneHitCharge} from '../../shared/sim/combat.mjs';

test('real LocalHost keeps publishing snapshots during Full Gale+Lightning versus an active flight pilot',()=>{
 let time=1;
 const host=new LocalHost({now:()=>time,every:()=>0,cancel:()=>{},later:fn=>fn(),storage:null});
 const failures=[],ticks=[];
 host.on('error',m=>failures.push(m.message));
 host.on('snapshot',s=>ticks.push(s.tick));
 try{
  host.startSolo('PRACTICE','Observer','castleward');
  const room=host.room,player=host.player;
  room.state='PLAYING';
  player.health=1000;player.maxHealth=1000;player.spawnProtectionUntil=0;
  player.ultimate='one_hit_of_wonders';player.prowess=100;
  assert.deepEqual(applyRoomCommand(room,player,{type:'practiceSiegeOpponent',
    action:'spawn',machine:'fight-and-flight',difficulty:'formidable',
    skill:'narrowToOne'},2),{});
  assert.deepEqual(applyRoomCommand(room,player,{type:'practiceOneHit',
    action:'preset',preset:'full'},2.1),{});
  const machine=room.fightFlight;
  player.input.yaw=Math.atan2(-(machine.x-player.position.x),
    -(machine.z-player.position.z));
  player.input.pitch=.55;player.yaw=player.input.yaw;
  assert.equal(tryUltimate(room,player.id,3,{held:true}),true);
  for(let i=0;i<24;i++){time=3+i/30;host.tick(time);}
  releaseOneHitCharge(room,player.id,3.8,
    {yaw:player.yaw,pitch:player.input.pitch});
  for(let i=0;i<165;i++){time=3.8+i/30;host.tick(time);}
  assert.equal(failures.length,0,'no authoritative exception should interrupt snapshots');
  assert.equal(host.lastSimulationFault,null);
  assert.ok(ticks.length>160,'every ongoing local match step still publishes an authoritative snapshot');
  assert.ok(ticks.at(-1)>ticks[0]+160);
  assert.ok(room.players.get(machine.operatorId)?.practiceSiegeOperator,
    'operator remains real server-owned actor');
 }finally{host.close();}
});
