import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { applyDamage, beginAttack, stepRoom } from '../../shared/sim/combat.mjs';
import { BOT_SKILLS, BOT_SKILL_IDS, botSkill } from '../../shared/sim/botSkill.mjs';
import { fight } from '../../scripts/bot-tournament.mjs';

// The Bot Duel's rival plays as well as it was asked to: better or worse decisions, never more health, damage or
// knowledge (botSkill.mjs).

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// open ground (for the blade's own questions, without an arena's walls and well in the way)
const FLAT = Object.freeze({
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }], ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -3, yaw: Math.PI }],
});

// a Bot Duel just begun (the match starts at 3.1): the rival `skill`, the human `gap` metres ahead of it, both facing
function duel(skill = 'knight', { gap = 1.6, peace = false, flat = false } = {}) {
  const manager = new RoomManager({ random: lcg(3) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.setBotSkill(skill);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  if (!peace) room.peace = null;
  if (flat) room.world = FLAT;
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  bot.spell = 'fireball';
  bot.ultimate = 'sunder';
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

// the room and its bots, together, from `from` to `until` (the human keeps their aim on the bot, as a player does)
function run(room, from, until, random = () => 0.01, dt = 1 / 30) {
  const events = [];
  const human = room.players.get('human');
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  for (let t = from; t <= until + 1e-9; t += dt) {
    const yaw = Math.atan2(-(bot.position.x - human.position.x), -(bot.position.z - human.position.z));
    human.input = { ...human.input, yaw, pitch: 0 };
    stepBotControllers(room, t, room.world, { random });
    stepRoom(room, dt, t, room.world);
    events.push(...room.events.splice(0));
  }
  return events;
}

test('every rival is the same knight: the same health, blows and cooldowns; only its decisions differ', () => {
  for (const id of BOT_SKILL_IDS) {
    const { room, human, bot } = duel(id);
    assert.equal(bot.botSkill, id);
    assert.equal(bot.name, BOT_SKILLS[id].name);
    assert.equal(bot.health, human.health);
    assert.equal(bot.guardStamina, human.guardStamina);
    applyDamage(room, human.id, bot.id, 30, 'sword', 4);
    assert.equal(bot.health, 70, 'a blow is a blow');
  }
  // a skill is never a statistic
  for (const skill of Object.values(BOT_SKILLS)) {
    for (const key of ['health', 'damage', 'cooldown', 'armor', 'speed']) assert.equal(skill[key], undefined, key);
    assert.ok(skill.reaction[0] >= 0.15, 'never quicker than a quick player');
  }
  // the hardest is called what it is
  assert.equal(BOT_SKILLS.spellblade.name, 'The Spellblade');
  assert.equal(botSkill({ botSkill: 'nonsense' }), BOT_SKILLS.knight);
});

test('the Spellblade parries blows it can see coming; the Knight and the Squire seldom do (a guard only lucky in its timing)', () => {
  // a swing at it from just outside its own reach, begun at every moment of its own decisions
  const parries = (skill) => {
    let count = 0;
    for (let trial = 0; trial < 24; trial += 1) {
      const { room, human, bot } = duel(skill, { gap: 2.5, flat: true });
      const random = lcg(100 + trial);
      const start = 4 + trial * 0.019;
      // (its own decisions under way, the two held where they are, until the swing)
      for (let t = 3.9; t < start - 1e-9; t += 1 / 30) {
        run(room, t, t, random);
        bot.position = { x: 0, y: 0, z: 0 };
        human.position = { x: 0, y: 0, z: -2.5 };
      }
      beginAttack(room, human.id, start);
      human.attackHeld = false;
      const events = run(room, start, start + 0.7, random);
      if (events.find((e) => ['parry', 'block', 'damage'].includes(e.type) && (e.defenderId === bot.id || e.victimId === bot.id))?.type === 'parry') count += 1;
    }
    return count / 24;
  };
  const best = parries('spellblade');
  const steady = parries('knight');
  const green = parries('squire');
  assert.ok(best >= 0.5, `The Spellblade ${best}`);
  assert.ok(steady < best - 0.25, `the Knight ${steady} (the Spellblade ${best})`);
  assert.ok(green <= steady, `the Squire ${green}`);
});

test('a parried foe is struck while it reels: the opening followed up at once', () => {
  const { room, human, bot } = duel('spellblade', { gap: 2.4, flat: true });
  beginAttack(room, human.id, 4);
  human.attackHeld = false;
  const events = run(room, 4, 5.2);
  const parry = events.find((e) => e.type === 'parry' && e.defenderId === bot.id);
  assert.ok(parry);
  const answer = events.find((e) => e.type === 'damage' && e.attackerId === bot.id);
  assert.ok(answer && answer.at - parry.at <= 0.6, `struck ${answer ? (answer.at - parry.at).toFixed(2) : 'never'} s after the parry`);
});

test('the Spellblade leads a spell at a foe on the move; the Knight throws at where they stand', () => {
  const thrown = (skill) => {
    const { room, human, bot } = duel(skill, { gap: 8 });
    bot.spellReadyAt = 0;
    human.velocity = { x: 6, y: 0, z: 0 };
    stepBotControllers(room, 5, room.world, { random: () => 0.01 });
    return bot.pendingSpell?.direction ?? null;
  };
  const led = thrown('spellblade');
  const straight = thrown('knight');
  assert.ok(led && straight);
  assert.ok(Math.abs(straight.x) < 0.02, 'at the body');
  assert.ok(led.x > 0.15, 'ahead of them, the way they run');
});

test('the Spellblade slips a spell coming straight at it', () => {
  const slipped = (skill) => {
    const { room, human, bot } = duel(skill, { gap: 7 });
    room.projectiles.set('p1', { id: 'p1', ownerId: human.id, spell: 'fireball', position: { x: 0, y: 1.2, z: -4 }, velocity: { x: 0, y: 0, z: 24 } });
    bot.ai = null;
    stepBotControllers(room, 5, room.world, { random: () => 0.01 });
    stepBotControllers(room, 5.25, room.world, { random: () => 0.01 });
    return (bot.dashUntil ?? -Infinity) > 5;
  };
  assert.equal(slipped('spellblade'), true);
  assert.equal(slipped('knight'), false);
});

test('low and outmatched, a better knight backs off to heal; caught, it fights', () => {
  const { room, human, bot } = duel('spellblade', { gap: 6 });
  bot.health = 25;
  stepBotControllers(room, 5, room.world, { random: () => 0.01 });
  const away = { x: -Math.sin(bot.input.yaw), z: -Math.cos(bot.input.yaw) };
  assert.ok(away.z > 0.5 && bot.input.forward > 0.5, 'running from its foe (who is toward -z)');
  // the Knight presses on
  const plain = duel('knight', { gap: 6 });
  plain.bot.health = 25;
  stepBotControllers(plain.room, 5, plain.room.world, { random: () => 0.01 });
  assert.ok(-Math.cos(plain.bot.input.yaw) < -0.5, 'toward its foe');
  // caught (its foe upon it and swinging), it stands and fights
  human.position = { x: bot.position.x, y: 0, z: bot.position.z - 1.5 };
  beginAttack(room, human.id, 5.5);
  stepBotControllers(room, 5.6, room.world, { random: () => 0.01 });
  assert.ok(!(bot.ai.retreatUntil > 5.6));
});

test('the ladder: each rival is better at the game than the one below it', () => {
  // (a few fixed fights, bot against bot on the real arena: kills over all of them)
  const total = (a, b) => {
    let mine = 0;
    let theirs = 0;
    for (const [seed, spell, ultimate] of [[11, 'fireball', 'sunder'], [23, 'frostfire', 'chivalry'], [37, 'gale', 'vortex'], [41, 'fireball', 'chivalry']]) {
      const r = fight(a, b, { seed, seconds: 60, spell, ultimate });
      mine += r.kills.a;
      theirs += r.kills.b;
    }
    return { mine, theirs };
  };
  const top = total('spellblade', 'squire');
  assert.ok(top.mine > top.theirs * 1.3, `The Spellblade ${top.mine}, the Squire ${top.theirs}`);
  const middle = total('knight', 'squire');
  assert.ok(middle.mine > middle.theirs, `the Knight ${middle.mine}, the Squire ${middle.theirs}`);
});
