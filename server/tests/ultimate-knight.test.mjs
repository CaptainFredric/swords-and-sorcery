import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, stepPracticeActors, resetPracticePlayer } from '../../shared/sim/practice.mjs';
import { stepRoom, killPlayer, beginAttack, applyDamage } from '../../shared/sim/combat.mjs';
import { observeChallengeFacts, challengeProgressFor } from '../../shared/sim/challenges.mjs';
import { matchReward } from '../src/ProfileStore.mjs';
import { eligibleChallengeParticipant } from '../src/challengeSettlement.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { configureUltimateKnight } from '../../shared/sim/UltimateKnight.mjs';
import { applyRoomCommand,serializeSnapshot } from '../../shared/sim/wire.mjs';

const world = { floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [], solids: [], abyssY: -9, spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -4, yaw: Math.PI }] };
function fixture() {
  const room = new Room('KNIGHT', { mode: 'PRACTICE' }); room.world = world;
  const human = room.addPlayer({ id: 'human', token: 'human', name: 'Aden' }, 0);
  room.startMatch(0);
  const knight = spawnPracticeDummy(room, 'ULTIMATE_KNIGHT', 0);
  return { room, human, knight };
}
function frame(f, now, observations = []) {
  const { room, human, knight } = f;
  for (const [actor, z] of [[human, -2], [knight, 0]]) {
    actor.position = { x: 0, y: 0, z }; actor.velocity = { x: 0, y: 0, z: 0 };
    actor.impulse = { x: 0, z: 0 }; actor.grounded = true; actor.health = 100;
    actor.spawnProtectionUntil = 0;
  }
  room.events.length = 0;
  stepPracticeActors(room, now, world, { random: () => 0.5 });
  observations.push({ now, ultimate: knight.ultimateState?.id, phase: knight.ultimateState?.phase,
    sword: knight.attackActive, guard: knight.guarding, spell: knight.pendingSpell?.spell,
    dash: now < knight.dashUntil, selected: knight.spell, prowess: knight.prowess });
  stepRoom(room, 1 / 30, now, world);
  return room.events.slice();
}

test('Ultimate Knight is a single Practice actor with its full name and ready charge', () => {
  const f = fixture(); assert.ok(f.knight);
  assert.equal(f.knight.name, 'The Ultimate Knight'); assert.equal(f.knight.botProfile, 'rival');
  assert.equal(f.knight.prowess, 100); assert.equal(f.knight.ultimate, 'sunder');
  assert.equal(f.knight.ultimateKnight.behavior,'stay','default is Stay · Repeat & Defend');
  assert.deepEqual(f.knight.preparedSpells, ['fireball', 'frostfire', 'gale']);
  assert.equal(spawnPracticeDummy(f.room, 'ULTIMATE_KNIGHT', 1), f.knight);
  assert.equal([...f.room.players.values()].filter((p) => p.actorKind === 'dummy').length, 1);
  const arena = new Room('ARENA'); assert.equal(spawnPracticeDummy(arena, 'ULTIMATE_KNIGHT', 0), null);
});

test('real commits cycle deterministically with a three second refill after recovery and concurrent demonstrations', () => {
  const f = fixture(); const events = []; const states = [];
  // Explicit Follow demonstrates dashing as part of Chivalry; a newly
  // spawned Knight now defaults to the stationary defensive drill.
  assert.equal(configureUltimateKnight(f.room,f.human.id,{behavior:'follow'},0),true);
  for (let i = 0; i < 1800; i++) events.push(...frame(f, i / 30, states));
  const active = events.filter((e) => e.type === 'ultimateActive');
  assert.deepEqual(active.slice(0, 4).map((e) => e.ultimate), ['sunder', 'vortex', 'chivalry', 'sunder']);
  const ended = events.filter((e) => e.type === 'ultimateEnded');
  const started = events.filter((e) => e.type === 'ultimateStart');
  for (let i = 0; i < 4; i++) {
    assert.ok(active[i].at >= started[i].commitAt - 1e-9);
    assert.ok(Math.abs(started[i].commitAt - started[i].at - ULTIMATES[started[i].ultimate].startupSec) < 1e-9);
  }
  for (let i = 1; i < 4; i++) assert.ok(started[i].at >= ended[i - 1].at + 3 + (ended[i - 1].ultimate === 'vortex' ? 0.5 : 0) - 1e-6);
  for (const state of states.filter((s) => s.phase === 'active')) assert.equal(state.prowess, 0);
  const chiv = states.filter((s) => s.ultimate === 'chivalry' && s.phase === 'active');
  for (const predicate of [(s) => s.guard && s.sword, (s) => s.spell && s.sword,
    (s) => s.dash && s.sword, (s) => s.guard && s.sword && s.spell && s.dash]) assert.ok(chiv.some(predicate));
  assert.deepEqual(new Set(chiv.map((s) => s.selected)), new Set(['fireball', 'frostfire', 'gale']));
  assert.deepEqual(new Set(events.filter((e) => e.type === 'spellCast' && e.playerId === f.knight.id).map((e) => e.spell)),
    new Set(['fireball', 'frostfire', 'gale']));
  assert.ok(events.some((e) => e.type === 'attackStarted' && !states.find((s) => Math.abs(s.now - e.at) < 1e-6)?.ultimate));
});

test('startup interruption retains real charge and retries the same ultimate after lockout', () => {
  const f = fixture(); frame(f, 0);
  assert.equal(f.knight.ultimateState?.phase, 'startup');
  f.knight.staggerUntil = 0.5; stepRoom(f.room, 1 / 30, 0.1, world);
  assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.prowess, 100);
  const lockout = f.knight.ultimateLockedUntil;
  for (let now = 0.2; now < lockout; now += 1 / 30) {
    frame(f, now); assert.equal(f.knight.ultimateState, null);
  }
  for (let now = lockout; now < lockout + 5 && !f.knight.ultimateState; now += 1 / 30) frame(f, now);
  assert.equal(f.knight.ultimateState?.id, 'sunder');
});

test('a committed ultimate followed by death in the same tick advances once', () => {
  const f = fixture(); frame(f, 0);
  const commit = f.knight.ultimateState.commitAt;
  stepRoom(f.room, 1 / 30, commit, world);
  assert.equal(f.knight.ultimateState.phase, 'active');
  killPlayer(f.room, f.knight.id, f.human.id, 'sword', commit);
  assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.alive, false);
  stepPracticeActors(f.room, commit, world); stepPracticeActors(f.room, commit + 0.1, world);
  f.knight.alive = true; f.knight.staggerUntil = -Infinity;
  frame(f, commit + 3.2);
  assert.equal(f.knight.ultimate, 'vortex');
});

test('a Knight spawned during the lobby promptly regains charge when the Practice session starts', () => {
  const f = fixture(); f.room.state = 'WAITING';
  spawnPracticeDummy(f.room, 'ULTIMATE_KNIGHT', 1);
  f.room.startMatch(3); assert.equal(f.knight.prowess, 0);
  frame(f, 3); assert.equal(f.knight.prowess, 100);
  assert.equal(f.knight.ultimateState?.id, 'sunder');
});

test('Practice resets clear held Guard and both spell clocks, and mode changes stop the demonstration', () => {
  const f = fixture(); f.human.guardHeld = true; f.human.spellReadyById = { fireball: 40 };
  f.human.chivalryProjectileReadyAt = 40; f.human.spell = 'gale';
  assert.equal(resetPracticePlayer(f.room, f.human.id, 3), true);
  assert.equal(f.human.guardHeld, false); assert.deepEqual(f.human.spellReadyById, {});
  assert.ok(f.human.chivalryProjectileReadyAt <= 3); assert.equal(f.human.spell, 'gale');
  frame(f, 4); assert.ok(f.knight.ultimateState);
  setPracticeDummyMode(f.room, 'PASSIVE', 4.1);
  frame(f, 5); assert.equal(f.knight.ultimateState, null); assert.equal(f.knight.attackHeld, false);
  assert.equal(f.knight.guardHeld, false); assert.equal(f.knight.pendingSpell, null);
});

test('Ultimate Knight combat cannot progress Challenges, reward Renown, or finish Practice by scoring', () => {
  const f = fixture();
  for (let i = 0; i < 1200; i++) {
    frame(f, i / 30); observeChallengeFacts(f.room);
    if (i % 20 === 0) f.room.recordKill(f.human.id, f.knight.id, i / 30);
  }
  assert.deepEqual(challengeProgressFor(f.room, f.human.id), {});
  assert.equal(f.room.state, 'PLAYING'); assert.equal(matchReward(f.room, f.human, 40), 0);
  assert.equal(eligibleChallengeParticipant(f.room, f.human), false);
});

test('Ultimate Knight drill settings are Practice-only and carry fixed Ultimate, Follow/Stay and 5 tiers on the wire',()=>{
  const {room,human,knight}=fixture();
  const chosen={type:'practiceUltimateKnightConfig',selection:'one_hit_of_wonders'};
  assert.deepEqual(applyRoomCommand(room,human,chosen,0),{});
  assert.equal(knight.ultimate,'one_hit_of_wonders');
  assert.deepEqual(applyRoomCommand(room,human,{type:'practiceUltimateKnightConfig',behavior:'stay'},0),{});
  assert.equal(knight.ultimateKnight.behavior,'stay');
  assert.deepEqual(applyRoomCommand(room,human,{type:'practiceUltimateKnightConfig',preset:'full'},0),{});
  assert.deepEqual(knight.ultimateKnight.stages,{fire:2,frost:2,gale:2,lightning:2,steel:2});
  assert.deepEqual(applyRoomCommand(room,human,{type:'practiceUltimateKnightConfig',element:'frost',tier:0},0),{});
  assert.equal(knight.practiceOneHit.stages.frost,0);
  const wire=serializeSnapshot(room,0,human.id).players.find(p=>p.id===knight.id);
  assert.equal(wire.ultimateKnight.selection,'one_hit_of_wonders');
  assert.equal(wire.ultimateKnight.behavior,'stay');
  assert.equal(wire.ultimateKnight.stages.frost,0);
  assert.equal(applyRoomCommand(room,human,{type:'practiceUltimateKnightConfig',element:'frost',tier:4},0).rejected!==undefined,true);
  assert.equal(knight.practiceOneHit.stages.frost,0);
  assert.equal(spawnPracticeDummy(room,'ULTIMATE_KNIGHT',.5,human.id),knight);
  assert.equal(knight.ultimateKnight.selection,'one_hit_of_wonders','recall preserves chosen Ultimate');
  assert.equal(knight.ultimateKnight.behavior,'stay','recall preserves Stay');
  assert.equal(knight.ultimateKnight.stages.frost,0,'recall preserves individual infusion');
  const arena=new Room('NOPE',{mode:'FFA'});
  assert.equal(configureUltimateKnight(arena,human.id,chosen,0),false);
});
test('Ultimate Knight stationary drill commits its selected Disaster without walking toward the player',()=>{
  const f=fixture();const {room,human,knight}=f;
  human.position={x:0,y:0,z:-10};
  assert.equal(configureUltimateKnight(room,human.id,{selection:'one_hit_of_wonders',behavior:'stay',preset:'partial'},0),true);
  const post={...knight.position};
  for(let i=0;i<180;i++){
    const now=i/30;
    human.position={x:0,y:0,z:-10};human.velocity={x:0,y:0,z:0};human.health=100;
    stepPracticeActors(room,now,world,{random:()=>.5});
    stepRoom(room,1/30,now,world);
  }
  const starts=room.events.filter(e=>e.type==='ultimateStart'&&e.playerId===knight.id);
  assert.ok(starts.length>=1,'stationary Knight actually uses the chosen Ultimate');
  assert.ok(starts.every(e=>e.ultimate==='one_hit_of_wonders'));
  assert.ok(Math.hypot(knight.position.x-post.x,knight.position.z-post.z)<.5,'Stay does not chase a player ten meters away');
  assert.ok(room.events.some(e=>e.type==='oneHitCommitted'&&e.playerId===knight.id));
});

test('Ultimate Knight in Stay drill does not run ordinary bot spell and sword attacks',()=>{
 const f=fixture(),{room,human,knight}=f;
 human.position={x:0,y:0,z:-13};human.spawnProtectionUntil=0;
 assert.equal(configureUltimateKnight(room,human.id,
   {behavior:'stay',selection:'one_hit_of_wonders',preset:'partial'},0),true);
 for(let i=0;i<420;i++){
   const now=i/30;
   human.position={x:0,y:0,z:-13};human.alive=true;
   human.health=100;human.spawnProtectionUntil=0;
   stepPracticeActors(room,now,world,{random:()=>.5});
   stepRoom(room,1/30,now,world);
 }
 assert.ok(room.events.some(e=>e.type==='ultimateStart'&&e.playerId===knight.id));
 assert.equal(room.events.some(e=>e.type==='spellCast'&&e.playerId===knight.id),false,
   'no ordinary spellcasting controller');
 assert.equal(room.events.some(e=>e.type==='attackStarted'&&e.playerId===knight.id),false,
   'no pointless sword swings from 13 metres away');
});
test('Stay returns to its marked post by ordinary foot movement after physical displacement',()=>{
  const f=fixture();
  const {room,human,knight}=f;
  human.position={x:0,y:0,z:-12};
  assert.equal(configureUltimateKnight(room,human.id,{behavior:'stay',selection:'sunder'},0),true);
  const anchor={...knight.ultimateKnight.anchor};
  knight.position={x:anchor.x+5,y:anchor.y,z:anchor.z};
  knight.prowess=0;
  knight.ultimateKnight.refillAt=20; // no new Ultimate while navigating home
  knight.ultimateLockedUntil=20;
  stepPracticeActors(room,1,world,{random:()=>.5});
  assert.equal(knight.input.forward,.6,'normal locomotion toward marked station');
  assert.equal(knight.input.sprint,false,'returns at walking pace, not teleported or boosted');
  assert.equal(knight.input.jump,false);
  assert.deepEqual(knight.ultimateKnight.anchor,anchor,'the drill post remains unchanged');
});

test('Stay defends in brief readable Guard windows, without permanent immunity',()=>{
 const {room,human,knight}=fixture();
 knight.prowess=0;knight.ultimateKnight.refillAt=50;knight.ultimateLockedUntil=50;
 human.position={x:0,y:0,z:2};knight.position={x:0,y:0,z:0};
 human.spawnProtectionUntil=0;knight.spawnProtectionUntil=0;
 stepPracticeActors(room,2,world);
 assert.equal(knight.ultimateKnight.behavior,'stay');
 assert.equal(knight.guardHeld,true,'defensive station has a genuine Guard window');
 stepPracticeActors(room,3.8,world);
 assert.equal(knight.guardHeld,false,'Guard drops for a genuine counterattack opening');
 const before=knight.health;
 assert.equal(applyDamage(room,human.id,knight.id,15,'sword',3.8),true);
 assert.equal(knight.health,before-15,'stationary Knight is a real damageable actor');
});

test('human sword can physically strike a vulnerable Ultimate Knight in normal Practice',()=>{
 const {room,human,knight}=fixture();
 human.position={x:0,y:0,z:2.05};human.yaw=0;human.input.yaw=0;
 knight.position={x:0,y:0,z:0};knight.yaw=Math.PI;knight.input.yaw=Math.PI;
 for(const p of [human,knight]){
  p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};
  p.spawnProtectionUntil=0;p.grounded=true;
 }
 // Keep the target idle for this independent sword-contact test; other
 // tests cover its fully legitimate Ultimate/Steel defense.
 knight.guardStamina=0;knight.prowess=0;knight.ultimateLockedUntil=100;
 knight.ultimateKnight.refillAt=100;
 assert.ok(beginAttack(room,human.id,2));
 for(let i=0;i<22;i++){
  const now=2+i/30;
  stepPracticeActors(room,now,world,{random:()=>.5});
  stepRoom(room,1/30,now,world);
 }
 assert.ok(room.events.some(e=>e.type==='swordHit'&&e.targetId===knight.id),
   'real collision should register a player sword against the Ultimate Knight');
 assert.ok(knight.health<100,'the actual sword hit reduces HP');
});

test('Half Lightning Knight releases its real charge promptly instead of hanging for the 1.75s maximum',()=>{
 const {room,human,knight}=fixture();
 assert.ok(configureUltimateKnight(room,human.id,{
  selection:'one_hit_of_wonders',behavior:'stay',preset:'reset'},0));
 assert.ok(configureUltimateKnight(room,human.id,{element:'lightning',tier:1},0));
 for(let i=0;i<90;i++){
  const now=i/30;
  stepPracticeActors(room,now,world,{random:()=>.5});
  stepRoom(room,1/30,now,world);
 }
 const start=room.events.find(e=>e.type==='ultimateStart'&&e.playerId===knight.id);
 const commit=room.events.find(e=>e.type==='oneHitCommitted'&&e.playerId===knight.id);
 assert.ok(start&&commit,'real Half Lightning attack committed');
 assert.ok(commit.at-start.at<.8,'the dummy released in normal responsive charge time');
 assert.ok(room.events.some(e=>e.type==='oneHitImpact'&&e.playerId===knight.id));
});

test('Full Lightning + Gale Stay shows short real teleport and the actual projectile without running away',()=>{
 const {room,human,knight}=fixture();
 human.position={x:0,y:0,z:-9};
 assert.ok(configureUltimateKnight(room,human.id,{
  selection:'one_hit_of_wonders',behavior:'stay',preset:'reset'},0));
 for(const [element,tier] of [['lightning',2],['gale',2]])
  assert.ok(configureUltimateKnight(room,human.id,{element,tier},0));
 const post={...knight.position};
 for(let i=0;i<165;i++){
  const now=i/30;
  human.position={x:0,y:0,z:-9};
  human.velocity={x:0,y:0,z:0};human.spawnProtectionUntil=0;
  stepPracticeActors(room,now,world,{random:()=>.5});
  stepRoom(room,1/30,now,world);
 }
 const tel=room.events.find(e=>e.type==='oneHitTeleport'&&e.playerId===knight.id);
 assert.ok(tel,'Full Lightning uses the real authoritative teleport');
 assert.ok(Math.hypot(tel.to.x-tel.from.x,tel.to.z-tel.from.z)<5,
   'Stay does a short real blink instead of jumping a dozen meters away');
 assert.ok(room.events.some(e=>e.type==='oneHitCommitted'&&e.playerId===knight.id));
 assert.ok(room.events.some(e=>e.type==='oneHitWave'&&e.playerId===knight.id),
   'Full Gale launches an actual projectile after the grounded slam');
 assert.ok(Math.hypot(knight.position.x-post.x,knight.position.z-post.z)<5.2,
   'the teaching opponent remains around its marked drill post');
});
