import test from 'node:test';import assert from 'node:assert/strict';
import {createGameServer} from '../src/server.mjs';
import {createSoFistication,soFistEntry} from '../../shared/sim/soFistication.mjs';
test('real network host rejects a guest Skill and replicates machine cooldown after dismount',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1'});await game.start();const sockets=[];
 async function client(){const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);sockets.push(ws);const q=[];ws.addEventListener('message',e=>q.push(JSON.parse(String(e.data))));await new Promise(r=>ws.addEventListener('open',r,{once:true}));return{send:m=>ws.send(JSON.stringify(m)),wait:async pred=>{const end=Date.now()+3000;while(Date.now()<end){const i=q.findIndex(pred);if(i>=0)return q.splice(i,1)[0];await new Promise(r=>setTimeout(r,15));}throw Error('Skill network timeout');}};}
 try{
  const a=await client();a.send({type:'createRoom',name:'Skill host'});const joined=await a.wait(m=>m.type==='joined'),room=game.roomManager.findByCode(joined.roomCode);
  const b=await client();b.send({type:'joinRoom',code:room.code,name:'Skill guest'});const guest=await b.wait(m=>m.type==='joined');
  room.startMatch(game.now());room.siegeSkillRandom=()=>.999999;room.world={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20};room.soFistication=createSoFistication();const ram=room.soFistication,p=room.players.get(joined.playerId);p.position=soFistEntry(ram,room.world);room.players.get(guest.playerId).position={x:20,y:0,z:20};
  b.send({type:'siegeSkill',machineId:ram.id});await b.wait(m=>m.type==='error');assert.equal(ram.skill.readyAt,0);
  a.send({type:'siegeOperate'});await a.wait(m=>m.type==='snapshot'&&m.soFistication?.operatorId===p.id);a.send({type:'siegeSkill'});
  const seen=await b.wait(m=>m.type==='snapshot'&&m.soFistication?.skill.phase==='primed');const clock=seen.soFistication.skill.readyAt;assert.equal(clock,0);
  a.send({type:'siegeOperate'});const after=await b.wait(m=>m.type==='snapshot'&&m.soFistication?.operatorId===null&&m.soFistication.skill.readyAt>game.now());assert.equal(after.soFistication.skill.phase,'idle');assert.equal(after.soFistication.skill.failureThreshold,undefined);
 }finally{for(const s of sockets)s.close();await game.stop();}
});
