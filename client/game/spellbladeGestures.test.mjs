import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPRAISE_CHANCE, FADE_OUT, GESTURES, GestureLayer, HARD, JOIN, NOD_WAIT, SLOT, THUMP_CHANCE, THUMP_REST, bodyClaims,
  canStart, drawn, envelope, flightIntense, gestureMachines, gesturePose, regionOf, scheduledGesture, slotGesture, thumpBeats,
} from './spellbladeGestures.mjs';

const idle = Object.freeze({ machine: null, moving: false });
const ids = ['a1b2', 'knight-7', '0f9e8d7c-6b5a', 'Tester', 'bot-3'];
const DEG = Math.PI / 180;

test('the schedule is the same for every observer: a knight and a time give one gesture, whoever asks', () => {
  for (const id of ids) {
    for (let t = 100; t < 400; t += 0.7) assert.deepEqual(scheduledGesture(id, t, idle), scheduledGesture(id, t, idle));
  }
  // and different knights do not move together
  const starts = (id) => Array.from({ length: 200 }, (_, s) => slotGesture(id, s, idle)?.at ?? null).join();
  assert.notEqual(starts(ids[0]), starts(ids[1]));
  // what he is doing that moment does not change the draw (observers may see a moment differently): only where he is
  for (let s = 0; s < 400; s += 1) {
    assert.deepEqual(slotGesture('Tester', s, { machine: 'ballista' }), slotGesture('Tester', s, { machine: 'ballista', aiming: true, steering: true, moving: true }));
  }
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

test('gestures are occasional: roughly one every 20 to 50 seconds, on foot or on a machine', () => {
  const rate = (c) => {
    let n = 0;
    for (const id of ids) for (let s = 0; s < 4000; s += 1) if (slotGesture(id, s, c)) n += 1;
    return (ids.length * 4000 * SLOT) / n;   // seconds per gesture
  };
  for (const c of [idle, { machine: 'ballista' }, { machine: 'ram' }, { machine: 'flight' }]) {
    const every = rate(c);
    assert.ok(every > 20 && every < 50, `${c.machine ?? 'foot'}: one every ${every.toFixed(1)} s`);
  }
});

test('each place has its own gestures: on foot a look or a yawn; the L-sit only from the flying machine, aloft', () => {
  const kinds = (c) => {
    const seen = new Set();
    for (const id of ids) for (let s = 0; s < 3000; s += 1) { const g = slotGesture(id, s, c); if (g) seen.add(g.kind); }
    return [...seen].sort();
  };
  assert.deepEqual(kinds(idle), ['look', 'yawn']);
  assert.deepEqual(kinds({ machine: 'ballista' }), ['frustration', 'glance', 'look', 'shade', 'yawn']);
  assert.deepEqual(kinds({ machine: 'ram' }), ['frustration', 'glance', 'look', 'yawn']);
  assert.deepEqual(kinds({ machine: 'flight' }), ['glance', 'look', 'lsit']);
  assert.equal(canStart('yawn', { ...idle, moving: true, sprinting: true }), false);
  assert.equal(canStart('lsit', { machine: 'flight', airborne: false }), false);
  assert.equal(canStart('lsit', { machine: 'flight', airborne: true }), true);
});

test('a machine that makes him wait makes him more often frustrated with it', () => {
  const share = (c) => {
    let f = 0, n = 0;
    for (const id of ids) for (let s = 0; s < 3000; s += 1) { const g = slotGesture(id, s, c); if (g) { n += 1; if (g.kind === 'frustration') f += 1; } }
    return f / n;
  };
  assert.ok(share({ machine: 'ram', machineReloading: true }) > share({ machine: 'ram' }) * 1.5);
});

test('each action claims only the body it needs, so gestures go on beside the fight and the machine work', () => {
  // the ballista loosing (the right hand on the lever), not driven: his left hand may shade his eyes, and his head is his
  const firing = { machine: 'ballista', aiming: true };
  assert.equal(bodyClaims(firing).claims.armR, HARD);
  assert.equal(canStart('shade', firing), true);
  assert.equal(canStart('look', firing), true);
  assert.equal(canStart('frustration', firing), false);
  // driven, the left hand steers
  assert.equal(canStart('shade', { machine: 'ballista', steering: true }), false);
  // the ram's fist going out while it drives straight, or even turns: the right hand is free to thump
  assert.equal(canStart('thump', { machine: 'ram', moving: true }), true);
  assert.equal(canStart('thump', { machine: 'ram', moving: true, steering: true }), true);
  // flying, firing, pursuing: his legs are his own (both hands stay on the controls)
  const pursuit = { machine: 'flight', airborne: true, moving: true };
  assert.equal(canStart('lsit', pursuit), true);
  assert.equal(canStart('look', pursuit), true);
  assert.equal(bodyClaims(pursuit).claims.armL, HARD);
  assert.equal(bodyClaims(pursuit).claims.armR, HARD);
  // ...but not in a dash, a dive, takeoff or landing
  assert.equal(canStart('lsit', { ...pursuit, flightIntense: true }), false);
  assert.equal(canStart('look', { ...pursuit, flightIntense: true }), true);
  // on foot: running, he may still yawn at the opposition (the arm leaves its swing); behind his Guard he may look away;
  // a stroke has his head and both arms, a spell his throwing hand
  assert.equal(canStart('yawn', { ...idle, moving: true }), true);
  assert.equal(canStart('look', { ...idle, guarding: true }), true);
  assert.equal(canStart('yawn', { ...idle, guarding: true }), false);
  assert.equal(canStart('look', { ...idle, attacking: true }), false);
  assert.equal(canStart('yawn', { ...idle, casting: true }), false);
  // the moments that want the whole body at once
  for (const key of ['dead', 'struck', 'staggered', 'dashing', 'ultimate', 'ejecting', 'machineStruck']) {
    assert.equal(bodyClaims({ ...idle, [key]: true }).critical, true, key);
    for (const kind of Object.keys(GESTURES)) assert.equal(canStart(kind, { ...idle, [key]: true }), false, `${key}: ${kind}`);
  }
});

// the first time a gesture of `kind` (or any) is scheduled for this knight after `from`, in this context
function nextGesture(id, from, c = idle, kind = null) {
  for (let t = from; t < from + 2000; t += 0.05) {
    const g = scheduledGesture(id, t, c);
    if (g && g.age < 0.05 && (!kind || g.kind === kind)) return g;
  }
  return null;
}
const weightOf = (poses, kind) => poses.find((p) => p.kind === kind)?.weight ?? 0;

test('a scheduled gesture starts only at its time (never joined late), and once', () => {
  const g = nextGesture('Tester', 50);
  assert.ok(g);
  const late = new GestureLayer();
  assert.deepEqual(late.update('Tester', g.at + JOIN + 0.2, idle), []);
  const layer = new GestureLayer();
  assert.equal(layer.update('Tester', g.at + 0.05, idle)[0]?.kind, g.kind);
  // played through to its end, it does not start again
  for (let t = g.at + 0.1; t < g.at + g.seconds + 0.2; t += 0.05) layer.update('Tester', t, idle);
  assert.deepEqual(layer.update('Tester', g.at + 0.1, idle), []);
});

test('shading his eyes carries on while the ballista looses, and gives the hand back when it is driven', () => {
  const c = { machine: 'ballista' };
  const g = nextGesture('Tester', 0, c, 'shade');
  assert.ok(g, 'a shade is scheduled');
  const layer = new GestureLayer();
  layer.update('Tester', g.at + 0.05, c);
  // the bolt laid and loosed under it: the right hand on the lever, the recoil (in the animator) through him
  let t = g.at + 0.1;
  for (; t < g.at + 1.6; t += 1 / 60) {
    const poses = layer.update('Tester', t, { ...c, aiming: true, firedAt: g.at + 1 });
    if (t > g.at + 0.5) assert.ok(weightOf(poses, 'shade') > 0.5, `shading at ${(t - g.at).toFixed(2)}`);
  }
  // driving off: the left hand to the steering grip within FADE_OUT, and the shade does not come back
  const off = t;
  for (; t < off + FADE_OUT + 0.02; t += 1 / 60) layer.update('Tester', t, { ...c, steering: true });
  assert.equal(weightOf(layer.update('Tester', t, { ...c, steering: true }), 'shade'), 0);
  assert.equal(weightOf(layer.update('Tester', t + 0.2, c), 'shade'), 0);
});

test('the player never waits on a gesture: whatever needs its body takes it back within FADE_OUT, and it does not resume', () => {
  const g = nextGesture('knight-7', 30, idle, 'look');
  const layer = new GestureLayer();
  layer.update('knight-7', g.at + 0.05, idle);
  assert.ok(weightOf(layer.update('knight-7', g.at + 0.5, idle), 'look') > 0);
  const at = g.at + 0.6;
  const striking = { ...idle, attacking: true };
  layer.update('knight-7', at, striking);
  const half = weightOf(layer.update('knight-7', at + FADE_OUT / 2, striking), 'look');
  assert.ok(half < 0.6, `half way: ${half}`);
  assert.equal(weightOf(layer.update('knight-7', at + FADE_OUT + 0.01, striking), 'look'), 0);
  // the stroke over, it stays gone
  assert.equal(weightOf(layer.update('knight-7', at + 0.5, idle), 'look'), 0);
});

test('a region a gesture only likes is given back while claimed, and the rest of the gesture goes on', () => {
  // a look during a flight's dash: the head turns, the chest (braced for the dash) does not
  const c = { machine: 'flight', airborne: true };
  const layer = new GestureLayer();
  layer.active = [];
  const g = nextGesture('Tester', 0, c, 'look');
  layer.update('Tester', g.at + 0.02, c);
  let poses;
  for (let t = g.at + 0.05; t < g.at + 0.9; t += 1 / 60) poses = layer.update('Tester', t, { ...c, flightIntense: true });
  const look = poses.find((p) => p.kind === 'look');
  assert.ok(look && look.weight > 0.5);
  assert.ok(look.turns.some((t) => regionOf(t.bone) === 'head'));
  assert.ok(!look.turns.some((t) => regionOf(t.bone) === 'torso'), 'the chest is the dash\'s');
});

test('limbs taken by something else end the gesture: mounting a machine mid-yawn gives the arm back', () => {
  const g = nextGesture('x', 0, idle, 'yawn');
  const layer = new GestureLayer();
  layer.update('x', g.at + 0.02, idle);
  assert.ok(weightOf(layer.update('x', g.at + 0.5, idle), 'yawn') > 0);
  layer.update('x', g.at + 0.6, { machine: 'flight' });
  assert.equal(weightOf(layer.update('x', g.at + 0.6 + FADE_OUT + 0.01, { machine: 'flight' }), 'yawn'), 0);
});

test('a kill: the nod waits for the head to be free of the stroke that won it, then plays, and gives up after NOD_WAIT', () => {
  const layer = new GestureLayer();
  layer.nod(10);
  assert.deepEqual(layer.update('x', 10.1, { ...idle, attacking: true }), []);
  layer.update('x', 10.4, idle);
  const pose = layer.update('x', 10.5, idle);
  assert.equal(pose[0]?.kind, 'nod');
  // the same kill told twice nods once
  layer.nod(10);
  assert.equal(layer.pending.length, 0);
  const late = new GestureLayer();
  late.nod(10);
  assert.deepEqual(late.update('x', 10 + NOD_WAIT + 0.1, idle), []);
  // and dying clears it
  const dead = new GestureLayer();
  dead.nod(10);
  assert.deepEqual(dead.update('x', 10.2, { dead: true }), []);
  assert.deepEqual(dead.update('x', 10.3, idle), []);
});

test('a bolt through two knights: now and then (by the bolt, for every observer) he looks out at his work and nods, once', () => {
  const keys = Array.from({ length: 400 }, (_, i) => `bibye-bolt-${i}`);
  const admired = keys.filter((k) => new GestureLayer().appraise(10, k, 0.4));
  // every observer agrees which
  assert.deepEqual(admired, keys.filter((k) => drawn(`appraise:${k}`) < APPRAISE_CHANCE));
  assert.ok(admired.length > 0.5 * keys.length && admired.length < 0.8 * keys.length, `${admired.length} of ${keys.length}`);
  const key = admired[0];
  const layer = new GestureLayer();
  assert.ok(layer.appraise(10, key, 0.6));
  // (the same bolt reported again does not stack a second)
  assert.equal(layer.appraise(10, key, 0.6), false);
  const c = { machine: 'ballista', aiming: true };
  assert.deepEqual(layer.update('x', 10.1, c), []);
  let yawAt = 0, nodded = false;
  for (let t = 10.2; t < 13.2; t += 1 / 60) {
    const pose = layer.update('x', t, c).find((p) => p.kind === 'appraise');
    if (!pose) continue;
    const yaw = pose.turns.filter((u) => u.bone === 'head' && u.axis[1] === 1).reduce((s, u) => s + u.angle, 0);
    const pitch = pose.turns.filter((u) => (u.bone === 'head' || u.bone === 'neck') && u.axis[0] === 1).reduce((s, u) => s + u.angle, 0);
    yawAt = Math.max(yawAt, yaw);
    if (pitch < -8 * DEG) nodded = true;
  }
  assert.ok(yawAt > 0.3, `looked out toward it: ${yawAt}`);
  assert.ok(nodded, 'and nodded');
});

test('the ram: two thumps on its casing, the second on the piston\'s release, keyed to the strike for every observer', () => {
  assert.deepEqual(thumpBeats(0.68).map((v) => +v.toFixed(2)), [0.34, 0.68]);
  // a Beat to the Punch counter goes out at once: the first blow on the release, the second as the fist flies
  assert.deepEqual(thumpBeats(0.14).map((v) => +v.toFixed(2)), [0.14, 0.46]);
  const keys = Array.from({ length: 400 }, (_, i) => `ram:${100 + i * 4.1}`);
  const thumped = keys.filter((k) => new GestureLayer().thump(100, k, 0.68));
  assert.deepEqual(thumped, keys.filter((k) => drawn(`thump:${k}`) < THUMP_CHANCE));
  // the blows land where the beats are: the fist on the casing (all the way there, nothing of the lift left)
  const key = thumped[0];
  const layer = new GestureLayer();
  const strikeAt = 50;
  layer.thump(strikeAt, key, 0.68);
  const c = { machine: 'ram' };
  const at = (t) => layer.update('x', strikeAt + t, c).find((p) => p.kind === 'thump');
  const samples = [];
  for (let t = 0; t < 1.3; t += 0.01) samples.push([t, at(t)]);
  const near = (t0) => samples.reduce((best, s) => (Math.abs(s[0] - t0) < Math.abs(best[0] - t0) ? s : best))[1];
  for (const beat of [0.34, 0.68]) {
    const p = near(beat);
    assert.ok(p && p.strike.reach > 0.95 && p.strike.lift < 0.01, `on the casing at ${beat}: ${JSON.stringify(p?.strike)}`);
  }
  assert.ok(near(0.51).strike.lift > 0.25, 'up off it between');
  assert.ok(!near(1.25), 'back on the handlebar after');
  // not every strike: a rest after one he thumped
  const busy = new GestureLayer();
  assert.ok(busy.thump(100, thumped[0], 0.68));
  assert.equal(busy.thump(100 + THUMP_REST - 1, thumped[1], 0.68), false);
});

test('the flight L-sit: legs level before him, splayed either side of the machine\'s front, and swinging, not set', () => {
  const g = { kind: 'lsit', seconds: GESTURES.lsit.seconds, side: 1, variant: 0.4 };
  const pitches = { L: [], R: [] };
  for (let age = 0.9; age < 2.4; age += 0.05) {
    const pose = gesturePose({ ...g, age });
    assert.ok(pose.legs.lift > 0.95);
    for (const s of ['L', 'R']) {
      const [x, y, z] = pose.legs.dir[s];
      assert.ok(z < -0.95, 'ahead');
      assert.ok(Math.abs(Math.asin(y)) < 10 * DEG, `level: ${(Math.asin(y) / DEG).toFixed(1)} deg`);
      assert.ok(s === 'L' ? x < -0.05 : x > 0.05, 'splayed');
      pitches[s].push(y);
    }
  }
  const range = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(range(pitches.L) > 0.1 && range(pitches.R) > 0.1, 'they swing');
  assert.notDeepEqual(pitches.L, pitches.R, 'each its own way');
});

test('every gesture eases in and out, and its weight stays within 0..1', () => {
  for (const [kind, g] of Object.entries(GESTURES)) {
    assert.equal(gesturePose({ kind, age: 0, seconds: g.seconds }).weight, 0, kind);
    assert.equal(gesturePose({ kind, age: g.seconds, seconds: g.seconds }).weight, 0, kind);
    for (let a = 0; a <= g.seconds; a += 0.05) {
      const pose = gesturePose({ kind, age: a, seconds: g.seconds, side: -1, variant: 0.8, data: { bearing: 2, beats: [0.32, 0.66] } });
      assert.ok(pose.weight >= 0 && pose.weight <= 1, `${kind} ${a}`);
      for (const t of pose.turns) assert.ok(Number.isFinite(t.angle) && Math.abs(t.angle) < 0.9, `${kind} ${t.bone} ${t.angle}`);
    }
  }
  assert.equal(envelope(-1, 2), 0);
  assert.equal(envelope(3, 2), 0);
});

test('a Fight-and-Flight braces its rider only in a dash, dive, run, impact, takeoff or landing: not in flight or a pursuit', () => {
  const calm = { mode: 'AIRBORNE', skill: { phase: 'idle' }, flightDashStartedAt: null, lastImpactAt: -Infinity, takeoffAt: -Infinity, landingAt: -Infinity };
  assert.equal(flightIntense(calm, 100), false);
  assert.equal(flightIntense({ ...calm, lastShotAt: 99.9, velocity: { x: 9, z: 4 } }, 100), false);
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
    bibyeBallista: { id: 'bb', operatorId: 'b', state: 'LOADED', coupling: 'FIRING', firedAt: 49.8, speed: 0, mainYaw: 0.2 },
    soFistication: { id: 'ram', operatorId: 'r', strikeAt: 49.5, speed: 2, steer: 0 },
    fightFlight: { operatorId: 'f', grounded: false, mode: 'AIRBORNE', skill: { phase: 'idle' }, lastShotAt: 49.9, velocity: { x: 3, z: 0 } },
  }, now);
  assert.deepEqual(machines.get('b'), { steering: false, aiming: true, firedAt: 49.8, reloading: false, struck: false, moving: false });
  const ram = machines.get('r');
  assert.equal(ram.strikeAt, 49.5);
  assert.equal(ram.release, 0.68);
  assert.equal(ram.steering, false);
  assert.equal(ram.key, 'ram:49.5');
  assert.equal(gestureMachines({ soFistication: { id: 'ram', operatorId: 'r', strikeAt: 49, skillStroke: { from: 0, prepare: 0.2 } } }, now).get('r').release, 0.2);
  assert.equal(gestureMachines({ soFistication: { operatorId: 'r', strikeAt: 47.5 } }, now).get('r').reloading, true);
  const f = machines.get('f');
  assert.equal(f.airborne, true);
  assert.equal(f.intense, false);
  assert.equal(f.firing, true);
  // the traverse wheel turning: the right hand is on it
  const memory = new Map();
  const still = { bibyeBallista: { id: 'bb', operatorId: 'b', state: 'LOADED', mainYaw: 0 } };
  assert.equal(gestureMachines(still, 10, memory).get('b').aiming, false);
  assert.equal(gestureMachines({ bibyeBallista: { ...still.bibyeBallista, mainYaw: 0.05 } }, 10.1, memory).get('b').aiming, true);
  assert.equal(gestureMachines({ bibyeBallista: { ...still.bibyeBallista, mainYaw: 0.05 } }, 10.6, memory).get('b').aiming, false);
  assert.equal(gestureMachines(null, now).size, 0);
});

test('two gestures share a body where they can: a hand stays at the brow while the head appraises the shot', () => {
  const c = { machine: 'ballista' };
  const g = nextGesture('Tester', 0, c, 'shade');
  const layer = new GestureLayer();
  layer.update('Tester', g.at + 0.02, c);
  for (let t = g.at + 0.05; t < g.at + 0.6; t += 1 / 60) layer.update('Tester', t, { ...c, aiming: true });
  const key = Array.from({ length: 50 }, (_, i) => `bibye-bolt-${i}`).find((k) => drawn(`appraise:${k}`) < APPRAISE_CHANCE);
  assert.ok(layer.appraise(g.at + 0.4, key, -0.5));
  let both = 0;
  for (let t = g.at + 0.6; t < g.at + 2.2; t += 1 / 60) {
    const poses = layer.update('Tester', t, { ...c, aiming: true });
    const shade = poses.find((p) => p.kind === 'shade');
    const appraise = poses.find((p) => p.kind === 'appraise');
    if (shade && appraise && shade.weight > 0.5 && appraise.weight > 0.5) {
      both += 1;
      // the head is the appraisal's alone; the hand stays the shade's
      assert.ok(!shade.turns.some((u) => regionOf(u.bone) === 'head') || t < g.at + 1.0);
      assert.ok(shade.hand);
    }
  }
  assert.ok(both > 30, `together for ${both} frames`);
});
