import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { applyDamage, beginAttack, cancelAttack, killPlayer, setGuard, staggerBy, stepRoom, tryCastSpell, tryDash, tryUltimate } from '../../shared/sim/combat.mjs';
import { recordChallengeFact, observeChallengeFacts, challengeProgressFor, resetChallengeTracking } from '../../shared/sim/challenges.mjs';
import { callSteel } from '../../shared/src/steel.mjs';

const world={floors:[{id:'floor',center:[0,-0.1,0],size:[80,.2,80],y:0}],ramps:[],solids:[],abyssY:-9,
  spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:1.8,y:0,z:0,yaw:Math.PI/2},{x:20,y:0,z:0,yaw:0}]};
function roomFor(mode='FFA') {
  const room=new Room('FEATS',{mode});room.world=world;
  for(const id of ['a','b','c'])room.addPlayer({id,token:id,name:id,ultimate:'chivalry'},0);
  room.startMatch(3);for(const p of room.players.values())p.spawnProtectionUntil=0;
  room.events.length=0;return room;
}
function fact(room,f){recordChallengeFact(room,f);}
function damage(extra={}) {return {type:'damage',attackerId:'a',victimId:'b',at:10,source:'sword',amount:20,rawDamage:30,
  healthBefore:100,healthAfter:80,steel:0,contact:true,ordinary:true,chainId:'a:1',strikeIndex:0,...extra};}
function progress(room,id='a'){observeChallengeFacts(room);return challengeProgressFor(room,id);}
function run(room,from,to,pinned=false){for(let n=from;n<=to+1e-9;n+=.01){
  if(pinned){const b=room.players.get('b');b.position={x:1.8,y:0,z:0};b.velocity={x:0,y:0,z:0};b.impulse={x:0,z:0};}
  stepRoom(room,.01,n,world);
}}

test('one ordinary chain on one victim progresses 1,2,3, with repeated observation idempotent',()=>{
  const r=roomFor();for(const i of [0,1,2]){fact(r,damage({at:10+i,strikeIndex:i}));assert.equal(progress(r).three_part_argument,i+1);}
  assert.equal(progress(r).three_part_argument,3);assert.equal(r.challengeFacts.length,0);
  const result=progress(r);result.three_part_argument=0;assert.equal(progress(r).three_part_argument,3);
});

test('interruption, distinct victims, different chains, duplicated indices and elevated hits cannot assemble the chain feat',()=>{
  for(const variant of ['interrupt','victim','chain','duplicate','elevated']){
    const r=roomFor();fact(r,damage());
    if(variant==='interrupt')fact(r,{type:'swordChainInterrupted',playerId:'a',chainId:'a:1',at:10.2});
    fact(r,damage({at:11,strikeIndex:variant==='duplicate'?0:1,victimId:variant==='victim'?'c':'b',chainId:variant==='chain'?'a:2':'a:1',ordinary:variant!=='elevated'}));
    fact(r,damage({at:12,strikeIndex:2}));assert.ok((progress(r).three_part_argument??0)<3,variant);
  }
});

test('Turnabout requires the same parried victim within the inclusive five second window',()=>{
  for(const [victim,at,yes] of [['b',15,true],['b',15.00001,false],['c',14,false],['b',9,false]]){
    const r=roomFor();fact(r,{type:'parry',defenderId:'a',attackerId:'b',at:10});fact(r,{type:'death',killerId:'a',victimId:victim,at,source:'sword'});
    assert.equal(progress(r).turnabout??0,yes?1:0);
  }
});

test('Mind the Gap requires recent actual Gale displacement credited to the abyss killer',()=>{
  for(const x of [{},{source:'sword'},{displacementSource:'fireball'},{displacementBy:'c'},{displacementAt:4.999},{displacementAt:11}]){
    const r=roomFor();fact(r,{type:'death',killerId:'a',victimId:'b',source:'abyss',at:10,displacementSource:'gale',displacementBy:'a',displacementAt:5,...x});
    assert.equal(progress(r).mind_the_gap??0,Object.keys(x).length?0:1);
  }
});

test('Wind Correction requires the same owned ordinary projectile bent by its owner before an enemy hit',()=>{
  for(const x of [{},{ownerId:'c'},{benderId:'c'},{projectileId:'other'},{ordinary:false}]){
    const r=roomFor();fact(r,{type:'projectileBent',projectileId:'f1',ownerId:'a',benderId:'a',ordinary:true,at:9,...x});
    fact(r,damage({source:'fireball',ordinary:false,ordinaryProjectile:true,projectileId:'f1',strikeIndex:null}));
    assert.equal(progress(r).wind_correction??0,Object.keys(x).length?0:1);
  }
});

test('Steel save requires active mitigation, a survived contact and genuinely lethal unrounded raw damage',()=>{
  for(const [extra,yes] of [[{},true],[{rawDamage:19.99999},false],[{steel:0},false],[{healthAfter:0},false],[{amount:0},false],[{contact:false,source:'burn'},false],[{rawDamage:NaN},false]]){
    const r=roomFor();fact(r,damage({healthBefore:20,healthAfter:1,amount:19,steel:1,rawDamage:20,...extra}));
    assert.equal(progress(r,'b').polished_under_pressure??0,yes?1:0);
  }
});

test('Not Yet requires an enemy interrupt during startup strictly before commit',()=>{
  for(const [extra,yes] of [[{},true],[{phase:'active'},false],[{at:11},false],[{by:'b'},false],[{by:'missing'},false],[{source:'retry'},false]]){
    const r=roomFor();fact(r,{type:'ultimateInterrupted',victimId:'b',by:'a',phase:'startup',commitAt:11,at:10,source:'stagger',...extra});
    assert.equal(progress(r).not_yet??0,yes?1:0);
  }
});

test('Against Better Judgment requires a Duel winner with actual damage reaching <=15, excluding forfeit',()=>{
  for(const [mode,hp,winner,reason,yes] of [['DUEL',15,'a','score',true],['BOT_DUEL',0,'a','score',true],['DUEL',15.01,'a','score',false],['FFA',15,'a','score',false],['DUEL',15,'b','score',false],['DUEL',15,'a','forfeit',false]]){
    const r=roomFor(mode);fact(r,damage({attackerId:'b',victimId:'a',healthBefore:40,healthAfter:hp,amount:40-hp}));
    fact(r,{type:'matchFinished',winnerId:winner,reason,at:11});assert.equal(progress(r).against_better_judgment??0,yes?1:0);
  }
});

test('Both Hands Full requires same enemy, active Chivalry, prepared spell, Guard and <=1.5 seconds',()=>{
  for(const [extra,yes] of [[{},true],[{victimId:'c'},false],[{chivalry:false},false],[{prepared:false},false],[{at:11.50001},false],[{amount:0},false]]){
    const r=roomFor();fact(r,damage({at:10,chivalry:true,guarding:true}));
    fact(r,damage({at:11.5,source:'frostfire',ordinary:false,chivalry:true,guarding:false,prepared:true,...extra}));
    assert.equal(progress(r).both_hands_full??0,yes?1:0);
  }
  const r=roomFor();fact(r,damage({chivalry:true,guarding:false}));fact(r,damage({at:11,source:'gale',ordinary:false,chivalry:true,prepared:true,guarding:false}));
  assert.equal(progress(r).both_hands_full??0,0);
  fact(r,{type:'guardContact',playerId:'a',enemyId:'b',at:10.5,chivalry:true});assert.equal(progress(r).both_hands_full,1);
});

test('Passing Remark requires a real damaging ordinary sword contact during authoritative Chivalry Dash',()=>{
  for(const [extra,yes] of [[{},true],[{dashing:false},false],[{chivalry:false},false],[{ordinary:false},false],[{source:'gauntlet'},false],[{amount:0},false]]){
    const r=roomFor();fact(r,damage({chivalry:true,dashing:true,...extra}));assert.equal(progress(r).passing_remark??0,yes?1:0);
  }
});

test('Practice facts, malformed data and client outcome messages cannot progress feats; new match resets all facts',()=>{
  const p=roomFor('PRACTICE');fact(p,damage({chivalry:true,dashing:true}));assert.deepEqual(progress(p),{});
  const r=roomFor();for(const f of [null,{}, {type:'challengeCompleted',playerId:'a',id:'passing_remark'},damage({amount:NaN}),damage({attackerId:'b',victimId:'b'}),damage({victimId:'missing'}),damage({at:Infinity})])fact(r,f);
  assert.deepEqual(progress(r),{});fact(r,damage({chivalry:true,dashing:true}));assert.equal(progress(r).passing_remark,1);
  r.startMatch(20);assert.deepEqual(progress(r),{});resetChallengeTracking(r);assert.deepEqual(progress(r),{});
});

test('actual ordinary sword chain supplies private identity facts and wins the feat only on one enemy',()=>{
  const r=roomFor();beginAttack(r,'a',10);run(r,10,11.82,true);
  assert.equal(progress(r).three_part_argument,3);assert.ok(r.challengeFacts.length===0);
  assert.equal(r.events.some(e=>e.type==='challengeCompleted'||e.chainId),false);
});

test('actual Guard cancellation prevents combining interrupted chains',()=>{
  const r=roomFor();beginAttack(r,'a',10);run(r,10,10.5);setGuard(r,'a',true,10.6);setGuard(r,'a',false,10.7);
  beginAttack(r,'a',10.8);run(r,10.8,12.01);assert.ok((progress(r).three_part_argument??0)<3);
});

test('actual Steel damage fact captures health and unrounded lethal contact rather than mitigated damage',()=>{
  const r=roomFor();const a=r.players.get('a'),b=r.players.get('b');b.health=20;b.steel=callSteel(10);
  beginAttack(r,'a',10);run(r,10,10.5);assert.ok(b.health>0);assert.equal(progress(r,'b').polished_under_pressure,1);
});

test('actual Balance break identifies the enemy who interrupts startup without awarding committed interruption',()=>{
  for(const committed of [false,true]){
    const r=roomFor();const b=r.players.get('b');b.prowess=100;tryUltimate(r,'b',10);
    if(committed)stepRoom(r,.01,10.65,world);staggerBy(r,b,100,committed?10.7:10.2,'a');stepRoom(r,.01,committed?10.71:10.21,world);
    assert.equal(progress(r).not_yet??0,committed?0:1);
  }
});

test('winning kill and final chain contact remain available after immediate room finish',()=>{
  const r=roomFor();r.scoreToWin=1;const b=r.players.get('b');b.health=90;b.lastDamageAt=10;beginAttack(r,'a',10);run(r,10,11.82,true);
  assert.equal(r.state,'FINISHED');assert.equal(progress(r).three_part_argument,3);
});


test('actual perfect parry followed by a kill supplies Turnabout without a client outcome',()=>{
  const r=roomFor();const b=r.players.get('b');beginAttack(r,'b',10);setGuard(r,'a',true,10.34);run(r,10.34,10.5);
  assert.ok(r.events.some(e=>e.type==='parry'&&e.defenderId==='a'));
  setGuard(r,'a',false,10.6);b.health=30;b.lastDamageAt=11;beginAttack(r,'a',11);run(r,11,11.5,true);
  assert.equal(b.alive,false);assert.equal(progress(r).turnabout,1);
});

test('actual Gale movement owns an abyss kill, while other displacement cannot substitute',()=>{
  for(const gale of [true,false]){
    const r=roomFor();const a=r.players.get('a'),b=r.players.get('b');
    if(gale){a.spell='gale';tryCastSpell(r,'a',{x:1,y:0,z:0},10);run(r,10,10.6);}
    else applyDamage(r,'a','b',1,'fireball',10,{x:3,y:0,z:0});
    b.position.y=-10;stepRoom(r,.01,10.61,world);assert.equal(b.alive,false);
    assert.equal(progress(r).mind_the_gap??0,gale?1:0);
  }
});

test('actual projectile velocity must turn under its own Gale before the same ordinary shot damages an enemy',()=>{
  for(const owner of ['a','c']){
    const r=roomFor();const a=r.players.get('a'),b=r.players.get('b');b.position.x=30;
    const shot={id:'owned-shot',ownerId:owner,spell:'fireball',position:{x:3,y:1.4,z:0},velocity:{x:0,y:0,z:2},bornAt:10};
    r.projectiles.set(shot.id,shot);a.spell='gale';tryCastSpell(r,'a',{x:1,y:0,z:0},10);
    run(r,10,10.54);assert.ok(shot.velocity.x>0,'the real gust bent velocity');
    b.position={x:shot.position.x,y:0,z:shot.position.z};b.velocity={x:0,y:0,z:0};b.impulse={x:0,z:0};
    stepRoom(r,.01,10.55,world);assert.ok(r.events.some(e=>e.type==='damage'&&e.source==='fireball'));
    assert.equal(progress(r,owner).wind_correction??0,owner==='a'?1:0);
  }
});

test('actual Chivalry sword and prepared projectile contacts see Guard without combining different enemies',()=>{
  const r=roomFor();const a=r.players.get('a');a.prowess=100;tryUltimate(r,'a',9);stepRoom(r,.01,9.65,world);
  setGuard(r,'a',true,10);beginAttack(r,'a',10);run(r,10,10.42,true);
  tryCastSpell(r,'a',{x:1,y:0,z:0},10.43);run(r,10.43,10.85,true);
  assert.equal(progress(r).both_hands_full,1);
});

test('actual sword contact in Dash exposes Passing Remark only while the movement is authoritative',()=>{
  const r=roomFor();const a=r.players.get('a');a.prowess=100;tryUltimate(r,'a',9);stepRoom(r,.01,9.65,world);
  beginAttack(r,'a',10);run(r,10,10.31);tryDash(r,'a',{x:1,z:0},10.32);run(r,10.33,10.42);
  assert.equal(progress(r).passing_remark,1);
});

test('actual Duel damage at exactly fifteen and subsequent winning kill exposes the comeback feat',()=>{
  const r=roomFor('DUEL');r.scoreToWin=1;applyDamage(r,'b','a',85,'fireball',10);applyDamage(r,'a','b',100,'sword',11);
  assert.equal(r.state,'FINISHED');assert.equal(progress(r).against_better_judgment,1);
});

test('Steel stopping a Sundering hit from its elevated damage can be a real lethal save',()=>{
  const r=roomFor();const a=r.players.get('a'),b=r.players.get('b');a.ultimateState={id:'sunder',phase:'active',until:20};
  b.health=33;b.lastDamageAt=10;b.steel=callSteel(10);beginAttack(r,'a',10);run(r,10,10.5,true);
  assert.ok(r.events.find(e=>e.type==='damage'&&e.source==='sword').health>0);assert.equal(progress(r,'b').polished_under_pressure,1);
});

test('a Dash accepted after the sampled sword contact cannot retroactively earn Passing Remark',()=>{
  const r=roomFor();const a=r.players.get('a');a.prowess=100;tryUltimate(r,'a',9);stepRoom(r,.01,9.65,world);
  beginAttack(r,'a',10);run(r,10,10.31);
  tryDash(r,'a',{x:1,z:0},10.45);stepRoom(r,.01,10.46,world);
  assert.ok(r.events.some(e=>e.type==='damage'&&e.source==='sword'));
  assert.equal(progress(r).passing_remark??0,0);
});

test('malformed raw contact data and nondamaging contact claims cannot progress damaging feats',()=>{
  for(const extra of [{rawDamage:NaN},{contact:false},{rawDamage:Infinity}]){
    const r=roomFor();fact(r,damage({chivalry:true,dashing:true,...extra}));
    assert.equal(progress(r).passing_remark??0,0);assert.equal(progress(r).three_part_argument??0,0);
  }
});
