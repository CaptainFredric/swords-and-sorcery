import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms/RoomManager.mjs';
import { stepRoom } from '../src/game/combat.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';

function sequenceRandom(values = [0.1, 0.2, 0.3, 0.4, 0.5]) {
  let i = 0;
  return () => values[(i++) % values.length];
}

function preparePlayer(room, id, position) {
  const player = room.addPlayer({ id, token: `token-${id}`, name: id }, 0);
  room.startMatch(0);
  player.position = { ...position };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.grounded = true;
  player.input = { forward: 0, right: 0, jump: false, yaw: 0, pitch: 0 };
  player.spawnProtectionUntil = 0;
  return player;
}

test('new rooms default to Castleward while explicit Keep rooms remain available', () => {
  const manager = new RoomManager({ random: sequenceRandom([0.07, 0.19, 0.31, 0.43, 0.67, 0.83]) });
  const publicRoom = manager.createPublicRoom(0);
  const privateRoom = manager.createPrivateRoom(0);
  const soloRoom = manager.createSoloRoom('PRACTICE', 0);
  const keepRoom = manager.createPrivateRoom(0, WORLD_IDS.SHATTERED_KEEP);

  assert.equal(publicRoom.worldId, WORLD_IDS.CASTLEWARD);
  assert.equal(privateRoom.worldId, WORLD_IDS.CASTLEWARD);
  assert.equal(soloRoom.worldId, WORLD_IDS.CASTLEWARD);
  assert.equal(keepRoom.worldId, WORLD_IDS.SHATTERED_KEEP);
  assert.notDeepEqual(privateRoom.world.spawnPoints[0], keepRoom.world.spawnPoints[0]);
});

test('room simulation uses each room world instead of a server-global Keep', () => {
  const manager = new RoomManager({ random: sequenceRandom([0.11, 0.23, 0.37, 0.49, 0.61, 0.73]) });
  const castleRoom = manager.createPrivateRoom(0, WORLD_IDS.CASTLEWARD);
  const keepRoom = manager.createPrivateRoom(0, WORLD_IDS.SHATTERED_KEEP);
  const castlePlayer = preparePlayer(castleRoom, 'castle-player', { x: 22, y: 0, z: 0 });
  const keepPlayer = preparePlayer(keepRoom, 'keep-player', { x: 0, y: 0, z: -25 });

  for (let i = 0; i < 45; i += 1) {
    const now = (i + 1) / 30;
    stepRoom(castleRoom, 1 / 30, now);
    stepRoom(keepRoom, 1 / 30, now);
  }

  assert.ok(castlePlayer.position.y > -0.1, `Castleward floor ignored: y=${castlePlayer.position.y}`);
  assert.equal(castlePlayer.grounded, true);
  assert.ok(keepPlayer.position.y > -0.1, `Keep floor ignored: y=${keepPlayer.position.y}`);
  assert.equal(keepPlayer.grounded, true);
});
