import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { tryCastSpell, stepRoom } from '../../shared/sim/combat.mjs';
import { galeLift, galeProfile, sustainGaleRecoil } from '../../shared/src/galeModes.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';

const world={floors:[{id:'floor',center:[0,-.1,0],size:[80,.2,80],y:0}],ramps:[],solids:[],abyssY:-9};
function cast(mode='balanced', targetPosition={x:3,y:0,z:0}) {
  const room=new Room('GMODE');
  for(const id of ['a','b'])room.addPlayer({id,token:id,name:id},0);
  room.startMatch(1);
  const a=room.players.get('a'),b=room.players.get('b');
  for(const p of [a,b]){p.spawnProtectionUntil=0;p.history=[];}
  Object.assign(a.position,{x:0,y:0,z:0});Object.assign(b.position,targetPosition);
  a.yaw=-Math.PI/2;a.input.yaw=a.yaw;a.spell='gale';room.events=[];
  assert.equal(tryCastSpell(room,'a',{x:1,y:0,z:0},10),true);
  applyRoomCommand(room,a,{type:'galeMode',mode},10.3);
  stepRoom(room,1/30,10.5,world);
  return {room,a,b};
}

test('Gale commits the selected profile at release, with distinct bounded wind durations',()=>{
  const variants=['burst','balanced','sustained'].map(mode=>({mode,...cast(mode)}));
  for(const {room,a,mode} of variants){
    assert.equal(a.gust.mode,mode);
    assert.equal(room.events.find(e=>e.type==='galeBlast').mode,mode);
    assert.ok(a.gust.until-a.gust.bornAt<=1.3);
  }
  assert.ok(variants[0].a.gust.until<variants[1].a.gust.until);
  assert.ok(variants[1].a.gust.until<variants[2].a.gust.until);
});

test('mode changes after the gather deadline and malformed profiles are rejected',()=>{
  const {room,a}=cast('burst');
  assert.ok(applyRoomCommand(room,a,{type:'galeMode',mode:'sustained'},10.51).rejected);
  assert.equal(a.gust.mode,'burst');
  assert.ok(applyRoomCommand(room,a,{type:'galeMode',mode:'unlimited'},10.6).rejected);
});

test('sustained wind carries late entrants, with at most one damage application per target',()=>{
  const {room,a,b}=cast('sustained',{x:3,y:0,z:20});
  // Enter well after the balanced gust expires.
  for(let now=10.53;now<11.15;now+=1/30)stepRoom(room,1/30,now,world);
  assert.equal(b.health,100);
  Object.assign(b.position,{x:3,y:0,z:0});
  for(let now=11.15;now<11.7;now+=1/30)stepRoom(room,1/30,now,world);
  const hits=room.events.filter(e=>e.type==='damage'&&e.source==='gale'&&e.victimId==='b');
  assert.equal(hits.length,1);assert.ok(100-b.health<=8);
  assert.ok(b.position.x>6);assert.equal(a.spellReadyAt,16);
});


test('persistent lift is bounded and caster support requires a real reachable surface',()=>{
  const spell=galeProfile('sustained');
  let vy=0;for(let i=0;i<150;i++)vy=galeLift(vy,1,1,1/30)-18/30;
  assert.ok(vy>0&&vy<=6);
  assert.ok(galeLift(0,1,1,1/30,true)<galeLift(0,1,1,1/30));
  const body={alive:true,position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},impulse:{x:0,z:0}};
  sustainGaleRecoil(spell,body,{x:0,y:-1,z:0},world,1/30);
  assert.ok(body.velocity.y>0&&body.velocity.y<=6);
  body.position.y=20;body.velocity.y=0;
  sustainGaleRecoil(spell,body,{x:0,y:-1,z:0},world,1/30);
  assert.equal(body.velocity.y,0,'wind cannot float indefinitely above out-of-reach ground');
  sustainGaleRecoil(spell,body,{x:1,y:0,z:0},world,1/30);
  assert.deepEqual(body.impulse,{x:0,z:0},'open air supplies no wall recoil');
});
