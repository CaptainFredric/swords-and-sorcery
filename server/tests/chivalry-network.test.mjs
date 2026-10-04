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

test('both clients observe commit Guard and the complete Sprint sword spell Dash sequence', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chivalry-sprint-wire-'));
  const game = createGameServer({ port: 0, host: '127.0.0.1', profileStore: new ProfileStore(dir) });
  await game.start(); const sockets = [];
  t.after(async () => { sockets.forEach(s => s.close()); await game.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`); sockets.push(ws); const next = inbox(ws);
    await new Promise(r => ws.addEventListener('open', r, { once: true })); return { ws, next };
  }
  const a = await connect();
  send(a.ws, { type: 'loadout', spell: 'fireball', ultimate: 'chivalry', preparedSpells: ['fireball','frostfire','gale'] });
  send(a.ws, { type: 'createRoom', name: 'Knight' }); const joined = await a.next('joined');
  const b = await connect(); send(b.ws, { type: 'joinRoom', code: joined.roomCode, name: 'Observer' }); await b.next('joined');
  const room = game.roomManager.findByCode(joined.roomCode), p = room.players.get(joined.playerId);
  room.startMatch(game.now()); p.prowess = 100;
  send(a.ws, { type: 'ultimate' });
  const active = await a.next('events', m => m.events.some(e => e.type === 'ultimateActive' && e.ultimate === 'chivalry'));
  assert.equal(active.events.filter(e => e.type === 'guardStarted' && e.playerId === p.id).length, 1);
  const matching = predicate => m => predicate(m.players.find(k => k.id === p.id));
  for (const client of [a, b]) {
    const snap = await client.next('snapshot', matching(k => k?.guarding && k.ultimateState?.phase === 'active'));
    assert.equal(snap.players.find(k => k.id === p.id).guarding, true);
  }
  send(a.ws, { type: 'input', seq: 1, forward: 1, right: 0, sprint: true, yaw: p.yaw, guard: false });
  await a.next('snapshot', matching(k => k?.sprinting && k.guarding));
  send(a.ws, { type: 'attack', down: true });
  send(a.ws, { type: 'castPreparedSpell', spell: 'fireball', direction: {x:0,y:0,z:-1}, yaw: p.yaw, pitch: 0 });
  for (const client of [a, b]) await client.next('snapshot', matching(k => k?.sprinting && k.guarding && k.attackActive && k.castingSpell === 'fireball'));
  send(a.ws, { type: 'dash', direction: {x:0,z:-1} });
  const dash = await b.next('events', m => m.events.some(e => e.type === 'dash' && e.playerId === p.id));
  const at = dash.events.find(e => e.type === 'dash' && e.playerId === p.id).at;
  for (const client of [a, b]) await client.next('snapshot', m => matching(k => k?.sprinting && k.guarding && k.attackActive && k.dashUntil > m.serverTime)(m));
  for (const client of [a, b]) await client.next('snapshot', m => m.serverTime > at + .2 && matching(k => k?.sprinting && k.guarding && k.attackActive)(m));
  assert.equal(p.input.sprint, true); assert.equal(p.guardStartedAt, active.events.find(e => e.type === 'guardStarted').at);
  send(a.ws, { type: 'guard', down: true }); send(a.ws, { type: 'guard', down: false });
  for (const client of [a, b]) await client.next('snapshot', matching(k => k?.sprinting && !k.guarding));
  await new Promise(r => setTimeout(r, 120)); assert.equal(p.guarding, false);
});

test('both clients observe select only and an immediate authoritative current cast', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chivalry-slot-wire-'));
  const game = createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(dir)});
  await game.start(); const sockets = [];
  t.after(async () => { sockets.forEach(s => s.close()); await game.stop(); fs.rmSync(dir,{recursive:true,force:true}); });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`); sockets.push(ws); const next = inbox(ws);
    await new Promise(r => ws.addEventListener('open',r,{once:true})); return {ws,next};
  }
  const a = await connect();
  send(a.ws,{type:'loadout',spell:'fireball',ultimate:'chivalry',preparedSpells:['fireball','frostfire','gale']});
  send(a.ws,{type:'createRoom',name:'Knight'}); const joined = await a.next('joined');
  const b = await connect(); send(b.ws,{type:'joinRoom',code:joined.roomCode,name:'Observer'}); await b.next('joined');
  const room = game.roomManager.findByCode(joined.roomCode), p = room.players.get(joined.playerId);
  room.startMatch(game.now()); p.prowess = 100; send(a.ws,{type:'ultimate'});
  await a.next('events',m => m.events.some(e => e.type === 'ultimateActive' && e.ultimate === 'chivalry'));
  const history = {[p.spell]:p.spellReadyAt,...p.spellReadyById};
  send(a.ws,{type:'selectPreparedSlot',slot:3});
  for (const client of [a,b]) {
    const snap = await client.next('snapshot',m => m.players.some(k => k.id === p.id && k.spell === 'gale'));
    const knight = snap.players.find(k => k.id === p.id);
    assert.equal(knight.castingSpell,null); assert.equal(knight.preparedSpellSelected,true);
    assert.deepEqual(knight.spellReadyById,history);
  }
  // Ordered commands are sent together before either client receives selection acknowledgement.
  send(a.ws,{type:'selectPreparedSlot',slot:2});
  send(a.ws,{type:'castCurrentSpell',direction:{x:0,y:0,z:-1},yaw:Math.PI/2,pitch:0.2});
  for (const client of [a,b]) {
    const cast = await client.next('events',m => m.events.some(e => e.type === 'spellCast' && e.playerId === p.id));
    assert.equal(cast.events.find(e => e.type === 'spellCast' && e.playerId === p.id).spell,'frostfire');
  }
  send(a.ws,{type:'selectPreparedSlot',slot:3});
  for (const client of [a,b]) {
    const snap = await client.next('snapshot',m => m.players.some(k => k.id === p.id && k.spell === 'gale' && k.castingSpell === 'frostfire'));
    assert.equal(snap.players.find(k => k.id === p.id).preparedSpellSelected,true);
    const released = await client.next('events',m => m.events.some(e => e.type === 'projectileSpawned' && e.projectile.ownerId === p.id));
    const shot = released.events.find(e => e.type === 'projectileSpawned' && e.projectile.ownerId === p.id).projectile;
    assert.equal(shot.spell,'frostfire'); assert.ok(shot.velocity.x < 0); assert.ok(shot.velocity.y > 0);
  }
});
