import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, resetPracticePlayer, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { applyDamage, stepRoom, setGuard } from '../../shared/sim/combat.mjs';
import { setupStPerry, answerPerryDialogue, selectPerryDialogueChoices, isHeraldEarned, PERRY_CONDITIONAL_ANSWERS } from '../../shared/sim/StPerry.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { CHALLENGES } from '../../shared/src/challenges.mjs';
import { EMBLEMS, ownedEmblems } from '../../shared/src/heraldry.mjs';
import { heraldryView } from '../../client/menu/renownView.mjs';

const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -4, yaw: Math.PI }],
};

function makeFixture() {
  const room = new Room('PLAIN_TEST', { mode: 'PRACTICE' });
  room.world = world;
  const player = room.addPlayer({ id: 'player-1', token: 'tok-1', name: 'Knight' }, 0);
  room.startMatch(0);
  player.spawnProtectionUntil = 0;
  return { room, player };
}

test('Case 1: Legitimate flawless Canonization victory unlocks St. Perry the Plain prestige herald', () => {
  const { room, player } = makeFixture();
  // Player unlocks and spawns Canonization
  room.stPerryState = { byPlayer: new Map([[player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player.id);
  assert.equal(dummy.practiceMode, 'CANONIZATION');
  assert.equal(dummy.health, 100);
  assert.equal(player.damageTakenThisLife, 0);

  // Player deals 100 damage to Perry from full health to defeat
  applyDamage(room, player.id, dummy.id, 100, 'sword', 1.0);
  assert.equal(dummy.health, 0);

  // Event emitted and challenge marked completed
  const event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.ok(event, 'Must emit prestigeChallengeCompleted event');
  assert.equal(event.challengeId, 'st_perry_the_plain');
  assert.equal(event.playerId, player.id);

  const unlockEvent = room.events.find(e => e.type === 'stPerryPlainUnlocked');
  assert.ok(unlockEvent, 'Must emit unlock announcement');

  const voiceLine = room.events.find(e => e.type === 'spellbladeLine');
  assert.ok(voiceLine);
  assert.equal(voiceLine.text, 'I suppose anyone can become a saint... these days.');
  assert.equal(player.challenges?.completed?.['st_perry_the_plain'] > 0, true);
});

test('Case 2: Earlier HP damage during same life disqualifies victory, even if healed to 100 HP', () => {
  const { room, player } = makeFixture();
  room.stPerryState = { byPlayer: new Map([[player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player.id);

  // Player takes 15 HP damage earlier in life
  applyDamage(room, dummy.id, player.id, 15, 'sword', 0.5);
  assert.equal(player.health, 85);
  assert.equal(player.damageTakenThisLife, 15);

  // Practice reset restores HP to 100
  resetPracticePlayer(room, player.id, 1.0);
  assert.equal(player.health, 100);
  assert.equal(player.damageTakenThisLife, 15, 'Damage taken this life must not be erased by practice reset');

  // Player now defeats Perry
  applyDamage(room, player.id, dummy.id, 100, 'sword', 2.0);
  assert.equal(dummy.health, 0);

  const event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(event, undefined, 'Must NOT award herald if player took damage earlier in life');
});

test('Case 3: Guard stamina loss alone does not disqualify', () => {
  const { room, player } = makeFixture();
  room.stPerryState = { byPlayer: new Map([[player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player.id);

  // Player loses guard stamina through guarding
  setGuard(room, player.id, true, 0.5);
  player.guardStamina = 20; // Depleted stamina
  assert.equal(player.health, 100);
  assert.equal(player.damageTakenThisLife, 0);

  // Flawless defeat
  applyDamage(room, player.id, dummy.id, 100, 'sword', 1.0);
  assert.equal(dummy.health, 0);

  const event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.ok(event, 'Stamina loss alone must not disqualify');
  assert.equal(event.challengeId, 'st_perry_the_plain');
});

test('Case 4: Perry beginning below full health disqualifies', () => {
  const { room, player } = makeFixture();
  room.stPerryState = { byPlayer: new Map([[player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player.id);

  // Perry is already at 80 HP before the player engages him
  dummy.health = 80;

  applyDamage(room, player.id, dummy.id, 80, 'sword', 1.0);
  assert.equal(dummy.health, 0);

  const event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(event, undefined, 'Must disqualify if Perry began below 100 HP');
});

test('Case 5: Unrelated dummy or ordinary Perry defeat does not qualify', () => {
  const { room, player } = makeFixture();
  // Ordinary ST_PERRY dummy
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0, player.id);
  assert.equal(dummy.practiceMode, 'ST_PERRY');

  applyDamage(room, player.id, dummy.id, 100, 'sword', 1.0);
  assert.equal(dummy.health, 0);

  let event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(event, undefined, 'Ordinary Perry defeat must not qualify');

  // MELEE dummy
  setPracticeDummyMode(room, 'MELEE', 2.0);
  dummy.health = 100;
  applyDamage(room, player.id, dummy.id, 100, 'sword', 3.0);
  event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(event, undefined, 'Melee dummy defeat must not qualify');
});

test('Case 6: Another player cannot claim someone else flawless victory', () => {
  const { room, player: player1 } = makeFixture();
  const player2 = room.addPlayer({ id: 'player-2', token: 'tok-2', name: 'Leach' }, 0);
  player2.spawnProtectionUntil = 0;

  room.stPerryState = { byPlayer: new Map([
    [player1.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }],
    [player2.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }],
  ]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player1.id);

  // Player 1 deals 40 damage, Player 2 deals 60 damage
  applyDamage(room, player1.id, dummy.id, 40, 'sword', 1.0);
  applyDamage(room, player2.id, dummy.id, 60, 'sword', 2.0);
  assert.equal(dummy.health, 0);

  const event = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(event, undefined, 'Split damage between players must not award herald');
});

test('Case 7 & 8: ProfileStore persistence, reload & idempotence (no duplicates or Renown inflation)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-test-'));
  try {
    const store = new ProfileStore(tmpDir);
    const { token, profile } = store.open();
    assert.equal(profile.balance, 0);
    assert.equal(profile.emblems.includes('st_perry_the_plain'), false);

    // Complete challenge authoritatively
    const updated = store.completePrestigeChallenge(token, 'st_perry_the_plain', { completedAt: 123456789 });
    assert.equal(updated.balance, 0, 'Prestige challenge must award 0 Renown');
    assert.equal(updated.challenges.completed['st_perry_the_plain'], 123456789);
    assert.ok(updated.emblems.includes('st_perry_the_plain'), 'Emblems list must contain st_perry_the_plain');

    // Idempotent repeat call
    const repeat = store.completePrestigeChallenge(token, 'st_perry_the_plain', { completedAt: 999999999 });
    assert.equal(repeat.challenges.completed['st_perry_the_plain'], 123456789, 'Repeat call must be idempotent');
    assert.equal(repeat.balance, 0);

    // Reload from disk via new store instance
    const store2 = new ProfileStore(tmpDir);
    const reloaded = store2.open(token).profile;
    assert.equal(reloaded.challenges.completed['st_perry_the_plain'], 123456789);
    assert.ok(reloaded.emblems.includes('st_perry_the_plain'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Case 9 & 10: Armory/Herald UI view displays St. Perry the Plain through legitimate completed challenge', () => {
  // Before challenge completion:
  const profileLocked = {
    balance: 0,
    emblem: 'trident',
    emblems: ['trident'],
    challenges: { completed: {} },
  };
  const viewLocked = heraldryView(profileLocked, 'st_perry_the_plain', true);
  assert.equal(viewLocked.owned, false);
  assert.equal(viewLocked.status, 'Locked');
  assert.equal(viewLocked.label, 'NOT YET EARNED');
  assert.equal(viewLocked.disabled, true);

  // After challenge completion:
  const profileEarned = {
    balance: 0,
    emblem: 'trident',
    emblems: ['trident', 'st_perry_the_plain'],
    challenges: { completed: { st_perry_the_plain: 12345 } },
  };
  const viewEarned = heraldryView(profileEarned, 'st_perry_the_plain', true);
  assert.equal(viewEarned.owned, true);
  assert.equal(viewEarned.status, 'Earned');
  assert.equal(viewEarned.label, 'CARRY THIS HERALDRY');
  assert.equal(viewEarned.disabled, false);

  // Equipped:
  const profileEquipped = {
    balance: 0,
    emblem: 'st_perry_the_plain',
    emblems: ['trident', 'st_perry_the_plain'],
    challenges: { completed: { st_perry_the_plain: 12345 } },
  };
  const viewEquipped = heraldryView(profileEquipped, 'st_perry_the_plain', true);
  assert.equal(viewEquipped.carried, true);
  assert.equal(viewEquipped.status, 'Carried');
  assert.equal(viewEquipped.label, 'CARRIED');
  assert.equal(viewEquipped.disabled, true);
});

test('Case 11: Conditional answer and Perry special reaction remain locked until ownership is real', () => {
  const { room, player } = makeFixture();
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0, player.id);

  // Player does NOT own herald
  assert.equal(isHeraldEarned(player, 'st-perry-the-plain'), false);
  const choicesWithout = selectPerryDialogueChoices({ player });
  assert.ok(!choicesWithout.includes("Because 'St. Perry the Plain' was too accurate?"));

  // Typing or submitting the answer without owning herald yields ordinary wrong response
  answerPerryDialogue(room, player, "Because 'St. Perry the Plain' was too accurate?", 1.0);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Incorrect! You are lucky I am a St. Try again.');

  // Now player genuinely earns herald
  player.challenges = { completed: { st_perry_the_plain: Date.now() } };
  assert.equal(isHeraldEarned(player, 'st-perry-the-plain'), true);

  // First fresh visit guarantees special answer is present
  const choicesWith = selectPerryDialogueChoices({ player });
  assert.ok(choicesWith.includes("Because 'St. Perry the Plain' was too accurate?"));

  // Submitting the answer triggers Perry's exact authored special line
  answerPerryDialogue(room, player, "Because 'St. Perry the Plain' was too accurate?", 2.0);
  assert.equal(
    dummy.stPerry.dialogue.lastLine,
    "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"
  );
  const specialEvent = room.events.find(e => e.special === 'stPerryThePlain');
  assert.ok(specialEvent);
});

test('Case 12: Existing Practice Yard and Canonization mechanics preserved', () => {
  assert.ok(CHALLENGES.st_perry_the_plain);
  assert.equal(CHALLENGES.st_perry_the_plain.reward.renown, 0);
  assert.equal(CHALLENGES.st_perry_the_plain.reward.emblem, 'st_perry_the_plain');
  assert.ok(EMBLEMS.st_perry_the_plain);
  assert.equal(EMBLEMS.st_perry_the_plain.challenge, 'st_perry_the_plain');
  assert.equal(EMBLEMS.st_perry_the_plain.art, '/client/assets/heraldry/st-perry-the-plain.png');
});
