import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Room } from '../../shared/sim/Room.mjs';
import { spawnPracticeDummy, setPracticeDummyMode, resetPracticePlayer, stepPracticeActors } from '../../shared/sim/practice.mjs';
import { applyDamage, stepRoom, setGuard } from '../../shared/sim/combat.mjs';
import { setupStPerry, answerPerryDialogue, selectPerryDialogueChoices, isHeraldEarned, PERRY_CONDITIONAL_ANSWERS, normalizeDialogueGuess } from '../../shared/sim/StPerry.mjs';
import { LocalHost, SOLO_PROFILE_KEY } from '../../client/network/LocalHost.mjs';
import { createGameServer } from '../src/server.mjs';
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

test('Case 13: LocalHost solo achievement persistence, reload, room change, and storage error handling', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const host = new LocalHost({ storage: mockStorage, every: () => {}, cancel: () => {}, later: (fn) => fn() });
  const messages = [];
  host.on('*', ({ type, payload }) => messages.push({ type, payload }));

  // Start solo practice
  host.startSolo('PRACTICE', 'SoloKnight');
  assert.ok(host.player);
  assert.equal(host.player.damageTakenThisLife, 0);
  assert.equal(isHeraldEarned(host.player, 'st-perry-the-plain'), false);

  // Setup Canonization
  host.room.stPerryState = { byPlayer: new Map([[host.player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(host.room, 'CANONIZATION', 0, host.player.id);
  assert.equal(dummy.health, 100);

  // Flawless defeat
  applyDamage(host.room, host.player.id, dummy.id, 100, 'sword', 1.0);
  assert.equal(dummy.health, 0);

  // Tick LocalHost to process room events
  host.tick();

  // Storage must now contain the saved profile with st_perry_the_plain completed
  const rawSaved = mockStorage.getItem(SOLO_PROFILE_KEY) || mockStorage.getItem('ss-profile-cache');
  assert.ok(rawSaved, 'Must save profile to storage');
  const savedProfile = JSON.parse(rawSaved);
  assert.ok(savedProfile.challenges.completed.st_perry_the_plain > 0);
  assert.ok(savedProfile.emblems.includes('st_perry_the_plain'));

  // Confirmed unlock announcements must be delivered on events channel
  const eventMessages = messages.filter(m => m.type === 'events');
  const allEvents = eventMessages.flatMap(m => m.payload.events || []);
  const unlockFeed = allEvents.find(e => e.type === 'stPerryPlainUnlocked');
  assert.ok(unlockFeed, 'Must deliver stPerryPlainUnlocked on events channel');
  assert.equal(unlockFeed.playerId, host.player.id);

  const voiceSubtitle = allEvents.find(e => e.type === 'spellbladeLine');
  assert.ok(voiceSubtitle, 'Must deliver spellbladeLine subtitle on events channel');
  assert.equal(voiceSubtitle.text, 'I suppose anyone can become a saint... these days.');

  // Leave room and reenter fresh Practice
  host.leaveRoom();
  host.startSolo('PRACTICE', 'SoloKnight');

  // New player in new room must have herald hydrated from storage
  assert.ok(host.player.challenges.completed.st_perry_the_plain > 0, 'Challenges must be restored from storage');
  assert.ok(host.player.emblems.includes('st_perry_the_plain'), 'Emblems must be restored from storage');
  assert.equal(isHeraldEarned(host.player, 'st-perry-the-plain'), true);

  // Guaranteed riddle answer appears in fresh visit
  const choices = selectPerryDialogueChoices({ player: host.player });
  assert.ok(choices.includes("Because 'St. Perry the Plain' was too accurate?"));

  // Storage failure test: blocked storage emits profileError, preserves pending, and recovers on retry
  let allowSave = false;
  let fakeClock = 10;
  const failStore = new Map();
  const recoverableStorage = {
    getItem: (k) => failStore.get(k) ?? null,
    setItem: (k, v) => {
      if (!allowSave) throw new Error('QuotaExceeded');
      failStore.set(k, String(v));
    },
    removeItem: (k) => failStore.delete(k),
  };
  const failingHost = new LocalHost({
    now: () => fakeClock,
    storage: recoverableStorage,
    every: () => {},
    cancel: () => {},
    later: (fn) => fn(),
  });
  const failMessages = [];
  failingHost.on('*', ({ type, payload }) => failMessages.push({ type, payload }));
  failingHost.startSolo('PRACTICE', 'Unlucky');
  failingHost.room.stPerryState = { byPlayer: new Map([[failingHost.player.id, { unlocked: true }]]) };
  const dummy2 = spawnPracticeDummy(failingHost.room, 'CANONIZATION', 0, failingHost.player.id);
  applyDamage(failingHost.room, failingHost.player.id, dummy2.id, 100, 'sword', fakeClock);
  failingHost.tick();

  const errProfile = failMessages.find(m => m.type === 'profileError');
  assert.ok(errProfile, 'Must emit profileError when storage write fails');
  const failAllEvents = failMessages.filter(m => m.type === 'events').flatMap(m => m.payload.events || []);
  assert.equal(failAllEvents.find(e => e.type === 'stPerryPlainUnlocked'), undefined, 'Must NOT announce unlock if save fails');
  assert.ok(failingHost.pendingPrestige, 'Must preserve pending achievement for retry');

  // Recover storage and tick again
  allowSave = true;
  fakeClock += 2;
  failingHost.tick();

  // Retry succeeded: confirmed unlock event delivered and pending cleared
  const recoveredEvents = failMessages.filter(m => m.type === 'events').flatMap(m => m.payload.events || []);
  assert.ok(recoveredEvents.find(e => e.type === 'stPerryPlainUnlocked'), 'Must announce unlock after storage recovery');
  assert.equal(failingHost.pendingPrestige, null, 'Must clear pending after successful save');
  const recoveredProfile = JSON.parse(failStore.get(SOLO_PROFILE_KEY));
  assert.ok(recoveredProfile.challenges.completed.st_perry_the_plain > 0);
});

function createInbox(ws) {
  const messages = [];
  ws.addEventListener('message', (e) => messages.push(JSON.parse(e.data)));
  return async (type, predicate = () => true, timeoutMs = 5000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const i = messages.findIndex(m => m.type === type && predicate(m));
      if (i >= 0) return messages.splice(i, 1)[0];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`Missing message of type ${type}`);
  };
}

test('Case 14: Real network-hosted ownership restoration and server restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-net-restoration-'));
  const store = new ProfileStore(dir);
  const game = createGameServer({ port: 0, host: '127.0.0.1', profileStore: store });
  await game.start();
  const sockets = [];

  t.after(async () => {
    sockets.forEach(s => { try { s.close(); } catch {} });
    try { await game.stop(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function connect(activeGame, token = null) {
    const ws = new WebSocket(`ws://127.0.0.1:${activeGame.address().port}/ws`);
    sockets.push(ws);
    const next = createInbox(ws);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    ws.send(JSON.stringify({ type: 'profileHello', token }));
    const profileMsg = await next('profile');
    return { ws, next, token: profileMsg.token || token, profile: profileMsg.profile };
  }

  // 1. Fresh connection without herald
  const c1 = await connect(game);
  assert.ok(c1.token);
  assert.equal(isHeraldEarned({ challenges: c1.profile?.challenges }, 'st-perry-the-plain'), false);

  // Join Practice Yard
  c1.ws.send(JSON.stringify({ type: 'startSolo', name: 'KnightOne', mode: 'PRACTICE' }));
  const joined1 = await c1.next('joined');
  assert.ok(joined1.roomCode);

  const room1 = game.roomManager.findByCode(joined1.roomCode);
  const player1 = room1.players.get(joined1.playerId);
  assert.ok(player1);
  assert.equal(isHeraldEarned(player1, 'st-perry-the-plain'), false, 'Unearned player must not have herald in simulation');

  // Spawn St. Perry in Practice Yard
  c1.ws.send(JSON.stringify({ type: 'practiceSpawnDummy', mode: 'ST_PERRY' }));
  await c1.next('events', evs => evs.events?.some(e => e.type === 'practiceDummySpawned'));

  // Dialogue choices without herald:
  const choicesWithout = selectPerryDialogueChoices({ player: player1 });
  assert.ok(!choicesWithout.includes("Because 'St. Perry the Plain' was too accurate?"), 'Riddle choices must NOT contain special guess');

  // Submitting the special answer without herald returns ordinary rejection
  c1.ws.send(JSON.stringify({ type: 'practicePerryAnswer', answer: "Because 'St. Perry the Plain' was too accurate?" }));
  const rejectSub = await c1.next('events', evs => evs.events?.some(e => e.type === 'stPerryDialogue'));
  const rejectEvent = rejectSub.events.find(e => e.type === 'stPerryDialogue');
  assert.equal(rejectEvent.text, 'Incorrect! You are lucky I am a St. Try again.');

  // 2. Authoritatively earn the herald in ProfileStore
  store.completePrestigeChallenge(c1.token, 'st_perry_the_plain', { completedAt: Date.now() });

  // Disconnect client 1 and STOP game server (simulating full server restart)
  c1.ws.close();
  await game.stop();

  // 3. Restart game server with fresh instance pointing to the SAME data directory
  const restartedStore = new ProfileStore(dir);
  const restartedGame = createGameServer({ port: 0, host: '127.0.0.1', profileStore: restartedStore });
  await restartedGame.start();

  t.after(async () => {
    try { await restartedGame.stop(); } catch {}
  });

  // Reconnect with same guest profile token to restarted server
  const c2 = await connect(restartedGame, c1.token);
  assert.ok(c2.profile.challenges.completed.st_perry_the_plain > 0, 'Reconnected profile must have challenge');
  assert.ok(c2.profile.emblems.includes('st_perry_the_plain'), 'Reconnected profile must have emblem');

  // Enter Practice Yard on restarted server
  c2.ws.send(JSON.stringify({ type: 'startSolo', name: 'EarnedKnight', mode: 'PRACTICE' }));
  const joined2 = await c2.next('joined');
  const room2 = restartedGame.roomManager.findByCode(joined2.roomCode);
  const player2 = room2.players.get(joined2.playerId);

  // Authoritative attachment on real restarted server
  assert.equal(isHeraldEarned(player2, 'st-perry-the-plain'), true, 'Player attached on restarted server must have herald');
  assert.ok(player2.emblems.includes('st_perry_the_plain'));

  // Spawn St. Perry on restarted server
  c2.ws.send(JSON.stringify({ type: 'practiceSpawnDummy', mode: 'ST_PERRY' }));
  await c2.next('events', evs => evs.events?.some(e => e.type === 'practiceDummySpawned'));

  // Dialogue choices with herald on restarted server
  const choicesWith = selectPerryDialogueChoices({ player: player2 });
  assert.ok(choicesWith.includes("Because 'St. Perry the Plain' was too accurate?"), 'Riddle choices must include special guess');

  // Submitting the special answer provokes Perry's exact authored indignant reaction
  c2.ws.send(JSON.stringify({ type: 'practicePerryAnswer', answer: "Because 'St. Perry the Plain' was too accurate?" }));
  const specialSub = await c2.next('events', evs => evs.events?.some(e => e.type === 'stPerryDialogue' && e.special === 'stPerryThePlain'));
  const specialEvent = specialSub.events.find(e => e.special === 'stPerryThePlain');
  assert.equal(
    specialEvent.text,
    "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"
  );
});

test('Case 15: Tightened special-answer trigger', () => {
  const { room, player } = makeFixture();
  player.challenges = { completed: { st_perry_the_plain: Date.now() } };
  const dummy = spawnPracticeDummy(room, 'ST_PERRY', 0, player.id);

  // Exact authored line triggers special reaction
  answerPerryDialogue(room, player, "Because 'St. Perry the Plain' was too accurate?", 1.0);
  assert.equal(
    dummy.stPerry.dialogue.lastLine,
    "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"
  );

  // Reset dialogue
  dummy.stPerry.dialogue.lastLine = '';
  dummy.stPerry.dialogue.wrongCount = 0;

  // Normalized variants without quotes or with different casing match
  answerPerryDialogue(room, player, "because st perry the plain was too accurate", 2.0);
  assert.equal(
    dummy.stPerry.dialogue.lastLine,
    "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"
  );

  // Unrelated sentence containing words "plain" and "accurate" does NOT match
  dummy.stPerry.dialogue.lastLine = '';
  dummy.stPerry.dialogue.wrongCount = 0;
  answerPerryDialogue(room, player, "The plain truth is that your sword is not accurate", 3.0);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Incorrect! You are lucky I am a St. Try again.');

  // Another unrelated phrase
  answerPerryDialogue(room, player, "plain and accurate strike", 4.0);
  assert.equal(dummy.stPerry.dialogue.lastLine, 'Have you grown in intellect since we last spoke?');
});

test('Case 16: Comprehensive combat damage audit (overkill, burn ticks, and respawn)', () => {
  const { room, player } = makeFixture();
  room.stPerryState = { byPlayer: new Map([[player.id, { unlocked: true, perryParries: 3, playerCounterParries: 1 }]]) };
  const dummy = spawnPracticeDummy(room, 'CANONIZATION', 0, player.id);

  // Overkill damage capping test:
  // Perry has 100 HP. Player 1 deals 40. Then Player 2 deals 120 overkill on remaining 60 HP.
  const player2 = room.addPlayer({ id: 'player-2', token: 'tok-2', name: 'Overkiller' }, 0);
  player2.spawnProtectionUntil = 0;
  room.stPerryState.byPlayer.set(player2.id, { unlocked: true });

  applyDamage(room, player.id, dummy.id, 40, 'sword', 1.0);
  assert.equal(dummy.health, 60);

  applyDamage(room, player2.id, dummy.id, 120, 'sword', 2.0);
  assert.equal(dummy.health, 0);

  const prog2 = room.stPerryState.byPlayer.get(player2.id);
  assert.equal(prog2.damageDealtToPerry, 60, 'Damage dealt to Perry must cap at HP actually taken (60, not 120)');

  let ev = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(ev, undefined, 'Split kill with overkill must not award challenge');

  // Burn damage tick test:
  // Reset dummy for fresh fight
  setupStPerry(dummy, 3.0, true, room, player.id);
  assert.equal(dummy.health, 100);
  player.damageTakenThisLife = 0;

  // Player takes 5 damage from burn
  applyDamage(room, dummy.id, player.id, 5, 'burn', 3.5);
  assert.equal(player.damageTakenThisLife, 5);

  // Player defeats Perry flawlessly from then on
  applyDamage(room, player.id, dummy.id, 100, 'sword', 4.0);
  ev = room.events.find(e => e.type === 'prestigeChallengeCompleted');
  assert.equal(ev, undefined, 'Damage from burn tick must disqualify');
});

test('Case 17: Save-failure retry recovery and duplicate event idempotence on the server', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-retry-'));
  const realStore = new ProfileStore(dir);

  let failStorage = true;
  const mockStore = {
    open: (tok) => realStore.open(tok),
    read: (tok) => realStore.read(tok),
    view: (prof) => realStore.view(prof),
    completePrestigeChallenge: (tok, id, opts) => {
      if (failStorage) {
        throw new Error('DiskIOFailure: temporary simulated storage error');
      }
      return realStore.completePrestigeChallenge(tok, id, opts);
    },
  };

  const game = createGameServer({ port: 0, host: '127.0.0.1', profileStore: mockStore });
  await game.start();
  const sockets = [];

  t.after(async () => {
    sockets.forEach(s => { try { s.close(); } catch {} });
    await game.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const ws = new WebSocket(`ws://127.0.0.1:${game.address().port}/ws`);
  sockets.push(ws);
  const next = createInbox(ws);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.send(JSON.stringify({ type: 'profileHello' }));
  const profileMsg = await next('profile');

  // Create room
  ws.send(JSON.stringify({ type: 'createRoom', name: 'RetryKnight', mode: 'PRACTICE' }));
  const joined = await next('joined');
  const room = game.roomManager.findByCode(joined.roomCode);
  const player = room.players.get(joined.playerId);

  // Trigger prestigeChallengeCompleted while storage fails
  failStorage = true;
  room.events.push({
    type: 'prestigeChallengeCompleted',
    playerId: player.id,
    challengeId: 'st_perry_the_plain',
    at: game.now(),
  });

  // Tick the game server to process the failure
  game.tick();

  // Client must receive profileError informing them of temporary delay
  const err = await next('profileError');
  assert.ok(err.message.includes('Prestige feat storage is temporarily unavailable'));

  // Ensure confirmed unlock feed was NOT emitted prematurely in ProfileStore
  assert.equal(realStore.open(profileMsg.token).profile.challenges.completed.st_perry_the_plain, undefined);

  // Now restore storage health
  failStorage = false;

  // Advance time past retryAt (time + 1s) and tick server
  const retryTime = game.now() + 2;
  game.tick(retryTime);

  // Client must now receive confirmed profile and unlock events
  const updatedProfile = await next('profile', p => Boolean(p.profile?.challenges?.completed?.st_perry_the_plain));
  assert.ok(updatedProfile.profile.challenges.completed.st_perry_the_plain > 0);
  assert.ok(updatedProfile.profile.emblems.includes('st_perry_the_plain'));

  const unlockEvents = await next('events', evs => evs.events?.some(e => e.type === 'stPerryPlainUnlocked'));
  assert.ok(unlockEvents.events.some(e => e.type === 'stPerryPlainUnlocked'));
  assert.ok(unlockEvents.events.some(e => e.type === 'spellbladeLine'));

  // Verify duplicate event is completely idempotent and does not error
  const duplicateResult = realStore.completePrestigeChallenge(profileMsg.token, 'st_perry_the_plain');
  assert.ok(duplicateResult.challenges.completed.st_perry_the_plain > 0);
});
