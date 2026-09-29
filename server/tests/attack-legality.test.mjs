import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { setGuard, stepRoom } from '../../shared/sim/combat.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES, MELEE_CONTACT } from '../../shared/src/combat.mjs';

// Attack legality: a tap is one strike, a hold chains at the earliest legal times, and no pattern of letting go and
// pressing again (however late its word arrives) brings the sword round sooner than holding would.

const TICK = 1 / 30;
const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 30, y: 0, z: 0, yaw: 0 }],
  abyssY: -9,
};

function arena() {
  const room = new Room('LEGAL');
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  // (far away: this is about when the sword swings, not whom it meets)
  Object.assign(b.position, { x: 30, y: 0, z: 0 });
  a.spawnProtectionUntil = 0;
  b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return room;
}

/**
 * Run the room at the server's rate from `start` for `seconds`, applying the attack button as the player pressed it:
 * each { at, down, latency } is pressed/let go at the player's `at` and its word arrives `latency` later. Returns
 * when each of A's strikes went live (seconds after `start`) and which strike it was.
 */
function play(script, { seconds = 4, start = 10, extra = () => {} } = {}) {
  const room = arena();
  const a = room.players.get('a');
  const pending = script.map((step) => ({ ...step, arrive: start + step.at + (step.latency ?? 0) })).sort((x, y) => x.arrive - y.arrive);
  const swings = [];
  for (let now = start; now <= start + seconds + 1e-9; now += TICK) {
    while (pending.length && pending[0].arrive <= now + 1e-9) {
      const step = pending.shift();
      applyRoomCommand(room, a, { type: 'attack', down: step.down, clientTime: start + step.at }, now);
    }
    extra(room, a, now - start);
    const events = stepRoom(room, TICK, now, openWorld);
    for (const event of events.splice(0)) {
      if (event.type === 'swordSwing' && event.playerId === 'a') swings.push({ at: now - start, strike: event.strikeIndex });
    }
  }
  return swings;
}

// the least time between one strike going live and the next, holding the button (the combo, then the next chain)
const HELD_GAP = Math.min(
  SWORD_STRIKE_TIMES[1] - SWORD_STRIKE_TIMES[0],
  SWORD_STRIKE_TIMES[2] - SWORD_STRIKE_TIMES[1],
  SWORD_CHAIN.restart + SWORD_STRIKE_TIMES[0],
);
const live = (contact) => contact - MELEE_CONTACT.window.early;

test('a single press is exactly one sword strike, and then the sword stops', () => {
  const swings = play([{ at: 0, down: true }, { at: 0.08, down: false }], { seconds: 4 });
  assert.equal(swings.length, 1);
  assert.equal(swings[0].strike, 0);
  assert.ok(Math.abs(swings[0].at - live(SWORD_STRIKE_TIMES[0])) < TICK + 1e-6);
});

test('holding chains each strike at the earliest legal moment, and starts the next chain a breath after the third', () => {
  const swings = play([{ at: 0, down: true }], { seconds: 3 });
  const cycle = SWORD_STRIKE_TIMES[2] + SWORD_CHAIN.restart;
  const expected = [...SWORD_STRIKE_TIMES.map(live), cycle + live(SWORD_STRIKE_TIMES[0])];
  assert.deepEqual(swings.map((s) => s.strike), [0, 1, 2, 0]);
  swings.forEach((swing, i) => assert.ok(Math.abs(swing.at - expected[i]) < TICK + 1e-6, `strike ${i + 1} at ${swing.at.toFixed(3)} (held: ${expected[i].toFixed(3)})`));
});

test('a press made just before a let-go chain ended, arriving late, asks for its next strike, not a fresh first one', () => {
  // let go after the first strike; press again 0.12 s before the chain would end, but the word takes 0.18 s
  const ends = SWORD_CHAIN.starts[1];
  const swings = play([
    { at: 0, down: true }, { at: 0.08, down: false },
    { at: ends - 0.12, down: true, latency: 0.18 }, { at: ends, down: false, latency: 0.18 },
  ], { seconds: 2 });
  assert.deepEqual(swings.map((s) => s.strike), [0, 1], 'the backhand, as a timely press would have asked for');
  assert.ok(Math.abs(swings[1].at - live(SWORD_STRIKE_TIMES[1])) < TICK + 1e-6, 'and exactly when holding would have swung it');
});

test('no pattern of letting go and pressing again, however late its word arrives, strikes sooner than holding', () => {
  let worst = Infinity;
  let worstCase = null;
  const presses = [0.3, 0.45, 0.55, 0.62, 0.68, 0.71, 0.74, 0.8, 0.9];
  for (const release of [0.05, 0.3, 0.5]) {
    for (const again of presses) {
      for (const latency of [0, 0.05, 0.1, 0.15, 0.2]) {
        if (again <= release) continue;
        const script = [
          { at: 0, down: true }, { at: release, down: false },
          { at: again, down: true, latency }, { at: again + 0.06, down: false, latency },
          // and once more, a little later, for a third
          { at: again + 0.75, down: true, latency }, { at: again + 0.8, down: false, latency },
        ];
        const swings = play(script, { seconds: 3 });
        for (let i = 1; i < swings.length; i += 1) {
          const gap = swings[i].at - swings[i - 1].at;
          if (gap < worst) { worst = gap; worstCase = { release, again, latency, swings }; }
        }
      }
    }
  }
  assert.ok(worst >= HELD_GAP - TICK - 1e-6, `strikes ${worst.toFixed(3)} s apart (holding: ${HELD_GAP.toFixed(2)}) with ${JSON.stringify(worstCase)}`);
});

test('breaking a chain off into a guard does not bring the sword round sooner either', () => {
  // the first strike lands; guard at once, lower it, and press again straight away
  const contact = SWORD_STRIKE_TIMES[0];
  const swings = play([
    { at: 0, down: true },
    { at: contact + 0.1, down: false },
    { at: contact + 0.2, down: true },
    { at: contact + 0.3, down: false },
  ], {
    seconds: 2.5,
    extra: (room, a, t) => {
      if (Math.abs(t - (contact + 0.05)) < TICK / 2) setGuard(room, 'a', true, 10 + t);
      if (Math.abs(t - (contact + 0.15)) < TICK / 2) setGuard(room, 'a', false, 10 + t);
    },
  });
  assert.ok(swings.length >= 2, 'the press after the guard still swings');
  assert.ok(swings[1].at - swings[0].at >= HELD_GAP - TICK - 1e-6, `the next swing ${(swings[1].at - swings[0].at).toFixed(3)} s after the first`);
});
