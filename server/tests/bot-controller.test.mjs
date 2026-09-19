import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms/RoomManager.mjs';
import { stepBotControllers } from '../src/ai/BotController.mjs';

function sequenceRandom(values = [0.5]) {
  let i = 0;
  return () => values[(i++) % values.length];
}

function makeBotDuel() {
  const manager = new RoomManager({ random: sequenceRandom([0.11, 0.27, 0.43, 0.59, 0.71]) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);
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

test('bot Fireball cannot bypass authoritative cooldown', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -8 };
  bot.fireballReadyAt = 10;
  const projectileCount = room.projectiles.size;

  stepBotControllers(room, 5, room.world, { random: () => 0.05 });

  assert.equal(room.projectiles.size, projectileCount);
  assert.equal(bot.pendingFireball, null);
  assert.equal(bot.fireballReadyAt, 10);
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

test('bot sidesteps and slows when a solid blocks its forward lane', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -9 };
  const world = {
    ...room.world,
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
