import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { beginAttack, stepRoom } from '../../shared/sim/combat.mjs';
import { peaceHolds } from '../../shared/sim/peace.mjs';

// The Bot Duel opens in peace (peace.mjs): its rival starts nothing for a few seconds, or until the player does.

const FLAT = Object.freeze({
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }], ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -3, yaw: Math.PI }],
});

// a Bot Duel just begun (the match starts at 3.1), the human `gap` metres ahead of its rival, both facing
function duel({ gap = 1.6, flat = false } = {}) {
  const room = new RoomManager().createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  if (flat) room.world = FLAT;
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  bot.spell = 'fireball';
  human.spawnProtectionUntil = 0;
  bot.spawnProtectionUntil = 0;
  human.connected = true;
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -gap };
  bot.yaw = 0;
  human.yaw = Math.PI;
  human.input = { ...human.input, yaw: Math.PI, pitch: 0 };
  return { room, human, bot };
}

// the room and its bots, together (the human keeps their aim on the bot, as a player does)
function run(room, from, until, random = () => 0.01, dt = 1 / 30) {
  const events = [];
  const human = room.players.get('human');
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  for (let t = from; t <= until + 1e-9; t += dt) {
    human.input = { ...human.input, yaw: Math.atan2(-(bot.position.x - human.position.x), -(bot.position.z - human.position.z)), pitch: 0 };
    stepBotControllers(room, t, room.world, { random });
    stepRoom(room, dt, t, room.world);
    events.push(...room.events.splice(0));
  }
  return events;
}

test('a Bot Duel opens in peace: the rival starts nothing for a few seconds, then fights', () => {
  const { room, bot } = duel();
  assert.ok(room.peace && room.peace.until > 3.1, 'begun with the match');
  stepBotControllers(room, 3.5, room.world, { random: () => 0.01 });
  assert.equal(bot.attackHeld || bot.attackActive, false, 'within reach, and still nothing');
  assert.equal(bot.pendingSpell, null);
  stepBotControllers(room, room.peace.until + 0.1, room.world, { random: () => 0.01 });
  assert.equal(bot.attackHeld, true, 'the peace over, it fights');
  // and only in a mode that asks for it
  const yard = new RoomManager().createSoloRoom('PRACTICE', 0);
  yard.startMatch(1);
  assert.equal(yard.peace, null);
});

test('the peace ends the moment the player starts something, and the rival answers (it may guard, and fight back)', () => {
  // (its foe just outside its own reach, inside theirs: only a guard answers the swing)
  const { room, human, bot } = duel({ gap: 2.5, flat: true });
  assert.equal(peaceHolds(room, 3.3), true);
  assert.ok(beginAttack(room, human.id, 3.3));
  stepBotControllers(room, 3.35, room.world, { random: () => 0.01 });
  assert.equal(room.peace.brokenBy, human.id, 'broken by the swing');
  assert.equal(peaceHolds(room, 3.4), false);
  const events = run(room, 3.35, 4.2);
  assert.ok(events.some((e) => (e.type === 'parry' || e.type === 'block') && e.defenderId === bot.id), 'it defends itself');
  // a ward is no attack: calling Sheathe in Steel keeps the peace
  const calm = duel();
  calm.room.events.push({ type: 'spellCast', playerId: calm.human.id, spell: 'steel', at: 3.3 });
  assert.equal(peaceHolds(calm.room, 3.35), true);
});
