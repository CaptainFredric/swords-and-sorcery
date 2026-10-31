import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../src/server.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';

async function connect(game,sockets){
 const ws=new WebSocket('ws://127.0.0.1:'+game.address().port+'/ws');
 sockets.push(ws);const queue=[];
 ws.addEventListener('message',e=>queue.push(JSON.parse(String(e.data))));
 await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 return {ws,send:m=>ws.send(JSON.stringify(m)),wait:async check=>{
   const deadline=Date.now()+5000;
   while(Date.now()<deadline){const i=queue.findIndex(check);if(i>=0)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,15));}
   throw Error('Shared Practice network timeout');
 }};
}

test('Two genuine socket clients join one authoritative Shared Practice room and retain independent controls',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1'});await game.start();const sockets=[];
 try{
  const host=await connect(game,sockets);
  host.send({type:'createSharedPracticeRoom',name:'Host',worldId:'castleward'});
  const joined=await host.wait(m=>m.type==='joined');
  assert.equal(joined.mode,'PRACTICE');assert.equal(joined.sharedPractice,true);
  assert.equal(joined.isPrivate,true);assert.equal(joined.sharedPracticeHostId,joined.playerId);
  const room=game.roomManager.findByCode(joined.roomCode);
  assert.equal(room.mode,'PRACTICE');assert.equal(room.state,'PLAYING');
  const guest=await connect(game,sockets);
  guest.send({type:'joinRoom',code:joined.roomCode,name:'Guest'});
  const second=await guest.wait(m=>m.type==='joined');
  assert.equal(second.mode,'PRACTICE');assert.equal(second.sharedPractice,true);
  assert.equal(second.players.filter(p=>p.actorKind==='human').length,2);
  assert.equal(room.humanCount(),2);
  guest.send({type:'practiceSetDummyMode',mode:'GUARDING'});
  assert.match((await guest.wait(m=>m.type==='error')).message,/host/i);
  host.send({type:'practiceSetDummyMode',mode:'GUARDING'});
  await guest.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.practiceMode==='GUARDING'));
  guest.send({type:'practiceReadyUltimate'});
  await host.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.id===second.playerId&&p.prowess===100));
  room.world={solids:[],ramps:[],floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-30};
  const pilot=room.players.get(joined.playerId),walker=room.players.get(second.playerId);
  pilot.position={x:0,y:0,z:1};pilot.input={...pilot.input,yaw:0,pitch:0};
  walker.position={x:0,y:0,z:6};walker.input={...walker.input,yaw:0,pitch:0};
  room.fightFlight=createFightFlight({x:0,y:0,z:0,id:'shared-flight'});
  host.send({type:'siegeOperate'});
  await guest.wait(m=>m.type==='snapshot'&&m.fightFlight?.operatorId===pilot.id);
  guest.send({type:'input',forward:1,right:0,jump:false,crouch:false,yaw:0,pitch:0});
  const moving=await host.wait(m=>m.type==='snapshot'&&m.fightFlight?.operatorId===pilot.id&&m.players.some(p=>p.id===walker.id&&p.position.z<5.5));
  assert.equal(moving.fightFlight.operatorId,pilot.id);
  assert.equal(moving.players.find(p=>p.id===pilot.id).operatingFightFlightId,room.fightFlight.id);
  assert.ok(moving.players.find(p=>p.id===walker.id).position.z<5.5);
  host.ws.close();
  const transferred=await guest.wait(m=>m.type==='lobby'&&m.sharedPracticeHostId===walker.id);
  assert.equal(transferred.sharedPracticeHostId,walker.id);
  assert.equal(room.fightFlight.operatorId,null,'disconnect safely releases shared machine');
 }finally{for(const ws of sockets)ws.close();await game.stop();}
});

test('A solo Practice code is not an invitation to a multiplayer room',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1'});await game.start();const sockets=[];
 try{
  const solo=game.roomManager.createSoloRoom('PRACTICE',game.now(),'castleward');
  const client=await connect(game,sockets);
  client.send({type:'joinRoom',name:'Uninvited',code:solo.code});
  assert.match((await client.wait(m=>m.type==='error')).message,/not joinable/i);
 }finally{for(const ws of sockets)ws.close();await game.stop();}
});
