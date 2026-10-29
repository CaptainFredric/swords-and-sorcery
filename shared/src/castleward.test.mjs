import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT, createMovementState, movePlayer, tryStartDash } from './movement.mjs';
import { CASTLEWARD } from '../worlds/castleward.mjs';
import { surfaceHeightAt } from './collision.mjs';

function runForward(start, yaw, frames) {
  let state = createMovementState(start);
  for (let i = 0; i < frames; i += 1) {
    state = movePlayer(
      state,
      { forward: 1, right: 0, jump: false, yaw },
      1 / 60,
      (i + 1) / 60,
      CASTLEWARD,
    );
  }
  return state;
}

test('Castleward exposes the six intended combat zones', () => {
  const ids = new Set(CASTLEWARD.zones.map((zone) => zone.id));
  assert.deepEqual(ids, new Set(['town-green', 'castle-bailey', 'west-village', 'east-meadow', 'south-road', 'tourney-field']));
});

test('East Meadow runs through the gateway onto the open Tourney Field, and it stays open', () => {
  const state = runForward({ x: 13.8, y: 0, z: -2 }, 0, 120);
  assert.ok(state.position.z < -16, `did not reach the Tourney Field: z=${state.position.z}`);
  assert.ok(Math.abs(state.position.y) < 0.01);
  assert.equal(state.grounded, true);
  const field = CASTLEWARD.floors.find((floor) => floor.id === 'tourney-field');
  const cover = CASTLEWARD.solids.filter((solid) => solid.id.startsWith('tourney-') && !['hedge', 'field-wall', 'gatepost'].includes(solid.kind));
  const covered = cover.reduce((sum, solid) => sum + solid.size[0] * solid.size[2], 0);
  assert.ok(covered / (field.size[0] * field.size[2]) < 0.08, 'open ground: almost nothing stands in it');
});

test('Castleward stays inside the arena size envelope', () => {
  const coreFloors = CASTLEWARD.floors.filter((floor) => floor.id !== 'broken-bridge-far');
  const xs = coreFloors.flatMap((floor) => [
    floor.center[0] - floor.size[0] / 2,
    floor.center[0] + floor.size[0] / 2,
  ]);
  const zs = coreFloors.flatMap((floor) => [
    floor.center[2] - floor.size[2] / 2,
    floor.center[2] + floor.size[2] / 2,
  ]);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  assert.ok(width >= 45 && width <= 55, `Castleward width out of envelope: ${width}`);
  assert.ok(depth >= 45 && depth <= 55, `Castleward depth out of envelope: ${depth}`);
  assert.ok(CASTLEWARD.spawnPoints.length >= 10);
});

test('Town Green reaches Castle Bailey by normal running without Dash', () => {
  const state = runForward({ x: 0, y: 0, z: 5 }, Math.PI, 150);
  assert.ok(state.position.z > 20, `did not reach Bailey: z=${state.position.z}`);
  assert.ok(state.position.y > 2.2, `did not climb Bailey ramp: y=${state.position.y}`);
  assert.equal(state.grounded, true);
  assert.ok(state.dashReadyAt <= 0, 'route unexpectedly used Dash');
});

test('Town Green reaches East Meadow by normal running without Dash', () => {
  const state = runForward({ x: 6, y: 0, z: 0 }, -Math.PI / 2, 105);
  assert.ok(state.position.x > 18, `did not reach East Meadow: x=${state.position.x}`);
  assert.ok(Math.abs(state.position.y) < 0.01, `East Meadow should remain ground level: y=${state.position.y}`);
  assert.equal(state.grounded, true);
  assert.ok(state.dashReadyAt <= 0, 'route unexpectedly used Dash');
});

const SPRINT_INPUT = (yaw) => ({ forward: 1, right: 0, jump: false, sprint: true, yaw });

function simulate(start, yaw, seconds, { jump = false, dash = false } = {}) {
  let state = createMovementState(start);
  state.sprinting = true;
  const dt = 1 / 30;
  let lowest = start.y;
  for (let i = 0; i < seconds / dt; i += 1) {
    const now = (i + 1) * dt;
    if (dash && i === 2) tryStartDash(state, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, now);
    state = movePlayer(state, { ...SPRINT_INPUT(yaw), jump: jump && i < 3 }, dt, now, CASTLEWARD);
    lowest = Math.min(lowest, state.position.y);
  }
  return { state, lowest };
}

// points just inside every floor's rim, and the eight headings to run from each
function rimSamples() {
  const samples = [];
  for (const floor of CASTLEWARD.floors) {
    if (floor.id === 'broken-bridge' || floor.id === 'broken-bridge-far') continue;
    const [cx, , cz] = floor.center;
    const hx = floor.size[0] / 2 - 0.5;
    const hz = floor.size[2] / 2 - 0.5;
    for (let t = -1; t <= 1; t += 0.25) {
      samples.push({ x: cx + t * hx, z: cz - hz, floor }, { x: cx + t * hx, z: cz + hz, floor });
      samples.push({ x: cx - hx, z: cz + t * hz, floor }, { x: cx + hx, z: cz + t * hz, floor });
    }
  }
  return samples;
}

function inSolid(x, y, z) {
  return CASTLEWARD.solids.some((solid) => {
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    return Math.abs(x - cx) < sx / 2 + 0.46 && Math.abs(z - cz) < sz / 2 + 0.46 && y < cy + sy / 2 && y + 1.8 > cy - sy / 2;
  });
}

test('running, sprinting or dashing from anywhere on any edge never falls into the abyss', () => {
  const falls = [];
  for (const sample of rimSamples()) {
    const y = sample.floor.y;
    // skip spots buried in a wall or under a ramp's raised surface: no one can stand there
    if (inSolid(sample.x, y, sample.z) || (surfaceHeightAt(sample.x, sample.z, 99, CASTLEWARD) ?? y) > y + 0.65) continue;
    for (let k = 0; k < 8; k += 1) {
      const yaw = (k / 8) * Math.PI * 2;
      // heading south down the South Road leads through the South Gate onto the open Broken Bridge hazard
      if (Math.abs(sample.x) < 4 && sample.z < -6 && (k === 0 || k === 1 || k === 7)) continue;
      for (const dash of [false, true]) {
        const { lowest } = simulate({ x: sample.x, y, z: sample.z }, yaw, 2.5, { dash });
        if (lowest < -0.5) falls.push(`${sample.floor.id} (${sample.x.toFixed(1)}, ${sample.z.toFixed(1)}) heading ${k * 45}deg${dash ? ' with dash' : ''}`);
      }
    }
  }
  assert.deepEqual(falls, [], `accidental falls:\n${falls.slice(0, 12).join('\n')}`);
});

test('ground-level boundaries are taller than a jump reaches; lips are low enough to jump on purpose', () => {
  const apex = (MOVEMENT.jumpImpulse ** 2) / (2 * MOVEMENT.gravity);
  for (const solid of CASTLEWARD.solids) {
    const height = solid.size[1];
    if (['palisade', 'field-wall', 'hedge', 'bank'].includes(solid.kind)) assert.ok(height > apex, `${solid.id} can be hopped (${height} m)`);
    if (solid.kind === 'lip') assert.ok(height < apex * 0.4, `${solid.id} is too tall to read as a lip`);
  }
});

test('the Broken Bridge is an open hazard: running or being knocked off its end falls into the abyss', () => {
  // yaw 0 heads toward -z (south off the broken edge)
  const walked = simulate({ x: 0, y: 0, z: -25.5 }, 0, 2);
  assert.ok(walked.lowest < CASTLEWARD.abyssY + 3, 'running off the broken edge falls into the abyss');
  // but the parapets on east and west stop side-falls
  const westWalk = simulate({ x: 0, y: 0, z: -26 }, Math.PI / 2, 1.5);
  assert.ok(westWalk.lowest >= -0.1, 'stopped by west parapet');
  const eastWalk = simulate({ x: 0, y: 0, z: -26 }, -Math.PI / 2, 1.5);
  assert.ok(eastWalk.lowest >= -0.1, 'stopped by east parapet');
});

test('the far platform across the ravine has authoritative floor collision and can be landed on', () => {
  const farFloor = CASTLEWARD.floors.find((floor) => floor.id === 'broken-bridge-far');
  assert.ok(farFloor, 'broken-bridge-far floor exists');
  assert.equal(surfaceHeightAt(0, -35.7, 0, CASTLEWARD), 0, 'surface height is 0 at center of far platform');
  // a sprint-jump from the broken bridge edge reaches the far platform
  const jumped = simulate({ x: 0, y: 0, z: -27.5 }, 0, 0.85, { jump: true });
  assert.ok(jumped.state.position.z < -33.6 && jumped.state.position.z > -37.8, `reached far platform: z=${jumped.state.position.z}`);
  assert.ok(Math.abs(jumped.state.position.y) < 0.05, `safely standing on platform: y=${jumped.state.position.y}`);
  assert.equal(jumped.state.grounded, true, 'grounded on the far platform');
});

test('castle masonry, corner towers, and keep block movement', () => {
  // corner tower NW blocks passage
  const towerNW = CASTLEWARD.solids.find((s) => s.id === 'castle-tower-nw');
  assert.ok(towerNW, 'corner tower NW exists');
  const walkTower = runForward({ x: -8.8, y: 2.5, z: 26.0 }, 0.9, 60);
  assert.ok(Math.hypot(walkTower.position.x - (-10.2), walkTower.position.z - 26.9) >= 1.2, 'blocked by tower NW');

  // bailey back wall / keep blocks passage
  const keep = CASTLEWARD.solids.find((s) => s.id === 'castle-keep');
  assert.ok(keep, 'castle keep exists');
  const walkKeep = runForward({ x: 0, y: 4, z: 25.5 }, 0, 60);
  assert.ok(walkKeep.position.z <= 26.25, 'blocked by bailey back wall');
});

test('the wall walks are reached by their stairs and cannot be walked underneath', () => {
  // up the west stairs: north from the Bailey's front corner
  const climbed = runForward({ x: -7.4, y: 2.5, z: 17.6 }, Math.PI, 90);
  assert.ok(Math.abs(climbed.position.y - 4) < 0.01 && climbed.position.z > 21, `on the walk: y=${climbed.position.y}`);
  // from the Bailey floor, heading west into the walk's side: the balustrade stops it
  const blocked = runForward({ x: -4.8, y: 2.5, z: 23 }, Math.PI / 2, 60);
  assert.ok(blocked.position.x > -5.5 && Math.abs(blocked.position.y - 2.5) < 0.01);
});
