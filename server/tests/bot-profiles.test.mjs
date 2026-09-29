import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { beginAttack, endAttack, stepRoom } from '../../shared/sim/combat.mjs';
import { BOT_PROFILES, botProfile } from '../../shared/sim/botBehavior.mjs';

// Bot kinds are data (botBehavior.mjs): one controller plays each from its profile. And a bot decides from what shows,
// never from its foe's buttons.

const TICK = 1 / 30;

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function botDuel(profile = null) {
  const manager = new RoomManager({ random: lcg(7) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  if (profile) bot.botProfile = profile;
  human.spawnProtectionUntil = 0;
  bot.spawnProtectionUntil = 0;
  human.connected = true;
  return { room, human, bot };
}

test('the rival is the default kind, and it fights as it always has', () => {
  assert.equal(botProfile({}), BOT_PROFILES.rival);
  assert.equal(botProfile({ botProfile: 'caster' }), BOT_PROFILES.caster);
  assert.equal(botProfile({ botProfile: 'nobody' }), BOT_PROFILES.rival);
  const { rival } = BOT_PROFILES;
  assert.ok(rival.sword && rival.spells && !rival.flee && rival.keepRange === null);
  assert.equal(rival.guard, 0.58);
  assert.equal(rival.dash, 0.12);
});

test('bot kinds are data: the Blade Duelist never casts, the Spellcaster never swings, Sir Runs-a-Lot keeps away', () => {
  assert.equal(BOT_PROFILES.duelist.spells, false);
  assert.equal(BOT_PROFILES.caster.sword, false);
  assert.ok(BOT_PROFILES.runner.flee && !BOT_PROFILES.runner.sword && !BOT_PROFILES.runner.spells);
  const run = (kind, start) => {
    const { room, human, bot } = botDuel(kind);
    bot.spellReadyAt = 0;
    Object.assign(human.position, { x: 0, y: 0, z: 0 });
    Object.assign(bot.position, { x: 0, y: 0, z: -start });
    const random = lcg(5);
    const did = { swung: false, cast: false, nearest: Infinity };
    for (let now = 4; now < 10; now += TICK) {
      stepBotControllers(room, now, room.world, { random });
      for (const event of stepRoom(room, TICK, now, room.world).splice(0)) {
        if (event.playerId === bot.id && event.type === 'swordSwing') did.swung = true;
        if (event.playerId === bot.id && event.type === 'spellCast') did.cast = true;
      }
      if (bot.spellReadyAt < now) bot.spellReadyAt = 0;
      did.nearest = Math.min(did.nearest, Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z));
    }
    return did;
  };
  const duelist = run('duelist', 3);
  assert.ok(duelist.swung && !duelist.cast, 'the Blade Duelist: steel only');
  const caster = run('caster', 7);
  assert.ok(caster.cast && !caster.swung, 'the Spellcaster: spells only');
  const runner = run('runner', 4);
  assert.ok(!runner.swung && !runner.cast && runner.nearest > 3, `Sir Runs-a-Lot keeps his distance (${runner.nearest.toFixed(2)})`);
});

test('a bot never reads its foe\'s buttons: at every moment of a fight, what they hold changes nothing it decides', () => {
  const { room, human, bot } = botDuel();
  Object.assign(human.position, { x: 0, y: 0, z: 0 });
  Object.assign(bot.position, { x: 0, y: 0, z: -3 });
  // what cannot be seen: the buttons under the foe's hands and what they have asked for next
  const hidden = ['input', 'attackHeld', 'attackQueued', 'attackCommitted', 'attackCommitBy', 'attackLastChain', 'gauntletReadyAt'];
  const decided = () => JSON.stringify([bot.input, bot.yaw, bot.attackHeld, bot.attackActive, bot.guarding, bot.pendingSpell, bot.dashUntil, bot.ai]);
  let swung = 0;
  for (let tick = 0; tick < 180; tick += 1) {
    const now = 4 + tick * TICK;
    // the foe fights: presses now and then, and walks in and out
    if (tick % 40 === 5) { beginAttack(room, 'human', now); swung += 1; }
    if (tick % 40 === 7) endAttack(room, 'human', now);
    human.input = { forward: tick % 60 < 30 ? 0.8 : -0.8, right: 0, jump: false, sprint: false, yaw: Math.PI, pitch: 0 };
    // decide once as things are, and once with the foe's hidden intent scrambled; the same dice both times
    const bodyBefore = structuredClone(bot);
    const eventsBefore = room.events.length;
    const truth = Object.fromEntries(hidden.map((key) => [key, structuredClone(human[key])]));
    stepBotControllers(room, now, room.world, { random: lcg(tick + 1) });
    const honest = decided();
    for (const key of Object.keys(bot)) delete bot[key];
    Object.assign(bot, structuredClone(bodyBefore));
    room.events.length = eventsBefore;
    Object.assign(human, {
      input: { forward: -1, right: 1, jump: true, sprint: true, crouch: true, yaw: 0, pitch: 1 },
      attackHeld: tick % 2 === 0,
      attackQueued: tick % 3 === 0,
      attackCommitted: 3,
      attackCommitBy: 'queued',
      attackLastChain: { startedAt: now, committed: 2, landed: 1, endedAt: now + 1 },
      gauntletReadyAt: now + 5,
    });
    stepBotControllers(room, now, room.world, { random: lcg(tick + 1) });
    assert.equal(decided(), honest, `the bot decided differently at ${now.toFixed(2)} s`);
    Object.assign(human, truth);
    stepRoom(room, TICK, now, room.world).splice(0);
  }
  assert.ok(swung >= 4, 'a real fight, not a standstill');
});
