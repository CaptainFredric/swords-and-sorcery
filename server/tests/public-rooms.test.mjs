import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';

function inbox(ws) {
  const queue=[];
  ws.addEventListener('message',e=>queue.push(JSON.parse(e.data)));
  return async (type, predicate=()=>true) => {
    const deadline=Date.now()+4500;
    while(Date.now()<deadline) {
      const index=queue.findIndex(item=>item.type===type&&predicate(item));
      if(index>=0) return queue.splice(index,1)[0];
      await new Promise(resolve=>setTimeout(resolve,12));
    }
    throw new Error('Missing '+type);
  };
}
const send=(client,message)=>client.ws.send(JSON.stringify(message));

test('public room browser respects mode, human seats and full-room state',()=>{
  const manager=new RoomManager();
  const ffa=manager.createCustomRoom({isPrivate:false,mode:'FFA',worldId:'ruined-keep'},0);
  const team=manager.createCustomRoom({isPrivate:false,mode:'BREAKTHROUGH',worldId:'outerworks',teamSize:2,botSkill:'champion'},0);
  const high=manager.createCustomRoom({isPrivate:false,mode:'HIGH_GROUNDS'},0);
  for(const [room,id] of [[ffa,'f'],[team,'t'],[high,'h']])room.addPlayer({id,token:id,name:id},0);
  team.provisionModeActors(0);
  high.provisionModeActors(0);
  const rows=manager.listPublicRooms(1);
  assert.deepEqual(new Set(rows.map(r=>r.mode)),new Set(['FFA','BREAKTHROUGH','HIGH_GROUNDS']));
  assert.equal(rows.find(r=>r.mode==='BREAKTHROUGH').players,1);
  assert.equal(rows.find(r=>r.mode==='BREAKTHROUGH').capacity,4);
  assert.equal(rows.find(r=>r.mode==='HIGH_GROUNDS').capacity,6);
  assert.equal(manager.quickPlay(2,'HIGH_GROUNDS').code,high.code,'mode-aware quick join chooses existing room');
  assert.equal(manager.quickPlay(2,'BREAKTHROUGH').code,team.code);
  assert.equal(manager.quickPlay(2,'FFA').code,ffa.code);
  for(const id of ['t2','t3','t4'])team.addPlayer({id,token:id,name:id},2);
  assert.equal(team.humanActorCount(),4);
  assert.equal(team.joinError(),'Room is full.');
  assert.equal(manager.listPublicRooms(3).some(r=>r.code===team.code),false);
  assert.throws(()=>manager.createCustomRoom({isPrivate:false,mode:'HIGH_GROUNDS',worldId:'ruined-keep'},3),/arena/i);
});

test('real WebSocket public team creation, browsing, host rules, bot replacement and reconnect',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'castleward-public-'));
  const server=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(dir)});
  await server.start();
  const clients=[];
  t.after(async()=>{clients.forEach(c=>c.ws.close());await server.stop();fs.rmSync(dir,{recursive:true,force:true});});
  const port=server.address().port;
  async function connect(){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const next=inbox(ws);
    await new Promise((resolve,reject)=>{
      ws.addEventListener('open',resolve,{once:true});
      ws.addEventListener('error',reject,{once:true});
    });
    const client={ws,next};clients.push(client);return client;
  }
  const host=await connect();
  send(host,{type:'createPublicRoom',name:'Host',settings:{
    mode:'BREAKTHROUGH',worldId:'outerworks',teamSize:2,botSkill:'champion',matchSeconds:420}});
  const owner=await host.next('joined');
  assert.equal(owner.isPrivate,false);
  assert.equal(owner.mode,'BREAKTHROUGH');
  assert.equal(owner.worldId,'outerworks');
  assert.equal(owner.botSkill,'champion');
  assert.equal(owner.matchSeconds,420);
  assert.equal(owner.players.filter(p=>p.actorKind==='bot').length,3);
  assert.equal(owner.hostId,owner.playerId);

  const guest=await connect();
  send(guest,{type:'listRooms'});
  const listed=await guest.next('roomList');
  const entry=listed.rooms.find(r=>r.code===owner.roomCode);
  assert.equal(entry.mode,'BREAKTHROUGH');
  assert.equal(entry.players,1,'bots do not fill public human slots');
  assert.equal(entry.capacity,4);
  send(guest,{type:'joinRoom',code:owner.roomCode,name:'Guest'});
  const joined=await guest.next('joined');
  assert.equal(joined.players.filter(p=>p.actorKind==='human').length,2);
  assert.equal(joined.players.length,4,'one bot is replaced by the joining human');

  send(guest,{type:'configureRoom',settings:{matchSeconds:900}});
  assert.match((await guest.next('error')).message,/host/i);
  send(guest,{type:'vote',key:'time',value:900});
  assert.match((await guest.next('error')).message,/valid setting|countdown/i);
  send(host,{type:'configureRoom',settings:{matchSeconds:480}});
  await guest.next('lobby',m=>m.matchSeconds===480);
  host.ws.close();
  await new Promise(resolve=>host.ws.addEventListener('close',resolve,{once:true}));
  send(guest,{type:'configureRoom',settings:{matchSeconds:600}});
  assert.match((await guest.next('error')).message,/host/i);
  const resumed=await connect();
  send(resumed,{type:'resume',token:owner.token});
  const restored=await resumed.next('joined');
  assert.equal(restored.playerId,owner.playerId,'same player and ownership through grace period');
  assert.equal(restored.hostId,owner.playerId);
  send(resumed,{type:'configureRoom',settings:{matchSeconds:540}});
  await guest.next('lobby',m=>m.matchSeconds===540);

  const high=await connect();
  send(high,{type:'quickPlay',name:'High',mode:'HIGH_GROUNDS'});
  const highJoined=await high.next('joined');
  assert.equal(highJoined.mode,'HIGH_GROUNDS');
  assert.notEqual(highJoined.roomCode,owner.roomCode);
  assert.equal(highJoined.worldId,'high-grounds');
});
