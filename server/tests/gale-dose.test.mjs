import test from 'node:test';
import assert from 'node:assert/strict';
import { galeDose } from '../../shared/src/galeDamage.mjs';
function run(dt,options={}){const gust={bornAt:0,until:1.25};let damage=0;for(let t=0;t<1.25-1e-9;){const next=Math.min(1.25,t+dt);damage+=galeDose(gust,'a',next,next-t,1,options).amount;t=next;}return {damage,gust};}
test('fractional sustained damage is subdivision stable and never spends more than eight raw damage',()=>{for(const dt of [1/20,1/30,1/120,1.25]){const r=run(dt);assert.equal(r.damage,7);assert.ok(r.gust.damageAccounts.a.raw<=8);}});
test('departing and reentering share the original budget; guard and steel mitigate accumulated dose',()=>{const g={bornAt:0,until:1.25};assert.equal(galeDose(g,'a',.25,.25,1).amount,1);assert.equal(galeDose(g,'a',1.25,.25,1).amount,1);assert.ok(g.damageAccounts.a.raw<4);assert.equal(run(1/30,{guarded:true}).damage,0);assert.ok(run(1/30,{steel:1}).damage<=1);assert.equal(galeDose(g,'a',3,1,1).amount,0);});

test('independent gusts retain independent budgets and full guard contact cannot reset a dose',()=>{const a={bornAt:0,until:1.25},b={bornAt:0,until:1.25};let da=0,db=0;for(let i=1;i<=150;i++){da+=galeDose(a,'target',i/120,1/120,1,{guarded:i<90}).amount;db+=galeDose(b,'target',i/120,1/120,1).amount;}assert.ok(da>0&&da<db);assert.equal(db,7);assert.ok(a.damageAccounts.target.raw<=8&&b.damageAccounts.target.raw<=8);});

import { Room } from '../../shared/sim/Room.mjs';
import { tryCastSpell,stepRoom,interruptHitActions } from '../../shared/sim/combat.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
const flat={floors:[{id:'floor',center:[0,-.1,0],size:[80,.2,80],y:0}],ramps:[],solids:[],abyssY:-9};
function scenario(){const room=new Room('DOSE',{mode:'PRACTICE'});for(const id of ['a','b'])room.addPlayer({id,token:id,name:id},0);room.startMatch(1);const a=room.players.get('a'),b=room.players.get('b');for(const p of [a,b])p.spawnProtectionUntil=0;Object.assign(a.position,{x:0,y:0,z:0});Object.assign(b.position,{x:1,y:0,z:0});a.yaw=a.input.yaw=-Math.PI/2;a.spell='gale';tryCastSpell(room,'a',{x:1,y:0,z:0},10);applyRoomCommand(room,a,{type:'galeMode',mode:'sustained'},10.1);stepRoom(room,1/120,10.5,flat);return {room,a,b};}
test('authority emits ongoing damage only, first contact effects once, and interruption ends the wind',()=>{const {room,a,b}=scenario();assert.equal(b.health,100);const prowess=a.prowess;for(let i=1;i<110;i++){Object.assign(b.position,{x:1,y:0,z:0});b.impulse={x:0,z:0};b.velocity={x:0,y:0,z:0};stepRoom(room,1/120,10.5+i/120,flat);}assert.ok(b.health<100&&b.health>=92);assert.equal(a.prowess,prowess);const hits=room.events.filter(e=>e.type==='damage'&&e.victimId==='b');assert.ok(hits.length>1&&hits.every(e=>e.ongoing&&!e.push));assert.equal(room.events.filter(e=>e.type==='galeCatch'&&e.affected.some(p=>p.id==='b')).length,0);interruptHitActions(room,a,'b',11.5);assert.equal(a.gust,null);});


test('authority integrates the final fade interval before clearing a finished sustained gust',()=>{
  for(const dt of [1/20,1/30,1/120]){
    const {room,a,b}=scenario(),gust=a.gust;
    for(let now=10.5+dt;now<11.75+dt*1.5;now+=dt){
      Object.assign(b.position,{x:1,y:0,z:0});b.impulse={x:0,z:0};b.velocity={x:0,y:0,z:0};
      stepRoom(room,dt,now,flat);
    }
    assert.equal(a.gust,null);
    assert.equal(b.health,94);
    assert.equal(gust.damageAccounts.b.through,gust.until);
  }
});

test('sustained authority protects allies, keeps Guard mitigation and stops damage on death',()=>{
  for(const kind of ['allied','guarded','steel','dead']){
    const {room,a,b}=scenario();
    if(kind==='allied')a.team=b.team='azure';
    if(kind==='guarded'){b.guarding=true;b.guardHeld=true;b.yaw=b.input.yaw=Math.PI/2;}
    if(kind==='steel')b.steel={calledAt:10,fullUntil:20,struck:false};
    if(kind==='dead'){b.alive=false;b.respawnAt=30;}
    for(let i=1;i<=150;i++){
      Object.assign(b.position,{x:1,y:0,z:0});b.impulse={x:0,z:0};b.velocity={x:0,y:0,z:0};
      stepRoom(room,1/120,10.5+i/120,flat);
    }
    assert.equal(b.health,100,kind);
    assert.equal(room.events.filter(e=>e.type==='damage'&&e.victimId==='b').length,0,kind);
  }
});
