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

test('Castleward exposes the five intended combat zones', () => {
  const ids = new Set(CASTLEWARD.zones.map((zone) => zone.id));
  assert.deepEqual(ids, new Set(['town-green', 'castle-bailey', 'west-village', 'east-meadow', 'south-road']));
});

test('Castleward stays inside the arena size envelope', () => {
  const xs = CASTLEWARD.floors.flatMap((floor) => [
    floor.center[0] - floor.size[0] / 2,
    floor.center[0] + floor.size[0] / 2,
  ]);
  const zs = CASTLEWARD.floors.flatMap((floor) => [
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

test('the Broken Bridge is the one deliberate hazard: walking stops at its lip, a jump over it falls', () => {
  const hazards = CASTLEWARD.solids.filter((solid) => solid.hazard);
  assert.deepEqual(hazards.map((solid) => solid.id), ['bridge-broken-lip']);
  // yaw 0 heads toward -z (south)
  const walked = simulate({ x: 0, y: 0, z: -25.5 }, 0, 2);
  assert.ok(walked.state.position.y > -0.01 && walked.state.position.z > -27.7, 'stopped at the lip');
  const jumped = simulate({ x: 0, y: 0, z: -26.2 }, 0, 2.5, { jump: true });
  assert.ok(jumped.lowest < CASTLEWARD.abyssY + 3, 'a jump over the lip falls');
});

test('the wall walks are reached by their stairs and cannot be walked underneath', () => {
  // up the west stairs: north from the Bailey's front corner
  const climbed = runForward({ x: -7.4, y: 2.5, z: 17.6 }, Math.PI, 90);
  assert.ok(Math.abs(climbed.position.y - 4) < 0.01 && climbed.position.z > 21, `on the walk: y=${climbed.position.y}`);
  // from the Bailey floor, heading west into the walk's side: the balustrade stops it
  const blocked = runForward({ x: -4.8, y: 2.5, z: 23 }, Math.PI / 2, 60);
  assert.ok(blocked.position.x > -5.5 && Math.abs(blocked.position.y - 2.5) < 0.01);
});
