import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { POST_KILL, stepBotControllers } from '../../shared/sim/BotController.mjs';
import { killPlayer, stepRoom } from '../../shared/sim/combat.mjs';

function sequenceRandom(values = [0.5]) {
  let i = 0;
  return () => values[(i++) % values.length];
}

function makeBotDuel() {
  const manager = new RoomManager({ random: sequenceRandom([0.11, 0.27, 0.43, 0.59, 0.71]) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  human.spawnProtectionUntil = 0;
  bot.spawnProtectionUntil = 0;
  return { room, bot, human };
}

test('bot chooses melee intent without directly damaging the target', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.4 };

  stepBotControllers(room, 4, room.world, { random: () => 0.5 });

  assert.equal(bot.attackHeld, true);
  assert.equal(human.health, 100);
});

test('a bot spell cannot bypass the authoritative cooldown', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -8 };
  bot.spellReadyAt = 10;
  const projectileCount = room.projectiles.size;

  stepBotControllers(room, 5, room.world, { random: () => 0.05 });

  assert.equal(room.projectiles.size, projectileCount);
  assert.equal(bot.pendingSpell, null);
  assert.equal(bot.spellReadyAt, 10);
});

test('a bot keeps its Gale for a foe near enough to feel it; a Fireball it throws from further off', () => {
  const casts = (spell, distance) => {
    const { room, bot, human } = makeBotDuel();
    bot.spell = spell;
    bot.spellReadyAt = 0;
    bot.position = { x: 0, y: 0, z: 0 };
    human.position = { x: 0, y: 0, z: -distance };
    stepBotControllers(room, 5, room.world, { random: () => 0.05 });
    return bot.pendingSpell !== null;
  };
  assert.equal(casts('gale', 8), false, 'out where a Gale is only a breeze');
  assert.equal(casts('gale', 4), true);
  assert.equal(casts('fireball', 8), true);
});

test('bot defensive decisions have nonzero reaction latency', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.8 };
  human.attackActive = true;
  human.attackHeld = true;

  stepBotControllers(room, 4, room.world, { random: () => 0.2 });

  assert.ok(bot.ai.nextDefensiveDecisionAt > 4);
  assert.equal(bot.guarding, false);
});

test('bot targets living humans instead of server-owned actors', () => {
  const { room, bot, human } = makeBotDuel();
  const dummy = room.addServerActor({ id: 'dummy', name: 'Dummy', actorKind: 'dummy' }, 4);
  bot.position = { x: 0, y: 0, z: 0 };
  dummy.position = { x: 0, y: 0, z: -0.8 };
  human.position = { x: 0, y: 0, z: -5 };

  stepBotControllers(room, 4, room.world, { random: () => 0.5 });

  assert.equal(bot.ai.targetId, human.id);
});

test('bot sidesteps and slows when a solid blocks its forward lane (a world without waypoints)', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -9 };
  const world = {
    ...room.world,
    navigation: null,
    solids: [{ id: 'test-wall', center: [0, 0.9, -1.05], size: [1.4, 1.8, 0.5] }],
  };

  stepBotControllers(room, 4, world, { random: () => 0.9 });

  assert.ok(Math.abs(bot.input.right) >= 0.7, 'blocked bot should commit to a sidestep');
  assert.ok(bot.input.forward <= 0.3, 'blocked bot should not keep running directly into the wall');
  assert.ok(bot.ai.avoidUntil > 4, 'avoidance should persist briefly so the bot can clear the corner');
});

test('bot keeps a direct approach when the forward lane is clear', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -9 };
  const world = { ...room.world, solids: [] };

  stepBotControllers(room, 4, world, { random: () => 0.9 });

  assert.equal(bot.input.right, 0);
  assert.ok(bot.input.forward >= 0.9);
});

test('bot falls back to a lateral escape when requested movement makes almost no progress', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -9 };
  const world = { ...room.world, solids: [] };

  stepBotControllers(room, 4, world, { random: () => 0.8 });
  assert.ok(bot.input.forward > 0.4);
  const originalStrafe = bot.ai.strafeDirection;

  // Simulate a collision shape or corner case that the short forward probe did not detect.
  stepBotControllers(room, 4.85, world, { random: () => 0.8 });

  assert.ok(bot.ai.escapeUntil > 4.85, 'bot should enter a bounded escape window');
  assert.notEqual(bot.ai.strafeDirection, originalStrafe, 'fallback should switch the attempted side around the obstruction');
  assert.ok(Math.abs(bot.input.right) >= 0.8, 'escape should strongly favor lateral movement');
  assert.ok(bot.input.forward <= 0.25, 'escape should stop feeding forward input into the obstruction');
});

test('bot finishes a bounded escape before evaluating another stuck pursuit window', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -9 };
  const world = { ...room.world, solids: [] };

  stepBotControllers(room, 4, world, { random: () => 0.8 });
  stepBotControllers(room, 4.85, world, { random: () => 0.8 });
  const escapeUntil = bot.ai.escapeUntil;
  assert.ok(escapeUntil > 4.85);

  stepBotControllers(room, escapeUntil + 0.01, world, { random: () => 0.8 });

  assert.equal(bot.ai.escapeUntil, -Infinity);
  assert.ok(bot.input.forward > 0.4, 'bot should resume pursuit after the bounded escape');
});

test('when its foe falls, a bot lets the attack go, looks at the body a moment, then moves off (briefly)', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.4 };
  stepBotControllers(room, 4, room.world, { random: () => 0.5 });
  assert.equal(bot.attackHeld, true, 'it was attacking');
  // the foe falls (and is back in three seconds, as always)
  killPlayer(room, human.id, bot.id, 'sword', 4.05);
  stepBotControllers(room, 4.1, room.world, { random: () => 0.5 });
  assert.equal(bot.attackHeld, false, 'the button is let go at once');
  assert.ok(bot.ai.postKill, 'a moment over the body');
  const body = bot.ai.postKill.body;
  // at first it looks at the body (from where it stands, or a quick step back or aside: never toward it)
  const facing = Math.atan2(-(body.x - bot.position.x), -(body.z - bot.position.z));
  assert.ok(Math.abs(bot.input.yaw - facing) < 1e-6);
  assert.ok(bot.input.forward <= 0);
  // no swing starts while it stands over the body, and the swing it had under way does not chain on
  let now = 4.1;
  const swings = () => room.events.filter((e) => e.type === 'swordSwing' && e.playerId === bot.id).length;
  const before = swings();
  while (now < 4.1 + POST_KILL.confirm[1] + POST_KILL.settle[1] + 0.05) {
    now += 0.05;
    stepBotControllers(room, now, room.world, { random: () => 0.5 });
    stepRoom(room, 0.05, now, room.world);
  }
  assert.ok(swings() - before <= 1, 'at most the swing already under way lands');
  // it is over within a second and a half, and it walks on (a walk, not a run) rather than standing there
  assert.equal(bot.ai.postKill, null);
  assert.ok(now - 4.1 <= POST_KILL.confirm[1] + POST_KILL.settle[1] + 0.1, 'a moment, not a gloat');
  let walking = false;
  for (let i = 0; i < 40 && !walking; i += 1) {
    now += 0.05;
    stepBotControllers(room, now, room.world, { random: () => 0.5 });
    stepRoom(room, 0.05, now, room.world);
    assert.ok(!bot.attackHeld && !bot.attackActive, 'nothing to attack');
    walking = bot.input.forward > 0 && bot.input.forward < 0.6;
  }
  assert.ok(walking, 'walking the arena (a walk, not a run) while nobody is there');
});

test('with nobody to fight, a bot walks between spots in the middle of the arena and looks about at each', () => {
  const { room, bot, human } = makeBotDuel();
  human.alive = false;
  bot.position = { x: 0, y: 0, z: 0 };
  let now = 4;
  let rested = false;
  let walked = false;
  for (let i = 0; i < 400 && !(rested && walked); i += 1) {
    now += 0.05;
    stepBotControllers(room, now, room.world, { random: () => 0.3 });
    // (move it as its input asks)
    bot.position.x += -Math.sin(bot.input.yaw) * bot.input.forward * 7.5 * 0.05;
    bot.position.z += -Math.cos(bot.input.yaw) * bot.input.forward * 7.5 * 0.05;
    if (bot.input.forward > 0) walked = true;
    if (walked && bot.input.forward === 0) rested = true;
    assert.ok(Math.hypot(bot.position.x, bot.position.z) < POST_KILL.patrolRadius + 1.5, 'it stays in the middle');
  }
  assert.ok(walked && rested);
});

test('a foe who comes at it while it stands over a body is answered at once', () => {
  const { room, bot, human } = makeBotDuel();
  const second = room.addPlayer({ id: 'second', token: 'token-2', name: 'Other' }, 4);
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.4 };
  second.position = { x: 20, y: 0, z: 0 };
  second.alive = true;
  second.connected = true;
  second.actorKind = 'human';
  stepBotControllers(room, 4, room.world, { random: () => 0.5 });
  human.alive = false;
  stepBotControllers(room, 4.1, room.world, { random: () => 0.5 });
  assert.ok(bot.ai.postKill);
  // the other one closes in
  second.position = { x: 0, y: 0, z: 2 };
  stepBotControllers(room, 4.2, room.world, { random: () => 0.5 });
  assert.equal(bot.ai.postKill, null);
  assert.equal(bot.ai.targetId, second.id);
});

test('no two pauses over a body are quite alike: how long it looks, how it first moves, how it looks about', () => {
  const seen = { styles: new Set(), confirms: new Set() };
  let seed = 7;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 24; i += 1) {
    const { room, bot, human } = makeBotDuel();
    bot.position = { x: 0, y: 0, z: 0 };
    human.position = { x: 0, y: 0, z: -1.4 };
    stepBotControllers(room, 4, room.world, { random });
    killPlayer(room, human.id, bot.id, 'sword', 4.05);
    stepBotControllers(room, 4.1, room.world, { random });
    seen.styles.add(bot.ai.postKill.style);
    seen.confirms.add(Math.round((bot.ai.postKill.confirmUntil - 4.1) * 20));
  }
  assert.equal(seen.styles.size, 3, 'still, a step back, a step aside');
  assert.ok(seen.confirms.size >= 3, 'looks for different lengths of time');
});

test('a bot carrying the Blazing Vortex calls it in a fight, then goes at its foe and aims at them while it spins', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const { PROWESS } = await import('../../shared/src/prowess.mjs');
  const { room, bot, human } = makeBotDuel();
  bot.ultimate = 'vortex';
  bot.prowess = PROWESS.full;
  bot.position = { x: 0, y: 0, z: 0 };
  // a foe within a fight's distance
  human.position = { x: 0, y: 0, z: -3.6 };
  // far off, it keeps its ultimate: never at nothing
  const idle = makeBotDuel();
  idle.bot.ultimate = 'vortex';
  idle.bot.prowess = PROWESS.full;
  idle.bot.position = { x: 0, y: 0, z: 0 };
  idle.human.position = { x: 0, y: 0, z: -14 };
  stepBotControllers(idle.room, 4, idle.room.world, { random: () => 0.5 });
  assert.equal(idle.bot.ultimateState, null);

  stepBotControllers(room, 4, room.world, { random: () => 0.5 });
  assert.equal(bot.ultimateState?.id, 'vortex', 'called as the fight is joined');
  const flat = { ...room.world, solids: [] };
  for (let now = 4; now <= 4 + ULTIMATES.vortex.startupSec + 0.4; now += 1 / 30) {
    // (the foe keeps off, a little above it: something to chase, and to look up at)
    human.position = { x: 0, y: 2, z: -9 };
    human.velocity = { x: 0, y: 0, z: 0 };
    human.grounded = true;
    human.health = 100;
    stepBotControllers(room, now, flat, { random: () => 0.5 });
    stepRoom(room, 1 / 30, now, flat);
  }
  assert.equal(bot.ultimateState?.phase, 'active');
  assert.ok(bot.input.forward >= 0.9, 'it goes at them');
  assert.ok(bot.input.pitch > 0.1, `and looks at them: pitch ${bot.input.pitch.toFixed(2)}`);
  assert.equal(bot.guarding, false);
  assert.ok(bot.position.z < -0.5, 'closing the distance');  // and steers it by how far off they are: the fire from a distance, the blade up close, balanced between
  const steer = (distance) => {
    human.position = { x: bot.position.x, y: bot.position.y, z: bot.position.z - distance };
    stepBotControllers(room, 5.6, flat, { random: () => 0.5 });
    // (the guard's button is the blade's, the attack's the fire's)
    return [Boolean(bot.input.guard), Boolean(bot.input.attack)];
  };
  assert.deepEqual(steer(2), [true, false], 'close: the blade');
  assert.deepEqual(steer(4.4), [false, false], 'between: balanced');
  assert.deepEqual(steer(8), [false, true]);
});
