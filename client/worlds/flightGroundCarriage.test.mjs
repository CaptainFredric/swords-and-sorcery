// The grounded carriage (flightGroundCarriage.mjs): the apparatus takes its gait's authored chassis on the ground,
// leans with its own weight, settles, and gives all of it up as it leaves the ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGroundCarriage, FLIGHT_CARRIAGE, carriedOnTheGround } from './flightGroundCarriage.mjs';

const DT = 1 / 60;
// a gait that drops the chassis onto each footfall (twice a cycle) and leans it 0.12 rad into its pace
const WALK = 'walk', CYCLE = 0.96;
const authored = (clip, time) => (clip === WALK ? { y: -0.038 - 0.052 * Math.cos(4 * Math.PI * time / CYCLE), q: [Math.sin(0.06), 0, 0, Math.cos(0.06)] } : clip === 'idle' ? { y: 0, q: [0, 0, 0, 1] } : null);
const machine = (over = {}) => ({ id: 'm', grounded: true, mode: 'GROUNDED', health: 250, heading: 0, velocity: { x: 0, z: 0 }, ...over });
const pitchOf = (offset) => 2 * Math.atan2(offset.q[0], offset.q[3]);
const rollOf = (offset) => 2 * Math.atan2(offset.q[2], offset.q[3]);

function walk(carriage, seconds, m, from = 0) {
  const trace = [];
  for (let t = 0; t < seconds; t += DT) trace.push({ t, phase: ((from + t) % CYCLE) / CYCLE, ...carriage.update(m, { clip: WALK, time: (from + t) % CYCLE }, DT, authored) });
  return trace;
}

test('walking, the chassis drops onto each footfall and rises between, on the stride the legs are on', () => {
  const carriage = new FlightGroundCarriage();
  const steady = walk(carriage, 4, machine({ velocity: { x: 0, z: -5.5 } })).filter((f) => f.t > 2);
  const ys = steady.map((f) => f.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.09, `bob of ${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} m`);
  // lowest at the footfalls (phase 0 and a half), highest between: exactly what the clip authors, no lag
  for (const f of steady) assert.ok(Math.abs(f.y - authored(WALK, f.phase * CYCLE).y) < 1e-3, `at phase ${f.phase.toFixed(2)}`);
  // and it leans into its pace as authored
  assert.ok(Math.abs(pitchOf(steady.at(-1)) - 0.12) < 0.01);
});

test('standing still it is still; nothing is laid on a machine that is not on its legs', () => {
  const carriage = new FlightGroundCarriage();
  let offset;
  for (let t = 0; t < 2; t += DT) offset = carriage.update(machine(), { clip: 'idle', time: t }, DT, authored);
  assert.ok(Math.abs(offset.y) < 1e-6 && Math.abs(pitchOf(offset)) < 1e-6 && Math.abs(rollOf(offset)) < 1e-6);
  for (const m of [machine({ grounded: false }), machine({ mode: 'TAKEOFF' }), machine({ mode: 'LANDING' }), machine({ mode: 'DESTROYED' }), machine({ health: 0 }),
    machine({ offensiveRun: true }), machine({ terminalDive: {} }), machine({ crouched: true })]) assert.equal(carriedOnTheGround(m), false);
  assert.equal(carriedOnTheGround(machine()), true);
  const air = new FlightGroundCarriage();
  for (let t = 0; t < 1; t += DT) offset = air.update(machine({ grounded: false, velocity: { x: 0, z: -9 } }), { clip: WALK, time: t }, DT, authored);
  assert.equal(offset.weight, 0);
  assert.deepEqual(offset.q, [0, 0, 0, 1]);
  assert.equal(offset.y, 0);
});

test('taking off, the gait gives way smoothly: no step in the chassis, and nothing of it left in the air', () => {
  const carriage = new FlightGroundCarriage();
  const m = machine({ velocity: { x: 0, z: -5.5 } });
  let last = walk(carriage, 3, m).at(-1), worst = 0;
  const up = machine({ grounded: false, mode: 'TAKEOFF', velocity: { x: 0, z: -5.5 } });
  for (let t = 0; t < 1.2; t += DT) {
    const now = carriage.update(up, { clip: 'takeoff', time: t }, DT, authored);
    worst = Math.max(worst, Math.abs(now.y - last.y));
    last = now;
  }
  assert.ok(worst < 0.012, `largest step ${worst.toFixed(4)} m in a frame`);
  assert.ok(last.weight < 1e-3 && Math.abs(last.y) < 1e-4 && Math.abs(pitchOf(last)) < 1e-3);
});

test('its weight: it lags as it gathers pace, pitches on as it brakes, and rocks to rest', () => {
  const carriage = new FlightGroundCarriage();
  const m = machine();
  for (let t = 0; t < 1; t += DT) carriage.update(m, { clip: 'idle', time: t }, DT, authored);
  // gathering pace (8 m/s^2 ahead: -z)
  let back = 0;
  for (let t = 0; t < 0.6; t += DT) { m.velocity = { x: 0, z: -8 * t }; back = Math.min(back, pitchOf(carriage.update(m, { clip: 'idle', time: t }, DT, authored))); }
  assert.ok(back < -0.03 && back >= -FLIGHT_CARRIAGE.pitchLimit * 1.6, `leans back ${back.toFixed(3)} rad`);
  // then stopping dead
  const trace = [];
  for (let t = 0; t < 2.5; t += DT) { m.velocity = { x: 0, z: Math.min(0, -4.8 + 16 * t) }; trace.push(pitchOf(carriage.update(m, { clip: 'idle', time: t }, DT, authored))); }
  assert.ok(Math.max(...trace) > 0.04, `pitches on ${Math.max(...trace).toFixed(3)} rad`);
  // it rocks back past level at least once (it is a mass on a spring, not a slider), and is at rest two seconds on
  const after = trace.slice(trace.indexOf(Math.max(...trace)));
  assert.ok(Math.min(...after) < -0.003, 'rocks back past level');
  assert.ok(Math.abs(trace.at(-1)) < 0.004, `settled: ${trace.at(-1).toFixed(4)}`);
  // never beyond what a heavy machine would do
  for (const p of trace) assert.ok(Math.abs(p) < FLIGHT_CARRIAGE.pitchLimit * 1.6);
});

test('in a turn it sways outward, either way, and comes upright after', () => {
  for (const side of [1, -1]) {
    const carriage = new FlightGroundCarriage();
    const m = machine({ velocity: { x: 0, z: -5.5 } });
    walk(carriage, 1, m);
    let roll = 0;
    // turning (heading rising is a turn to the left) at 1.6 rad/s, the velocity swinging round with it
    for (let t = 0; t < 0.8; t += DT) {
      m.heading = side * 1.6 * t; m.velocity = { x: -Math.sin(m.heading) * 5.5, z: -Math.cos(m.heading) * 5.5 };
      roll = rollOf(carriage.update(m, { clip: WALK, time: t % CYCLE }, DT, authored));
    }
    // (a left turn throws the top to the right: positive about the machine's length)
    assert.ok(roll * side > 0.02 && Math.abs(roll) <= FLIGHT_CARRIAGE.rollLimit * 1.6, `side ${side}: ${roll.toFixed(3)} rad`);
    for (let t = 0; t < 2.5; t += DT) roll = rollOf(carriage.update(m, { clip: WALK, time: t % CYCLE }, DT, authored));
    assert.ok(Math.abs(roll) < 0.004);
  }
});

test('a change of gait is eased, a hitch in the snapshots is not a shove, and the frame rate does not matter', () => {
  const carriage = new FlightGroundCarriage();
  const m = machine({ velocity: { x: 0, z: -5.5 } });
  let last = walk(carriage, 2, m).at(-1), worst = 0;
  m.velocity = { x: 0, z: 0 };
  for (let t = 0; t < 1; t += DT) { const now = carriage.update(m, { clip: 'idle', time: t }, DT, authored); worst = Math.max(worst, Math.abs(now.y - last.y)); last = now; }
  assert.ok(worst < 0.012, `largest step ${worst.toFixed(4)} m`);
  // a teleport-sized change of velocity in one frame
  const jolted = new FlightGroundCarriage();
  jolted.update(machine(), { clip: 'idle', time: 0 }, DT, authored);
  let peak = 0;
  for (let t = 0; t < 1; t += DT) peak = Math.max(peak, Math.abs(pitchOf(jolted.update(machine({ velocity: { x: 0, z: t < DT ? -400 : 0 } }), { clip: 'idle', time: t }, DT, authored))));
  assert.ok(peak < FLIGHT_CARRIAGE.pitchLimit * 1.6);
  // 30 and 144 frames a second settle to the same lean under the same steady push
  const lean = (rate) => { const c = new FlightGroundCarriage(), mm = machine(); let o; for (let t = 0; t < 3; t += 1 / rate) { mm.velocity = { x: 0, z: -3 * t }; o = c.update(mm, { clip: 'idle', time: t }, 1 / rate, authored); } return pitchOf(o); };
  assert.ok(Math.abs(lean(30) - lean(144)) < 0.004, `${lean(30).toFixed(4)} against ${lean(144).toFixed(4)}`);
});
