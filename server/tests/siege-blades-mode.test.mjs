import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import {
  createSiegeBladesState,
  provisionSiegeBladesFleet,
  stepSiegeBlades,
  resetSiegeBladesRound,
  SIEGE_BLADES_FORMATS,
  SIEGE_MACHINE_CLASSES,
} from '../../shared/sim/siegeBladesMode.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { damageSoFistication } from '../../shared/sim/soFistication.mjs';
import { damageBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { damageFightFlight } from '../../shared/sim/fightFlightComponents.mjs';

function setupSiegeBladesRoom({ format = 'MATCH', teamSize = 1, worldId = 'high-grounds', clashStarts = null } = {}) {
  const room = new Room('sb-test-room', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId,
  });
  room.state = 'PLAYING';

  // Setup mode state with custom options
  room.siegeBlades = createSiegeBladesState(room, {
    format,
    teamSize,
    clashStarts,
    matchRounds: 3,
    botDifficulty: 'knight',
  });

  return room;
}

test('Siege Blades 1v1 Match spawns mirrored combatants in machines', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', name: 'Azure Pilot', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', name: 'Crimson Pilot', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  assert.equal(room.getMachines().length, 2);
  const m1 = room.getMachineForPlayer(p1.id);
  const m2 = room.getMachineForPlayer(p2.id);

  assert.ok(m1, 'Azure pilot should have an assigned machine');
  assert.ok(m2, 'Crimson pilot should have an assigned machine');
  assert.equal(m1.operatorId, p1.id);
  assert.equal(m2.operatorId, p2.id);

  // Check mirrored positions
  assert.ok(m1.z < 0, 'Azure machine should be on negative Z');
  assert.ok(m2.z > 0, 'Crimson machine should be on positive Z');
  assert.equal(m1.team, TEAMS.ATTACKERS);
  assert.equal(m2.team, TEAMS.DEFENDERS);

  // Snapshot contains siegeBlades state
  const snapshot = serializeSnapshot(room, 0);
  assert.ok(snapshot.siegeBlades);
  assert.equal(snapshot.siegeBlades.format, 'MATCH');
  assert.equal(snapshot.siegeBlades.roundNumber, 1);
  assert.equal(snapshot.siegeBlades.roundsToWin, 2);
});

test('Elimination rule: machine destruction causes player elimination; component damage does not', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  // Force machine classes: Azure gets flight, Crimson gets ram
  p1.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.FLIGHT;
  p2.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;

  provisionSiegeBladesFleet(room, 0);

  const flt = room.getMachineForPlayer(p1.id);
  const ram = room.getMachineForPlayer(p2.id);

  // 1. Damage non-hull component: Fight-and-Flight rotor (deal 250 to overcome innate Steel mitigation)
  damageFightFlight(room, flt, 250, p2.id, 'sword', 1.0, { componentId: 'rotor' });
  stepSiegeBlades(room, 1 / 30, 1.1);

  assert.equal(flt.rotorHP, 0, 'Rotor destroyed');
  assert.equal(room.siegeBlades.eliminated.has(p1.id), false, 'Component destruction must NOT eliminate player');
  assert.equal(p1.alive, true);

  // 2. Destroy machine hull completely: Ram hull
  damageSoFistication(room, ram, 5000, p1.id, 'sword', 2.0, { componentId: 'hull' });
  stepSiegeBlades(room, 1 / 30, 2.1);

  assert.equal(room.siegeBlades.eliminated.has(p2.id), true, 'Machine destruction must eliminate player');
  assert.equal(p2.alive, false, 'Player should be cleanly eliminated');
  assert.equal(room.siegeBlades.eliminated.size, 1);

  // Crimson eliminated -> Azure wins round 1!
  assert.equal(room.siegeBlades.roundWinner, TEAMS.ATTACKERS);
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 1);
  assert.equal(room.siegeBlades.scores[TEAMS.DEFENDERS], 0);
});

test('Match format ends when a team reaches score to win (Best of 3)', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  // Round 1 win for Azure
  p2.alive = false;
  stepSiegeBlades(room, 1 / 30, 1.0);
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 1);
  assert.equal(room.siegeBlades.matchFinished, false);

  // Reset to round 2
  resetSiegeBladesRound(room, 2.0);
  assert.equal(room.siegeBlades.roundNumber, 2);

  // Round 2 win for Azure -> reaches 2 wins in Bo3 -> Match finished!
  const crimsonM2 = room.getMachineForPlayer(p2.id);
  crimsonM2.health = 0;
  crimsonM2.mode = 'DESTROYED';
  stepSiegeBlades(room, 1 / 30, 3.0);

  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 2);
  assert.equal(room.siegeBlades.matchFinished, true);
  assert.equal(room.siegeBlades.matchWinner, TEAMS.ATTACKERS);
  assert.equal(room.state, 'FINISHED');
});

test('Endless format triggers 6-second countdown between rounds without leaving room', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  // End round 1 by eliminating p2
  p2.alive = false;
  stepSiegeBlades(room, 1 / 30, 1.0);

  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 1);
  assert.equal(room.siegeBlades.roundWinner, TEAMS.ATTACKERS);
  assert.equal(room.siegeBlades.roundResetCountdown, 6.0);

  // Step 3 seconds of countdown
  stepSiegeBlades(room, 3.0, 4.0);
  assert.ok(room.siegeBlades.roundResetCountdown <= 3.0 && room.siegeBlades.roundResetCountdown > 0);
  assert.equal(room.siegeBlades.roundNumber, 1);

  // Step past remaining 3 seconds -> triggers atomic reset into Round 2
  stepSiegeBlades(room, 3.1, 7.1);
  assert.equal(room.siegeBlades.roundResetCountdown, null);
  assert.equal(room.siegeBlades.roundNumber, 2);
  assert.equal(room.siegeBlades.roundWinner, null);
  assert.equal(p1.alive, true);
  assert.equal(p2.alive, true);
  assert.equal(room.getMachines().length, 2);
});

test('Overtime Engagement Zone activates at 180s in Match format and enforces low-altitude Flight contest', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  p1.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  p2.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.FLIGHT;

  provisionSiegeBladesFleet(room, 0);

  const ram = room.getMachineForPlayer(p1.id);
  const flt = room.getMachineForPlayer(p2.id);

  // Before 180s: Overtime not active
  stepSiegeBlades(room, 1.0, 100.0);
  assert.equal(room.siegeBlades.overtimeActive, false);

  // At 180s: Overtime activates
  stepSiegeBlades(room, 1.0, 181.0);
  assert.equal(room.siegeBlades.overtimeActive, true);

  // Move Azure Ram into zone center (0, 0, 0)
  ram.x = 0; ram.y = 0; ram.z = 0;
  p1.position = { x: 0, y: 0, z: 0 };

  // Place Crimson Flight directly above zone center at high altitude (Y = 25m; bridge is Y = 12, ground is Y = 0)
  flt.x = 0; flt.y = 25; flt.z = 0;
  p2.position = { x: 0, y: 25, z: 0 };

  // High altitude (> 4m) must NOT contest the zone!
  stepSiegeBlades(room, 1.0, 182.0);
  assert.equal(room.siegeBlades.zone.controllingTeam, TEAMS.ATTACKERS);
  assert.equal(room.siegeBlades.zone.contested, false);
  assert.ok(room.siegeBlades.zone.holdSec > 0);

  // Lower Flight to low altitude (Y = 2m; altitude <= 4m) -> NOW it contests!
  flt.y = 2.0;
  p2.position.y = 2.0;
  const holdBefore = room.siegeBlades.zone.holdSec;

  stepSiegeBlades(room, 1.0, 183.0);
  assert.equal(room.siegeBlades.zone.contested, true, 'Low altitude Flight should contest the zone');
  assert.equal(room.siegeBlades.zone.holdSec, holdBefore, 'Contested zone timer must pause');
});

test('Clash Starts spawn combatants 20–28m apart with symmetric line of sight', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1, clashStarts: true });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  assert.equal(room.siegeBlades.clashActiveThisRound, true);

  const m1 = room.getMachineForPlayer(p1.id);
  const m2 = room.getMachineForPlayer(p2.id);

  const separation = Math.hypot(m2.x - m1.x, m2.z - m1.z);
  assert.ok(separation >= 20 && separation <= 28, `Separation ${separation} must be between 20 and 28m`);
});

test('Authoritative Bot Controllers step machine weapons and steering in Siege Blades', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1 });
  const human = room.addPlayer({ id: 'human', token: 'h', team: TEAMS.ATTACKERS }, 0);
  const bot = room.addPlayer({ id: 'bot-1', token: 'b', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);

  human.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  bot.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.BALLISTA;

  provisionSiegeBladesFleet(room, 0);

  const botMachine = room.getMachineForPlayer(bot.id);
  assert.ok(botMachine);
  assert.equal(botMachine.operatorId, bot.id);

  // Step several simulation ticks
  for (let t = 0; t < 10; t++) {
    stepSiegeBlades(room, 1 / 30, t * (1 / 30));
  }

  // Verify bot generated inputs
  assert.ok(Number.isFinite(bot.input?.yaw));
  assert.ok(Number.isFinite(bot.input?.pitch));
});
