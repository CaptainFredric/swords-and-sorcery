import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_QUIET, FADE_OUT, GESTURES, GestureLayer, JOIN, NOD_WAIT, SLOT, envelope, flightIntense, gestureAllowed,
  gestureMachines, gesturePose, scheduledGesture, slotGesture,
} from './spellbladeGestures.mjs';

const idle = Object.freeze({ machine: null, moving: false });
const ids = ['a1b2', 'knight-7', '0f9e8d7c-6b5a', 'Tester', 'bot-3'];

test('the schedule is the same for every observer: a knight and a time give one gesture, whoever asks', () => {
  for (const id of ids) {
    for (let t = 100; t < 400; t += 0.7) assert.deepEqual(scheduledGesture(id, t, idle), scheduledGesture(id, t, idle));
  }
  // and different knights do not move together
  const starts = (id) => Array.from({ length: 200 }, (_, s) => slotGesture(id, s, idle)?.at ?? null).join();
  assert.notEqual(starts(ids[0]), starts(ids[1]));
});

test('a slot after one that held a gesture rests, and a gesture is never the one two slots before', () => {
  for (const id of ids) {
    for (let s = 2; s < 2000; s += 1) {
      const g = slotGesture(id, s, idle);
      if (!g) continue;
      assert.equal(slotGesture(id, s - 1, idle), null, `${id} slot ${s}: back to back`);
    }
  }
});

test('gestures are occasional: idle, roughly one every 20 to 50 seconds; on the move, rarer', () => {
  const rate = (c) => {
    let n = 0;
    for (const id of ids) for (let s = 0; s < 4000; s += 1) if (slotGesture(id, s, c)) n += 1;
    return (ids.length * 4000 * SLOT) / n;   // seconds per gesture
  };
  const still = rate(idle);
  const moving = rate({ ...idle, moving: true });
  assert.ok(still > 20 && still < 50, `idle: one every ${still.toFixed(1)} s`);
  assert.ok(moving > still, `moving: one every ${moving.toFixed(1)} s`);
});

test('each gesture only where it belongs: on foot no machine gestures; the L-sit only flying calmly', () => {
  const kinds = (c) => {
    const seen = new Set();
    for (const id of ids) for (let s = 0; s < 3000; s += 1) { const g = slotGesture(id, s, c); if (g) seen.add(g.kind); }
    return seen;
  };
  assert.deepEqual([...kinds(idle)].sort(), ['look', 'yawn']);
  assert.ok(!kinds({ ...idle, sprinting: true }).has('yawn'));
  const ballista = kinds({ machine: 'ballista' });
  assert.ok(['look', 'glance', 'frustration', 'shade'].every((k) => ballista.has(k)), [...ballista].join());
  assert.ok(!ballista.has('yawn') && !ballista.has('lsit'));
  assert.ok(!kinds({ machine: 'ballista', machineBusy: true }).has('shade'));
  assert.ok(kinds({ machine: 'flight', airborne: true }).has('lsit'));
  assert.ok(!kinds({ machine: 'flight', airborne: false }).has('lsit'));
  assert.deepEqual([...kinds({ machine: 'flight', airborne: true, flightIntense: true })], []);
  assert.ok(kinds({ machine: 'ram' }).has('frustration') && !kinds({ machine: 'ram' }).has('shade'));
});

test('a machine that makes him wait makes him more often frustrated with it', () => {
  const share = (c) => {
    let f = 0, n = 0;
    for (const id of ids) for (let s = 0; s < 3000; s += 1) { const g = slotGesture(id, s, c); if (g) { n += 1; if (g.kind === 'frustration') f += 1; } }
    return f / n;
  };
  assert.ok(share({ machine: 'ram', machineReloading: true }) > share({ machine: 'ram' }) * 1.5);
});

test('nothing shows while anything above it has the body, nor straight after an exchange of blows', () => {
  for (const key of ['dead', 'staggered', 'attacking', 'guarding', 'casting', 'dashing', 'ultimate', 'ejecting', 'machineFiring', 'machineCritical']) {
    assert.equal(gestureAllowed({ ...idle, [key]: true }, 10), false, key);
  }
  assert.equal(gestureAllowed({ ...idle, lastCombatAt: 10 - COMBAT_QUIET / 2 }, 10), false);
  assert.equal(gestureAllowed({ ...idle, lastCombatAt: 10 - COMBAT_QUIET - 0.01 }, 10), true);
  // in battle (enemies about, moving, pursuing) is not in itself a reason
  assert.equal(gestureAllowed({ ...idle, moving: true, sprinting: true }, 10), true);
});

// the first time a gesture is scheduled for this knight after `from`, in this context
function nextGesture(id, from, c = idle) {
  for (let t = from; t < from + 400; t += 0.05) {
    const g = scheduledGesture(id, t, c);
    if (g && g.age < 0.05) return g;
  }
  return null;
}

test('a gesture starts only at its time (never joined late), and once', () => {
  const g = nextGesture('Tester', 50);
  assert.ok(g);
  const late = new GestureLayer();
  assert.equal(late.update('Tester', g.at + JOIN + 0.2, idle), null);
  const layer = new GestureLayer();
  const pose = layer.update('Tester', g.at + 0.05, idle);
  assert.equal(pose?.kind, g.kind);
  // played through to its end, it does not start again
  for (let t = g.at + 0.1; t < g.at + g.seconds + 0.2; t += 0.05) layer.update('Tester', t, idle);
  assert.equal(layer.update('Tester', g.at + 0.1, idle), null);
});

test('the player never waits on one: anything above it takes the body back within FADE_OUT, and it does not resume', () => {
  const g = nextGesture('knight-7', 30);
  const layer = new GestureLayer();
  layer.update('knight-7', g.at + 0.05, idle);
  assert.ok(layer.update('knight-7', g.at + 0.4, idle)?.weight > 0);
  const at = g.at + 0.5;
  const struck = { ...idle, attacking: true, lastCombatAt: at };
  const first = layer.update('knight-7', at, struck);
  assert.ok(!first || first.weight <= 1);
  const half = layer.update('knight-7', at + FADE_OUT / 2, struck);
  assert.ok(half && half.weight < 0.6, `half way: ${half?.weight}`);
  assert.equal(layer.update('knight-7', at + FADE_OUT + 0.01, struck), null);
  // the strike over, it stays gone
  assert.equal(layer.update('knight-7', at + COMBAT_QUIET + 0.1, idle), null);
});

test('limbs taken by something else end the gesture: mounting a machine mid-yawn gives the arm back', () => {
  const layer = new GestureLayer();
  layer.active = { kind: 'yawn', at: 5, seconds: GESTURES.yawn.seconds, side: 1, variant: 0 };
  assert.ok(layer.update('x', 5.5, idle)?.weight > 0);
  layer.update('x', 5.6, { machine: 'ballista' });
  assert.equal(layer.update('x', 5.6 + FADE_OUT + 0.01, { machine: 'ballista' }), null);
});

test('a kill: the nod waits for the strike that won it to finish, then plays, and gives up after NOD_WAIT', () => {
  const layer = new GestureLayer();
  layer.nod(10);
  assert.equal(layer.update('x', 10.1, { ...idle, attacking: true, lastCombatAt: 10.1 }), null);
  // free again (the quiet after blows does not hold the nod back: it is the answer to them)
  layer.update('x', 10.4, { ...idle, lastCombatAt: 10.3 });
  const pose = layer.update('x', 10.5, { ...idle, lastCombatAt: 10.3 });
  assert.equal(pose?.kind, 'nod');
  assert.ok(pose.weight > 0);
  const late = new GestureLayer();
  late.nod(10);
  assert.equal(late.update('x', 10 + NOD_WAIT + 0.1, idle), null);
  // and dying clears it
  const dead = new GestureLayer();
  dead.nod(10);
  assert.equal(dead.update('x', 10.2, { dead: true }), null);
  assert.equal(dead.update('x', 10.3, idle), null);
});

test('every gesture eases in and out, and its weight stays within 0..1', () => {
  for (const [kind, g] of Object.entries(GESTURES)) {
    assert.equal(gesturePose({ kind, age: 0, seconds: g.seconds }).weight, 0, kind);
    assert.equal(gesturePose({ kind, age: g.seconds, seconds: g.seconds }).weight, 0, kind);
    for (let a = 0; a <= g.seconds; a += 0.05) {
      const pose = gesturePose({ kind, age: a, seconds: g.seconds, side: -1, variant: 0.8 });
      assert.ok(pose.weight >= 0 && pose.weight <= 1, `${kind} ${a}`);
      for (const t of pose.turns) assert.ok(Number.isFinite(t.angle) && Math.abs(t.angle) < 0.9, `${kind} ${t.bone} ${t.angle}`);
    }
  }
  assert.equal(envelope(-1, 2), 0);
  assert.equal(envelope(3, 2), 0);
});

test('a Fight-and-Flight is too busy for its rider while dashing, diving, running, struck, taking off or landing', () => {
  const calm = { mode: 'AIRBORNE', skill: { phase: 'idle' }, flightDashStartedAt: null, lastImpactAt: -Infinity, takeoffAt: -Infinity, landingAt: -Infinity };
  assert.equal(flightIntense(calm, 100), false);
  assert.equal(flightIntense({ ...calm, flightDashStartedAt: 99.5 }, 100), true);
  assert.equal(flightIntense({ ...calm, terminalDive: {} }, 100), true);
  assert.equal(flightIntense({ ...calm, offensiveRun: true }, 100), true);
  assert.equal(flightIntense({ ...calm, lastImpactAt: 99.2 }, 100), true);
  assert.equal(flightIntense({ ...calm, mode: 'TAKEOFF' }, 100), true);
  assert.equal(flightIntense({ ...calm, takeoffAt: 99.5 }, 100), true);
  assert.equal(flightIntense({ ...calm, ejectHoldStartedAt: 99.9 }, 100), true);
});

test("each machine's operator context comes from the snapshot alone", () => {
  const now = 50;
  const machines = gestureMachines({
    bibyeBallista: { operatorId: 'b', state: 'RELOADING', firedAt: 48, speed: 0 },
    soFistication: { operatorId: 'r', strikeAt: 49.5, speed: 0 },
    fightFlight: { operatorId: 'f', grounded: false, mode: 'AIRBORNE', skill: { phase: 'idle' }, lastShotAt: 49.9, velocity: { x: 3, z: 0 } },
  }, now);
  assert.deepEqual(machines.get('b'), { firing: false, moving: false, busy: false, reloading: true, critical: false });
  assert.equal(machines.get('r').firing, true);
  assert.equal(machines.get('r').busy, true);
  assert.equal(gestureMachines({ soFistication: { operatorId: 'r', strikeAt: 47.5 } }, now).get('r').reloading, true);
  const f = machines.get('f');
  assert.equal(f.airborne, true);
  assert.equal(f.firing, true);
  assert.equal(f.moving, true);
  assert.equal(gestureMachines({ bibyeBallista: { operatorId: 'b', state: 'FIRING' } }, now).get('b').busy, true);
  assert.equal(gestureMachines(null, now).size, 0);
});
