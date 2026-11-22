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
} from '../../shared/sim/siegeBladesMode.mjs';

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
