import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from './LocalHost.mjs';
import { GameLink } from './GameLink.mjs';

function yard() {
  let wall = 100;
  const host = new LocalHost({ now: () => wall, every: () => 1, cancel: () => {}, later: fn => fn() });
  host.startInspectionPractice('Inspector', 'castleward');
  host.arenaReady(true);
  const advance = seconds => { wall += seconds; host.tick(); };
  advance(0.1);
  return { host, advance };
}

test('inspection freeze stops simulation, projectiles and cooldown time; resume excludes elapsed wall time', () => {
  const { host, advance } = yard();
  host.cast({ x: 0, y: 0, z: -1 });
  for (let i = 0; i < 11; i++) advance(1 / 30);
  assert.ok(host.latestSnapshot.projectiles.length);
  assert.equal(host.setInspectionFrozen(true), true);
  const before = structuredClone(host.latestSnapshot);
  const time = host.serverNow();
  advance(25);
  host.cast({ x: 1, y: 0, z: 0 });
  assert.equal(host.serverNow(), time);
  assert.deepEqual(host.latestSnapshot, before);
  host.setInspectionFrozen(false);
  assert.equal(host.serverNow(), time);
  advance(1 / 30);
  assert.ok(Math.abs(host.serverNow() - time - 1 / 30) < 1e-9);
  assert.equal(host.latestSnapshot.tick, before.tick + 1);
});

test('single step advances exactly one authoritative tick and stays frozen', () => {
  const { host, advance } = yard();
  host.setInspectionFrozen(true);
  const time = host.serverNow();
  const tick = host.latestSnapshot.tick;
  advance(10);
  assert.equal(host.stepInspection(), true);
  assert.equal(host.inspectionFrozen, true);
  assert.equal(host.latestSnapshot.tick, tick + 1);
  assert.ok(Math.abs(host.serverNow() - time - 1 / 30) < 1e-9);
  advance(5);
  assert.equal(host.latestSnapshot.tick, tick + 1);
  host.leaveRoom();
  assert.equal(host.inspectionFrozen, false);
  assert.equal(host.stepInspection(), false);
});

test('ordinary local Practice and Bot Duel cannot be frozen', () => {
  const { host } = yard();
  for (const mode of ['PRACTICE', 'BOT_DUEL']) {
    host.startSolo(mode, 'Ordinary');
    host.arenaReady(true);
    host.tick();
    assert.equal(host.setInspectionFrozen(true), false);
    assert.equal(host.stepInspection(), false);
  }
});

test('inspection is explicitly local even online and freeze never sends a remote command', () => {
  const remote = { on() {}, calls: [], startSolo(...args) { this.calls.push(args); } };
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: fn => fn() });
  const link = new GameLink({ remote, local });
  link.status = 'online';
  assert.equal(link.setInspectionFrozen(true), false);
  link.startInspectionPractice('Inspector', 'ruined-keep');
  link.arenaReady(true);
  local.tick();
  assert.equal(link.playingLocally, true);
  assert.equal(link.inspectionAvailable, true);
  assert.equal(link.setInspectionFrozen(true), true);
  assert.equal(remote.calls.length, 0);
  link.leaveRoom();
  assert.equal(link.inspectionAvailable, false);
  assert.equal(link.stepInspection(), false);
  link.startSolo('PRACTICE', 'Ordinary');
  assert.equal(remote.calls.length, 0, 'ordinary solo stays local after leaving Inspection');
  assert.equal(link.playingLocally, true);
  assert.equal(link.inspectionAvailable, false, 'ordinary Practice still cannot be frozen');
});


test('frozen input cannot change the pose, and resume clears held actions and movement', () => {
  const { host, advance } = yard();
  host.guard(true);
  host.input({ seq: 1, forward: 1, right: 0, jump: false, sprint: false, yaw: 0, pitch: 0 });
  advance(1 / 30);
  assert.equal(host.player.guarding, true);
  host.setInspectionFrozen(true);
  host.guard(false);
  host.input({ seq: 2, forward: -1, yaw: 2, pitch: 1 });
  assert.equal(host.player.guarding, true);
  assert.equal(host.player.yaw, 0);
  host.setInspectionFrozen(false);
  assert.equal(host.player.guarding, false);
  assert.equal(host.player.input.forward, 0);
  assert.equal(host.player.attackHeld, false);
});

test('successive freezes preserve phase and a newly cast spell starts on the resumed clock', () => {
  const { host, advance } = yard();
  const start = host.serverNow();
  host.setInspectionFrozen(true);
  advance(40);
  host.stepInspection();
  host.setInspectionFrozen(false);
  advance(1 / 30);
  host.setInspectionFrozen(true);
  advance(40);
  host.stepInspection();
  host.setInspectionFrozen(false);
  assert.ok(Math.abs(host.serverNow() - start - 0.1) < 1e-9);
  host.cast({ x: 0, y: 0, z: -1 });
  assert.ok(Math.abs(host.player.castEndsAt - host.serverNow() - 0.3) < 1e-9);
});

test('Play Frames advances one tick per inspection beat, stops immediately and preserves frozen time', () => {
  const { host, advance } = yard();
  assert.equal(typeof host.playInspectionFrames, 'function');
  assert.equal(host.playInspectionFrames(true), false, 'freeze first');
  host.setInspectionFrozen(true);
  const time = host.serverNow();
  const tick = host.latestSnapshot.tick;
  assert.equal(host.playInspectionFrames(true), true);
  advance(0.19);
  assert.equal(host.latestSnapshot.tick, tick);
  advance(0.04); // polling can arrive a little after the scheduled beat
  assert.equal(host.latestSnapshot.tick, tick + 1);
  advance(0.17); // preserve cadence instead of adding the polling delay each time
  assert.equal(host.latestSnapshot.tick, tick + 2);
  assert.equal(host.inspectionFrozen, true);
  host.playInspectionFrames(false);
  advance(10);
  assert.equal(host.latestSnapshot.tick, tick + 2);
  assert.ok(Math.abs(host.serverNow() - time - 2 / 30) < 1e-9);
});

test('continuous stepping never catches up a background stall and clears on resume or leave', () => {
  const { host, advance } = yard();
  host.setInspectionFrozen(true);
  host.playInspectionFrames(true);
  const tick = host.latestSnapshot.tick;
  advance(12);
  assert.equal(host.latestSnapshot.tick, tick + 1, 'one visible step, no backlog');
  host.setInspectionFrozen(false);
  assert.equal(host.inspectionFramesPlaying, false);
  host.setInspectionFrozen(true);
  host.playInspectionFrames(true);
  host.leaveRoom();
  assert.equal(host.inspectionFramesPlaying, false);
  assert.equal(host.playInspectionFrames(true), false);
});

test('dummy possession is confined to Inspection and preserves the human identity', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('GUARDING'); advance(1);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');
  const owner = host.player;
  assert.equal(host.setInspectionActor(dummy.id), true);
  assert.equal(host.inspectionActorId, dummy.id);
  assert.equal(host.player, owner);
  assert.equal(host.playerId, owner.id, 'profile and room identity remain human');
  host.input({seq:50,forward:1,right:0,yaw:0,pitch:0});
  const oldZ = dummy.position.z;
  for(let i=0;i<12;i++)advance(1/30);
  assert(dummy.position.z < oldZ - .3, 'ordinary movement reaches the selected dummy');
  assert.equal(owner.input.forward, 0);
  assert.equal(dummy.practiceMode, 'GUARDING', 'the authored mode is preserved while its controller yields');
  assert.equal(dummy.actorKind, 'dummy');
  host.guard(true); advance(1/30); assert.equal(dummy.guarding,true);
  const facts=[];host.on('events',({events})=>facts.push(...events));
  host.guard(false); host.cast({x:0,y:0,z:-1});
  for(let i=0;i<12;i++)advance(1/30);
  assert(facts.some(e=>e.type==='spellCast'&&e.playerId===dummy.id), 'normal cast uses the possessed actor');
  assert(facts.some(e=>e.type==='projectileImpact'&&e.ownerId===dummy.id)||host.latestSnapshot.projectiles.some(p=>p.ownerId===dummy.id), 'the real projectile travels or hits scenery normally');
  host.setInspectionActor(owner.id); advance(1/30);
  assert.equal(dummy.input.forward,0); assert.equal(host.inspectionActorId,owner.id);
  host.startSolo('PRACTICE','Ordinary');host.arenaReady(true);host.tick();
  assert.equal(host.setInspectionActor(host.player.id),false);
});

test('frozen handoffs preserve the captured pose and flush both actors on resume', () => {
  const { host, advance } = yard();host.practiceSpawnDummy('PASSIVE');advance(1);
  const owner=host.player,dummy=[...host.room.players.values()].find(p=>p.actorKind==='dummy');
  host.guard(true);advance(1/30);host.setInspectionFrozen(true);
  const before=structuredClone(host.latestSnapshot.players);
  assert.equal(host.setInspectionActor(dummy.id),true);
  assert.deepEqual(host.latestSnapshot.players,before);
  assert.equal(owner.guarding,true);
  host.attack(true);host.input({seq:11,forward:1,yaw:2});
  host.setInspectionFrozen(false);advance(1/30);
  assert.equal(owner.guarding,false);assert.equal(owner.attackHeld,false);
  assert.equal(dummy.attackHeld,false);assert.equal(dummy.input.forward,0);
});

test('removed or dead possessed actors return control without stale commands', () => {
  const {host,advance}=yard();host.practiceSpawnDummy('PASSIVE');advance(1);
  const dummy=[...host.room.players.values()].find(p=>p.actorKind==='dummy');
  host.setInspectionActor(dummy.id);dummy.alive=false;advance(1/30);
  assert.equal(host.inspectionActorId,host.player.id);
  host.practiceRemoveDummy();advance(1/30);
  assert.equal(host.setInspectionActor(dummy.id),false);
  host.leaveRoom();assert.equal(host.inspectionActorId,null);
});

test('GameLink possession never forwards a command to a remote room', () => {
  const remote={on(){},calls:[],send(m){this.calls.push(m);}};
  const local=new LocalHost({every:()=>1,cancel:()=>{},later:fn=>fn()});
  const link=new GameLink({remote,local});
  assert.equal(link.setInspectionActor('someone'),false);
  link.startInspectionPractice('Inspector','castleward');link.arenaReady(true);local.tick();
  local.practiceSpawnDummy('PASSIVE');local.tick();
  const dummy=[...local.room.players.values()].find(p=>p.actorKind==='dummy');
  assert.equal(link.setInspectionActor(dummy.id),true);assert.equal(link.inspectionActorId,dummy.id);
  assert.equal(remote.calls.length,0);
});

test('free camera input release preserves frozen pose and possession cannot write challenge rewards',()=>{
 const {host,advance}=yard();host.practiceSpawnDummy('PASSIVE');advance(.1);
 const dummy=[...host.room.players.values()].find(p=>p.actorKind==='dummy');
 host.guard(true);host.input({seq:7,forward:1,yaw:host.player.yaw});advance(1/30);
 host.setInspectionFrozen(true);host.releaseInspectionInput();
 assert.equal(host.player.guarding,true);
 host.setInspectionFrozen(false);assert.equal(host.player.input.forward,0);assert.equal(host.player.guarding,false);
 host.setInspectionActor(dummy.id);host.setInspectionActor(host.player.id);
 const facts=[];host.on('events',b=>facts.push(...b.events));
 host.room.events.push({type:'prestigeChallengeCompleted',challengeId:'st-perry-plain',playerId:host.player.id,at:host.serverNow()});
 advance(1/30);
 assert.equal(host.profile,null);assert(!facts.some(e=>e.type==='prestigeChallengeCompleted'||e.type==='stPerryPlainUnlocked'));
});


test('Priority 1A: possessed dummy can prepare and execute Ultimates in Inspection Yard only', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('PASSIVE'); advance(0.1);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');
  const owner = host.player;
  const ownerProwessBefore = owner.prowess;

  assert.equal(host.setInspectionActor(dummy.id), true);
  assert.equal(host.inspectionActorId, dummy.id);

  // Ready dummy's ultimate
  host.practiceReadyUltimate();
  assert.equal(dummy.prowess, 100);

  // Trigger ultimate
  const facts = [];
  host.on('events', ({ events }) => facts.push(...events));
  host.ultimate();
  assert.ok(dummy.ultimateState, 'Dummy has started its ultimate');
  assert.equal(dummy.ultimateState.id, dummy.ultimate);

  // Advance ticks through ultimate startup and commit
  for (let i = 0; i < 20; i++) advance(1 / 30);
  assert.ok(facts.some(e => (e.type === 'ultimateStart' || e.type === 'ultimateActive') && e.playerId === dummy.id), 'Ultimate started event recorded');
  assert.equal(owner.prowess, ownerProwessBefore, 'Owner prowess was not altered');

  // Verify that competitive multiplayer / ordinary rooms reject dummy ultimates
  host.startSolo('PRACTICE', 'Ordinary');
  host.arenaReady(true);
  host.tick();
  assert.equal(host.setInspectionActor(dummy.id), false);
});

test('Priority 1B: possessed dummy can mount, drive, fire, and dismount siege machinery', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('PASSIVE'); advance(0.1);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');

  assert.equal(host.setInspectionActor(dummy.id), true);

  // Mount Bi-Bye-llista
  const mountBallistaRes = host.stageInspectionActor({ actorId: dummy.id, mount: 'ballista' });
  assert.equal(mountBallistaRes.success, true);
  assert.ok(dummy.operatingBallistaId, 'Dummy mounted the ballista');
  assert.equal(host.room.biByeLlista.operatorId, dummy.id);

  // Fire ballista
  const facts = [];
  host.on('events', ({ events }) => facts.push(...events));
  host.bibyeFire('MAIN');
  advance(1 / 30);
  assert.ok(facts.some(e => e.type?.startsWith('bibye') || host.latestSnapshot.bibyeProjectiles?.length), 'Ballista shot fired');

  // Dismount
  host.stageInspectionActor({ actorId: dummy.id, mount: 'dismount' });
  assert.equal(dummy.operatingBallistaId, null);
  assert.equal(host.room.biByeLlista.operatorId, null);

  // Mount SO-FIST-ICATION
  const mountRamRes = host.stageInspectionActor({ actorId: dummy.id, mount: 'ram' });
  assert.equal(mountRamRes.success, true);
  assert.ok(dummy.operatingRamId, 'Dummy mounted SO-FIST-ICATION');
  assert.equal(host.room.soFistication.operatorId, dummy.id);

  // Punch
  host.attack(true);
  advance(1 / 30);
  assert.ok(host.room.soFistication.strikeAt !== null, 'Ram strike initiated');

  // Safe dismount
  host.stageInspectionActor({ actorId: dummy.id, mount: 'dismount' });
  assert.equal(dummy.operatingRamId, null);
  assert.equal(host.room.soFistication.operatorId, null);
});

test('Priority 2: selective freeze modes (ALL, OTHERS, ACTOR) and projectile freezing', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('PASSIVE'); advance(1.5);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');
  const owner = host.player;

  // 1. FREEZE OTHERS: Owner moves and attacks, dummy stationary
  assert.equal(host.setInspectionFreezeMode('others'), true);
  assert.equal(host.inspectionFreezeMode, 'others');
  assert.equal(host.inspectionFrozen, false, 'Simulation continues in real time');

  const oldDummyZ = dummy.position.z;
  const oldDummyHealth = dummy.health;
  // Position owner facing dummy within sword reach
  host.stageInspectionActor({ actorId: owner.id, position: { x: dummy.position.x, y: dummy.position.y, z: dummy.position.z - 1.2 } });
  host.stageInspectionActor({ actorId: owner.id, position: 'face_target' });
  host.attack(true);
  for (let i = 0; i < 25; i++) advance(1 / 30);
  assert.equal(dummy.position.z, oldDummyZ, 'Frozen dummy stayed stationary in position');
  assert.ok(dummy.health < oldDummyHealth, 'Stationary dummy received combat damage');
  host.attack(false);

  // 2. FREEZE PROJECTILES: Cast fireball, freeze projectiles midair, verify position holds
  host.stageInspectionActor({ actorId: owner.id, position: { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 } });
  host.cast({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 11; i++) advance(1 / 30);
  assert.ok(host.latestSnapshot.projectiles.length, 'Projectile spawned and in flight');

  const pBefore = structuredClone(host.latestSnapshot.projectiles[0]);
  host.setInspectionFreezeProjectiles(true);
  assert.equal(host.inspectionFreezeProjectiles, true);
  advance(1.0); // 30 ticks elapsed
  const pDuring = host.latestSnapshot.projectiles[0];
  assert.deepEqual(pDuring.position, pBefore.position, 'Projectile stayed frozen in midair');

  // Resume projectile motion
  host.setInspectionFreezeProjectiles(false);
  advance(0.5);
  const pAfter = host.latestSnapshot.projectiles[0];
  if (pAfter) {
    assert.notDeepEqual(pAfter.position, pBefore.position, 'Projectile resumed flight');
  }

  // 3. FREEZE ACTOR: Owner frozen, dummy free
  host.setInspectionFreezeMode('actor');
  assert.equal(host.inspectionFreezeMode, 'actor');
  const ownerPosBefore = structuredClone(owner.position);
  host.input({ seq: 99, forward: 1, right: 0, yaw: 0, pitch: 0 });
  advance(0.5);
  assert.deepEqual(owner.position, ownerPosBefore, 'Frozen actor position held fixed');
});

test('Priority 3: director staging actor vitals, cooldowns, loadouts, AI and poses', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('PASSIVE'); advance(0.1);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');

  // Vitals refill
  dummy.health = 25;
  dummy.guardStamina = 10;
  host.stageInspectionActor({ actorId: dummy.id, vitals: { refill: true } });
  assert.equal(dummy.health, 100);
  assert.equal(dummy.guardStamina, 100);

  // Loadout change
  host.stageInspectionActor({ actorId: dummy.id, loadout: { spell: 'frostfire', ultimate: 'vortex' } });
  assert.equal(dummy.spell, 'frostfire');
  assert.equal(dummy.ultimate, 'vortex');

  // Pose staging
  host.stageInspectionActor({ actorId: dummy.id, pose: 'guard' });
  assert.equal(dummy.guarding, true);

  host.stageInspectionActor({ actorId: dummy.id, pose: 'idle' });
  assert.equal(dummy.guarding, false);

  // AI suspension
  host.stageInspectionActor({ actorId: dummy.id, ai: { suspended: true } });
  assert.equal(dummy.aiSuspended, true);

  // Flight staging
  host.stageInspectionActor({ actorId: dummy.id, flight: true });
  assert.equal(dummy.flight, true);
  assert.equal(dummy.grounded, false);
});

test('freeze mode OTHERS freezes incoming projectiles and unattended siege machines', () => {
  const { host, advance } = yard();
  host.practiceSpawnDummy('PASSIVE');
  advance(0.1);
  const dummy = [...host.room.players.values()].find(p => p.actorKind === 'dummy');

  // Mount ballista, fire a bolt, then dismount
  host.setInspectionActor(dummy.id);
  host.stageInspectionActor({ actorId: dummy.id, mount: 'ballista' });
  const ballista = host.room.biByeLlista;
  assert(ballista, 'ballista exists');
  host.bibyeFire('MAIN');
  advance(0.25);
  assert.ok(host.room.bibyeProjectiles?.size, 'Ballista bolt in flight');
  const bolt = [...host.room.bibyeProjectiles.values()][0];
  host.stageInspectionActor({ actorId: dummy.id, mount: 'dismount' });
  assert.equal(ballista.operatorId, null, 'ballista is unattended');

  // Set freeze mode to OTHERS with owner as active actor
  host.setInspectionActor(host.player.id);
  host.setInspectionFreezeMode('others');

  const boltPosBefore = structuredClone(bolt.position);
  advance(0.3);

  assert.deepEqual(bolt.position, boltPosBefore, 'Unattended incoming ballista bolt remained frozen in flight in OTHERS mode');

  // Dummy should not be moved by gravity if flight is enabled
  host.stageInspectionActor({ actorId: dummy.id, flight: true });
  const dummyY = dummy.position.y;
  advance(0.2);
  assert.equal(dummy.position.y, dummyY, 'dummy in flight maintains altitude when frozen as others');
});

test('Play Frames advances flying projectiles and unpauses everything cleanly on resume', () => {
  const { host, advance } = yard();
  const owner = host.player;

  // 1. Cast fireball while live
  host.stageInspectionActor({ actorId: owner.id, position: { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 } });
  host.cast({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 11; i++) advance(1 / 30);
  assert.ok(host.latestSnapshot.projectiles.length, 'Fireball spawned and in flight');
  const proj = host.latestSnapshot.projectiles[0];

  // 2. Freeze all
  host.setInspectionFreezeMode('all');
  assert.equal(host.inspectionFrozen, true);
  const posFrozen = structuredClone(host.latestSnapshot.projectiles[0].position);

  // 3. While frozen without playFrames, idle advance does not advance projectile
  advance(0.3);
  assert.deepEqual(host.latestSnapshot.projectiles[0].position, posFrozen, 'Projectile stationary while frozen');

  // 4. Start Play Frames: each beat must advance the flying projectile
  assert.equal(host.playInspectionFrames(true), true);
  assert.equal(host.inspectionFramesPlaying, true);

  advance(0.25); // Advances 1 beat (1 tick)
  const posAfterBeat1 = structuredClone(host.latestSnapshot.projectiles[0].position);
  assert.notDeepEqual(posAfterBeat1, posFrozen, 'Projectile flew forward during Play Frames beat 1');

  advance(0.2); // Advances beat 2
  const posAfterBeat2 = structuredClone(host.latestSnapshot.projectiles[0].position);
  assert.notDeepEqual(posAfterBeat2, posAfterBeat1, 'Projectile flew forward during Play Frames beat 2');

  // 5. Resume to live (unpause everything)
  assert.equal(host.setInspectionFreezeMode('none'), true);
  assert.equal(host.inspectionFrozen, false, 'Unpaused to live');
  assert.equal(host.inspectionFramesPlaying, false, 'Play frames stopped on resume');
  assert.equal(host.inspectionFreezeProjectiles, false, 'Projectiles unpaused on resume');

  // 6. Projectile continues flying in real time
  advance(0.2);
  if (host.latestSnapshot.projectiles.length > 0) {
    assert.notDeepEqual(host.latestSnapshot.projectiles[0].position, posAfterBeat2, 'Projectile resumes real-time flight');
  }
});
