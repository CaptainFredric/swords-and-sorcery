import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

function opened(ws) {
  return new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
}
function awaitMessage(ws,predicate,timeout=4000) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.removeEventListener('message',onMessage);reject(new Error('Missing expected full-room network update'));},timeout);
    const onMessage=event=>{
      const m=JSON.parse(String(event.data));
      if(!predicate(m))return;
      clearTimeout(timer);ws.removeEventListener('message',onMessage);resolve(m);
    };
    ws.addEventListener('message',onMessage);
  });
}
function send(ws,m){ ws.send(JSON.stringify(m)); }

test('six independent FFA clients receive authoritative movement and a disconnected fighter can resume', { timeout:18000 }, async t=>{
  const server=createGameServer({port:0,host:'127.0.0.1'});
  await server.start();
  t.after(async()=>server.stop());
  const url=`ws://127.0.0.1:${server.address().port}/ws`;
  const clients=[];
  const connect=async()=>{
    const ws=new WebSocket(url);
    clients.push(ws);
    await opened(ws);
    return ws;
  };
  t.after(()=>{for(const ws of clients)ws.close();});
  const first=await connect();
  const firstJoin=awaitMessage(first,m=>m.type==='joined');
  send(first,{type:'createRoom',name:'First'});
  const info=await firstJoin;
  for(let i=1;i<6;i++){
    const ws=await connect();
    const joined=awaitMessage(ws,m=>m.type==='joined');
    send(ws,{type:'joinRoom',code:info.roomCode,name:'Knight'+i});
    await joined;
  }
  const room=server.roomManager.findByCode(info.roomCode);
  assert.equal(room.players.size,6);
  const start=awaitMessage(first,m=>m.type==='lobby'&&m.roomState==='COUNTDOWN');
  for(const ws of clients)send(ws,{type:'ready',ready:true});
  await start;
  room.countdownEndsAt=server.now()-.001;
  await awaitMessage(first,m=>m.type==='snapshot'&&m.roomState==='PLAYING');

  let latest=null, received=0;
  const observe=e=>{
    const m=JSON.parse(String(e.data));
    if(m.type==='snapshot'&&m.roomCode===room.code){latest=m;received++;}
  };
  first.addEventListener('message',observe);
  for(let k=0;k<28;k++) {
    for(let i=0;i<6;i++)send(clients[i],{
      type:'input',seq:k+1,yaw:i*Math.PI/3,pitch:0,forward:1,right:k%3===0?.4:0,
      sprint:k%10<7,jump:k===3,crouch:false,
    });
    await new Promise(resolve=>setTimeout(resolve,55));
  }
  first.removeEventListener('message',observe);
  assert.ok(received>=15,'actual network delivery continues at six clients');
  assert.equal(latest.players.length,6,'everyone remains in the same authoritative room');
  for(const p of latest.players)assert.ok(Object.values(p.position).every(Number.isFinite),'no corrupt transforms');

  // Losing the connection must not duplicate a Spellblade or send resumed input
  // to an obsolete actor: the old token still owns the authoritative position.
  const old=clients[5],id=[...room.players.values()].find(p=>p.name==='Knight5').id;
  const player=room.players.get(id),token=player.token;
  old.close();
  await new Promise(resolve=>setTimeout(resolve,100));
  const resumed=await connect();
  const resumedJoined=awaitMessage(resumed,m=>m.type==='joined'&&m.playerId===id);
  send(resumed,{type:'resume',token});
  await resumedJoined;
  assert.equal(room.players.get(id),player,'no duplicate actor after reconnect');
  assert.equal(room.players.size,6);
  const snapshot=await awaitMessage(resumed,m=>m.type==='snapshot'&&m.players.some(p=>p.id===id));
  assert.ok(snapshot.tick>=latest.tick,'rejoining client receives advancing state');
});
