import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';
import { damageStructure } from '../../shared/sim/structures.mjs';
import { soFistOperator } from '../../shared/sim/soFistication.mjs';

// Initial fixture positions are arranged through authority. Joining, mounting,
// disconnection and resuming all use actual WebSocket messages and snapshots.
test('late network joins and token resume inherit the breach and release operator ownership', async () => {
  const game=createGameServer({port:0,host:'127.0.0.1'});await game.start();
  const room=game.roomManager.createBreakthroughRoom(game.now(),true,'bastion-breach');
  const sockets=[];
  const connect=async()=>{
    const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);sockets.push(ws);
    const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(String(e.data))));
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async predicate=>{
      const limit=Date.now()+2500;while(Date.now()<limit){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,15));}throw Error('Network state timeout');
    }};
  };
  try {
    const a=await connect();a.send({type:'joinRoom',code:room.code,name:'Driver'});
    const joined=await a.wait(m=>m.type==='joined');room.startMatch(game.now());
    const player=room.players.get(joined.playerId),machine=room.soFistication;
    player.position=soFistOperator(machine,room.world);
    a.send({type:'siegeOperate'});
    await a.wait(m=>m.type==='snapshot'&&m.soFistication?.operatorId===player.id);
    damageStructure(room,'assault-barricade',600,player.id,'so-fist',game.now(),{raw:true});
    const b=await connect();b.send({type:'joinRoom',code:room.code,name:'Late join'});
    await b.wait(m=>m.type==='joined');
    const snapshot=await b.wait(m=>m.type==='snapshot'&&m.structures?.entities['assault-barricade'].health===0);
    assert.equal(snapshot.soFistication.id,machine.id);
    assert.equal(snapshot.objective.index,0);
    assert.ok(room.world.solids.some(s=>s.id==='gatehouse-honorable-gate-closed'));
    assert.equal(room.world.solids.some(s=>s.id==='cover-approach-breastwork'),false);
    a.ws.close();await b.wait(m=>m.type==='snapshot'&&m.soFistication?.operatorId===null);
    const resumed=await connect();resumed.send({type:'resume',token:joined.token});
    const rejoined=await resumed.wait(m=>m.type==='joined');assert.equal(rejoined.playerId,joined.playerId);
    const after=await resumed.wait(m=>m.type==='snapshot');
    assert.equal(after.structures.entities['assault-barricade'].health,0);
    assert.equal(after.soFistication.id,machine.id);
    assert.equal(after.soFistication.operatorId,null);
  } finally {for(const ws of sockets)ws.close();await game.stop();}
});
