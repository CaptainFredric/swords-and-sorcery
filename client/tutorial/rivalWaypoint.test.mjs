import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRivalWaypoint } from './rivalWaypoint.mjs';

function createMockCamera({ x = 0, y = 1.7, z = 0, yaw = 0, pitch = 0, fov = 75, aspect = 16 / 9 } = {}) {
  return {
    position: { x, y, z },
    yaw,
    pitch,
    fov,
    aspect,
  };
}

test('computeRivalWaypoint returns null when not in tutorial mode or missing player', () => {
  const camera = createMockCamera();
  const local = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 200 } };
  const snapshot = { tutorial: false, players: [local, { id: 'rival', position: { x: 0, y: 0, z: 150 } }] };

  assert.equal(computeRivalWaypoint({ local, snapshot, camera }), null);
  assert.equal(computeRivalWaypoint({ local: { ...local, alive: false }, snapshot: { tutorial: true }, camera }), null);
  assert.equal(computeRivalWaypoint({ local: { ...local, health: 0 }, snapshot: { tutorial: true }, camera }), null);
  assert.equal(computeRivalWaypoint({ local: null, snapshot: { tutorial: true }, camera }), null);
});

test('computeRivalWaypoint suppresses marker during title cards, blocking dialogue, and completion', () => {
  const camera = createMockCamera({ z: 100 });
  const local = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 100 } };
  const snapshot = { tutorial: true, players: [local, { id: 'rival', position: { x: 0, y: 0, z: -15 } }] };

  const session = {
    rivalId: 'rival',
    director: {
      state: 'running',
      progress: {
        state: 'running',
        current: { kind: 'title', id: 'opening-title' },
      },
      facts: new Set(),
    },
    host: {
      room: {
        players: new Map([
          ['p1', local],
          ['rival', { id: 'rival', position: { x: 0, y: 0, z: -15 } }],
        ]),
      },
    },
  };

  // Title card suppression
  assert.equal(computeRivalWaypoint({ session, local, snapshot, camera }), null);

  // Blocking dialogue suppression
  session.director.progress.current = { kind: 'dialogue', presentation: 'blocking', id: 'talk' };
  assert.equal(computeRivalWaypoint({ session, local, snapshot, camera }), null);

  // Reactive dialogue is permitted (not blocking)
  session.director.progress.current = { kind: 'dialogue', presentation: 'reactive', id: 'chase-cue' };
  const reactiveResult = computeRivalWaypoint({ session, local, snapshot, camera });
  assert.ok(reactiveResult, 'Reactive dialogue should show waypoint');

  // Tutorial complete suppression
  session.director.progress.state = 'complete';
  assert.equal(computeRivalWaypoint({ session, local, snapshot, camera }), null);

  // Rival defeated suppression
  session.director.progress.state = 'running';
  session.director.facts.add('rival-defeated');
  assert.equal(computeRivalWaypoint({ session, local, snapshot, camera }), null);
});

test('computeRivalWaypoint guides through slalom gates in the opening', () => {
  const camera = createMockCamera({ yaw: 0 });
  const rivalPos = { x: 0, y: 0, z: -15 };
  const snapshot = {
    tutorial: true,
    players: [
      { id: 'p1', position: { x: 0, y: 0, z: 200 } },
      { id: 'rival', position: rivalPos },
    ],
  };

  // Player at z = 200 (> 168): should target Gate A (68, 0, 168)
  const localA = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 200 } };
  const resA = computeRivalWaypoint({ local: localA, snapshot, camera });
  assert.ok(resA);
  assert.equal(resA.name, 'RIVAL');
  assert.equal(Math.round(resA.dist), 215); // Distance to Rival (200 - (-15))

  // Gate A (68, 0, 168) is to the right (+X) and in front (-Z relative to z=200):
  // Since camera yaw=0 faces -Z, +X is to screen right (x > 0.5)
  assert.ok(resA.x > 0.5, `Expected x > 0.5 for Gate A to the right, got ${resA.x}`);

  // Player at z = 140 (168 >= z > 110): should target Gate B (-68, 0, 110)
  const localB = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 140 } };
  const resB = computeRivalWaypoint({ local: localB, snapshot, camera });
  assert.ok(resB);
  // Gate B (-68, 0, 110) is to the left (-X): x < 0.5
  assert.ok(resB.x < 0.5, `Expected x < 0.5 for Gate B to the left, got ${resB.x}`);

  // Player at z = 80 (110 >= z > 52): should target Gate C (68, 0, 52)
  const localC = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 80 } };
  const resC = computeRivalWaypoint({ local: localC, snapshot, camera });
  assert.ok(resC);
  assert.ok(resC.x > 0.5, `Expected x > 0.5 for Gate C to the right, got ${resC.x}`);

  // Player at z = 30 (<= 52): direct path to Rival at (0, 0, -15)
  const localCleared = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 30 } };
  const resCleared = computeRivalWaypoint({ local: localCleared, snapshot, camera });
  assert.ok(resCleared);
  // Rival is at x=0, player is at x=0: x should be centered around 0.5
  assert.ok(Math.abs(resCleared.x - 0.5) < 0.05, `Expected x ~ 0.5, got ${resCleared.x}`);
});

test('computeRivalWaypoint guides to bridge takeoff ramp before chasm', () => {
  const camera = createMockCamera({ yaw: 0 });
  // Rival has leaped across ravine and is at z = -690
  const rivalPos = { x: 32, y: 0, z: -690 };
  const snapshot = {
    tutorial: true,
    players: [
      { id: 'p1', position: { x: 10, y: 0, z: -640 } },
      { id: 'rival', position: rivalPos },
    ],
  };

  // Player is at x=10, approaching bridge before gap (z = -640)
  const localApproaching = { id: 'p1', alive: true, health: 100, position: { x: 10, y: 0, z: -640 } };
  const resApproaching = computeRivalWaypoint({ local: localApproaching, snapshot, camera });
  assert.ok(resApproaching);
  // Bridge takeoff ramp is at x=32, which is to the right of x=10:
  assert.ok(resApproaching.x > 0.5, `Expected x > 0.5 toward ramp, got ${resApproaching.x}`);

  // Once player has crossed (z = -678): targets Rival directly
  const localCrossed = { id: 'p1', alive: true, health: 100, position: { x: 32, y: 0, z: -678 } };
  const resCrossed = computeRivalWaypoint({ local: localCrossed, snapshot, camera });
  assert.ok(resCrossed);
  assert.equal(Math.round(resCrossed.dist), 12);
});

test('computeRivalWaypoint suppresses marker in close proximity (dist <= 5.5m on-screen)', () => {
  const camera = createMockCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // faces -Z
  const snapshot = { tutorial: true };

  // Rival 4 meters in front of player (on screen)
  const localClose = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 0 } };
  const snapRivalClose = {
    players: [localClose, { id: 'rival', position: { x: 0, y: 0, z: -4 } }],
  };
  assert.equal(
    computeRivalWaypoint({ local: localClose, snapshot: { ...snapshot, ...snapRivalClose }, camera }),
    null,
    'Should suppress marker when Rival is on-screen within 5.5m'
  );

  // Rival 12 meters in front of player (on screen)
  const snapRivalMid = {
    players: [localClose, { id: 'rival', position: { x: 0, y: 0, z: -12 } }],
  };
  const resMid = computeRivalWaypoint({ local: localClose, snapshot: { ...snapshot, ...snapRivalMid }, camera });
  assert.ok(resMid, 'Should show marker when Rival is 12m away');
  assert.equal(resMid.clamped, false);
  assert.equal(Math.round(resMid.dist), 12);
});

test('computeRivalWaypoint clamps to screen edge with directional angle when off-screen or behind', () => {
  const camera = createMockCamera({ x: 0, y: 1.7, z: 0, yaw: 0 }); // faces -Z
  const local = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 0 } };

  // Rival is behind player (+Z):
  const snapBehind = {
    tutorial: true,
    players: [local, { id: 'rival', position: { x: 0, y: 0, z: 25 } }],
  };
  const resBehind = computeRivalWaypoint({ local, snapshot: snapBehind, camera });
  assert.ok(resBehind);
  assert.equal(resBehind.clamped, true);
  assert.equal(resBehind.isBehind, true);
  assert.ok(Number.isFinite(resBehind.angle));

  // Rival is far to the right (+X):
  const snapRight = {
    tutorial: true,
    players: [local, { id: 'rival', position: { x: 60, y: 0, z: -5 } }],
  };
  const resRight = computeRivalWaypoint({ local, snapshot: snapRight, camera });
  assert.ok(resRight);
  assert.equal(resRight.clamped, true);
  assert.ok(resRight.x >= 0.90, `Expected clamped to right edge (x >= 0.90), got ${resRight.x}`);
});

test('computeRivalWaypoint dynamically tracks dynamic position and recovery/knockdown', () => {
  const camera = createMockCamera({ x: 0, y: 1.7, z: 0, yaw: 0 });
  const local = { id: 'p1', alive: true, health: 100, position: { x: 0, y: 0, z: 0 } };

  const session = {
    rivalId: 'rival',
    director: {
      state: 'running',
      progress: { state: 'running', current: { kind: 'dialogue', presentation: 'reactive', id: 'flee' } },
      facts: new Set(),
    },
    rival: { mode: 'escape' },
    host: {
      room: {
        players: new Map([
          ['p1', local],
          ['rival', { id: 'rival', position: { x: 10, y: 0, z: -30 } }],
        ]),
      },
    },
  };

  const snapshot = { tutorial: true, players: [local] };

  // Step 1: Rival fleeing at (10, 0, -30)
  const res1 = computeRivalWaypoint({ session, local, snapshot, camera });
  assert.ok(res1);
  assert.equal(Math.round(res1.dist), 32);

  // Step 2: Rival jumps or runs further to (15, 2, -50)
  session.host.room.players.get('rival').position = { x: 15, y: 2, z: -50 };
  const res2 = computeRivalWaypoint({ session, local, snapshot, camera });
  assert.ok(res2);
  assert.equal(Math.round(res2.dist), 52);

  // Step 3: Rival knocked down in close combat
  session.rival.mode = 'duel';
  session.host.room.players.get('rival').position = { x: 1, y: 0, z: -2 };
  const res3 = computeRivalWaypoint({ session, local, snapshot, camera });
  assert.equal(res3, null, 'Suppressed during close combat knockdown');
});
