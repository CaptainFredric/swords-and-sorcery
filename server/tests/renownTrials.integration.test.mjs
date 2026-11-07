import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { serializeSnapshot, applyRoomCommand } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';

function createTrial() {
  const manager = new RoomManager({ random: () => 0.28 });
  const room = manager.createSoloRoom(GAME_MODES.RENOWN_TRIALS, 0);
  const player = room.addPlayer({ id: 'player', token: 'token', name: 'Trial Knight' }, 0);
  room.armAutoStart(0);
  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  room.tick(4.7);
  assert.equal(room.renownTrial.waveIndex, 1);
  return { room, player };
}
test('solo Renown Trials registers an authoritative fight and snapshots its wave', () => {
  const { room } = createTrial();
  const snapshot = serializeSnapshot(room, 4.8, 'player');
  assert.equal(snapshot.mode, GAME_MODES.RENOWN_TRIALS);
  assert.equal(snapshot.renownTrial.phase, 'WAVE_ACTIVE');
  assert.equal(snapshot.renownTrial.totalEnemies, 1);
  assert.equal(snapshot.renownTrial.verdict, null);
  const enemy = room.players.get(room.renownTrial.wave.enemyIds[0]);
  assert.equal(enemy.actorKind, 'bot');
  assert.notEqual(enemy.actorKind, 'dummy');
  assert.equal(room.policy.timed, false);
});
test('the match deadline never ends a surviving overtime wave', () => {
  const { room } = createTrial();
  const deadline = room.renownTrial.wave.deadlineAt;
  stepRoom(room, 1 / 60, deadline + 6);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.renownTrial.phase, 'WAVE_OVERTIME');
  assert.equal(serializeSnapshot(room, deadline + 6, 'player').renownTrial.verdict, null);
});
test('ceremony refuses combat input, and rematch removes all previous wave bots', () => {
  const { room, player } = createTrial();
  const enemy = room.players.get(room.renownTrial.wave.enemyIds[0]);
  enemy.alive = false;
  enemy.respawnAt = Infinity;
  room.tick(8);
  assert.equal(room.renownTrial.phase, 'JUDGMENT');
  const oldRunId = room.renownTrial.runId;
  const original = { ...player.position };
  applyRoomCommand(room, player, { type: 'input', forward: 1, right: 0, yaw: 0 }, 8.1);
  stepRoom(room, 1 / 60, 8.15);
  assert.deepEqual(player.position, original, 'ceremonial presentation does not move the player');
  room.tick(12);
  room.finish(player.id, 12, 'test-force-end');
  assert.equal(room.requestRematch(player.id, 12.1), true, 'solo rematch requires only its living human');
  room.tick(15.2);
  assert.equal(room.state, 'PLAYING');
  assert.notEqual(room.renownTrial.runId, oldRunId);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 0);
  room.tick(17);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
});
