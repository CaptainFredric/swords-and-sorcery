import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
function inbox(ws){const queue=[];ws.addEventListener('message',e=>queue.push(JSON.parse(e.data)));return async(type,find=()=>true)=>{const end=Date.now()+4000;while(Date.now()<end){const i=queue.findIndex(m=>m.type===type&&find(m));if(i>=0)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);};}
const send=(client,message)=>client.ws.send(JSON.stringify(message));
test('real room joins carry full rules immediately and human arrivals replace bots before host swaps',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-controls-')),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(dir)});
 await game.start();const clients=[];t.after(async()=>{clients.forEach(c=>c.ws.close());await game.stop();fs.rmSync(dir,{recursive:true,force:true});});
 async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`),next=inbox(ws);await new Promise(r=>ws.addEventListener('open',r,{once:true}));const c={ws,next};clients.push(c);return c;}
 const host=await connect();send(host,{type:'createBreakthroughRoom',name:'Host',teamSize:2,worldId:'outerworks'});
 const joined=await host.next('joined');
 assert.equal(joined.isPrivate,true);assert.equal(joined.teamSize,2);assert.equal(joined.worldId,'outerworks');assert.equal(joined.players.length,4);
 const guest=await connect();send(guest,{type:'joinRoom',name:'Guest',code:joined.roomCode});const entry=await guest.next('joined');
 assert.equal(entry.players.filter(p=>p.actorKind==='human').length,2);assert.equal(entry.players.length,4);
 const before=entry.players.find(p=>p.id===entry.playerId).team;
 send(host,{type:'swapPlayers',firstId:joined.playerId,secondId:entry.playerId});
 const swapped=await guest.next('lobby',m=>m.players.find(p=>p.id===entry.playerId)?.team!==before);
 assert.equal(swapped.players.filter(p=>p.team==='ATTACKERS').length,2);
 send(guest,{type:'configureRoom',settings:{matchSeconds:420}});assert.match((await guest.next('error')).message,/host/i);
 send(host,{type:'configureRoom',settings:{matchSeconds:420}});await guest.next('lobby',m=>m.matchSeconds===420);
 send(host,{type:'ready',ready:true});send(guest,{type:'ready',ready:true});
 await guest.next('lobby',m=>m.roomState==='COUNTDOWN');
 const late=await connect();send(late,{type:'joinRoom',name:'Late',code:joined.roomCode});const lateJoin=await late.next('joined');assert.equal(lateJoin.players.filter(p=>p.actorKind==='human').length,3);
});
