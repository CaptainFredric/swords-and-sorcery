import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, removePracticeDummy, resetPracticePlayer, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, applyDamage, tryCastSpell, cancelAttack } from '../../shared/sim/combat.mjs';
import { isCorrectPerryAnswer, answerPerryDialogue, dismissPerryDialogue, PERRY_CANONIZED_SKILL, PERRY_PROFILE, PERRY_CANONIZED_PROFILE } from '../../shared/sim/StPerry.mjs';
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

test('St. Perry: Times legal frontal sword parries using authentic setGuard, guard timing, and parry events', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  // Place Perry at (0, 0, 0) facing -Z (yaw = 0)
  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  // Place human directly in front of Perry (2m ahead at -Z), facing +Z towards Perry (yaw = Math.PI)
  human.position = { x: 0, y: 0, z: -1.8 };
  human.yaw = Math.PI;
  human.input = { yaw: Math.PI };
  human.history = [];

  // Human starts sword attack at t = 1.0
  let nowSec = 1.0;
  beginAttack(room, human.id, nowSec);

  // Advance room tick by tick up to strike 0 contact (contact at 1.0 + 0.40 = 1.40s)
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
  stepPracticeActors(room, nowSec + 1 / 30, room.world);
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
  stepPracticeActors(room, nowSec + 1 / 30, room.world);
  assert.equal(dummy.stPerry.playerCounterParries, 1, 'Player counterparry count must increment');
  assert.ok(dummy.staggerUntil > nowSec, 'Perry must reel from player counterparry');
});

test('St. Perry: Fails to parry when attacked from behind (outside guard cone)', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  // Place human directly BEHIND Perry
  // Perry faces yaw = 0 (towards negative z)
  dummy.position = { x: 0, y: 0, z: 0 };
  dummy.yaw = 0;
  dummy.input = { yaw: 0 };
  dummy.history = [];
  dummy.stPerry.anchor = { x: 0, y: 0, z: 0 };

  // Human is at positive z (behind Perry), facing towards negative z (at Perry's back)
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
  // Cast fireball directly at Perry
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

  // Drain Perry's stamina to 0
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

test('St. Perry: Cannot guard while staggered or during attack recovery', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  // Set Perry staggered
  dummy.staggerUntil = 5.0;
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

  assert.equal(dummy.stPerry.parries, 0, 'Perry cannot parry while staggered');
  assert.ok(dummy.health < 100, 'Perry is damaged during stagger');
});

test('St. Perry: Unlocks Canonization only after 3 Perry parries and 1 player counterparry', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);

  assert.equal(dummy.stPerry.unlocked, false);

  // 1 parry by Perry
  dummy.stPerry.parries = 1;
  dummy.stPerry.playerCounterParries = 0;
  stepTick(room, 1.0);
  assert.equal(dummy.stPerry.unlocked, false);

  // 3 parries by Perry, but 0 player counterparries
  dummy.stPerry.parries = 3;
  dummy.stPerry.playerCounterParries = 0;
  stepTick(room, 2.0);
  assert.equal(dummy.stPerry.unlocked, false);

  // 1 player counterparry, but only 2 Perry parries
  dummy.stPerry.parries = 2;
  dummy.stPerry.playerCounterParries = 1;
  stepTick(room, 3.0);
  assert.equal(dummy.stPerry.unlocked, false);

  // 3 parries by Perry AND 1 player counterparry -> Unlocks!
  dummy.stPerry.parries = 3;
  dummy.stPerry.playerCounterParries = 1;
  // Trigger event check
  room.events.push({ type: 'parry', attackerId: dummy.id, defenderId: human.id, at: 4.0 });
  stepTick(room, 4.01);
  assert.equal(dummy.stPerry.unlocked, true, 'Canonization must unlock upon satisfying criteria');
  assert.ok(room.events.some((e) => e.type === 'stPerryUnlocked'));
});

test('Canonization: Transforms Perry into full Spellblade with legitimate Chivalry ultimate', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  dummy.stPerry.unlocked = true;

  // Select Canonization mode
  assert.equal(setPracticeDummyMode(room, 'CANONIZATION', 1.0), true);
  assert.equal(dummy.practiceMode, 'CANONIZATION');
  assert.equal(dummy.name, 'St. Perry the Prodigious');
  assert.equal(dummy.health, 100);
  assert.equal(dummy.guardStamina, 100);
  assert.equal(dummy.ultimate, 'chivalry');
  assert.deepEqual(dummy.preparedSpells, ['fireball', 'frostfire', 'gale']);
  assert.equal(dummy.stPerry.canonized, true);

  // Verify Canonized Perry operates with elite decision quality without stat cheating
  assert.equal(dummy.botSkill.smartUltimate, true);
  assert.equal(dummy.botSkill.yields, true);
  assert.equal(dummy.botSkill.parry, 0.88);
  assert.ok(dummy.botSkill.reaction[0] >= 0.15, 'Realistic human reaction delay');

  // Verify prowess builds legitimately and Chivalry can be activated
  dummy.prowess = PROWESS.full;
  human.position = { x: dummy.position.x, y: dummy.position.y, z: dummy.position.z - 3.0 };
  stepTick(room, 2.0);
  assert.ok(dummy.ultimateState, 'Canonized Perry must activate Chivalry when ready');
  assert.equal(dummy.ultimateState.id, 'chivalry');
});

test('St. Perry: Can be defeated legitimately without exploits', () => {
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
