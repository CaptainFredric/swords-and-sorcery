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
    assert.deepEqual(event.tiers,{fire:2,frost:2,gale:2,lightning:2,steel:2});
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

test('two real sockets see the same grounded Full Disaster: one decisive hit, its field, and every status on the struck knight',async()=>{
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
      throw new Error('grounded Disaster observation timed out');
    }};
  }
  try{
    const host=await connect();
    host.send({type:'loadout',spell:'fireball',ultimate:'one_hit_of_wonders'});
    host.send({type:'createSharedPracticeRoom',name:'Caster'});
    const joined=await host.wait(m=>m.type==='joined');
    const guest=await connect();
    guest.send({type:'joinRoom',code:joined.roomCode,name:'Struck'});
    const observer=await guest.wait(m=>m.type==='joined');
    const room=game.roomManager.findByCode(joined.roomCode);
    room.world={floors:[{center:[0,-.1,0],size:[100,.2,100],y:0}],solids:[],ramps:[],
      abyssY:-30,spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
    const player=room.players.get(joined.playerId);
    const peer=room.players.get(observer.playerId);
    player.position={x:0,y:0,z:0};player.grounded=true;player.velocity={x:0,y:0,z:0};
    peer.position={x:0,y:0,z:-1.8};peer.spawnProtectionUntil=0;player.spawnProtectionUntil=0;
    peer.health=100;
    host.send({type:'practiceOneHit',action:'preset',preset:'full'});
    host.send({type:'input',yaw:0,pitch:0,forward:0,right:0});
    host.send({type:'ultimate'});
    await host.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.id===player.id&&Number.isFinite(p.ultimateState?.teleportHoldAt)));
    host.send({type:'oneHitRelease'});
    const landing=m=>m.type==='events'&&m.events?.some(e=>e.type==='oneHitImpact'&&e.form==='ground');
    const [a,b]=await Promise.all([host.wait(landing),guest.wait(landing)]);
    const pick=(batch,type)=>batch.events.filter(e=>e.type===type);
    const impact=pick(a,'oneHitImpact')[0];
    assert.deepEqual(impact,pick(b,'oneHitImpact')[0],'the same impact on both sockets');
    assert.ok(impact.fieldId);
    assert.deepEqual(impact.struck,[peer.id]);
    for(const batch of [a,b]){
      const decisive=batch.events.filter(e=>e.type==='damage'&&e.source==='one_hit_of_wonders'&&e.victimId===peer.id);
      assert.equal(decisive.length,1,'one decisive event');
      assert.equal(decisive[0].amount,85,'46 + 13 + 11 + 1 + 12 + 2');
      for(const type of ['oneHitConduct','oneHitBlustered','oneHitCooldownsRestarted','actionInterrupted'])
        assert.equal(pick(batch,type).filter(e=>e.playerId===peer.id).length,1,type);
      assert.equal(pick(batch,'rupture')[0].radial,true);
      assert.equal(pick(batch,'rupture')[0].fissures.length,12);
    }
    const field=m=>m.type==='snapshot'&&m.oneHitFields?.some(f=>f.id===impact.fieldId);
    const [h,g]=await Promise.all([host.wait(field),guest.wait(field)]);
    assert.deepEqual(h.oneHitFields,g.oneHitFields,'the same field on both sockets');
    assert.ok(Math.abs(h.oneHitFields[0].until-h.oneHitFields[0].bornAt-5.5)<1e-9,'five elements: 4 + 5 x 0.3 seconds');
    for(const snapshot of [h,g]){
      const struck=snapshot.players.find(p=>p.id===peer.id);
      assert.ok(struck.shaken&&struck.blustered&&struck.oneHitFrostSlow,'Shaken, Blustered and slowed, as each socket sees it');
      assert.equal(struck.electricalBacklash.initial,12);
      assert.ok(struck.health>14.9&&struck.health<=15.01,'85 taken once');
    }
    // and all of it gone again, on the wire, a few seconds later
    peer.health=1000; // (kept alive through the burning ground: this is about the statuses running out)
    const after=h.oneHitFields[0].until;
    const clear=m=>m.type==='snapshot'&&m.serverTime>after&&m.oneHitFields?.length===0&&(()=>{const p=m.players.find(x=>x.id===peer.id);return p&&!p.blustered&&!p.electricalBacklash&&!p.shaken;})();
    const start=Date.now();
    let cleared=null;
    while(!cleared&&Date.now()-start<12000)cleared=await guest.wait(clear).catch(()=>null);
    assert.ok(cleared,'field and statuses decay away for the struck client');
    assert.ok(cleared.serverTime-after<4.5,'within a few seconds of the field ending');
  } finally {
    for(const ws of clients)ws.close();
    await game.stop();
  }
});
