import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, setGuard, staggerBy, stepRoom, tryCastSpell, tryDash, tryGauntletStrike, tryUltimate } from '../../shared/sim/combat.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { CONJURED, SPELLS, isSpell, spellFor } from '../../shared/src/spells.mjs';
import { DEFAULT_ULTIMATE, ULTIMATES, isUltimate, stepVortexEmphasis, vortexAngle, vortexEmphasisWanted, vortexTune, vortexWindup } from '../../shared/src/ultimates.mjs';
import { readyPracticeUltimate } from '../../shared/sim/practice.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

// Blazing Vortex: the second ultimate. A steered, spinning, burning sword with aimed fire, on the same course as any
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

// what a holds (the host reads it from their input): 'attack' the blade, 'spell' the fire, 'both', or nothing
const hold = (a, what = null, extra = {}) => {
  a.input = { ...a.input, attack: what === 'attack' || what === 'both', spell: what === 'spell' || what === 'both', ...extra };
};

const fires = (events) => events.filter((e) => e.type === 'projectileSpawned');

test('the Vortex is an ultimate a knight can carry, beside Sunder (which stays the default)', () => {
  assert.equal(isUltimate('vortex'), true);
  assert.equal(isUltimate('sunder'), true);
  assert.equal(DEFAULT_ULTIMATE, 'sunder');
  const { a, b } = duel();
  assert.equal(a.ultimate, 'vortex');
  assert.equal(b.ultimate, 'sunder');
  // its fires are no spells a knight can carry; each is less than a Fireball, and they stand in order
  const [ember, fire, blaze] = ['ember', 'vortexFire', 'vortexBlaze'].map((id) => CONJURED[id]);
  for (const id of Object.keys(CONJURED)) {
    assert.equal(isSpell(id), false);
    assert.equal(spellFor(id), CONJURED[id]);
    assert.equal(CONJURED[id].burn, undefined, 'none leaves a burn');
  }
  assert.ok(ember.directDamage < fire.directDamage && fire.directDamage < blaze.directDamage, 'the blade\'s ember the weakest, the fire\'s the strongest');
  assert.ok(ember.radius < fire.radius && fire.radius < blaze.radius && blaze.radius < SPELLS.fireball.radius);
  assert.ok(fire.directDamage > 8, 'balanced, more than the ember it used to throw');
  assert.ok(fire.directDamage < SPELLS.fireball.directDamage, 'and plainly less than a Fireball from the palm');
  assert.ok(blaze.directDamage <= SPELLS.fireball.directDamage);
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

test('committing spends the charge; it runs eight seconds and ends, with a short recovery and a dizzy moment', () => {
  assert.equal(vortex.activeSec, 8);
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
  // the recovery: no sword, spell, fist or second ultimate; then all of them again
  const during = ended.at + vortex.recoverSec * 0.5;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, during), false);
  assert.equal(tryGauntletStrike(room, 'a', during), false);
  assert.equal(beginAttack(room, 'a', during), false);
  assert.equal(a.attackActive || a.attackHeld || a.attackQueued, false, 'no sword in the recovery (and no press kept for after it)');
  a.prowess = PROWESS.full;
  assert.equal(tryUltimate(room, 'a', during), false, 'nor another ultimate on top of it');
  a.prowess = 0;
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
  assert.ok(vortex.speed > MOVEMENT.runSpeed && vortex.speed < SPRINT.speed);
  const { room, a } = duel({ distance: 30 });
  a.yaw = 0; a.input.yaw = 0;   // heading -z, away from everyone
  const forward = () => { a.input = { forward: 1, right: 0, jump: false, sprint: true, yaw: 0, pitch: 0 }; };
  const committed = spin(room, a, forward);
  let from = null;
  run(room, committed + TICK * 2, committed + 2, (now) => {
    forward();
    if (from === null && now >= committed + 1) from = { z: a.position.z, at: now };
  });
  const speed = Math.abs(a.position.z - from.z) / (committed + 2 - from.at);
  assert.ok(Math.abs(speed - vortex.speed) < 0.4, `its own pace: ${speed.toFixed(2)} m/s`);
  assert.equal(a.sprinting, false);
});

test('the knight steers it by what they hold, as the host reads it: the attack for the blade, the spell for the fire, neither or both balanced', () => {
  assert.equal(vortexEmphasisWanted({}), 0);
  assert.equal(vortexEmphasisWanted({ attack: true }), 1);
  assert.equal(vortexEmphasisWanted({ spell: true }), -1);
  assert.equal(vortexEmphasisWanted({ attack: true, spell: true }), 0, 'both: balanced, never both bonuses');
  const steered = (what) => {
    const { room, a } = duel({ distance: 30 });
    const committed = spin(room, a, () => hold(a, null));
    run(room, committed + TICK * 2, committed + 1.5, () => hold(a, what));
    return a.ultimateState.emphasis;
  };
  assert.equal(steered(null), 0);
  assert.equal(steered('attack'), 1);
  assert.equal(steered('spell'), -1);
  assert.equal(steered('both'), 0);
  // it is the host's reading: on the wire for the knight's own view, never taken from them
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  run(room, committed + TICK * 2, committed + 1, () => hold(a, 'attack'));
  const me = serializeSnapshot(room, committed + 1).players.find((p) => p.id === 'a');
  assert.equal(me.ultimateState.emphasis, 1);
  // each emphasis is its own thing
  const [balanced, blade, fire] = [0, 1, -1].map((e) => vortexTune(e));
  assert.deepEqual([balanced.kind, blade.kind, fire.kind], ['balanced', 'blade', 'fire']);
  assert.ok(blade.revPerSec > balanced.revPerSec && balanced.revPerSec > fire.revPerSec);
  assert.ok(blade.maxFall < balanced.maxFall && balanced.maxFall < fire.maxFall, 'the blade hangs longest, the fire falls soonest');
});

test('the emphasis is eased: it takes a moment to come round, and flicking between them gains nothing', () => {
  // a third of a second or so from balanced to all the way one way
  assert.ok(vortex.emphasisSec >= 0.3 && vortex.emphasisSec <= 0.4);
  let e = 0;
  for (let t = 0; t < vortex.emphasisSec / 2; t += TICK) e = stepVortexEmphasis(e, 1, TICK);
  assert.ok(e > 0.3 && e < 0.7, `half way there in half the time: ${e.toFixed(2)}`);
  assert.equal(stepVortexEmphasis(0, 1, 10), 1, 'never past the end');
  assert.equal(stepVortexEmphasis(0.2, -1, 0), 0.2);
  // held one tick, let go the next, over and over: it never leaves balanced
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  let on = false;
  let most = 0;
  let fastest = 0;
  run(room, committed + TICK * 2, committed + 2, () => {
    on = !on;
    hold(a, on ? 'attack' : 'spell');
    most = Math.max(most, Math.abs(a.ultimateState.emphasis));
    fastest = Math.max(fastest, a.ultimateState.rate);
  });
  assert.ok(most <= 2 * TICK / vortex.emphasisSec + 1e-9, `flicking stays balanced: ${most.toFixed(2)}`);
  assert.equal(vortexTune(most).kind, 'balanced');
  assert.ok(fastest < 2 * Math.PI * (vortex.balanced.revPerSec + 0.25), 'and turns no faster for it');
  // and a real change of mind passes through balanced on its way (no jump from one end to the other)
  let swing = 1;
  const path = [];
  for (let t = 0; t < 2 * vortex.emphasisSec + TICK; t += TICK) { swing = stepVortexEmphasis(swing, -1, TICK); path.push(swing); }
  assert.ok(path.some((v) => Math.abs(v) < 0.1), 'through balanced');
  assert.equal(path[path.length - 1], -1);
  for (let i = 1; i < path.length; i += 1) assert.ok(Math.abs(path[i] - path[i - 1]) <= TICK / vortex.emphasisSec + 1e-9);
});

test('the blade holds the attack to spin faster and the spell to spin slower: the host turns it at the pace it is steered to', () => {
  const turns = (what) => {
    const { room, a } = duel({ distance: 30 });
    const committed = spin(room, a, () => hold(a, what));
    run(room, committed + TICK * 2, committed + 1, () => hold(a, what));
    const from = a.ultimateState.angle;
    run(room, committed + 1 + TICK, committed + 2, () => hold(a, what));
    return (a.ultimateState.angle - from) / (2 * Math.PI);
  };
  const [balanced, blade, fire] = [null, 'attack', 'spell'].map(turns);
  assert.ok(Math.abs(balanced - vortex.balanced.revPerSec) < 0.2, `balanced: ${balanced.toFixed(2)} turns a second`);
  assert.ok(Math.abs(blade - vortex.blade.revPerSec) < 0.2, `the blade: ${blade.toFixed(2)}`);
  assert.ok(Math.abs(fire - vortex.fire.revPerSec) < 0.2, `the fire: ${fire.toFixed(2)}`);
  assert.ok(blade > balanced + 0.5 && balanced > fire + 0.5);
  // where the blade is, for a view between two words from the host: on from the last, at the rate it was turning
  assert.ok(Math.abs(vortexAngle({ angle: 2, angleAt: 10, rate: 20 }, 10.05) - 3) < 1e-9);
});

test('it falls slowly, slowest on the blade and soonest on the fire, and never rises of itself: hang time, not flight', () => {
  // dropped from a height: how far it falls in a second and a bit, and whether it ever rises
  const drop = (what, spinning = true) => {
    const { room, a } = duel({ distance: 30 });
    const committed = spinning ? spin(room, a, () => hold(a, what)) : 9.9;
    if (spinning) run(room, committed + TICK * 2, committed + 0.6, () => hold(a, what));
    const from = spinning ? committed + 0.6 : committed;
    Object.assign(a.position, { x: 0, y: 30, z: 0 });
    a.velocity = { x: 0, y: 0, z: 0 };
    a.grounded = false;
    let fastest = 0;
    let highest = a.position.y;
    run(room, from + TICK, from + 1.6, () => {
      hold(a, what);
      fastest = Math.max(fastest, -a.velocity.y);
      highest = Math.max(highest, a.position.y);
    });
    return { fell: 30 - a.position.y, fastest, highest };
  };
  const plain = drop(null, false);
  const [balanced, blade, fire] = [null, 'attack', 'spell'].map((what) => drop(what));
  for (const [name, fall, tune] of [['balanced', balanced, vortex.balanced], ['blade', blade, vortex.blade], ['fire', fire, vortex.fire]]) {
    assert.ok(fall.fell > 1, `${name}: gravity still matters: fell ${fall.fell.toFixed(2)} m`);
    assert.ok(fall.fell < plain.fell * 0.8, `${name}: slower than a plain fall: ${fall.fell.toFixed(2)} m against ${plain.fell.toFixed(2)} m`);
    assert.ok(fall.fastest <= tune.maxFall + 1e-6, `${name}: no faster than its limit`);
    assert.ok(fall.highest <= 30 + 1e-6, `${name}: it never rises`);
  }
  assert.ok(blade.fell < balanced.fell && balanced.fell < fire.fell, `the blade hangs longest: ${blade.fell.toFixed(2)} < ${balanced.fell.toFixed(2)} < ${fire.fell.toFixed(2)} m`);
  // and hammering the jump the whole way through, on any emphasis, gains no height beyond one ordinary jump
  const oneJump = MOVEMENT.jumpImpulse ** 2 / (2 * MOVEMENT.gravity);
  for (const what of [null, 'attack', 'spell']) {
    const { room, a } = duel({ distance: 30 });
    const committed = spin(room, a);
    let top = 0;
    let jump = false;
    run(room, committed + TICK * 2, committed + vortex.activeSec, () => {
      jump = !jump;
      hold(a, what, { forward: 0, right: 0, jump, sprint: false });
      top = Math.max(top, a.position.y);
    });
    assert.ok(top <= oneJump + 0.05, `${what ?? 'balanced'}: no higher than a jump: ${top.toFixed(2)} m (a jump is ${oneJump.toFixed(2)} m)`);
  }
});

test('a knight who stays within its inner reach is cut for thirty a turn and is dead in under a second; sooner still on the blade', () => {
  const stays = (what) => {
    const { room, a, b } = duel({ distance: 1.4 });
    const each = () => { pinned(b, 1.4)(); hold(a, what, { pitch: 1.4, yaw: a.yaw }); };   // (its fire thrown at the sky: only the blade is asked about)
    a.prowess = PROWESS.full;
    tryUltimate(room, 'a', 9);
    run(room, 9, 9 + vortex.startupSec + 3, each);
    const hits = cuts(room.events);
    const death = room.events.find((e) => e.type === 'death' && e.victimId === 'b');
    return { room, a, hits, death, took: death ? death.at - hits[0].at : Infinity };
  };
  const balanced = stays(null);
  assert.ok(balanced.hits.length >= 3, `${balanced.hits.length} cuts`);
  assert.equal(balanced.hits[0].amount, vortex.contact.damage, 'the inner blade at full');
  assert.equal(vortex.contact.damage, 30);
  // never more often than its cadence (no damage every frame), and no more than once a turn
  for (let i = 1; i < balanced.hits.length; i += 1) {
    const gap = balanced.hits[i].at - balanced.hits[i - 1].at;
    assert.ok(gap >= vortex.contact.everySec - 1e-6, `cuts ${gap.toFixed(3)} s apart`);
    assert.ok(gap >= 1 / vortex.balanced.revPerSec - 2 * TICK, 'once a turn');
  }
  assert.ok(balanced.death && balanced.death.killerId === 'a', 'it kills');
  assert.ok(balanced.took >= 0.5 && balanced.took <= 1.1, `dead ${balanced.took.toFixed(2)} s after the first cut`);
  // the ultimate's own damage (and the scorch it leaves) earns its user nothing
  assert.equal(balanced.a.prowess, 0);
  assert.ok(balanced.hits.every((e) => e.ultimate === true));
  // on the blade: quicker, by turning faster (each cut is the same cut), and still never faster than its cadence
  const blade = stays('attack');
  assert.ok(blade.took < balanced.took, `the blade: ${blade.took.toFixed(2)} s against ${balanced.took.toFixed(2)} s`);
  assert.ok(blade.took <= 0.85);
  assert.ok(blade.hits.every((e) => e.amount <= vortex.contact.damage));
  for (let i = 1; i < blade.hits.length; i += 1) assert.ok(blade.hits[i].at - blade.hits[i - 1].at >= vortex.contact.everySec - 1e-6);
  assert.ok(vortex.contact.everySec <= 1 / vortex.blade.revPerSec, 'its cadence lets the fastest blade cut once a turn');
  // on the fire the blade is as sharp, and comes round less often
  const fire = stays('spell');
  assert.equal(fire.hits[0].amount, vortex.contact.damage);
  assert.ok(fire.took > balanced.took);
});

test('the sword is a blade, not an aura: out of its reach nothing is cut, at its tip less, and a wall between spares them', () => {
  const far = duel({ distance: 4 });
  const up = (a) => { a.input = { ...a.input, pitch: 1.4, yaw: a.yaw, attack: true }; };
  const committed = spin(far.room, far.a, pinned(far.b, 4));
  run(far.room, committed + TICK * 2, committed + 3, () => { pinned(far.b, 4)(); up(far.a); });
  assert.equal(cuts(far.room.events).length, 0, 'four metres off: never cut, however fast it spins');

  const tip = duel({ distance: 2.6 });
  const at = spin(tip.room, tip.a, pinned(tip.b, 2.6));
  run(tip.room, at + TICK * 2, at + 1, pinned(tip.b, 2.6));
  assert.ok(cuts(tip.room.events)[0].amount < vortex.contact.damage, 'the tip bites less than the inner blade');

  const walled = duel({ distance: 1.6 });
  const world = { ...openWorld, solids: [{ id: 'wall', center: [0.8, 1.5, 0], size: [0.2, 3, 6] }] };
  walled.a.prowess = PROWESS.full;
  tryUltimate(walled.room, 'a', 9);
  const held = () => { pinned(walled.b, 1.6)(); Object.assign(walled.a.position, { x: 0, z: 0 }); up(walled.a); };
  run(walled.room, 9, 9 + vortex.startupSec + 3, held, world);
  assert.equal(cuts(walled.room.events).length, 0, 'not through a wall');
  assert.equal(walled.b.health, 100);
});

test('what the blade clips of the world rings and does not stop it; it is not rung like a bell; and it hurts nobody behind it', () => {
  // a spins beside a wall (within the sword's seen reach) with a pillar on its other side; b stands behind the wall
  const { room, a, b } = duel({ distance: 1.9 });
  const world = {
    ...openWorld,
    solids: [
      { id: 'wall', center: [1.1, 1.5, 0], size: [0.3, 3, 8], material: 'stone' },
      { id: 'post', center: [-1.2, 1.5, 0], size: [0.3, 3, 0.3], material: 'timber' },
    ],
  };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  const each = () => { pinned(b, 1.9)(); Object.assign(a.position, { x: 0, z: 0 }); hold(a, 'attack', { pitch: 1.4, yaw: a.yaw, forward: 0, right: 0 }); };
  run(room, 9, 9 + vortex.startupSec + 4, each, world);
  const rings = room.events.filter((e) => e.type === 'vortexWorldContact');
  assert.ok(rings.length >= 5, `it rings: ${rings.length} contacts in four seconds`);
  assert.ok(rings.every((e) => e.playerId === 'a' && e.point && e.material));
  assert.deepEqual([...new Set(rings.map((e) => e.surfaceId))].sort(), ['post', 'wall']);
  assert.equal(rings.find((e) => e.surfaceId === 'post').material, 'timber', 'each thing by what it is made of');
  // never two close together, and the same thing never again within a moment (not once a turn at four turns a second)
  for (let i = 1; i < rings.length; i += 1) assert.ok(rings[i].at - rings[i - 1].at >= vortex.world.everySec - 1e-6);
  for (const id of ['wall', 'post']) {
    const off = rings.filter((e) => e.surfaceId === id);
    for (let i = 1; i < off.length; i += 1) assert.ok(off[i].at - off[i - 1].at >= vortex.world.sameSec - 1e-6, `${id}: ${(off[i].at - off[i - 1].at).toFixed(2)} s apart`);
  }
  assert.ok(rings.length <= Math.ceil(4 / vortex.world.everySec) + 1);
  // (wedged between two things at four turns a second, it is still only a clank every beat or two: never a rattle)
  assert.ok(rings.length / 4 <= 3, `${(rings.length / 4).toFixed(1)} a second`);
  // the spin went on through all of it
  assert.equal(a.ultimateState?.phase, 'active');
  assert.ok(a.ultimateState.angle > 2 * Math.PI * vortex.balanced.revPerSec * 3.5, 'the blade never stopped turning');
  assert.equal(room.events.some((e) => e.type === 'swordWorldImpact' || e.type === 'ultimateInterrupted'), false);
  // and nobody behind the wall was touched
  assert.equal(cuts(room.events).length, 0);
  assert.equal(b.health, 100);
  // turning slowly (on the fire), the blade is in the wall for longer than the gap between two rings: still one ring
  // for each time it comes into it, not one for every moment it is in it
  const slow = duel({ distance: 20 });
  slow.a.prowess = PROWESS.full;
  tryUltimate(slow.room, 'a', 9);
  run(slow.room, 9, 9 + vortex.startupSec + 4, () => { Object.assign(slow.a.position, { x: 0, z: 0 }); hold(slow.a, 'spell', { pitch: 1.4, yaw: slow.a.yaw, forward: 0, right: 0 }); }, world);
  const offWall = slow.room.events.filter((e) => e.type === 'vortexWorldContact' && e.surfaceId === 'wall');
  const passes = Math.ceil(4 * vortex.balanced.revPerSec);
  assert.ok(offWall.length >= 2 && offWall.length <= passes, `${offWall.length} rings off the wall in at most ${passes} passes`);
  for (let i = 1; i < offWall.length; i += 1) assert.ok(offWall[i].at - offWall[i - 1].at >= vortex.world.sameSec - 1e-6);
});

test('a guard catches the first contacts and is then broken through: CLANG, CLANG, PERCUNK; and a guarded contact leaves no scorch', () => {
  const { room, a, b } = duel({ distance: 1.4 });
  const each = () => {
    pinned(b, 1.4)();
    a.input = { ...a.input, pitch: 1.4, yaw: a.yaw };   // (its fire goes skyward: only the blade is asked about)
  };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  run(room, 9, 9 + vortex.startupSec - 0.3, each);
  // raised well before the blade comes round (and even a guard raised in the instant is never a perfect one here)
  assert.equal(setGuard(room, 'b', true, 9 + vortex.startupSec - 0.3), true);
  let scorched = false;
  run(room, 9 + vortex.startupSec - 0.3 + TICK, 9 + vortex.startupSec + 3, () => {
    each();
    if (b.guarding && b.burn) scorched = true;
  });
  const sequence = room.events.filter((e) => ['block', 'guardBreak', 'parry'].includes(e.type) || (e.type === 'damage' && e.source === 'vortex')).map((e) => e.type);
  assert.deepEqual(sequence.slice(0, 3), ['block', 'block', 'guardBreak']);
  assert.ok(!sequence.includes('parry'));
  assert.equal(sequence[3], 'damage', 'and then it cuts');
  const first = room.events.find((e) => e.type === 'block');
  const broke = room.events.find((e) => e.type === 'guardBreak');
  assert.ok(first.vortex && broke.vortex);
  assert.equal(scorched, false, 'nothing burns behind a guard');
  const firstCut = room.events.find((e) => e.type === 'damage' && e.source === 'vortex');
  assert.ok(!room.events.some((e) => e.type === 'damage' && e.source === 'burn' && e.at < firstCut.at));
  // the guard bought time, no more: they still fall
  assert.ok(room.events.some((e) => e.type === 'death' && e.victimId === 'b'));
});

test('a cut leaves a scorch: a little more, over a moment, begun again by the next cut and never two at once', () => {
  const scorch = vortex.scorch;
  // one cut, then b is taken out of reach: the scorch runs its course and no more
  const { room, a, b } = duel({ distance: 1.4 });
  let away = false;
  const each = () => {
    if (!away && cuts(room.events).length) away = true;
    if (away) Object.assign(b.position, { x: 30, y: 0, z: 30 });
    else pinned(b, 1.4)();
    a.input = { ...a.input, pitch: 1.4, yaw: a.yaw };
  };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  run(room, 9, 9 + vortex.startupSec + 2, each);
  assert.equal(cuts(room.events).length, 1);
  const licks = room.events.filter((e) => e.type === 'damage' && e.source === 'burn' && e.victimId === 'b');
  assert.equal(licks.length, scorch.licks);
  assert.ok(Math.abs(licks.reduce((sum, e) => sum + e.amount, 0) - scorch.damage) < 1e-9, 'six in all');
  assert.ok(licks[licks.length - 1].at - cuts(room.events)[0].at <= scorch.seconds + TICK + 1e-6, 'over a moment');
  assert.ok(licks.every((e) => e.attackerId === 'a' && e.ultimate === true), 'its user\'s, and the ultimate\'s own');
  assert.equal(a.prowess, 0, 'it earns them nothing');
  assert.equal(b.health, 100 - vortex.contact.damage - scorch.damage);
  // cut after cut: one scorch, begun again each time, never one on top of another
  const kept = duel({ distance: 1.4 });
  let most = 0;
  let burning = 0;
  const hold2 = () => {
    pinned(kept.b, 1.4)();
    kept.b.health = 100;
    kept.a.input = { ...kept.a.input, pitch: 1.4, yaw: kept.a.yaw, attack: true };
    const burn = kept.b.burn;
    if (burn) most = Math.max(most, burn.perLick * burn.licksLeft);
  };
  kept.a.prowess = PROWESS.full;
  tryUltimate(kept.room, 'a', 9);
  run(kept.room, 9, 9 + vortex.startupSec + 3, hold2);
  assert.ok(cuts(kept.room.events).length >= 8);
  assert.ok(most <= scorch.damage + 1e-9, `never more than one scorch waiting: ${most}`);
  const all = kept.room.events.filter((e) => e.type === 'damage' && e.source === 'burn');
  for (let i = 1; i < all.length; i += 1) burning = Math.max(burning, all.filter((e) => e.at > all[i].at - scorch.seconds / scorch.licks + 1e-6 && e.at <= all[i].at).length);
  assert.ok(burning <= 1, 'one lick at a time');
  assert.ok(all.reduce((sum, e) => sum + e.amount, 0) <= cuts(kept.room.events).length * scorch.damage);
  // hardened plate takes the cut blunted and none of the scorch; and a worse burn already on them is left alone
  const hard = duel({ distance: 1.4 });
  hard.b.spell = 'steel';
  hard.a.prowess = PROWESS.full;
  tryUltimate(hard.room, 'a', 9);
  let steeled = false;
  run(hard.room, 9, 9 + vortex.startupSec + 0.5, (now) => {
    pinned(hard.b, 1.4)();
    hard.a.input = { ...hard.a.input, pitch: 1.4, yaw: hard.a.yaw };
    if (!steeled && now >= 9 + vortex.startupSec - 0.2) { hard.b.spellReadyAt = 0; steeled = tryCastSpell(hard.room, 'b', { x: -1, y: 0, z: 0 }, now); }
  });
  assert.equal(steeled, true);
  assert.ok(cuts(hard.room.events)[0].amount < vortex.contact.damage, 'blunted');
  assert.equal(hard.room.events.some((e) => e.type === 'damage' && e.source === 'burn'), false, 'and no scorch on hardened plate');
  const burnt = duel({ distance: 1.4 });
  burnt.a.prowess = PROWESS.full;
  tryUltimate(burnt.room, 'a', 9);
  const worse = { attackerId: 'c', perLick: 2, licksLeft: 5, interval: 5, nextAt: 99, until: 120 };
  burnt.b.burn = worse;
  run(burnt.room, 9, 9 + vortex.startupSec + 0.2, () => { pinned(burnt.b, 1.4)(); burnt.a.input = { ...burnt.a.input, pitch: 1.4, yaw: burnt.a.yaw }; });
  assert.ok(cuts(burnt.room.events).length >= 1);
  assert.equal(burnt.b.burn, worse);
});

test('a knight who runs gets away from the sword', () => {
  const { room, a, b } = duel({ distance: 2.2 });
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  // b turns and runs the moment it begins; a stands where it is, looking up (its fire thrown at the sky)
  const each = () => {
    b.input = { forward: 1, right: 0, jump: false, sprint: false, yaw: -Math.PI / 2, pitch: 0 };
    a.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: a.yaw, pitch: 1.4 };
  };
  run(room, 9, 9 + vortex.startupSec + vortex.activeSec + 0.2, each);
  assert.equal(cuts(room.events).length, 0);
  assert.equal(b.alive, true);
});

test('its fire is thrown where the knight aims, on a limited clock, by the host: small Fireballs balanced, weak embers on the blade, serious ones on the fire', () => {
  const thrown = (what) => {
    const { room, a, b } = duel({ distance: 12 });
    const each = () => { pinned(b, 12)(); b.health = 100; hold(a, what); };
    const committed = spin(room, a, each);
    run(room, committed + TICK * 2, committed + vortex.activeSec + 0.5, each);
    return { room, a, committed, spawned: fires(room.events) };
  };
  const balanced = thrown(null);
  assert.ok(balanced.spawned.length >= 8, `${balanced.spawned.length} thrown`);
  assert.ok(balanced.spawned.length <= Math.ceil(vortex.activeSec / vortex.balanced.fireEverySec) + 1, 'no more than its clock allows');
  for (const event of balanced.spawned) {
    assert.equal(event.projectile.spell, 'vortexFire');
    assert.equal(event.projectile.ownerId, 'a');
    assert.equal(event.projectile.ultimate, true);
    // along the aim (a faces +x, level)
    const v = event.projectile.velocity;
    assert.ok(v.x > 0 && Math.abs(v.z) < 1e-6 && Math.abs(v.y) < 1e-6, 'toward the aim, not out in a ring');
    assert.ok(event.at >= balanced.committed + vortex.firstFireSec - TICK, 'none in the startup');
  }
  // they burst on what they meet, as their owner's, weaker than a Fireball, and earn their owner no prowess
  const burns = balanced.room.events.filter((e) => e.type === 'damage' && e.source === 'vortexFire');
  assert.ok(burns.length >= 1, 'they reach what they were aimed at');
  assert.ok(burns.every((e) => e.attackerId === 'a' && e.victimId === 'b' && e.amount <= CONJURED.vortexFire.directDamage && e.ultimate === true));
  assert.ok(burns.some((e) => e.amount === CONJURED.vortexFire.directDamage));
  assert.equal(balanced.a.prowess, 0);
  assert.ok(!balanced.room.events.some((e) => e.type === 'damage' && e.source === 'burn'), 'and leave no burn');
  assert.equal(cuts(balanced.room.events).length, 0, 'twelve metres off, the sword never reached');
  // on the blade: the weakest, and fewer; on the fire: the strongest and largest; all of them still along the aim
  const blade = thrown('attack');
  const fire = thrown('spell');
  const kinds = (run) => [...new Set(run.spawned.filter((e) => e.at > run.committed + 1).map((e) => e.projectile.spell))];
  assert.deepEqual(kinds(blade), ['ember']);
  assert.deepEqual(kinds(fire), ['vortexBlaze']);
  assert.ok(blade.spawned.length < balanced.spawned.length);
  for (const each of [...blade.spawned, ...fire.spawned]) {
    const v = each.projectile.velocity;
    assert.ok(v.x > 0 && Math.abs(v.z) < 1e-6 && Math.abs(v.y) < 1e-6);
    assert.equal(each.projectile.ownerId, 'a');
  }
  const hurt = (run, source) => Math.max(...run.room.events.filter((e) => e.type === 'damage' && e.source === source).map((e) => e.amount));
  assert.equal(hurt(blade, 'ember'), CONJURED.ember.directDamage);
  assert.equal(hurt(fire, 'vortexBlaze'), CONJURED.vortexBlaze.directDamage);
  assert.ok(hurt(blade, 'ember') < hurt(balanced, 'vortexFire') && hurt(balanced, 'vortexFire') < hurt(fire, 'vortexBlaze'));
  const reach = (run) => Math.max(...run.room.events.filter((e) => e.type === 'projectileImpact').map((e) => e.radius));
  assert.ok(reach(blade) < reach(balanced) && reach(balanced) < reach(fire));
  // and the aim is the aim as it is when each leaves: turned, the next one goes the new way
  const turned = duel({ distance: 12 });
  const at = spin(turned.room, turned.a);
  run(turned.room, at + TICK * 2, at + 2, () => { turned.a.input = { ...turned.a.input, yaw: 0, pitch: 0.3 }; });
  const last = fires(turned.room.events).at(-1).projectile.velocity;
  assert.ok(last.z < 0 && Math.abs(last.x) < 1e-6 && last.y > 0, 'along the new aim (-z, and up)');
});

test('its fire meets the world like any spell', () => {
  const { room, a, b } = duel({ distance: 12 });
  const world = { ...openWorld, solids: [{ id: 'wall', center: [6, 1.5, 0], size: [0.4, 3, 8] }] };
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  run(room, 9, 9 + vortex.startupSec + 2, pinned(b, 12), world);
  assert.ok(room.events.some((e) => e.type === 'projectileImpact' && e.spell === 'vortexFire' && e.worldHit === true));
  assert.equal(b.health, 100);
});

test('it is no shield: the spinning knight is hurt and shaken as ever, and staggered, cuts nothing', () => {
  const { room, a, b } = duel({ distance: 1.4 });
  const committed = spin(room, a, pinned(b, 1.4));
  const before = a.health;
  // b's own blade lands on it as on anyone
  beginAttack(room, 'b', committed + 0.05);
  run(room, committed + TICK * 2, committed + 0.6, () => { pinned(b, 1.4)(); b.health = 100; });
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
  assert.equal(fires(other.room.events).length, 0);
  assert.equal(other.a.ultimateState?.phase, 'active', 'the charge is spent and the clock runs on');
});

test('a knight who falls spinning, or still dizzy from it, is marked for the voice', () => {
  const during = duel({ distance: 20 });
  const committed = spin(during.room, during.a);
  during.a.health = 1;
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

// a Practice Yard with a in it, carrying `ultimate`
function yard(ultimate) {
  const room = new Room('PRACT', { mode: 'PRACTICE' });
  const a = room.addPlayer({ id: 'a', token: 'ta', name: 'A', ultimate }, 0);
  room.armAutoStart(0);
  room.tick(3.2);
  run(room, 3.2, 4);
  assert.equal(room.state, 'PLAYING');
  return { room, a };
}

test('in the Practice Yard the ultimate\'s key readies it and calls it, again and again, with no trip to the menu', () => {
  for (const ultimate of ['vortex', 'sunder']) {
    const { room, a } = yard(ultimate);
    const spec = ULTIMATES[ultimate];
    let now = 9;
    for (let round = 0; round < 3; round += 1) {
      assert.equal(a.prowess, 0, 'the yard earns no prowess');
      assert.equal(tryUltimate(room, 'a', now), true, `${ultimate}, round ${round + 1}: the key alone`);
      assert.equal(a.ultimateState.id, ultimate);
      // (never one on top of another: while it runs, the key does nothing)
      run(room, now, now + spec.startupSec + 1);
      assert.equal(a.ultimateState.phase, 'active');
      assert.equal(tryUltimate(room, 'a', now + spec.startupSec + 1), false);
      run(room, now + spec.startupSec + 1 + TICK, now + spec.startupSec + spec.activeSec + TICK * 2);
      assert.equal(a.ultimateState, null, 'it ran its course');
      const ended = now + spec.startupSec + spec.activeSec + TICK * 2;
      // its recovery is kept to
      if (spec.recoverSec) assert.equal(tryUltimate(room, 'a', ended + spec.recoverSec * 0.5), false);
      now = ended + (spec.recoverSec ?? 0) + 0.1;
    }
  }
  // interrupted in the yard, the lockout is kept to as anywhere
  const { room, a } = yard('vortex');
  assert.equal(tryUltimate(room, 'a', 9), true);
  staggerBy(room, a, STAGGER.max, 9.2, null);
  run(room, 9.2, 9.3);
  assert.equal(a.ultimateState, null);
  assert.equal(tryUltimate(room, 'a', 9.4), false);
  assert.equal(tryUltimate(room, 'a', 9.3 + vortex.lockoutSec + 0.1), true);
  // the yard's own button still readies it (for whoever likes the button)
  const other = yard('sunder');
  assert.equal(readyPracticeUltimate(other.room, 'a'), true);
  assert.equal(other.a.prowess, PROWESS.full);
  // and none of this touches a real match: the meter short, the key does nothing
  const real = duel({ distance: 20 });
  real.a.prowess = PROWESS.full - 1;
  assert.equal(tryUltimate(real.room, 'a', 9), false);
  assert.equal(real.a.prowess, PROWESS.full - 1);
});

test('what a player\'s view needs of it is on the wire: where the blade is and how fast it turns, its emphasis, and the dizzy moment', () => {
  const { room, a } = duel({ distance: 30 });
  const committed = spin(room, a);
  run(room, committed + TICK * 2, committed + 0.5);
  const me = serializeSnapshot(room, committed + 0.5).players.find((p) => p.id === 'a');
  assert.equal(me.ultimateState.id, 'vortex');
  assert.equal(me.ultimateState.angle, a.ultimateState.angle);
  assert.equal(me.ultimateState.angleAt, a.ultimateState.angleAt);
  assert.equal(me.ultimateState.rate, a.ultimateState.rate);
  assert.equal(me.ultimateState.emphasis, 0);
  assert.equal(me.ultimateState.until, committed + vortex.activeSec, 'and how long is left');
  assert.equal(me.ultimateState.hits, undefined, 'and nothing of its bookkeeping');
  assert.equal(me.ultimateState.world, undefined);
  // its blade starts round from where the knight faced as it committed
  const fresh = duel({ distance: 30 });
  fresh.a.prowess = PROWESS.full;
  tryUltimate(fresh.room, 'a', 9);
  run(fresh.room, 9, 9 + vortex.startupSec + TICK / 2);
  assert.ok(Math.abs(fresh.a.ultimateState.angle - fresh.a.yaw) < 2 * Math.PI * vortex.balanced.revPerSec * TICK * 1.5);
  // the turn it gathers through the startup is one whole turn, arriving at the spin's own (balanced) speed
  const state = { commitAt: 10 };
  assert.ok(Math.abs(vortexWindup(state, 10) - 2 * Math.PI) < 1e-9);
  assert.equal(vortexWindup(state, 10 - vortex.startupSec), 0);
  const slope = (vortexWindup(state, 10) - vortexWindup(state, 10 - 1e-4)) / 1e-4;
  assert.ok(Math.abs(slope - 2 * Math.PI * vortex.balanced.revPerSec) < 0.05, `it runs on into the spin: ${slope.toFixed(2)} rad/s`);
});
