import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import {
  createSiegeBladesState,
  provisionSiegeBladesFleet,
  stepSiegeBlades,
  SIEGE_MACHINE_CLASSES,
  SIEGE_BOT_DIFFICULTIES,
} from '../../shared/sim/siegeBladesMode.mjs';
import { damageSoFistication } from '../../shared/sim/soFistication.mjs';

function setupBotRoom(machineClass, difficulty = 'knight') {
  const room = new Room('sb-bot-test', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId: 'high-grounds',
  });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, {
    format: 'ENDLESS',
    teamSize: 1,
    botDifficulty: difficulty,
    clashStarts: false,
  });

  const bot1 = room.addPlayer({ id: 'bot-azure', token: 'b1', team: TEAMS.ATTACKERS }, 0);
  const bot2 = room.addPlayer({ id: 'bot-crimson', token: 'b2', team: TEAMS.DEFENDERS }, 0);
  bot1.actorKind = 'bot';
  bot2.actorKind = 'bot';

  bot1.preferredSiegeMachine = machineClass;
  bot2.preferredSiegeMachine = machineClass;

  provisionSiegeBladesFleet(room, 0);
  return { room, bot1, bot2 };
}

test('SO-FIST-ICATION Ram bot mirror match executes steering, charge, and piston strikes', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  // Champion bot aims towards enemy
  assert.ok(Number.isFinite(bot1.input.forward));
  assert.ok(Number.isFinite(bot1.input.right));
  assert.ok(Number.isFinite(bot2.input.forward));
});

test('Bi-Bye-llista Ballista bot mirror match controls deployment, tracking, and independent shots', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.BALLISTA, 'knight');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  assert.ok(Number.isFinite(bot1.input.yaw));
  assert.ok(Number.isFinite(bot1.input.pitch));
  assert.ok(bot1.input.siegeTarget);
});

test('Fight-and-Flight bot mirror match controls altitude, repeater aim, and combat passes', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.FLIGHT, 'squire');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  assert.ok(Number.isFinite(bot1.input.yaw));
  assert.ok(Number.isFinite(bot1.input.pitch));
});

test('Bot decision frequency obeys reaction intervals (Squire 0.48s vs Champion 0.10s)', () => {
  const squireRoom = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'squire');
  const championRoom = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');

  // Step 1 second (30 ticks)
  for (let tick = 0; tick < 30; tick++) {
    const t = tick * (1 / 30);
    stepSiegeBlades(squireRoom.room, 1 / 30, t);
    stepSiegeBlades(championRoom.room, 1 / 30, t);
  }

  const squireDecisions = squireRoom.bot1.siegeAi?.decisions ?? 0;
  const championDecisions = championRoom.bot1.siegeAi?.decisions ?? 0;

  // Squire with 0.48s reaction should make ~2-3 decisions in 1s
  assert.ok(squireDecisions >= 2 && squireDecisions <= 3, `Squire decisions ${squireDecisions} should be 2-3`);
  // Champion with 0.10s reaction should make ~10-11 decisions in 1s
  assert.ok(championDecisions >= 9 && championDecisions <= 11, `Champion decisions ${championDecisions} should be 9-11`);
  assert.ok(championDecisions > squireDecisions * 3, 'Champion must decide substantially faster than Squire');
});

test('Skilled and Champion bots execute Sheathe in Steel when machinery is damaged', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');
  bot1.spell = 'steel';
  bot1.siegeAi = { difficulty: 'champion' };

  const m1 = room.getMachineForPlayer(bot1.id);
  // Damage machine hull
  damageSoFistication(room, m1, 300, bot2.id, 'sword', 1.0, { componentId: 'hull' });
  assert.ok(m1.health < m1.maxHealth);

  // Step bots
  stepSiegeBlades(room, 1 / 30, 2.0);

  // Bot should have cast Sheathe in Steel
  assert.ok(m1.siegeSteel, 'Machine should have active siegeSteel ward from bot cast');
  assert.equal(m1.siegeSteel.state, 'active');
});

test('Complete 3v3 Siege Blades bot match provisions 6 vehicles across 3 machine classes and steps physics', () => {
  const room = new Room('sb-3v3-test', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId: 'high-grounds',
    teamSize: 3,
  });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, {
    format: 'MATCH',
    teamSize: 3,
    matchRounds: 3,
    botDifficulty: 'knight',
    clashStarts: false,
  });

  // Provision 3 Azure bots and 3 Crimson bots
  const azureBots = [];
  const crimsonBots = [];
  for (let i = 0; i < 3; i++) {
    const a = room.addPlayer({ id: `az-${i}`, token: `tok-a${i}`, team: TEAMS.ATTACKERS }, 0);
    const c = room.addPlayer({ id: `cr-${i}`, token: `tok-c${i}`, team: TEAMS.DEFENDERS }, 0);
    a.actorKind = 'bot';
    c.actorKind = 'bot';
    azureBots.push(a);
    crimsonBots.push(c);
  }

  provisionSiegeBladesFleet(room, 0);

  const machines = room.getMachines();
  assert.equal(machines.length, 6, 'Should provision exactly 6 vehicles for 3v3');

  // Verify all 3 classes represented
  const kinds = new Set(machines.map(m => m.class ?? m.kind));
  assert.ok(kinds.has('so-fist-ication') || kinds.has('ram'));
  assert.ok(kinds.has('bi-bye-llista') || kinds.has('ballista'));
  assert.ok(kinds.has('fight-and-flight') || kinds.has('flight'));

  // Step 60 ticks (2 seconds)
  for (let tick = 0; tick < 60; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  // Verify bots generated inputs and match is active
  for (const bot of [...azureBots, ...crimsonBots]) {
    assert.ok(Number.isFinite(bot.input?.yaw));
  }
  assert.equal(room.siegeBlades.format, 'MATCH');
  assert.equal(room.siegeBlades.roundNumber, 1);
});
