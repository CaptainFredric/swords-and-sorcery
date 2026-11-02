import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../src/server.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
test('two real clients agree on pitched Dash, release and a falling wreck',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1'});await game.start();const sockets=[];let inputTimer;
 async function client(){const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);sockets.push(ws);const q=[];
  ws.addEventListener('message',e=>q.push(JSON.parse(String(e.data))));await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  return{send:m=>ws.send(JSON.stringify(m)),wait:async pred=>{const end=Date.now()+5500;while(Date.now()<end){const i=q.findIndex(pred);if(i>=0)return q.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Flight repair network timeout: '+JSON.stringify(q.filter(m=>m.type==='snapshot').at(-1)?.fightFlight));}};}
 try{
  const a=await client();a.send({type:'createRoom',name:'Flight pilot'});const joined=await a.wait(m=>m.type==='joined');
  const b=await client();b.send({type:'joinRoom',code:joined.roomCode,name:'Flight witness'});const guest=await b.wait(m=>m.type==='joined');
  const room=game.roomManager.findByCode(joined.roomCode);room.startMatch(game.now());
  // This wire scenario needs a landing surface after the fast horizontal run.
  // The default arena ends before the falling wreck comes to rest.
  room.world={...room.world,floors:[{center:[0,0,0],size:[500,1,500],y:0}]};
  const p=room.players.get(joined.playerId);p.spawnProtectionUntil=0;p.position={x:0,y:0,z:1};p.ultimate='sunder';p.prowess=100;
  room.players.get(guest.playerId).position={x:15,y:0,z:0};
  room.fightFlight=createFightFlight({id:'flight-wire-repair'});
  a.send({type:'siegeOperate'});await b.wait(m=>m.type==='snapshot'&&m.fightFlight?.operatorId===p.id);
  const m=room.fightFlight;m.y=18;m.grounded=false;m.mode='AIRBORNE';m.rotorPowered=true;m.rotorAngularVelocity=Math.PI*15;
  let pitch=-.55;
  const sendInput=()=>a.send({type:'input',forward:0,right:0,yaw:0,pitch,flightRise:false,flightLower:false});sendInput();
  inputTimer=setInterval(sendInput,80);a.send({type:'flightDash',down:true});
  const down=await b.wait(s=>s.type==='snapshot'&&s.fightFlight?.offensiveRun&&s.fightFlight.velocity.y< -3);
  const same=await a.wait(s=>s.type==='snapshot'&&s.tick===down.tick);
  assert.deepEqual(same.fightFlight,down.fightFlight,'one physical authority for both recipients');
  assert.ok(down.fightFlight.runPitch>.6);assert.ok(Number.isFinite(down.fightFlight.runAnimationStartedAt));
  pitch=.6;sendInput();const up=await b.wait(s=>s.type==='snapshot'&&s.tick>down.tick&&s.fightFlight?.offensiveRun&&s.fightFlight.velocity.y>3);
  assert.ok(up.fightFlight.runPitch<.15);
  a.send({type:'flightDash',down:false});const ended=await b.wait(s=>s.type==='snapshot'&&s.tick>up.tick&&s.fightFlight?.flightDashHeld===false&&!s.fightFlight.offensiveRun);assert.ok(ended.fightFlight.runAnimationEndedAt>=down.fightFlight.runAnimationStartedAt);
  clearInterval(inputTimer);inputTimer=null;
  damageFightFlight(room,m,1000,guest.playerId,'sword',game.now(),{componentId:'main',point:{x:m.x,y:m.y+1,z:m.z}});
  const wreck=await b.wait(s=>s.type==='snapshot'&&s.fightFlight?.mode==='DESTROYED');
  assert.equal(wreck.fightFlight.wreckVisualExpired,false);assert.equal(wreck.fightFlight.wreckAirborne,true);
  const falling=await a.wait(s=>s.type==='snapshot'&&s.fightFlight?.mode==='DESTROYED'&&s.fightFlight.y<wreck.fightFlight.y-.5);
  assert.equal(falling.fightFlight.operatorId,null);assert.equal(falling.fightFlight.wreckWasAirborne,true);
  const landed=await b.wait(s=>s.type==='snapshot'&&Number.isFinite(s.fightFlight?.wreckImpactAt));
  const observed=await a.wait(s=>s.type==='snapshot'&&s.tick===landed.tick);assert.equal(observed.fightFlight.wreckImpactAt,landed.fightFlight.wreckImpactAt);
  assert.equal(falling.fightFlight.operatorId,null);assert.equal(falling.fightFlight.destroyedAt,wreck.fightFlight.destroyedAt);
 }finally{if(inputTimer)clearInterval(inputTimer);for(const ws of sockets)ws.close();await game.stop();}
});
