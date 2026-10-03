import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { applyDamage } from '../../shared/sim/combat.mjs';

function inbox(ws) {
  const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));
  return async(type,predicate=()=>true)=>{
    const end=Date.now()+4000;
    while(Date.now()<end) {
      const i=messages.findIndex(m=>m.type===type&&predicate(m));
      if(i>=0)return messages.splice(i,1)[0];
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error(`Missing ${type}`);
  };
}
test('server settles a short Duel feat once from private combat facts including the winning tick',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'challenge-wire-'));
  const store=new ProfileStore(dir), game=createGameServer({port:0,host:'127.0.0.1',profileStore:store});
  await game.start();const sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.close());await game.stop();fs.rmSync(dir,{recursive:true,force:true});});
  async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);sockets.push(ws);const next=inbox(ws);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.send(JSON.stringify({type:'profileHello'}));const profile=await next('profile');return {ws,next,token:profile.token};}
  const a=await connect();a.ws.send(JSON.stringify({type:'createRoom',name:'A',mode:'DUEL'}));const joined=await a.next('joined');
  const b=await connect();b.ws.send(JSON.stringify({type:'joinRoom',name:'B',code:joined.roomCode}));const other=await b.next('joined');
  const room=game.roomManager.findByCode(joined.roomCode);
  room.mode='DUEL';room.startMatch(game.now());room.scoreToWin=1;
  await a.next('snapshot',s=>s.roomState==='PLAYING'&&Boolean(s.rewardMatchId));
  const first=room.players.get(joined.playerId),second=room.players.get(other.playerId);
  first.spawnProtectionUntil=second.spawnProtectionUntil=0;
  const at=game.now();applyDamage(room,second.id,first.id,90,'gauntlet',at);
  applyDamage(room,first.id,second.id,100,'sword',at+0.001);
  const settled=await a.next('profile',p=>p.profile.lastReward?.challenges?.includes('against_better_judgment'));
  assert.equal(room.state,'FINISHED');assert.equal(settled.profile.balance,20);
  assert.equal(settled.profile.lastReward.completion,0,'short matches earn feats without ordinary completion payment');
  assert.equal(settled.profile.lastReward.challengeAmount,20);
  assert.deepEqual(settled.profile.lastReward.challenges,['against_better_judgment']);
  assert.equal(settled.profile.challenges.completed.against_better_judgment>0,true);
  const before=settled.profile.balance;
  a.ws.send(JSON.stringify({type:'claimChallenge',id:'wind_correction'}));
  a.ws.send(JSON.stringify({type:'profileHello'}));
  assert.equal((await a.next('profile')).profile.balance,before,'client outcome claim has no authority');
  assert.equal(new ProfileStore(dir).open(a.token).profile.balance,before,'settled state survives reload');
});
