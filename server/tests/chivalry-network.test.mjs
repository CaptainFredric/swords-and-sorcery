import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';

function inbox(ws) {
  const messages=[];
  ws.addEventListener('message', e=>messages.push(JSON.parse(e.data)));
  return async (type, predicate=()=>true) => {
    const end=Date.now()+3500;
    while(Date.now()<end) {
      const i=messages.findIndex(m=>m.type===type && predicate(m));
      if(i>=0) return messages.splice(i,1)[0];
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error(`Missing ${type}`);
  };
}
const send=(ws,v)=>ws.send(JSON.stringify(v));
test('real host broadcasts atomic requested casts, startup selection, live aim and persistent identity to both clients', async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chivalry-wire-'));
  const game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(dir)});
  await game.start();
  const sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.close());await game.stop();fs.rmSync(dir,{recursive:true,force:true});});
  async function connect(){
    const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);sockets.push(ws);
    const next=inbox(ws);await new Promise(r=>ws.addEventListener('open',r,{once:true}));return {ws,next};
  }
  const a=await connect();
  send(a.ws,{type:'loadout',spell:'fireball',ultimate:'chivalry',preparedSpells:['fireball','frostfire','gale']});
  send(a.ws,{type:'createRoom',name:'Master'});
  const joined=await a.next('joined');
  const b=await connect();send(b.ws,{type:'joinRoom',code:joined.roomCode,name:'Observer'});await b.next('joined');
  const room=game.roomManager.findByCode(joined.roomCode), player=room.players.get(joined.playerId);
  room.startMatch(game.now());player.prowess=100;
  send(a.ws,{type:'ultimate'});
  await a.next('events', m=>m.events.some(e=>e.type==='ultimateStart' && e.ultimate==='chivalry'));
  send(a.ws,{type:'castPreparedSpell',spell:'frostfire',direction:{x:0,y:0,z:-1}});
  const pre=await a.next('snapshot',m=>m.players.find(p=>p.id===player.id)?.spell==='frostfire');
  assert.equal(pre.players.find(p=>p.id===player.id).ultimateState.phase,'startup');
  assert.equal(player.pendingSpell,null);
  await b.next('events',m=>m.events.some(e=>e.type==='ultimateActive' && e.ultimate==='chivalry'));
  send(a.ws,{type:'castPreparedSpell',spell:'fireball',direction:{x:0,y:0,z:-1}});
  send(a.ws,{type:'input',seq:1,yaw:Math.PI/2,pitch:0,forward:0,right:0,jump:false,sprint:false,guard:false,attack:false});
  await a.next('events',m=>m.events.some(e=>e.type==='spellCast' && e.spell==='fireball'));
  const released=await b.next('events',m=>m.events.some(e=>e.type==='projectileSpawned' && e.projectile.ownerId===player.id));
  const shot=released.events.find(e=>e.type==='projectileSpawned' && e.projectile.ownerId===player.id).projectile;
  assert.equal(shot.spell,'fireball');
  assert.ok(shot.velocity.x < -20 && Math.abs(shot.velocity.z)<1,'release samples turned authoritative aim');
  send(a.ws,{type:'castPreparedSpell',spell:'steel',direction:{x:0,y:0,z:-1}});
  await new Promise(r=>setTimeout(r,80));
  assert.equal(player.spell,'fireball','unprepared spell rejected');
  send(a.ws,{type:'selectPreparedSpell',spell:'gale'});
  await b.next('snapshot',m=>m.players.find(p=>p.id===player.id)?.spell==='gale');
  send(a.ws,{type:'loadout',spell:'frostfire',ultimate:'sunder',preparedSpells:['fireball','frostfire','steel']});
  await new Promise(r=>setTimeout(r,80));
  assert.equal(player.spell,'gale');assert.equal(player.startingSpell,'frostfire');
  assert.deepEqual(player.preparedSpells,['fireball','frostfire','gale']);
  const history={...player.spellReadyById};
  assert.ok(history.fireball>game.now());
  player.ultimateState.until=game.now();
  await b.next('events',m=>m.events.some(e=>e.type==='ultimateEnded' && e.ultimate==='chivalry'));
  assert.equal(player.spell,'gale');assert.deepEqual(player.spellReadyById,history);
  room.startMatch(game.now());assert.equal(player.spell,'frostfire');
  assert.deepEqual(player.preparedSpells,['fireball','frostfire','steel']);
});
