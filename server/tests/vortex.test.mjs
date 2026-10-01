import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, setGuard, staggerBy, stepRoom, tryCastSpell, tryDash, tryGauntletStrike, tryUltimate } from '../../shared/sim/combat.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { CONJURED, SPELLS, isSpell, spellFor } from '../../shared/src/spells.mjs';
import { DEFAULT_ULTIMATE, ULTIMATES, isUltimate, vortexWindup } from '../../shared/src/ultimates.mjs';
import { readyPracticeUltimate } from '../../shared/sim/practice.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

// Blazing Vortex: the second ultimate. A steered, spinning sword with small aimed fire, on the same course as any
// ultimate (a full meter, an exposed startup, a commit that spends the charge, a stretch, an end). These are
// behaviours; the tuning numbers are read from the modules, not restated.

const vortex = ULTIMATES.vortex;
const TICK = 1 / 30;

const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 2, y: 0, z: 0, yaw: Math.PI / 2 }, { x: 0, y: 0, z: 30, yaw: 0 }],
  abyssY: -9,
};

// a (carrying the Vortex) at the origin facing +x; b `distance` in front of it, facing back; c (if asked for) far off
function duel({ distance = 1.4, third = false, mode = 'FFA', ultimate = 'vortex' } = {}) {
  const room = new Room('VORTX', { mode });
  room.addPlayer({ id: 'a', token: 'ta', name: 'A', ultimate }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  if (third) room.addPlayer({ id: 'c', token: 'tc', name: 'C' }, 0);
  for (const id of room.players.keys()) room.setReady(id, true, 0);
  room.tick(3.1);
  const [a, b, c] = ['a', 'b', 'c'].map((id) => room.players.get(id));
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: distance, y: 0, z: 0 });
  if (c) Object.assign(c.position, { x: 0, y: 0, z: 30 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw; a.pitch = 0; a.input.pitch = 0;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  for (const p of room.players.values()) { p.spawnProtectionUntil = 0; p.history = []; }
  room.events.length = 0;
  return { room, a, b, c };
}

// stepped from `from` to `to` at the server's tick; `each(now)` before every step
function run(room, from, to, each = () => {}, world = openWorld) {
  for (let now = from; now <= to + 1e-9; now += TICK) {
    each(now);
    stepRoom(room, TICK, now, world);
  }
  return room.events;
}

// a's Vortex, the key pressed at 9 and its startup run through; returns the moment it committed
function spin(room, a, each = () => {}) {
  a.prowess = PROWESS.full;
  assert.equal(tryUltimate(room, 'a', 9), true, 'the startup begins');
  run(room, 9, 9 + vortex.startupSec + TICK, each);
  assert.equal(a.ultimateState?.phase, 'active');
  return a.ultimateState.commitAt;
}

// b held where it stands (a post to cut at), whatever shoves it
const pinned = (b, distance) => () => {
  if (!b.alive) return;
  Object.assign(b.position, { x: distance, y: 0, z: 0 });
  b.impulse = { x: 0, z: 0 };
  b.velocity = { x: 0, y: 0, z: 0 };
  b.grounded = true;
};

const cuts = (events, victim = 'b') => events.filter((e) => e.type === 'damage' && e.source === 'vortex' && e.victimId === victim);

test('the Vortex is an ultimate a knight can carry, beside Sunder (which stays the default)', () => {
  assert.equal(isUltimate('vortex'), true);
  assert.equal(isUltimate('sunder'), true);
  assert.equal(DEFAULT_ULTIMATE, 'sunder');
  const { a, b } = duel();
  assert.equal(a.ultimate, 'vortex');
  assert.equal(b.ultimate, 'sunder');
  // its fire is no spell a knight can carry
  assert.equal(isSpell('ember'), false);
  assert.equal(spellFor('ember'), CONJURED.ember);
  assert.ok(CONJURED.ember.directDamage < SPELLS.fireball.directDamage && CONJURED.ember.radius < SPELLS.fireball.radius);
});

test('its startup is a small hop from the ground, does no damage, and is as exposed as any: interrupted, the charge is kept', () => {
  const { room, a, b } = duel();
  a.prowess = PROWESS.full;
  assert.equal(tryUltimate(room, 'a', 9), true);
  assert.ok(a.velocity.y > 0 && !a.grounded, 'it hops');
  assert.ok(room.events.some((e) => e.type === 'ultimateStart' && e.ultimate === 'vortex' && e.hop > 0));
  run(room, 9, 9 + vortex.startupSec * 0.5, pinned(b, 1.4));
  assert.equal(b.health, 100, 'nothing is cut before it commits');
  assert.equal(room.projectiles.size, 0);
  assert.equal(a.prowess, PROWESS.full, 'not spent yet');
  // its balance broken before the commit: the charge kept, a short lockout
  staggerBy(room, a, STAGGER.max, 9 + vortex.startupSec * 0.5, 'b');
  run(room, 9 + vortex.startupSec * 0.5, 9 + vortex.startupSec * 0.5 + 0.1, pinned(b, 1.4));
  assert.equal(a.ultimateState, null);
  assert.equal(a.prowess, PROWESS.full, 'the charge is kept');
  assert.ok(room.events.some((e) => e.type === 'ultimateInterrupted' && e.ultimate === 'vortex'));
  assert.equal(tryUltimate(room, 'a', 9 + vortex.startupSec * 0.5 + 0.2), false, 'and it cannot be tried again at once');
});

test('already in the air, the startup throws the knight no higher', () => {
  const { room, a } = duel({ distance: 20 });
  a.prowess = PROWESS.full;
  a.grounded = false;
  a.position.y = 3;
  a.velocity.y = -1;
  assert.equal(tryUltimate(room, 'a', 9), true);
  assert.equal(a.velocity.y, -1);
  assert.ok(!room.events.find((e) => e.type === 'ultimateStart').hop);
});

test('committing spends the charge; it runs its stretch and ends, with a short recovery and a dizzy moment', () => {
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  assert.equal(a.prowess, 0);
  assert.equal(a.ultimateState.until, committed + vortex.activeSec);
  run(room, committed + TICK * 2, committed + vortex.activeSec + TICK * 2);
  assert.equal(a.ultimateState, null);
  const ended = room.events.find((e) => e.type === 'ultimateEnded' && e.ultimate === 'vortex');
  assert.ok(ended, 'it ends');
  assert.ok(Math.abs(ended.at - (committed + vortex.activeSec)) <= TICK + 1e-6);
  assert.ok(ended.dizzyUntil > ended.at && ended.dizzyUntil - ended.at <= 2.5, 'dizzy for a moment, not a long stun');
  // the recovery: no sword, spell or fist; then all of them again
  const during = ended.at + vortex.recoverSec * 0.5;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, during), false);
  assert.equal(tryGauntletStrike(room, 'a', during), false);
  assert.equal(beginAttack(room, 'a', during), false);
  assert.equal(a.attackActive || a.attackHeld || a.attackQueued, false, 'no sword in the recovery (and no press kept for after it)');
  // (it can guard and move: it is a recovery, not a stun)
  assert.equal(setGuard(room, 'a', true, during), true);
  setGuard(room, 'a', false, during);
  const after = ended.at + vortex.recoverSec + 0.05;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, after), true);
  assert.equal(beginAttack(room, 'a', after + 0.5), true, 'and the sword again');
});

test('spinning, there is no guard, no dash, no spell, no fist and no sword chain of its own', () => {
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  const now = committed + 0.5;
  assert.equal(setGuard(room, 'a', true, now), false, 'no guard');
  assert.equal(a.guarding, false);
  assert.equal(tryDash(room, 'a', { x: 1, z: 0 }, now), false, 'no dash');
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, now), false, 'no spell');
  assert.equal(tryGauntletStrike(room, 'a', now), false, 'no fist');
  assert.equal(beginAttack(room, 'a', now), false, 'no chain');
  assert.equal(a.attackActive || a.attackHeld || a.attackQueued, false, 'and the press is not kept');
  // (nor is one made while it was being lit)
  const lit = duel({ distance: 30 });
  lit.a.prowess = PROWESS.full;
  tryUltimate(lit.room, 'a', 9);
  assert.equal(beginAttack(lit.room, 'a', 9.2), false);
  run(lit.room, 9, 9 + vortex.startupSec + vortex.activeSec + vortex.recoverSec + 0.5);
  assert.equal(lit.a.ultimateState, null);
  assert.equal(lit.room.events.some((e) => e.type === 'swordSwing'), false, 'no swing comes of it afterwards');
});

test('it moves faster than a run and slower than a sprint, and sprinting adds nothing', () => {
  assert.ok(vortex.move.speed > MOVEMENT.runSpeed && vortex.move.speed < SPRINT.speed);
  const { room, a } = duel({ distance: 30 });
  a.yaw = 0; a.input.yaw = 0;   // heading -z, away from everyone
  const committed = spin(room, a, () => { a.input = { forward: 1, right: 0, jump: false, sprint: true, yaw: 0, pitch: 0 }; });
  let from = null;
  run(room, committed + TICK * 2, committed + 2, (now) => {
    a.input = { forward: 1, right: 0, jump: false, sprint: true, yaw: 0, pitch: 0 };
    if (from === null && now >= committed + 1) from = { z: a.position.z, at: now };
  });
  const speed = Math.abs(a.position.z - from.z) / (committed + 2 - from.at);
  assert.ok(Math.abs(speed - vortex.move.speed) < 0.4, `its own pace: ${speed.toFixed(2)} m/s`);
  assert.equal(a.sprinting, false);
});

test('it falls slowly and never rises of itself: hang time, not flight', () => {
  // dropped from a height, spinning: far slower than a plain fall, never faster than its limit
  const drop = (spinning) => {
    const { room, a } = duel({ distance: 30 });
    const committed = spinning ? spin(room, a) : 9.9;
    Object.assign(a.position, { x: 0, y: 12, z: 0 });
    a.velocity = { x: 0, y: 0, z: 0 };
    a.grounded = false;
    let fastest = 0;
    let highest = a.position.y;
    run(room, committed + TICK * 2, committed + 1.2, () => {
      fastest = Math.max(fastest, -a.velocity.y);
      highest = Math.max(highest, a.position.y);
    });
    return { fell: 12 - a.position.y, fastest, highest };
  };
  const plain = drop(false);
  const whirl = drop(true);
  assert.ok(whirl.fell > 1, `gravity still matters: fell ${whirl.fell.toFixed(2)} m`);
  assert.ok(whirl.fell < plain.fell * 0.6, `slowly: ${whirl.fell.toFixed(2)} m against ${plain.fell.toFixed(2)} m`);
  assert.ok(whirl.fastest <= vortex.move.maxFall + 1e-6);
  assert.ok(whirl.highest <= 12 + 1e-6, 'it never rises');
  // and holding the jump the whole way through gains no height beyond one ordinary jump
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  let top = 0;
  let jump = false;
  run(room, committed + TICK * 2, committed + vortex.activeSec, () => {
    jump = !jump;   // hammering the key
    a.input = { forward: 0, right: 0, jump, sprint: false, yaw: a.yaw, pitch: 0 };
    top = Math.max(top, a.position.y);
  });
  const oneJump = MOVEMENT.jumpImpulse ** 2 / (2 * MOVEMENT.gravity);
  assert.ok(top <= oneJump + 0.05, `no higher than a jump: ${top.toFixed(2)} m (a jump is ${oneJump.toFixed(2)} m)`);
});

test('a knight who stays within its inner reach is cut once a turn and is dead in about a second', () => {
  const { room, a, b } = duel({ distance: 1.4 });
  const committed = spin(room, a, pinned(b, 1.4));
  run(room, committed + TICK * 2, committed + 2.5, pinned(b, 1.4));
  const hits = cuts(room.events);
  assert.ok(hits.length >= 3, `${hits.length} cuts`);
  // never more often than its cadence (no damage every frame)
  for (let i = 1; i < hits.length; i += 1) {
    assert.ok(hits[i].at - hits[i - 1].at >= vortex.contact.everySec - 1e-6, `cuts ${(hits[i].at - hits[i - 1].at).toFixed(3)} s apart`);
  }
  const death = room.events.find((e) => e.type === 'death' && e.victimId === 'b');
  assert.ok(death, 'it kills');
  assert.equal(death.killerId, 'a');
  const took = death.at - hits[0].at;
  assert.ok(took >= 0.7 && took <= 1.3, `dead ${took.toFixed(2)} s after the first cut`);
  // the ultimate's own damage earns its user nothing
  assert.equal(a.prowess, 0);
  assert.ok(hits.every((e) => e.ultimate === true));
});

test('the sword is a blade, not an aura: out of its reach nothing is cut, at its tip less, and a wall between spares them', () => {
  const far = duel({ distance: 4 });
  far.room.projectiles.clear();
  const committed = spin(far.room, far.a, pinned(far.b, 4));
  // (looking straight up, so no ember goes their way: only the sword is asked about)
  run(far.room, committed + TICK * 2, committed + 2, () => { pinned(far.b, 4)(); far.a.input = { ...far.a.input, pitch: 1.4, yaw: far.a.yaw }; });
  assert.equal(cuts(far.room.events).length, 0, 'four metres off: never cut');

  const tip = duel({ distance: 2.6 });
  const at = spin(tip.room, tip.a, pinned(tip.b, 2.6));
  run(tip.room, at + TICK * 2, at + 1, pinned(tip.b, 2.6));
  const inner = duel({ distance: 1.4 });
  const at2 = spin(inner.room, inner.a, pinned(inner.b, 1.4));
  run(inner.room, at2 + TICK * 2, at2 + 1, pinned(inner.b, 1.4));
  assert.ok(cuts(tip.room.events)[0].amount < cuts(inner.room.events)[0].amount, 'the tip bites less than the inner blade');

  const walled = duel({ distance: 1.6 });
  const world = { ...openWorld, solids: [{ id: 'wall', center: [0.8, 1.5, 0], size: [0.2, 3, 6] }] };
  walled.a.prowess = PROWESS.full;
  tryUltimate(walled.room, 'a', 9);
  const hold = () => { pinned(walled.b, 1.6)(); Object.assign(walled.a.position, { x: 0, z: 0 }); walled.a.input = { ...walled.a.input, pitch: 1.4, yaw: walled.a.yaw }; };
  run(walled.room, 9, 9 + vortex.startupSec + 2, hold, world);
  assert.equal(cuts(walled.room.events).length, 0, 'not through a wall');
});

test('a guard catches the first contacts and is then broken through: CLANG, CLANG, PERCUNK', () => {
  const { room, a, b } = duel({ distance: 1.4 });
  const hold = () => {
    pinned(b, 1.4)();
    a.input = { ...a.input, pitch: 1.4, yaw: a.yaw };   // (the embers go skyward: only the blade is asked about)
  };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  run(room, 9, 9 + vortex.startupSec - 0.3, hold);
  // raised well before the blade comes round (and even a guard raised in the instant is never a perfect one here)
  assert.equal(setGuard(room, 'b', true, 9 + vortex.startupSec - 0.3), true);
  run(room, 9 + vortex.startupSec - 0.3 + TICK, 9 + vortex.startupSec + 3, hold);
  const sequence = room.events.filter((e) => ['block', 'guardBreak', 'parry'].includes(e.type) || (e.type === 'damage' && e.source === 'vortex')).map((e) => e.type);
  assert.deepEqual(sequence.slice(0, 3), ['block', 'block', 'guardBreak']);
  assert.ok(!sequence.includes('parry'));
  assert.equal(sequence[3], 'damage', 'and then it cuts');
  const first = room.events.find((e) => e.type === 'block');
  const broke = room.events.find((e) => e.type === 'guardBreak');
  assert.ok(first.vortex && broke.vortex);
  // the guard bought time, no more: they still fall
  assert.ok(room.events.some((e) => e.type === 'death' && e.victimId === 'b'));
});

test('a knight who runs gets away from the sword', () => {
  const { room, a, b } = duel({ distance: 2.2 });
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  // b turns and runs the moment it begins; a stands where it is, looking up (its embers thrown at the sky)
  const each = () => {
    b.input = { forward: 1, right: 0, jump: false, sprint: false, yaw: -Math.PI / 2, pitch: 0 };
    a.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: a.yaw, pitch: 1.4 };
  };
  run(room, 9, 9 + vortex.startupSec + vortex.activeSec + 0.2, each);
  assert.equal(cuts(room.events).length, 0);
  assert.equal(b.alive, true);
});

test('its embers are small Fireballs of its owner\'s, thrown where the knight aims, on a limited clock', () => {
  const { room, a, b } = duel({ distance: 12 });
  const committed = spin(room, a, pinned(b, 12));
  run(room, committed + TICK * 2, committed + vortex.activeSec + 0.5, pinned(b, 12));
  const thrown = room.events.filter((e) => e.type === 'projectileSpawned');
  assert.ok(thrown.length >= 4, `${thrown.length} embers`);
  assert.ok(thrown.length <= Math.ceil(vortex.activeSec / vortex.ember.everySec) + 1, 'no more than its clock allows on the ground');
  for (const event of thrown) {
    assert.equal(event.projectile.spell, 'ember');
    assert.equal(event.projectile.ownerId, 'a');
    // along the aim (a faces +x, level)
    const v = event.projectile.velocity;
    assert.ok(v.x > 0 && Math.abs(v.z) < 1e-6 && Math.abs(v.y) < 1e-6, 'toward the aim, not out in a ring');
    assert.ok(event.at >= committed + vortex.ember.firstAfterSec - TICK, 'none in the startup');
  }
  for (let i = 1; i < thrown.length; i += 1) assert.ok(thrown[i].at - thrown[i - 1].at >= vortex.ember.fallingEverySec - 1e-6);
  // they burst on what they meet, as their owner's, weaker than a Fireball, and earn their owner no prowess
  const burns = room.events.filter((e) => e.type === 'damage' && e.source === 'ember');
  assert.ok(burns.length >= 1, 'they reach what they were aimed at');
  assert.ok(burns.every((e) => e.attackerId === 'a' && e.victimId === 'b' && e.amount <= CONJURED.ember.directDamage && e.ultimate === true));
  assert.equal(a.prowess, 0);
  assert.ok(!room.events.some((e) => e.type === 'damage' && e.source === 'burn'), 'and leave no burn');
  assert.equal(cuts(room.events).length, 0, 'twelve metres off, the sword never reached');
});

test('an ember meets the world like any spell', () => {
  const { room, a, b } = duel({ distance: 12 });
  const world = { ...openWorld, solids: [{ id: 'wall', center: [6, 1.5, 0], size: [0.4, 3, 8] }] };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  run(room, 9, 9 + vortex.startupSec + 2, pinned(b, 12), world);
  assert.ok(room.events.some((e) => e.type === 'projectileImpact' && e.spell === 'ember' && e.worldHit === true));
  assert.equal(b.health, 100);
});

test('feet on the ground the sword does the work; falling fast it bites less and the fire comes thicker', () => {
  const measure = (falling) => {
    const { room, a, b } = duel({ distance: 1.4 });
    const committed = spin(room, a, pinned(b, 1.4));
    const each = () => {
      b.health = 100;
      if (falling) {
        // both held high in the air, a falling at its limit
        Object.assign(a.position, { x: 0, y: 20, z: 0 });
        a.grounded = false;
        a.velocity.y = -vortex.move.maxFall;
        Object.assign(b.position, { x: 1.4, y: 20, z: 0 });
        b.velocity = { x: 0, y: 0, z: 0 };
        b.impulse = { x: 0, z: 0 };
      } else pinned(b, 1.4)();
    };
    room.events.length = 0;
    run(room, committed + TICK * 2, committed + 2.5, each);
    return { cut: cuts(room.events)[0]?.amount, embers: room.events.filter((e) => e.type === 'projectileSpawned').length };
  };
  const ground = measure(false);
  const air = measure(true);
  assert.ok(air.cut < ground.cut, `the sword: ${air.cut} falling against ${ground.cut}`);
  assert.ok(air.embers > ground.embers, `the fire: ${air.embers} falling against ${ground.embers}`);
});

test('it is no shield: the spinning knight is hurt and shaken as ever, and staggered, cuts nothing', () => {
  const { room, a, b } = duel({ distance: 1.4 });
  const committed = spin(room, a, pinned(b, 1.4));
  const before = a.health;
  // b's own blade lands on it as on anyone
  beginAttack(room, 'b', committed + 0.05);
  run(room, committed + TICK * 2, committed + 0.6, pinned(b, 1.4));
  assert.ok(a.health < before, 'it takes the blow in full');
  const sword = room.events.find((e) => e.type === 'damage' && e.source === 'sword' && e.victimId === 'a');
  assert.ok(sword && sword.amount >= 15);
  // its balance broken mid-spin: nothing more is cut until it has its feet
  const other = duel({ distance: 1.4 });
  const at = spin(other.room, other.a, pinned(other.b, 1.4));
  other.room.events.length = 0;
  staggerBy(other.room, other.a, STAGGER.max, at + 0.05, 'b');
  const until = other.a.staggerUntil;
  run(other.room, at + 0.05 + TICK, until - TICK, pinned(other.b, 1.4));
  assert.equal(cuts(other.room.events).length, 0);
  assert.equal(other.room.events.filter((e) => e.type === 'projectileSpawned').length, 0);
  assert.equal(other.a.ultimateState?.phase, 'active', 'the charge is spent and the clock runs on');
});

test('a knight who falls spinning, or still dizzy from it, is marked for the voice', () => {
  const during = duel({ distance: 20 });
  const committed = spin(during.room, during.a);
  during.a.health = 1;
  staggerBy(during.room, during.a, 1, committed + 0.2, 'b');
  beginAttack(during.room, 'b', committed + 0.2);
  Object.assign(during.b.position, { x: 1.6, y: 0, z: 0 });
  during.b.history = [];
  run(during.room, committed + 0.2, committed + 1, () => { Object.assign(during.b.position, { x: 1.6, y: 0, z: 0 }); during.b.impulse = { x: 0, z: 0 }; during.b.health = 100; });
  const death = during.room.events.find((e) => e.type === 'death' && e.victimId === 'a');
  assert.ok(death, 'it fell');
  assert.equal(death.dizzy, true);

  const after = duel({ distance: 20 });
  const at = spin(after.room, after.a);
  run(after.room, at + TICK * 2, at + vortex.activeSec + TICK * 2);
  const ended = after.room.events.find((e) => e.type === 'ultimateEnded');
  after.room.events.length = 0;
  after.a.health = 1;
  after.room.players.get('a').lastDamageAt = ended.at;
  // (an ordinary death a moment later, by anything)
  run(after.room, ended.at + 0.2, ended.at + 0.25, () => { if (after.a.alive) after.a.burn = { attackerId: 'b', perLick: 5, licksLeft: 1, interval: 0.1, nextAt: 0, until: ended.at + 1 }; });
  assert.equal(after.room.events.find((e) => e.type === 'death' && e.victimId === 'a')?.dizzy, true);

  // and long after: an ordinary death
  const later = duel({ distance: 20 });
  const at3 = spin(later.room, later.a);
  run(later.room, at3 + TICK * 2, at3 + vortex.activeSec + vortex.dizzySec + 0.5);
  later.room.events.length = 0;
  later.a.burn = { attackerId: 'b', perLick: 500, licksLeft: 1, interval: 0.1, nextAt: 0, until: 100 };
  run(later.room, at3 + vortex.activeSec + vortex.dizzySec + 0.6, at3 + vortex.activeSec + vortex.dizzySec + 0.7);
  const plain = later.room.events.find((e) => e.type === 'death' && e.victimId === 'a');
  assert.ok(plain && plain.dizzy === undefined);
});

test('the Practice Yard\'s READY ULTIMATE readies whichever ultimate is carried', () => {
  for (const ultimate of ['vortex', 'sunder']) {
    const room = new Room('PRACT', { mode: 'PRACTICE' });
    const a = room.addPlayer({ id: 'a', token: 'ta', name: 'A', ultimate }, 0);
    room.armAutoStart(0);
    room.tick(3.2);
    run(room, 3.2, 4);
    assert.equal(room.state, 'PLAYING');
    assert.equal(a.prowess, 0);
    assert.equal(readyPracticeUltimate(room, 'a'), true);
    assert.equal(tryUltimate(room, 'a', 9), true);
    assert.equal(a.ultimateState.id, ultimate);
    run(room, 9, 9 + ULTIMATES[ultimate].startupSec + TICK);
    assert.equal(a.ultimateState.phase, 'active');
  }
});

test('what a player\'s view needs of it is on the wire: where the blade started round, and the dizzy moment', () => {
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  const me = serializeSnapshot(room, committed + 0.1).players.find((p) => p.id === 'a');
  assert.equal(me.ultimateState.id, 'vortex');
  assert.equal(me.ultimateState.spinFrom, a.ultimateState.spinFrom);
  assert.equal(me.ultimateState.hits, undefined, 'and nothing of its bookkeeping');
  // the turn it gathers through the startup is one whole turn, arriving at the spin's own speed
  const state = { commitAt: 10 };
  assert.ok(Math.abs(vortexWindup(state, 10) - 2 * Math.PI) < 1e-9);
  assert.equal(vortexWindup(state, 10 - vortex.startupSec), 0);
  const slope = (vortexWindup(state, 10) - vortexWindup(state, 10 - 1e-4)) / 1e-4;
  assert.ok(Math.abs(slope - 2 * Math.PI * vortex.spin.revPerSec) < 0.05, `it runs on into the spin: ${slope.toFixed(2)} rad/s`);
});
