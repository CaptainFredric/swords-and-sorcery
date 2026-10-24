import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';

// This is a real WebSocket protocol test with a positioned fixture. Browser
// evidence separately walks to the machine using ordinary player controls.
test('network host preserves mechanical release after dismount and independent recock during heavy reload',{timeout:15000},async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'bibye-wire-'));
 const game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(folder)});await game.start();
 const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`),queue=[];
 ws.addEventListener('message',e=>queue.push(JSON.parse(e.data)));
 t.after(async()=>{ws.close();await game.stop();await rm(folder,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const send=m=>ws.send(JSON.stringify(m));
 const next=async(type,predicate=()=>true)=>{const until=Date.now()+7000;while(Date.now()<until){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error(`Missing ${type}`);};
 // A delayed host tick can publish both committed releases in one packet.
 // Consume one event at a time so observing Shot I cannot discard Shot II.
 const takeEvent=async predicate=>{const m=await next('events',m=>m.events.some(predicate));const [e]=m.events.splice(m.events.findIndex(predicate),1);if(m.events.length)queue.unshift(m);return e;};
 const event=type=>takeEvent(e=>e.type===type);
 send({type:'startSolo',mode:'PRACTICE',worldId:'castleward',name:'Network Siege'});
 const joined=await next('joined'),room=game.roomManager.findByCode(joined.roomCode),p=room.players.get(joined.playerId);
 // Keep an actual preconstruction snapshot queued while checking later releases.
 // Slow CI can naturally deliver this packet alongside the mounted snapshots.
 const empty=await next('snapshot',m=>m.bibyeBallista===null);queue.push(empty);
 const b=room.biByeLlista=createBiByeLlista();
 p.position={x:b.x,y:b.y,z:b.z};send({type:'bibyeOperate'});
 await next('snapshot',m=>m.bibyeBallista?.operatorId===p.id);
 send({type:'bibyeToggleDeploy'});await next('snapshot',m=>m.bibyeBallista?.mode==='DEPLOYED');
 send({type:'bibyeFire'});const committed=await event('bibyeVolleyInitiated');
 const first=await takeEvent(e=>e.type==='bibyeFired'&&e.shot==='I');
 send({type:'bibyeOperate'});
 const heavy=await takeEvent(e=>e.type==='bibyeFired'&&e.shot==='II');
 await next('snapshot',m=>m.bibyeBallista?.operatorId===null);
 assert.ok(Math.abs(heavy.at-first.at-.2)<1e-8);assert.ok(Math.abs(first.at-committed.at-.45)<1e-8);assert.equal(b.operatorId,null);
 const heavyReady=b.reloadEndsAt;assert.ok(Math.abs(heavyReady-committed.at-6.7)<1e-8);
 send({type:'bibyeOperate'});await next('snapshot',m=>m.serverTime>heavy.at&&m.bibyeBallista?.operatorId===p.id);
 send({type:'bibyeWeaponFocus',focus:'UPPER'});
 await next('snapshot',m=>m.serverTime>heavy.at&&m.bibyeBallista?.weaponFocus==='UPPER'&&m.bibyeBallista?.smallBoltReady);
 send({type:'bibyeFire'});
 const independent=await takeEvent(e=>e.type==='bibyeFired'&&e.shot==='I_MOBILE');
 const snapshot=await next('snapshot',m=>m.bibyeBallista?.upperReleasedAt>=independent.at);
 assert.equal(snapshot.bibyeBallista.state,'RELOADING');assert.equal(snapshot.bibyeBallista.reloadEndsAt,heavyReady);
 assert.ok(Math.abs(snapshot.bibyeBallista.smallBoltReadyAt-independent.at-2.5)<1e-8);
 assert.equal(snapshot.players.find(v=>v.id===p.id).yaw,snapshot.bibyeBallista.heading);
 await next('snapshot',m=>m.bibyeBallista?.mainBoltLoaded&&m.serverTime>=heavyReady);
 assert.equal(queue.flatMap(m=>m.events??[]).filter(e=>e.type==='bibyeVolleyInitiated').length,0);
});

test('network Practice constructs explicitly and retires an occupied instance before rebuilding',{timeout:10000},async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'bibye-lifecycle-')),game=createGameServer({port:0,host:'127.0.0.1',profileStore:new ProfileStore(folder)});await game.start();
 const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`),queue=[];ws.addEventListener('message',e=>queue.push(JSON.parse(e.data)));t.after(async()=>{ws.close();await game.stop();await rm(folder,{recursive:true,force:true});});
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});const send=m=>ws.send(JSON.stringify(m));
 const next=async(type,predicate=()=>true)=>{const until=Date.now()+4500;while(Date.now()<until){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type+': '+JSON.stringify(queue.filter(m=>m.type==='error')));};
 send({type:'startSolo',mode:'PRACTICE',worldId:'castleward',name:'Siege Builder'});const joined=await next('joined'),room=game.roomManager.findByCode(joined.roomCode),p=room.players.get(joined.playerId);assert.equal(room.biByeLlista,null);
 send({type:'arenaReady',ready:true});send({type:'ready',ready:true});await next('snapshot',s=>s.roomState==='PLAYING');send({type:'practiceBuildBiBye',x:999,z:999});const built=await next('snapshot',s=>s.bibyeBallista!=null),id=built.bibyeBallista.id;assert.ok(Math.abs(room.biByeLlista.x)<30);
 p.position={x:room.biByeLlista.x,y:room.biByeLlista.y,z:room.biByeLlista.z};send({type:'bibyeOperate'});await next('snapshot',s=>s.bibyeBallista?.operatorId===p.id);send({type:'practiceDismantleBiBye'});const removed=await next('snapshot',s=>s.bibyeRevision>built.bibyeRevision&&s.bibyeBallista===null);assert.equal(p.operatingBallistaId,null);
 send({type:'practiceBuildBiBye'});const fresh=await next('snapshot',s=>s.bibyeRevision>removed.bibyeRevision&&s.bibyeBallista!=null);assert.notEqual(fresh.bibyeBallista.id,id);assert.equal(fresh.bibyeBallista.health,650);
});
