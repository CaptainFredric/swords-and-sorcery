import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';

const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
function waitOpen(ws) {
  return new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
}
function waitFor(ws,predicate,timeoutMs=3500) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.removeEventListener('message',onMessage);reject(new Error('Timed out awaiting multiplayer state'));},timeoutMs);
    function onMessage(event) {
      const msg=JSON.parse(String(event.data));
      if (!predicate(msg)) return;
      clearTimeout(timer);
      ws.removeEventListener('message',onMessage);
      resolve(msg);
    }
    ws.addEventListener('message',onMessage);
  });
}
function send(ws,body) { ws.send(JSON.stringify(body)); }

test('real websocket players and four bots remain grounded in populated 3v3 battles on both worlds', {timeout:20000}, async t=>{
  const game=createGameServer({port:0,host:'127.0.0.1'});
  await game.start();
  t.after(async()=>game.stop());
  const url=`ws://127.0.0.1:${game.address().port}/ws`;

  for(const worldId of ['bastion-breach','high-grounds']) {
    const leader=new WebSocket(url), ally=new WebSocket(url);
    await Promise.all([waitOpen(leader),waitOpen(ally)]);
    try {
      const leaderJoined=waitFor(leader,m=>m.type==='joined');
      send(leader,{type:'createBreakthroughRoom',worldId,name:'Leader',teamSize:3});
      const joined=await leaderJoined;
      const allyJoined=waitFor(ally,m=>m.type==='joined');
      send(ally,{type:'joinRoom',code:joined.roomCode,name:'Ally'});
      await allyJoined;
      const room=game.roomManager.findByCode(joined.roomCode);
      assert.equal(room.players.size,6,'two real websocket clients with four bots');
      const countdown=waitFor(leader,m=>m.type==='lobby'&&m.roomState==='COUNTDOWN');
      send(leader,{type:'ready',ready:true});
      send(ally,{type:'ready',ready:true});
      await countdown;
      room.countdownEndsAt=game.now()-.01;
      await waitFor(leader,m=>m.type==='snapshot'&&m.roomState==='PLAYING');

      const snapshots=[];
      const collect=e=>{
        const m=JSON.parse(String(e.data));
        if(m.type==='snapshot'&&m.roomCode===room.code&&m.roomState==='PLAYING') snapshots.push(m);
      };
      leader.addEventListener('message',collect);
      for(let i=0;i<20;i++){
        for(const ws of [leader,ally]){
          send(ws,{type:'input',seq:i+1,forward:1,right:0,yaw:0,pitch:0,
            sprint:i%6<3,jump:i%10===0,crouch:false});
        }
        await delay(70);
      }
      leader.removeEventListener('message',collect);
      assert.ok(snapshots.length>=10,`${worldId}: actual network snapshots continued`);
      assert.ok(snapshots.at(-1).tick>snapshots[0].tick,`${worldId}: server tick moved`);
      assert.ok([...room.players.values()].some(p=>p.actorKind==='bot'), 'AI actors still participate');
      for(const snap of snapshots){
        for(const p of snap.players) {
          assert.ok([p.position.x,p.position.y,p.position.z].every(Number.isFinite),`${worldId}: finite transforms`);
          if(!p.alive||p.actorKind!=='human'||!p.grounded)continue;
          const ground=surfaceHeightAt(p.position.x,p.position.z,p.position.y+.2,room.world);
          if(ground!==null) assert.ok(Math.abs(p.position.y-ground)<.21,`${worldId}: grounded feet match surface`);
        }
      }
    } finally {leader.close();ally.close();}
  }
  const health=await (await fetch(`http://127.0.0.1:${game.address().port}/health`)).json();
  assert.ok(health.simulation.steps>0,'scheduler actually drove multiplayer');
});
