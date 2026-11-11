import assert from 'node:assert/strict';
import test from 'node:test';
import { arenaForMode, arenasForMode } from '../../shared/src/modes.mjs';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { runClear } from '../../shared/sim/botNav.mjs';
import { surfaceHeightAt, resolvePlayerWorld } from '../../shared/src/collision.mjs';
import { resetPracticePlayer, spawnPracticeDummy } from '../../shared/sim/practice.mjs';
import { practiceSiegeCommand } from '../../shared/sim/practiceSiege.mjs';

const safe = (world, p) => {
  assert.equal(surfaceHeightAt(p.x, p.z, p.y + 0.2, world), p.y);
  const resolved = resolvePlayerWorld(p, 0.48, world.solids, 1.8);
  assert.ok(Math.hypot(p.x - resolved.x, p.z - resolved.z) < 0.01);
};

test('mode arena choices stay separate from authored team objectives', () => {
  assert.equal(arenaForMode('PRACTICE', 'high-grounds'), 'high-grounds');
  assert.equal(arenaForMode('BOT_DUEL', 'high-grounds'), 'castleward');
  assert.equal(arenaForMode('HIGH_GROUNDS', 'court-of-merit'), 'high-grounds');
  assert.equal(arenaForMode('EDGE_OF_VICTORY', 'blackbell-foundry'), 'ruined-keep');
  assert.ok(!arenasForMode('DUEL').includes('outerworks'));
  assert.ok(!arenasForMode('PRACTICE').includes('oubloodlet'));
  const manager = new RoomManager();
  assert.equal(manager.createSharedPracticeRoom(0, 'high-grounds').worldId, 'high-grounds');
});

for (const worldId of ['court-of-merit', 'blackbell-foundry']) {
  test(worldId + ' has safe neutral starting positions and reachable duel opponents', () => {
    const room = new Room('ARENA', { mode: 'BOT_DUEL', worldId });
    const spawns = Array.from({length: 8}, (_, i) => room.initialSpawnFor({}, i));
    spawns.forEach(p => safe(room.world, p));
    const [first, second] = spawns;
    assert.ok(Math.hypot(first.x - second.x, first.z - second.z) < 17);
    assert.ok(runClear(room.world, first, second));
    assert.equal(room.objectiveState, undefined);
  });
}

test('High Grounds Practice uses safe anchors, nearby opponents and ordinary siege validation', () => {
  const room = new Room('ARENA', { mode: 'PRACTICE', worldId: 'high-grounds' });
  const player = room.addPlayer({ id:'p', token:'p', name:'Knight' }, 0);
  room.startMatch(1);
  assert.equal(room.highGrounds, null);
  assert.equal(room.objectiveState, undefined);
  assert.deepEqual(player.position, {x:0, y:0, z:4});
  for (const point of room.world.practiceDestinations) {
    assert.equal(resetPracticePlayer(room, player.id, 2, point.id), true);
    safe(room.world, player.position);
    assert.equal(player.position.y, point.y);
    assert.equal(player.prowess, 100);
    const dummy = spawnPracticeDummy(room, 'FIGHTS_BACK', 2, player.id);
    assert.ok(dummy?.position);
    assert.ok(runClear(room.world, player.position, dummy.position));
  }
  const before = { ...player.position };
  assert.equal(resetPracticePlayer(room, player.id, 2, 'unknown'), false);
  assert.deepEqual(player.position, before);
  assert.equal(practiceSiegeCommand(room, player, 'build', 'so-fist-ication', 2).rejected, undefined);
});
