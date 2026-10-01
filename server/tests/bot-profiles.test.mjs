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

// a bot of a kind against a Spellblade who stands and watches, from `start` metres; what it did, and where it went
function runKind(kind, start, { seconds = 6, foe = () => {}, seed = 5 } = {}) {
  const { room, human, bot } = botDuel(kind);
  bot.spellReadyAt = 0;
  if (BOT_PROFILES[kind]?.ward && !BOT_PROFILES[kind].spells) bot.spell = BOT_PROFILES[kind].ward;
  Object.assign(human.position, { x: 0, y: 0, z: 0 });
  Object.assign(bot.position, { x: 0, y: 0, z: -start });
  const random = lcg(seed);
  const did = { swung: false, cast: new Set(), casts: [], steelAt: null, dashes: [], nearest: Infinity, across: 0, away: 0, inReach: 0 };
  let last = { ...bot.position };
  for (let now = 4; now < 4 + seconds; now += TICK) {
    foe(human, now, room);
    stepBotControllers(room, now, room.world, { random });
    for (const event of stepRoom(room, TICK, now, room.world).splice(0)) {
      if (event.playerId !== bot.id) continue;
      if (event.type === 'swordSwing') did.swung = true;
      if (event.type === 'dash') did.dashes.push({ at: now, distance: Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z) });
      if (event.type === 'spellCast') { did.cast.add(event.spell); did.casts.push({ at: now, spell: event.spell }); }
      if (event.type === 'steelOn' && did.steelAt === null) did.steelAt = { at: now, distance: Math.hypot(bot.position.x, bot.position.z) };
    }
    human.health = 100;
    bot.health = 100;
    // how it moved: along the line from its foe (away) and across it
    const r = Math.hypot(bot.position.x, bot.position.z) || 1;
    const step = { x: bot.position.x - last.x, z: bot.position.z - last.z };
    did.away += (step.x * bot.position.x + step.z * bot.position.z) / r;
    did.across += Math.abs((step.x * -bot.position.z + step.z * bot.position.x) / r);
    last = { ...bot.position };
    const apart = Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z);
    did.nearest = Math.min(did.nearest, apart);
    if (apart <= 2.25) did.inReach += TICK / seconds;
  }
  return did;
}

test('bot kinds are data: Mr. Melee never throws a spell, Spells & Sorcery never swings, Sir Runs-a-Lot keeps away', () => {
  assert.equal(BOT_PROFILES.melee.spells, false);
  assert.equal(BOT_PROFILES.melee.ward, 'steel');
  assert.equal(BOT_PROFILES.caster.sword, false);
  assert.ok(BOT_PROFILES.runner.flee && !BOT_PROFILES.runner.sword && !BOT_PROFILES.runner.spells);
  const melee = runKind('melee', 3);
  assert.ok(melee.swung, 'Mr. Melee: the sword');
  // and from just beyond reach it lunges in
  const lunges = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => runKind('melee', 7, { seconds: 1.2, seed }).dashes.length).length;
  assert.ok(lunges >= 3, `Mr. Melee lunges in (${lunges} of 8 approaches)`);
  assert.deepEqual([...melee.cast], [], 'and no spell thrown');
  const caster = runKind('caster', 7);
  assert.ok(caster.cast.size && !caster.swung, 'Spells & Sorcery: spells only');
  const runner = runKind('runner', 4);
  assert.ok(!runner.swung && !runner.cast.size && runner.nearest > 3, `Sir Runs-a-Lot keeps his distance (${runner.nearest.toFixed(2)})`);
});

test('Spells & Sorcery turns through its spells, keeps its casting distance, and has them back sooner', () => {
  const caster = runKind('caster', 8, { seconds: 14 });
  assert.ok(caster.cast.has('fireball') && caster.cast.has('frostfire'), `cast: ${[...caster.cast].join(', ')}`);
  assert.ok(caster.nearest > 4, `it kept off (${caster.nearest.toFixed(2)} m at nearest)`);
  // a cast comes back in 0.65 of a knight's time
  const { room, bot } = botDuel('caster');
  Object.assign(bot.position, { x: 0, y: 0, z: -8 });
  bot.spellReadyAt = 0;
  const always = () => 0;
  let castAt = null;
  for (let now = 4; now < 6 && castAt === null; now += TICK) {
    stepBotControllers(room, now, room.world, { random: always });
    if (bot.pendingSpell) castAt = now;
    stepRoom(room, TICK, now, room.world).splice(0);
  }
  assert.ok(castAt !== null, 'it cast');
  const knightCooldown = { fireball: 4, frostfire: 4.5, gale: 6 }[bot.ai.lastSpell];
  assert.ok(Math.abs(bot.spellReadyAt - castAt - knightCooldown * BOT_PROFILES.caster.spellCooldown) < 1e-6);
});

test('Spells & Sorcery has every spell and Sheathe in Steel beside them, and never throws a volley', () => {
  assert.equal(BOT_PROFILES.caster.ward, 'steel');
  assert.deepEqual([...BOT_PROFILES.caster.spellCycle], ['fireball', 'frostfire', 'gale']);
  // pressed (a foe close and swinging), it hardens; and its spells' clock is none the worse for it
  const pressed = runKind('caster', 3, {
    seconds: 8,
    foe: (human, now, room) => { if (!human.attackHeld) beginAttack(room, human.id, now); },
  });
  assert.ok(pressed.steelAt, 'it called Sheathe in Steel');
  assert.ok(pressed.cast.size, `and still threw spells: ${[...pressed.cast].join(', ')}`);
  // every spell in turn over a long exchange (a Gale only once a foe is near enough to feel it)
  const long = runKind('caster', 5, { seconds: 30, seed: 3 });
  assert.ok(long.cast.has('fireball') && long.cast.has('frostfire') && long.cast.has('gale'), `cast: ${[...long.cast].join(', ')}`);
  // a spell every two and a half seconds at the soonest: its own (shorter) cooldown, never a volley
  const soonest = Math.min(...Object.values({ fireball: 4, frostfire: 4.5, gale: 6 })) * BOT_PROFILES.caster.spellCooldown;
  for (const did of [pressed, long]) {
    for (let i = 1; i < did.casts.length; i += 1) {
      const gap = did.casts[i].at - did.casts[i - 1].at;
      assert.ok(gap >= soonest - 1e-6, `${did.casts[i - 1].spell} then ${did.casts[i].spell} only ${gap.toFixed(2)} s apart`);
    }
  }
});

test('Sir Runs-a-Lot makes you chase: away at an angle, cutting back and forth, never a straight backpedal', () => {
  let sides = 0;
  let side = null;
  const runner = runKind('runner', 5, {
    seconds: 10,
    // a foe who runs straight at it (not sprinting)
    foe: (human, now, room) => {
      const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
      const yaw = Math.atan2(-(bot.position.x - human.position.x), -(bot.position.z - human.position.z));
      human.input = { forward: 1, right: 0, jump: false, sprint: false, yaw, pitch: 0 };
      human.yaw = yaw;
      if (bot.ai?.strafeDirection && bot.ai.strafeDirection !== side) { side = bot.ai.strafeDirection; sides += 1; }
    },
  });
  assert.ok(runner.across > 0.4 * runner.away, `across ${runner.across.toFixed(1)} m against away ${runner.away.toFixed(1)} m`);
  assert.ok(sides >= 3, `it cut back and forth (${sides - 1} times)`);
  // a knight at a run seldom has it in reach (one at a sprint will: that is how you catch a runner)
  assert.ok(runner.inReach < 0.2, `in reach ${(runner.inReach * 100).toFixed(0)}% of the time`);
});

test('Mr. Melee hardens as a fight begins, not at nothing', () => {
  // a foe far off and still: no Steel
  const idle = runKind('melee', 14, {
    seconds: 3,
    // (held there: however it wants to close, it is not yet in a fight)
    foe: (human, now, room) => {
      const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
      Object.assign(bot.position, { x: 0, y: 0, z: -14 });
    },
  });
  assert.equal(idle.steelAt, null, 'nothing to harden against');
  // it closes in: Steel as the blades come into reach, not before
  const fight = runKind('melee', 9, { seconds: 6 });
  assert.ok(fight.steelAt, 'it hardened');
  assert.ok(fight.steelAt.distance <= 3.5, `as the fight began (${fight.steelAt.distance.toFixed(2)} m)`);
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

test('a bot brings a spell it throws, never Sheathe in Steel (a ward carried in the spell\'s place)', async () => {
  const { Room } = await import('../../shared/sim/Room.mjs');
  const { spellFor } = await import('../../shared/src/spells.mjs');
  const room = new Room('BOT_SPELLS');
  const brought = new Set();
  for (let i = 0; i < 60; i += 1) {
    const bot = room.addServerActor({ id: `bot-${i}`, actorKind: 'bot' }, 0);
    brought.add(bot.spell);
    room.players.delete(bot.id);
  }
  assert.ok(![...brought].some((id) => spellFor(id).kind === 'ward'), `brought: ${[...brought].join(', ')}`);
  assert.ok(brought.size >= 2, 'more than one kind turns up');
});
