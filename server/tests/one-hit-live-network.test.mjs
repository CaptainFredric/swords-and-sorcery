import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

test('both Shared Practice sockets receive the same authoritative Disaster landing and supported Fire zone',async()=>{
  const game=createGameServer({host:'127.0.0.1',port:0});
  await game.start();
  const clients=[];
  async function connect(){
    const ws=new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);
    clients.push(ws);
    const queue=[];
    ws.addEventListener('message',e=>queue.push(JSON.parse(e.data)));
    await new Promise((resolve,reject)=>{
      ws.addEventListener('open',resolve,{once:true});
      ws.addEventListener('error',reject,{once:true});
    });
    return {send:msg=>ws.send(JSON.stringify(msg)),async wait(predicate){
      const deadline=Date.now()+4000;
      while(Date.now()<deadline){
        const i=queue.findIndex(predicate);
        if(i>=0)return queue.splice(i,1)[0];
        await new Promise(resolve=>setTimeout(resolve,15));
      }
      throw new Error('Shared Practice Disaster observation timed out');
    }};
  }
  try{
    const host=await connect();
    host.send({type:'loadout',spell:'line_of_conduct',ultimate:'one_hit_of_wonders'});
    host.send({type:'createSharedPracticeRoom',name:'Caster'});
    const joined=await host.wait(m=>m.type==='joined');
    const guest=await connect();
    guest.send({type:'joinRoom',code:joined.roomCode,name:'Observer'});
    const observer=await guest.wait(m=>m.type==='joined');
    const room=game.roomManager.findByCode(joined.roomCode);
    room.world={floors:[{center:[0,-.1,0],size:[100,.2,100],y:0}],solids:[],ramps:[],
      abyssY:-30,spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
    const player=room.players.get(joined.playerId);
    const peer=room.players.get(observer.playerId);
    player.position={x:0,y:0,z:0};
    peer.position={x:20,y:0,z:0};
    host.send({type:'practiceOneHit',action:'preset',preset:'full'});
    host.send({type:'practiceOneHit',action:'aerial'});
    host.send({type:'input',yaw:0,pitch:-.57,forward:0,right:0});
    host.send({type:'ultimate'});
    await host.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.id===player.id&&Number.isFinite(p.ultimateState?.teleportHoldAt)));
    host.send({type:'oneHitRelease'});
    const landing=m=>m.type==='events'&&m.events?.some(e=>e.type==='oneHitImpact'&&e.form==='aerial');
    const [a,b]=await Promise.all([host.wait(landing),guest.wait(landing)]);
    const event=a.events.find(e=>e.type==='oneHitImpact'&&e.form==='aerial');
    assert.deepEqual(event,b.events.find(e=>e.type==='oneHitImpact'&&e.form==='aerial'));
    assert.deepEqual(event.tiers,{fire:2,frost:2,gale:2,lightning:2});
    assert.ok(Math.abs(event.point.y)<1e-6);
    const zones=m=>m.type==='snapshot'&&m.oneHitBurnZones?.some(z=>z.id===event.impactId+':fire');
    const [h,g]=await Promise.all([host.wait(zones),guest.wait(zones)]);
    assert.deepEqual(h.oneHitBurnZones,g.oneHitBurnZones);
    assert.equal(h.oneHitBurnZones[0].radius,4.6);
  } finally {
    for(const ws of clients)ws.close();
    await game.stop();
  }
});
