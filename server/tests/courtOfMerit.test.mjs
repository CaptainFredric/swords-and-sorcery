import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_OF_MERIT } from '../../shared/worlds/courtOfMerit.mjs';
import { getWorld, registerWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { Room } from '../../shared/sim/Room.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { beginRenownTrial, stepRenownTrial } from '../../shared/sim/renownTrials.mjs';

test('Court of Merit is registered and has valid judicial geometry', () => {
  const world = getWorld('court-of-merit');
  assert.equal(world.id, 'court-of-merit');
  assert.ok(world.floors.length >= 7, 'Has arena, sally alcoves, and dais floors');
  assert.ok(world.solids.length >= 10, 'Has outer curtains, pillars, dais, and effigy solids');
  assert.ok(world.ramps.length >= 3, 'Has tribunal steps and gallery ramps');
  assert.ok(world.spawnPoints.length >= 5, 'Has primary player spawn and wave spawns');
  assert.ok(world.navigation.nodes.length >= 15, 'Has navigation nodes for bot pathfinding');
});

test('Court of Merit hosts Renown Trials mode and runs waves with bots', () => {
  const room = new Room('COURT1', { mode: GAME_MODES.RENOWN_TRIALS, worldId: 'court-of-merit' });
  room.addPlayer({ id: 'spellblade', token: 'token1', name: 'Champion' }, 0);
  room.startMatch(0);
  assert.equal(room.state, 'PLAYING');
  assert.ok(room.renownTrial);

  // Advance through intro to first wave
  stepRenownTrial(room, 2.0);
  assert.equal(room.renownTrial.phase, 'WAVE_ACTIVE');
  assert.equal(room.renownTrial.waveIndex, 1);
  const bots = [...room.players.values()].filter((p) => p.actorKind === 'bot');
  assert.equal(bots.length, 1);
  assert.ok(Number.isFinite(bots[0].position.x));
  assert.ok(Number.isFinite(bots[0].position.z));
});
