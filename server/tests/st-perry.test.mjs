import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, removePracticeDummy, resetPracticePlayer, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, applyDamage, tryCastSpell, cancelAttack } from '../../shared/sim/combat.mjs';
import { isCorrectPerryAnswer, answerPerryDialogue, dismissPerryDialogue, isCanonizationUnlocked, setupStPerry, recordPerryParry, getPlayerPerryProgress, PERRY_CANONIZED_SKILL, PERRY_PROFILE, PERRY_CANONIZED_PROFILE } from '../../shared/sim/StPerry.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { SWORD_STRIKE_TIMES, GAME } from '../../shared/src/combat.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';

const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -4, yaw: Math.PI }],
};

function makePracticeFixture() {
  const room = new Room('PERRY', { mode: 'PRACTICE' });
  room.world = world;
  const human = room.addPlayer({ id: 'human-test', token: 'token', name: 'Aden' }, 0);
  room.startMatch(0);
  human.spawnProtectionUntil = 0;
  return { room, human };
}

function stepTick(room, nowSec, dt = 1 / 30) {
  stepPracticeActors(room, nowSec, room.world);
  stepRoom(room, dt, nowSec, room.world);
}

test('St. Perry: Opponent setup, exact name display, and clean state initialization', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  assert.ok(dummy);
  assert.equal(dummy.practiceMode, 'ST_PERRY');
  assert.equal(dummy.name, 'St. Perry the Prodigious');
  assert.equal(dummy.health, 100);
  assert.equal(dummy.guardStamina, 100);
  assert.equal(dummy.stPerry.parries, 0);
  assert.equal(dummy.stPerry.playerCounterParries, 0);
  assert.equal(dummy.stPerry.unlocked, false);
  assert.equal(dummy.stPerry.canonized, false);
});

test('St. Perry: Part II dialogue - correct answers, wrong answers with exact authored lines, and case-insensitivity', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  assert.ok(dummy.stPerry.dialogue);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'I am St. Perry, the Prodigious! Any idea why that is my name?');

  // Verify answer matcher
  assert.equal(isCorrectPerryAnswer('parry'), true);
  assert.equal(isCorrectPerryAnswer('PARRY'), true);
  assert.equal(isCorrectPerryAnswer('parrying'), true);
  assert.equal(isCorrectPerryAnswer('Because you parry?'), true);
  assert.equal(isCorrectPerryAnswer('pears'), false);
  assert.equal(isCorrectPerryAnswer('humility'), false);

  // 1st wrong answer
  assert.equal(answerPerryDialogue(room, human, 'Because you like pears?', 1), true);
  assert.equal(dummy.stPerry.dialogue.wrongCount, 1);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Incorrect! You are lucky I am a St. Try again.');

  // 2nd wrong answer
  assert.equal(answerPerryDialogue(room, human, 'Because of your modesty?', 2), true);
  assert.equal(dummy.stPerry.dialogue.wrongCount, 2);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Have you grown in intellect since we last spoke?');

  // 3rd wrong answer (subsequent wrong answer)
  assert.equal(answerPerryDialogue(room, human, 'Because you wear green?', 3), true);
  assert.equal(dummy.stPerry.dialogue.wrongCount, 3);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Have you grown in intellect since we last spoke?');

  // Correct answer
  assert.equal(answerPerryDialogue(room, human, 'Because you parry!', 4), true);
  assert.equal(dummy.stPerry.dialogue.solved, true);
  assert.ok(dummy.stPerry.dialogue.lastLine.includes('Precisely!'));

  // Wire command test
  assert.deepEqual(applyRoomCommand(room, human, { type: 'practicePerryDismiss' }, 5), {});
  assert.equal(dummy.stPerry.dialogue.dismissed, true);
});

test('St. Perry: Dialogue UX does not needlessly repeat after introduction is completed', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  // Complete introduction via correct answer
  answerPerryDialogue(room, human, 'parry', 1.0);
  assert.equal(dummy.stPerry.dialogue.solved, true);

  // Switch dummy to Mr. Melee
  setPracticeDummyMode(room, 'MELEE', 2.0);
  assert.equal(dummy.practiceMode, 'MELEE');

  // Switch dummy back to St. Perry
  setPracticeDummyMode(room, 'ST_PERRY', 3.0);
  assert.equal(dummy.practiceMode, 'ST_PERRY');
  assert.equal(dummy.stPerry.dialogue.dismissed, true, 'Introduction must remain dismissed on re-selecting Perry');
});

test('St. Perry: Times legal frontal sword parries using authentic setGuard, guard timing, and parry events', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  human.position = { x: 0, y: 0, z: -1.8 };
  human.yaw = Math.PI;
  human.input = { yaw: Math.PI };
  human.history = [];

  let nowSec = 1.0;
  beginAttack(room, human.id, nowSec);

  let parried = false;
  while (nowSec < 1.45) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
    const parryEvent = room.events.find((e) => e.type === 'parry' && e.defenderId === dummy.id && e.attackerId === human.id);
    if (parryEvent) {
      parried = true;
      break;
    }
  }

  assert.ok(parried, 'St. Perry must authoritatively parry an incoming frontal sword strike');
  assert.equal(dummy.stPerry.parries, 1, 'Perry parry count must increment');
  assert.ok(human.staggerUntil > nowSec, 'Human must be staggered after being parried');
});

test('St. Perry: Delivers a single measured, telegraphed counterattack that can be counterparried by player', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  human.position = { x: 0, y: 0, z: -1.8 };
  human.yaw = Math.PI;
  human.input = { yaw: Math.PI };
  human.history = [];

  // 1. Human attacks and gets parried
  let nowSec = 1.0;
  beginAttack(room, human.id, nowSec);
  while (nowSec < 1.45) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
    if (dummy.stPerry.parries > 0) break;
  }
  assert.equal(dummy.stPerry.parries, 1);
  assert.ok(dummy.stPerry.pendingCounter, 'Perry must queue a measured counterattack');

  // 2. Step forward until Perry launches counterattack
  while (nowSec < 1.80 && !dummy.attackActive) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }
  assert.ok(dummy.attackActive, 'Perry must execute his counterattack');
  assert.equal(dummy.attackHeld, false, 'Counterattack must be a single strike without held chain');

  // Contact for Perry counterattack strike 0 is at attackStartedAt + 0.40
  const counterContact = dummy.attackStartedAt + SWORD_STRIKE_TIMES[0];

  // Human raises guard 100ms before Perry contact to counterparry
  while (nowSec < counterContact - 0.10) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }
  setGuard(room, human.id, true, nowSec);

  // Step across contact point
  let playerCounterParried = false;
  while (nowSec < counterContact + 0.15) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
    const parryEvent = room.events.find((e) => e.type === 'parry' && e.defenderId === human.id && e.attackerId === dummy.id);
    if (parryEvent) {
      playerCounterParried = true;
      break;
    }
  }

  assert.ok(playerCounterParried, 'Player must be able to counterparry Perry counterattack');
  assert.equal(dummy.stPerry.playerCounterParries, 1, 'Player counterparry count must increment');
  assert.ok(dummy.staggerUntil > nowSec, 'Perry must reel from player counterparry');
});

test('St. Perry: Fails to parry when attacked from behind (outside guard cone)', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  // Human is behind Perry (positive z), facing negative z
  human.position = { x: 0, y: 0, z: 1.8 };
  human.yaw = 0;
  human.input = { yaw: 0 };
  human.history = [];

  const initialHp = dummy.health;
  let nowSec = 1.0;
  beginAttack(room, human.id, nowSec);

  while (nowSec < 1.45) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }

  assert.equal(dummy.stPerry.parries, 0, 'Perry cannot parry attacks from behind');
  assert.ok(dummy.health < initialHp, 'Perry must take damage when struck from behind');
});

test('St. Perry: Fails to parry damaging spells (Fireball damages and burns him)', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  human.position = { x: 0, y: 0, z: -3.0 };
  human.yaw = Math.PI;
  human.input = { yaw: Math.PI };
  human.history = [];
  human.spell = 'fireball';

  const initialHp = dummy.health;
  tryCastSpell(room, human.id, { x: 0, y: 0, z: 1 }, 1.0);

  let nowSec = 1.0;
  while (nowSec < 2.5 && dummy.health === initialHp) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }

  assert.ok(dummy.health < initialHp, 'Fireball must bypass melee guard and damage Perry');
  assert.ok(dummy.burn, 'Perry must suffer burn effect from Fireball');
});

test('St. Perry: Respects guard stamina depletion and guard break stagger', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  dummy.guardStamina = 0;
  dummy.lastGuardDrainAt = 1.0;
  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  human.position = { x: 0, y: 0, z: -1.8 };
  human.yaw = Math.PI;
  human.input = { yaw: Math.PI };
  human.history = [];

  let nowSec = 1.0;
  beginAttack(room, human.id, nowSec);

  while (nowSec < 1.45) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }

  assert.equal(dummy.stPerry.parries, 0, 'Perry cannot parry with depleted stamina');
  assert.ok(dummy.health < 100, 'Perry takes hit damage without stamina');
});

test('St. Perry: Server-side enforcement blocks Canonization before unlock criteria are met', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  assert.equal(isCanonizationUnlocked(room), false);

  // Direct setPracticeDummyMode fails before unlock
  assert.equal(setPracticeDummyMode(room, 'CANONIZATION', 1.0), false);
  assert.equal(dummy.practiceMode, 'ST_PERRY', 'Dummy must remain in ST_PERRY mode');

  // Wire command is rejected before unlock
  const res = applyRoomCommand(room, human, { type: 'practiceSetDummyMode', mode: 'CANONIZATION' }, 1.0);
  assert.ok(res.rejected, 'practiceSetDummyMode for CANONIZATION must be rejected before unlock');

  // Direct spawnPracticeDummy fails before unlock
  removePracticeDummy(room);
  const spawned = spawnPracticeDummy(room, 'CANONIZATION', 2.0);
  assert.equal(spawned, null, 'spawnPracticeDummy for CANONIZATION must return null before unlock');

  // Direct setupStPerry does not manufacture unlocked = true
  const freshDummy = spawnPracticeDummy(room, 'ST_PERRY', 3.0);
  setupStPerry(freshDummy, 3.0, true, room);
  assert.equal(freshDummy.stPerry.unlocked, false, 'setupStPerry must never set unlocked = true when room is locked');
  assert.equal(freshDummy.stPerry.canonized, false, 'canonized must be false when locked');
});

test('St. Perry: Unlock tracking is strictly scoped to Perry vs player and resets on switch or reset', () => {
  const { room, human } = makePracticeFixture();

  // 1. Parrying other opponents (e.g. MELEE) does NOT satisfy Perry requirements
  const meleeDummy = spawnPracticeDummy(room, 'MELEE', 0);
  meleeDummy.position = { x: 0, y: 0, z: 0 };
  meleeDummy.yaw = 0;
  human.position = { x: 0, y: 0, z: -1.8 };
  human.yaw = Math.PI;

  // Let human parry Melee bot
  human.parries = 10;
  stepTick(room, 1.0);
  assert.equal(isCanonizationUnlocked(room), false, 'Player parries against other opponents must not unlock Canonization');

  // 2. Spawn St. Perry
  setPracticeDummyMode(room, 'ST_PERRY', 2.0);
  const perryDummy = spawnPracticeDummy(room, 'ST_PERRY', 2.0);
  assert.equal(perryDummy.stPerry.parries, 0);
  assert.equal(perryDummy.stPerry.playerCounterParries, 0);
  assert.equal(isCanonizationUnlocked(room), false);

  // 3. Resetting practice player clears incomplete progress for that player
  const prog = getPlayerPerryProgress(room, human.id);
  prog.perryParries = 2;
  prog.playerCounterParries = 0;
  resetPracticePlayer(room, human.id, 3.0);
  assert.equal(getPlayerPerryProgress(room, human.id).perryParries, 0, 'Resetting practice must clear incomplete Perry parries');
  assert.equal(isCanonizationUnlocked(room), false);

  // 4. Switching opponent away from Perry clears incomplete progress
  getPlayerPerryProgress(room, human.id).perryParries = 2;
  getPlayerPerryProgress(room, human.id).playerCounterParries = 0;
  setPracticeDummyMode(room, 'MELEE', 4.0);
  assert.equal(room.stPerryState.byPlayer?.size ?? 0, 0, 'Switching opponent must clear incomplete Perry parries');

  // 5. Earn legitimate criteria: 3 Perry parries + 1 player counterparry
  setPracticeDummyMode(room, 'ST_PERRY', 5.0);
  const perry = spawnPracticeDummy(room, 'ST_PERRY', 5.0);
  // Simulate 3 Perry parries against human
  recordPerryParry(room, human, perry, 5.1);
  recordPerryParry(room, human, perry, 5.2);
  recordPerryParry(room, human, perry, 5.3);
  assert.equal(isCanonizationUnlocked(room), false, '3 Perry parries without counterparry is not enough');

  // Now human counterparries Perry
  recordPerryParry(room, perry, human, 5.4);
  assert.equal(isCanonizationUnlocked(room), true, '3 Perry parries + 1 counterparry unlocks Canonization!');
  assert.equal(perry.stPerry.unlocked, true);

  // Now CANONIZATION can be selected legitimately
  assert.equal(setPracticeDummyMode(room, 'CANONIZATION', 6.0), true);
  assert.equal(perry.practiceMode, 'CANONIZATION');
  assert.equal(perry.stPerry.canonized, true);
});

test('St. Perry: Multiplayer Practice progress is isolated per player and cannot be pooled', () => {
  const room = new Room('PERRY_MULTI', { mode: 'PRACTICE' });
  room.world = world;
  const player1 = room.addPlayer({ id: 'human-1', token: 'token1', name: 'Aden' }, 0);
  const player2 = room.addPlayer({ id: 'human-2', token: 'token2', name: 'Bryn' }, 0);
  room.startMatch(0);
  player1.spawnProtectionUntil = 0;
  player2.spawnProtectionUntil = 0;

  const perry = spawnPracticeDummy(room, 'ST_PERRY', 0);
  assert.ok(perry);

  // Player 1 attacks Perry twice -> Perry parries twice for Player 1
  recordPerryParry(room, player1, perry, 1.0);
  recordPerryParry(room, player1, perry, 1.1);

  // Player 2 gets attacked by Perry once -> Player 2 counterparries Perry
  recordPerryParry(room, perry, player2, 1.2);

  const prog1 = getPlayerPerryProgress(room, player1.id);
  const prog2 = getPlayerPerryProgress(room, player2.id);

  assert.equal(prog1.perryParries, 2);
  assert.equal(prog1.playerCounterParries, 0);
  assert.equal(prog2.perryParries, 0);
  assert.equal(prog2.playerCounterParries, 1);

  assert.equal(isCanonizationUnlocked(room), false, 'Combining Player 1 and Player 2 parries must NOT unlock Canonization');

  // Player 2 also has Perry parry him twice (now Player 2 has 2 parries + 1 counterparry -> still not 3)
  recordPerryParry(room, player2, perry, 1.3);
  recordPerryParry(room, player2, perry, 1.4);
  assert.equal(isCanonizationUnlocked(room), false, 'Player 2 with 2 parries + 1 counterparry is not enough');

  // Player 2 gets 3rd parry:
  recordPerryParry(room, player2, perry, 1.5);
  assert.equal(isCanonizationUnlocked(room), true, 'Player 2 earning 3 parries + 1 counterparry independently unlocks Canonization');
});

test('St. Perry: Canonization unlock announcement is emitted exactly once upon transition', () => {
  const { room, human } = makePracticeFixture();
  const perry = spawnPracticeDummy(room, 'ST_PERRY', 0);

  recordPerryParry(room, human, perry, 1.0);
  recordPerryParry(room, human, perry, 1.1);
  recordPerryParry(room, human, perry, 1.2);
  recordPerryParry(room, perry, human, 1.3);

  const unlockEvents = room.events.filter(e => e.type === 'stPerryUnlocked');
  assert.equal(unlockEvents.length, 1, 'stPerryUnlocked event emitted upon unlocking');

  // Additional parries after unlock
  recordPerryParry(room, human, perry, 2.0);
  recordPerryParry(room, perry, human, 2.1);

  const unlockEventsAfter = room.events.filter(e => e.type === 'stPerryUnlocked');
  assert.equal(unlockEventsAfter.length, 1, 'stPerryUnlocked event must NOT repeat on subsequent parries');
});

test('Canonization: Chivalry spell casting uses prepared-spell API with real projectiles, cooldowns, and Gale blasts', async () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  room.stPerryState = { unlocked: true, perryParries: 3, playerCounterParries: 1 };
  dummy.stPerry.unlocked = true;

  setPracticeDummyMode(room, 'CANONIZATION', 1.0);
  assert.equal(dummy.practiceMode, 'CANONIZATION');

  // Place human 4m in front of Perry
  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0; // facing negative z
  human.position = { x: 0, y: 0, z: -4.0 };
  human.yaw = Math.PI;

  // Trigger Chivalry ultimate
  dummy.prowess = PROWESS.full;
  stepTick(room, 2.0);
  assert.ok(dummy.ultimateState, 'Chivalry must be active');
  assert.equal(dummy.ultimateState.id, 'chivalry');

  // Step into Chivalry loop phase (phase >= 0.8) where spell casting occurs
  // Startup is 0.65s (active at 2.65s); first cast slot occurs at phase >= 0.8s (t = 3.45s) and gathers for 0.33s (spawns at t = 3.80s)
  let nowSec = 2.0;
  let projectileSpawned = false;
  while (nowSec < 3.9) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
    if (room.projectiles.size > 0) {
      projectileSpawned = true;
      break;
    }
  }

  assert.ok(projectileSpawned, 'Canonized Perry must spawn authoritative projectile spells during Chivalry');
  const proj = [...room.projectiles.values()][0];
  assert.equal(proj.ownerId, dummy.id);
  assert.ok(['fireball', 'frostfire'].includes(proj.spell));
});

test('Canonization: Turning is physically constrained and allows legitimate flanking during Chivalry', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  room.stPerryState = { unlocked: true, perryParries: 3, playerCounterParries: 1 };
  dummy.stPerry.unlocked = true;

  setPracticeDummyMode(room, 'CANONIZATION', 1.0);
  dummy.prowess = PROWESS.full;
  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0; // facing negative z

  human.position = { x: 0, y: 0, z: -3.0 };
  human.yaw = Math.PI;
  stepTick(room, 2.0); // activates Chivalry

  // Player immediately flashes/teleports behind Perry (positive z)
  human.position = { x: 0, y: 0, z: 2.5 };
  human.yaw = 0; // facing negative z towards Perry's back
  human.history = [];

  const initialYaw = dummy.yaw;
  // Step single tick (dt = 1/30s)
  stepTick(room, 2.0 + 1 / 30);

  // Verify Perry does NOT instantaneously snap 180 degrees (Math.PI)
  const yawDelta = Math.abs(dummy.yaw - initialYaw);
  assert.ok(yawDelta < 0.35, `Perry must turn smoothly, not snap instantaneously (turned ${yawDelta.toFixed(3)} rad)`);

  // Striking Perry's back while he is turning lands as hit damage
  const hpBefore = dummy.health;
  beginAttack(room, human.id, 2.05);
  let nowSec = 2.05;
  while (nowSec < 2.50) {
    nowSec += 1 / 30;
    stepTick(room, nowSec);
  }
  assert.ok(dummy.health < hpBefore, 'Flank strike during Chivalry turn must damage Perry');
});

test('St. Perry: Can be defeated legitimately and resets cleanly', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  applyDamage(room, human.id, dummy.id, 100, 'sword', 1.0);
  assert.equal(dummy.health, 0);
  assert.equal(dummy.alive, false);

  // Normal practice reset can restore
  assert.equal(setPracticeDummyMode(room, 'ST_PERRY', 2.0), true);
  assert.equal(dummy.alive, true);
  assert.equal(dummy.health, 100);
});

test('St. Perry: Mode switching, cleanup, and removal preserve no stale state', () => {
  const { room } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  assert.ok(dummy.stPerry);

  // Switch to Mr. Melee
  setPracticeDummyMode(room, 'MELEE', 1.0);
  assert.equal(dummy.practiceMode, 'MELEE');
  assert.equal(dummy.name, 'Mr. Melee');
  assert.equal(dummy.stPerry, null, 'St. Perry state must be cleaned up');

  // Switch back to St. Perry
  setPracticeDummyMode(room, 'ST_PERRY', 2.0);
  assert.equal(dummy.name, 'St. Perry the Prodigious');
  assert.ok(dummy.stPerry);

  // Remove dummy completely
  assert.equal(removePracticeDummy(room), true);
  assert.equal([...room.players.values()].some((p) => p.actorKind === 'dummy'), false);
});
