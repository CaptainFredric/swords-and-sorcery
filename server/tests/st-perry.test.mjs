import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, removePracticeDummy, resetPracticePlayer, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, applyDamage, tryCastSpell, cancelAttack } from '../../shared/sim/combat.mjs';
import { isCorrectPerryAnswer, answerPerryDialogue, dismissPerryDialogue, isCanonizationUnlocked, setupStPerry, recordPerryParry, getPlayerPerryProgress, PERRY_CORRECT_ANSWER, PERRY_INCORRECT_ANSWERS, PERRY_CONDITIONAL_ANSWERS, isHeraldEarned, selectPerryDialogueChoices, resetPerryVisitBag, PERRY_CANONIZED_SKILL, PERRY_PROFILE, PERRY_CANONIZED_PROFILE } from '../../shared/sim/StPerry.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
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
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Finally!.. I meant, that was the least you could do. Your reward?... Enjoy this brief acknowledgement.');

  // Wire command test
  assert.deepEqual(applyRoomCommand(room, human, { type: 'practicePerryDismiss' }, 5), {});
  assert.equal(dummy.stPerry.dialogue.dismissed, true);
});

test('St. Perry: Rotating dialogue choices - 4 choices, 1 correct, 3 unique incorrect', () => {
  const choices = selectPerryDialogueChoices();
  assert.equal(choices.length, 4, 'Must present exactly four choices');
  assert.ok(choices.includes(PERRY_CORRECT_ANSWER), 'Must include the fixed correct answer');

  const incorrectChoices = choices.filter(c => c !== PERRY_CORRECT_ANSWER);
  assert.equal(incorrectChoices.length, 3, 'Must have exactly 3 incorrect choices');
  assert.equal(new Set(incorrectChoices).size, 3, 'All 3 incorrect choices must be unique');

  for (const inc of incorrectChoices) {
    assert.ok(PERRY_INCORRECT_ANSWERS.includes(inc), `Must belong to authored pool: ${inc}`);
    assert.equal(isCorrectPerryAnswer(inc), false, `Must never satisfy correct-answer matcher: ${inc}`);
  }
  assert.equal(isCorrectPerryAnswer(PERRY_CORRECT_ANSWER), true, 'Correct answer must satisfy matcher');
});

test('St. Perry: Seeded determinism and 100% full coverage of authored incorrect answer pool', () => {
  // Test seeded determinism: same seed returns identical choice array
  const c1 = selectPerryDialogueChoices({ seed: 1337 });
  const c2 = selectPerryDialogueChoices({ seed: 1337 });
  assert.deepEqual(c1, c2, 'Same seed must produce identical choices in identical order');

  // Test full coverage over seeds 0 to 60
  const chosenSet = new Set();
  for (let s = 0; s < 60; s++) {
    const list = selectPerryDialogueChoices({ seed: s });
    for (const item of list) {
      if (item !== PERRY_CORRECT_ANSWER) chosenSet.add(item);
    }
  }
  for (const authored of PERRY_INCORRECT_ANSWERS) {
    assert.ok(chosenSet.has(authored), `Authored choice missing from coverage: "${authored}"`);
  }
  assert.equal(chosenSet.size, PERRY_INCORRECT_ANSWERS.length, 'Every authored incorrect choice must be reachable');
});

test('St. Perry: Herald-gated conditional answer is excluded without genuine herald', () => {
  // Unearned player
  const playerWithout = { id: 'unearned', unlockedHeralds: null };
  for (let s = 0; s < 50; s++) {
    const list = selectPerryDialogueChoices({ player: playerWithout, seed: s });
    assert.ok(!list.includes("Because 'St. Perry the Plain' was too accurate?"), 'Herald-gated answer must NOT be selected without genuine herald');
  }

  // Earned player (when genuine herald becomes available)
  const playerWith = { id: 'earned', unlockedHeralds: new Set(['st-perry-the-plain']) };
  assert.equal(isHeraldEarned(playerWith, 'st-perry-the-plain'), true);
  let seenWith = false;
  for (let s = 0; s < 100; s++) {
    const list = selectPerryDialogueChoices({ player: playerWith, seed: s });
    if (list.includes("Because 'St. Perry the Plain' was too accurate?")) {
      seenWith = true;
      break;
    }
  }
  assert.ok(seenWith, 'Herald-gated answer can appear once player legitimately owns herald');
});

test('St. Perry: Encounter choice stability and fresh selection across visits', () => {
  const { room, human } = makePracticeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
  const initialChoices = [...dummy.stPerry.dialogue.choices];
  assert.equal(initialChoices.length, 4);

  // Guess wrong answer -> choices remain identical
  const wrongChoice = initialChoices.find(c => c !== PERRY_CORRECT_ANSWER);
  answerPerryDialogue(room, human, wrongChoice, 1.0);
  assert.deepEqual(dummy.stPerry.dialogue.choices, initialChoices, 'Choices must not reshuffle on guess');

  // Switch dummy to MELEE then back to ST_PERRY -> choices remain identical
  setPracticeDummyMode(room, 'MELEE', 2.0);
  setPracticeDummyMode(room, 'ST_PERRY', 3.0);
  assert.deepEqual(dummy.stPerry.dialogue.choices, initialChoices, 'Choices must not reshuffle on opponent switch');

  // Enter fresh Practice visit (new room) -> provides new selection
  const { room: room2, human: human2 } = makePracticeFixture();
  const dummy2 = spawnPracticeDummy(room2, 'ST_PERRY', 0);
  assert.equal(dummy2.stPerry.dialogue.choices.length, 4);
});

test('St. Perry: Every authored incorrect choice advances wrongCount and follows authored progression', () => {
  for (let i = 0; i < PERRY_INCORRECT_ANSWERS.length; i++) {
    const { room, human } = makePracticeFixture();
    const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0);
    const inc = PERRY_INCORRECT_ANSWERS[i];

    // 1st wrong
    answerPerryDialogue(room, human, inc, 1.0);
    assert.equal(dummy.stPerry.dialogue.wrongCount, 1);
    assert.equal(dummy.stPerry.dialogue.lastLine, 'Incorrect! You are lucky I am a St. Try again.');

    // 2nd wrong
    answerPerryDialogue(room, human, inc, 2.0);
    assert.equal(dummy.stPerry.dialogue.wrongCount, 2);
    assert.equal(dummy.stPerry.dialogue.lastLine, 'Have you grown in intellect since we last spoke?');
  }
});

test('St. Perry: Repeatable introduction after leaving and reentering Practice', () => {
  const { room: visit1, human: h1 } = makePracticeFixture();
  const d1 = spawnPracticeDummy(visit1, 'ST_PERRY', 0);
  answerPerryDialogue(visit1, h1, PERRY_CORRECT_ANSWER, 1.0);
  assert.equal(d1.stPerry.dialogue.solved, true);

  // Leave and re-enter fresh Practice session
  const { room: visit2, human: h2 } = makePracticeFixture();
  const d2 = spawnPracticeDummy(visit2, 'ST_PERRY', 0);
  assert.equal(d2.stPerry.dialogue.solved, false, 'Fresh visit must allow playing introduction again');
  assert.equal(d2.stPerry.dialogue.dismissed, false);
  assert.equal(d2.stPerry.dialogue.lastLine, 'I am St. Perry, the Prodigious! Any idea why that is my name?');
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
  assert.equal(isCanonizationUnlocked(room, player2.id), true, 'Player 2 earning 3 parries + 1 counterparry independently unlocks Canonization');
  assert.equal(isCanonizationUnlocked(room, player1.id), false, 'Player 1 must NOT have Canonization unlocked simply because Player 2 unlocked it');

  // Player 1 attempts to switch dummy to CANONIZATION via wire command -> REJECTED
  const res1 = applyRoomCommand(room, player1, { type: 'practiceSetDummyMode', mode: 'CANONIZATION' }, 2.0);
  assert.ok(res1.rejected, 'Player 1 cannot select CANONIZATION without qualifying');

  // Player 2 attempts to switch dummy to CANONIZATION via wire command -> ACCEPTED
  const res2 = applyRoomCommand(room, player2, { type: 'practiceSetDummyMode', mode: 'CANONIZATION' }, 2.1);
  assert.equal(res2.rejected, undefined, 'Player 2 can select CANONIZATION after qualifying');
  assert.equal(perry.practiceMode, 'CANONIZATION');

  // Snapshot verification: serializeSnapshot for player1 has unlocked: false; serializeSnapshot for player2 has unlocked: true
  const snap1 = serializeSnapshot(room, 2.2, player1.id);
  const snap2 = serializeSnapshot(room, 2.2, player2.id);
  const dummy1 = snap1.players.find(p => p.actorKind === 'dummy');
  const dummy2 = snap2.players.find(p => p.actorKind === 'dummy');
  assert.equal(dummy1.stPerry.unlocked, false, 'Player 1 snapshot reflects locked status');
  assert.equal(dummy2.stPerry.unlocked, true, 'Player 2 snapshot reflects unlocked status');
  assert.deepEqual(dummy1.stPerry.unlockedPlayers, [player2.id]);
  assert.deepEqual(dummy2.stPerry.unlockedPlayers, [player2.id]);
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
