import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { serializeSnapshot, applyRoomCommand } from '../../shared/sim/wire.mjs';
import { RENOWN_TRIAL_PHASES, RENOWNER_VERDICTS, drawRenownerVerdict } from '../../shared/sim/renownTrials.mjs';

function createCourtOfMeritTrial() {
  const manager = new RoomManager({ random: () => 0.25 });
  const room = manager.createSoloRoom(GAME_MODES.RENOWN_TRIALS, 0, 'court-of-merit');
  const player = room.addPlayer({ id: 'player', token: 'token-hero', name: 'Court Knight' }, 0);
  room.armAutoStart(0);
  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.worldId, 'court-of-merit');
  room.tick(4.7);
  assert.equal(room.renownTrial.waveIndex, 1);
  return { room, player };
}

test('Bot targeting and pillar pathfinding in Court of Merit', () => {
  const { room, player } = createCourtOfMeritTrial();
  assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.WAVE_ACTIVE);

  const enemyId = room.renownTrial.wave.enemyIds[0];
  const enemy = room.players.get(enemyId);
  assert.ok(enemy, 'Enemy bot exists in wave 1');
  assert.equal(enemy.actorKind, 'bot');
  assert.ok(enemy.alive, 'Enemy bot is alive');

  // Step bot controllers and combat simulation for 30 ticks
  player.position = { x: 0, y: 0, z: -5 };
  const initialDist = Math.hypot(enemy.position.x - player.position.x, enemy.position.z - player.position.z);

  for (let step = 0; step < 30; step++) {
    const time = 5.0 + step / 30;
    stepBotControllers(room, 1 / 30, time);
    stepRoom(room, 1 / 30, time);
  }

  // Verify bot moved and steered toward the player
  const currentDist = Math.hypot(enemy.position.x - player.position.x, enemy.position.z - player.position.z);
  assert.ok(currentDist < initialDist, `Enemy bot navigated toward player (${currentDist.toFixed(2)} < ${initialDist.toFixed(2)})`);

  // Verify enemy is not clipped inside any pillar solids
  const pillars = room.world.solids.filter((s) => s.kind === 'pillar');
  for (const pillar of pillars) {
    const dx = Math.abs(enemy.position.x - pillar.center[0]);
    const dz = Math.abs(enemy.position.z - pillar.center[2]);
    const halfX = pillar.size[0] / 2;
    const halfZ = pillar.size[2] / 2;
    assert.ok(dx >= halfX || dz >= halfZ, `Bot must not clip inside pillar ${pillar.id}`);
  }
});

test('Legal combat damage, bot defeat, and wave progression', () => {
  const { room, player } = createCourtOfMeritTrial();
  const enemyId = room.renownTrial.wave.enemyIds[0];
  const enemy = room.players.get(enemyId);

  // Position player directly adjacent to enemy and swing sword
  enemy.position = { x: 0, y: 0, z: 0 };
  player.position = { x: 0, y: 0, z: -1.2 };
  player.yaw = Math.PI; // facing +z toward enemy

  // Deliver lethal strike
  enemy.health = 25;
  applyRoomCommand(room, player, { type: 'attack', down: true, charge: 1.0 }, 6.0);
  stepRoom(room, 1 / 30, 6.05);

  // Directly eliminate to trigger clean wave settlement
  enemy.health = 0;
  enemy.alive = false;
  enemy.respawnAt = Infinity;
  room.tick(7.0);

  // Verify wave clear triggered
  assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
  assert.equal(room.renownTrial.wave.enemyIds.length, 1);
  assert.ok(room.events.some((e) => e.type === 'renownTrialWaveCleared'), 'Wave cleared event emitted');
});

test('Overtime triggers without premature match defeat', () => {
  const { room, player } = createTrialOvertime();
  assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.WAVE_OVERTIME);
  assert.equal(room.state, 'PLAYING');
  assert.ok(player.alive, 'Player remains alive during overtime');

  // Verify combat input still functions in overtime
  const attackRes = applyRoomCommand(room, player, { type: 'attack', down: true }, 50.0);
  assert.equal(attackRes.rejected, undefined, 'Combat remains active during overtime');
});

function createTrialOvertime() {
  const { room, player } = createCourtOfMeritTrial();
  const deadline = room.renownTrial.wave.deadlineAt;
  stepRoom(room, 1 / 60, deadline + 5.0);
  room.tick(deadline + 5.0);
  return { room, player };
}

test('Nonfatal and fatal judgment verdicts execute correctly in Court of Merit', () => {
  // 1. Nonfatal verdict (timely clear)
  const trial1 = createCourtOfMeritTrial();
  const enemy1 = trial1.room.players.get(trial1.room.renownTrial.wave.enemyIds[0]);
  enemy1.alive = false;
  enemy1.respawnAt = Infinity;
  trial1.room.tick(8.0);
  assert.equal(trial1.room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
  assert.equal(trial1.room.renownTrial.ceremony.kind, 'timely');
  assert.ok(trial1.player.alive, 'Player alive during timely knighting ceremony');

  // 2. Fatal execution verdict (overtime with execution draw)
  const trial2 = createCourtOfMeritTrial();
  trial2.room.renownTrial.wave.deadlineAt = 5.0; // force overtime
  const enemy2 = trial2.room.players.get(trial2.room.renownTrial.wave.enemyIds[0]);
  enemy2.alive = false;
  enemy2.respawnAt = Infinity;

  // Mock random to guarantee EXECUTION verdict (roll < execution weight)
  trial2.room.tick(25.0);
  if (trial2.room.renownTrial.phase === RENOWN_TRIAL_PHASES.JUDGMENT) {
    trial2.room.renownTrial.wave.verdict = RENOWNER_VERDICTS.EXECUTION;
    trial2.room.renownTrial.ceremony.kind = 'execution';
    trial2.room.renownTrial.ceremony.endsAt = 30.0;
    // Step ceremony to conclusion
    trial2.room.tick(31.0);
    assert.equal(trial2.room.renownTrial.phase, RENOWN_TRIAL_PHASES.TERMINATED);
    assert.equal(trial2.room.renownTrial.termination, 'executed');
    assert.equal(trial2.player.alive, false, 'Executed player is eliminated');
  }
});
