import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room } from '../../shared/sim/Room.mjs';
import { applyDamage, beginAttack, endAttack, setGuard, staggerBy, stepRoom, tryCastSpell, tryDash, tryGauntletStrike, tryUltimate } from '../../shared/sim/combat.mjs';
import { GAME, MELEE_CONTACT, closingImpact, guardBlockCost, swordDamageFor } from '../../shared/src/combat.mjs';
import { BLADE, aimFrame, aimQuality, bladeDirection, sweepBlade } from '../../shared/src/blade.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { RUPTURE, fissureCatches, planRupture } from '../../shared/src/rupture.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

// Sunder All That Rusts and the shared systems under it: the elevated damage level, maximum physical force, a guard
// paying for two blows, Steel meeting it halfway, accumulated stagger, a guard's stamina coming back behind it once the
// pressure lets up, prowess and the ultimate's commit point, and the ground rupturing under a driven blade. These are
// behaviours; the tuning numbers are read from the modules, not restated.

const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 2, y: 0, z: 0, yaw: Math.PI / 2 }],
  abyssY: -9,
};

function duel({ mode = 'FFA', third = false } = {}) {
  const room = new Room('SUNDR', { mode });
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  if (third) room.addPlayer({ id: 'c', token: 'tc', name: 'C' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  if (third) room.setReady('c', true, 0);
  room.tick(3.1);
  if (third) {
    const c = room.players.get('c');
    Object.assign(c.position, { x: 40, y: 0, z: 0 });
    c.spawnProtectionUntil = 0;
    c.history = [];
  }
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 1.8, y: 0, z: 0 });
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw; a.pitch = 0; a.input.pitch = 0;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  room.events.length = 0;
  return { room, a, b };
}

function run(room, from, to, world = openWorld, step = 0.01) {
  for (let now = from; now <= to + 1e-9; now += step) stepRoom(room, step, now, world);
  return room.events;
}

// a Sundering: a's meter filled, the key pressed at `at`, and the brace run through to its commit
function sunder(room, a, at = 9) {
  a.prowess = PROWESS.full;
  assert.ok(tryUltimate(room, 'a', at), 'the brace begins');
  run(room, at, at + ULTIMATES.sunder.startupSec + 0.02);
  assert.equal(a.ultimateState?.phase, 'active');
}

// b placed `deg` off a's aim (a faces +x: negative angles on a's right), `distance` away
function place(b, deg, distance = 1.8) {
  const angle = deg * Math.PI / 180;
  Object.assign(b.position, { x: Math.cos(angle) * distance, y: 0, z: -Math.sin(angle) * distance });
  b.history = [];
}

// one forehand from a at 10 s; the events of it
function forehand(room, world = openWorld) {
  beginAttack(room, 'a', 10);
  const events = run(room, 10, 10.55, world);
  endAttack(room, 'a', 10.55);
  return events;
}

test('an ordinary sword blow still follows the 19-30 contact curve, at the normal level', () => {
  // (negative: on a's right, the side the forehand is driven in from; its follow-through lands on nothing)
  for (const deg of [0, -30, -60]) {
    const { room, b } = duel();
    place(b, deg);
    const hit = forehand(room).find((e) => e.type === 'damage' && e.source === 'sword');
    assert.ok(hit.amount >= GAME.swordGlance && hit.amount <= GAME.swordDamage, `${deg}: ${hit.amount}`);
    assert.equal(hit.level, undefined, 'normal');
  }
});

test('Sundering, every sword blow it lands strikes at the elevated level, and every strike is a slam', () => {
  for (const deg of [0, 8]) {
    const { room, a, b } = duel();
    sunder(room, a);
    place(b, deg);
    room.events.length = 0;
    const events = forehand(room);
    const hit = events.find((e) => e.type === 'damage' && e.source === 'sword');
    assert.equal(hit.amount, GAME.swordElevated, `${deg} degrees off`);
    assert.equal(hit.level, 'elevated');
    assert.ok(GAME.swordElevated > GAME.swordDamage, 'above the ordinary curve altogether');
    assert.ok(events.find((e) => e.type === 'swordHit').level === 'elevated');
    assert.equal(events.find((e) => e.type === 'swordSwing').slam, true, 'the forehand came down as a slam');
  }
});

test('Sundering, a blow lands with the greatest physical force: the shove of a full-tilt collision, standing still', () => {
  const shoveOf = (events) => Math.hypot(events.find((e) => e.type === 'damage').push.x, events.find((e) => e.type === 'damage').push.z);
  // the shove a blow gives at a closing impact (0 standing, 1 a full-tilt collision)
  const shoveAt = (impact) => 1.7 * (1 + MELEE_CONTACT.impactKnockback * impact);
  const still = duel();
  const ordinary = forehand(still.room);
  assert.equal(ordinary.find((e) => e.type === 'swordHit').impact, 0, 'two knights standing');
  assert.ok(Math.abs(shoveOf(ordinary) - shoveAt(0)) < 1e-6);
  const sundered = duel();
  sunder(sundered.room, sundered.a);
  sundered.room.events.length = 0;
  const events = forehand(sundered.room);
  assert.equal(events.find((e) => e.type === 'swordHit').impact, 1, 'met as a full-tilt collision');
  assert.ok(Math.abs(shoveOf(events) - shoveAt(1)) < 1e-6, 'the full-tilt shove');
  // and it shakes a knight's balance by its own measure, more than any ordinary blow could (and the ground it split
  // under them shakes it again)
  assert.ok(ULTIMATES.sunder.stagger > STAGGER.gain.sword);
  assert.ok(sundered.b.stagger.level >= ULTIMATES.sunder.stagger + RUPTURE.stagger - 1, `${sundered.b.stagger.level}`);
  assert.ok(sundered.b.stagger.level <= ULTIMATES.sunder.stagger + RUPTURE.stagger + 1e-6);
  assert.ok(still.b.stagger.level < sundered.b.stagger.level);
});

test('Sunder meets Sheathe in Steel halfway: an ordinary blow by ordinary rules, and the plate\'s clock untouched', () => {
  const { room, a, b } = duel();
  sunder(room, a);
  b.steel = { calledAt: 9.9, fullUntil: 9.9 + 5, struck: false };
  const before = JSON.stringify(b.steel);
  room.events.length = 0;
  const events = forehand(room);
  const hit = events.find((e) => e.type === 'damage' && e.source === 'sword');
  const quality = events.find((e) => e.type === 'swordHit').quality;
  assert.equal(hit.amount, swordDamageFor(quality), 'the ordinary curve');
  assert.notEqual(hit.amount, GAME.swordElevated, 'not elevated');
  assert.notEqual(hit.amount, GAME.swordGlance, 'not turned to a glance');
  assert.equal(hit.level, undefined);
  assert.equal(JSON.stringify(b.steel), before, 'the plate holds as it did');
  assert.ok(steelStrength(b.steel, 10.5) > 0.99);
});

test('a Sundering blow on a guard costs it two blows\' worth, and is still one blow', () => {
  const guardCost = (sundering) => {
    const { room, a, b } = duel();
    if (sundering) sunder(room, a);
    setGuard(room, 'b', true, 9.5);
    b.guardStamina = 100;
    room.events.length = 0;
    const events = forehand(room);
    return { spent: 100 - b.guardStamina, events };
  };
  // the strongest ordinary blow a guard can take: clean, at full tilt
  const strongest = guardBlockCost() * (1 + MELEE_CONTACT.impactGuard);
  const ordinary = guardCost(false);
  assert.ok(ordinary.spent <= strongest + 1e-6, `an ordinary blow standing: ${ordinary.spent}`);
  const sundered = guardCost(true);
  assert.ok(Math.abs(sundered.spent - 2 * strongest) < 0.01, `two of the strongest blows: ${sundered.spent} vs ${strongest}`);
  // one blow: one block, no damage, no second swing or hit anywhere
  const blocks = sundered.events.filter((e) => e.type === 'block');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].impacts, ULTIMATES.sunder.guardImpacts);
  assert.equal(sundered.events.filter((e) => e.type === 'swordSwing').length, 1);
  assert.ok(!sundered.events.some((e) => e.type === 'swordHit' || (e.type === 'damage' && e.source === 'sword')));
  // (the guard stops the blade, not the ground it splits: the rupture still runs under them)
  assert.deepEqual(sundered.events.filter((e) => e.type === 'damage').map((e) => e.source), ['rupture']);
});

test('stagger builds with blows and drains away once nothing shakes the knight', () => {
  const { room, b } = duel();
  place(b, 0);
  const landed = forehand(room).find((e) => e.type === 'damage').at;
  const after = b.stagger.level;
  assert.ok(after > 0, 'a blow shakes them');
  run(room, 10.56, landed + STAGGER.holdSec - 0.05);
  assert.equal(b.stagger.level, after, 'it holds for a moment');
  run(room, landed + STAGGER.holdSec, 13);
  assert.equal(b.stagger.level, 0, 'then drains away');
  // blow on blow, it builds
  const { room: again, b: b2 } = duel();
  place(b2, 0);
  forehand(again);
  const one = b2.stagger.level;
  beginAttack(again, 'a', 10.56);
  run(again, 10.56, 11.3);
  assert.ok(b2.stagger.level > one, 'a second blow adds to the first');
});

test('a full meter breaks the knight\'s balance once: staggered briefly, left well down (not reset), and not broken again straight away', () => {
  const { room, b } = duel();
  let calls = 0;
  while (!room.events.some((e) => e.type === 'staggerBreak') && calls < 50) { staggerBy(room, b, 15, 10); calls += 1; }
  assert.ok(Math.abs(b.staggerUntil - (10 + STAGGER.breakSec)) < 1e-9, 'staggered for a moment');
  assert.ok(STAGGER.breakSec >= 0.8 && STAGGER.breakSec <= 1.2);
  assert.ok(b.stagger.level > 0 && b.stagger.level <= STAGGER.max * 0.35, `dropped well down, not to nothing (${b.stagger.level})`);
  assert.equal(b.guarding, false);
  // the blows that follow add less, and cannot break it again while it recovers
  const level = b.stagger.level;
  for (let i = 0; i < 10; i += 1) staggerBy(room, b, 15, 10.2);
  assert.equal(room.events.filter((e) => e.type === 'staggerBreak').length, 1, 'one break');
  assert.ok(b.stagger.level <= Math.min(STAGGER.max, level + 10 * 15 * STAGGER.recoverGain) + 1e-9);
});

test('a guard held up gets its stamina back once the pressure lets up; blow after blow on it, it does not', () => {
  const { room, b } = duel();
  setGuard(room, 'b', true, 9);
  b.guardStamina = 40;
  b.lastGuardDrainAt = 9;
  run(room, 9, 11);
  assert.ok(b.guarding, 'still guarding');
  assert.ok(b.guardStamina > 40, `back behind the raised guard (${b.guardStamina.toFixed(1)})`);
  // pressure kept on it: a blow every half second
  const pressed = duel();
  setGuard(pressed.room, 'b', true, 9);
  pressed.b.guardStamina = 60;
  let lowest = 60;
  for (let t = 9; t < 11; t += 0.5) {
    pressed.b.lastGuardDrainAt = t;
    pressed.b.guardStamina -= 1;
    run(pressed.room, t, t + 0.49);
    lowest = Math.max(lowest, pressed.b.guardStamina);
  }
  assert.ok(pressed.b.guardStamina <= 60, 'no stamina back while the pressure goes on');
});

test('the ultimate is committed only after its brace: interrupted before it, the charge is kept and a moment must pass', () => {
  const { room, a } = duel();
  a.prowess = PROWESS.full;
  assert.ok(tryUltimate(room, 'a', 9));
  // a broken balance during the brace
  for (let i = 0; i < 12; i += 1) staggerBy(room, a, 15, 9.2);
  run(room, 9.2, 9.3);
  assert.equal(a.ultimateState, null, 'interrupted');
  assert.equal(a.prowess, PROWESS.full, 'the charge kept');
  assert.ok(room.events.some((e) => e.type === 'ultimateInterrupted'));
  assert.equal(tryUltimate(room, 'a', 10.4), false, 'not straight away');
  assert.ok(tryUltimate(room, 'a', 9.3 + ULTIMATES.sunder.lockoutSec + 0.1), 'after the moment');
  run(room, 11.9, 11.9 + ULTIMATES.sunder.startupSec + 0.05);
  assert.equal(a.ultimateState.phase, 'active');
  assert.equal(a.prowess, 0, 'spent at the commit');
});

test('prowess: earned by fighting, kept through a death, never for an ultimate\'s own damage, and none in the Practice Yard', () => {
  const { room, a, b } = duel();
  applyDamage(room, 'a', 'b', 20, 'sword', 10);
  assert.ok(Math.abs(a.prowess - 20 * PROWESS.dealt) < 1e-9, 'dealing');
  assert.ok(Math.abs(b.prowess - 20 * PROWESS.taken) < 1e-9, 'taking, less');
  assert.ok(PROWESS.taken < PROWESS.dealt);
  applyDamage(room, 'a', 'a', 10, 'abyss', 10.1);
  assert.ok(Math.abs(a.prowess - 20 * PROWESS.dealt) < 1e-9, 'nothing for hurting oneself');
  const before = a.prowess;
  applyDamage(room, 'a', 'b', 20, 'sword', 10.2, null, { ultimate: true });
  assert.equal(a.prowess, before, 'an ultimate does not pay for the next');
  // a death does not empty it; a meter holds one ultimate at most
  b.prowess = 60;
  applyDamage(room, 'a', 'b', 200, 'sword', 10.3);
  assert.equal(b.alive, false);
  assert.ok(b.prowess >= 60);
  run(room, 10.3, 14);
  assert.ok(b.alive && b.prowess >= 60, 'kept through the respawn');
  a.prowess = 95;
  applyDamage(room, 'a', 'b', 50, 'sword', 14.5);
  assert.equal(a.prowess, PROWESS.full);
  const practice = duel({ mode: 'PRACTICE' });
  applyDamage(practice.room, 'a', 'b', 30, 'sword', 10);
  assert.equal(practice.a.prowess ?? 0, 0);
});

test('Sundering, every strike is a slam into the ground, aimed level; an ordinary chop never ruptures it', () => {
  const swing = ({ sundering, pitch, chain = false }) => {
    const { room, a, b } = duel();
    place(b, 0, 9);   // well away
    if (sundering) sunder(room, a);
    a.pitch = pitch; a.input.pitch = pitch;
    room.events.length = 0;
    beginAttack(room, 'a', 10);
    if (chain) return run(room, 10, 12);
    run(room, 10, 10.55);
    endAttack(room, 'a', 10.55);
    return room.events;
  };
  for (const pitch of [0, 0.3, -0.45]) {
    const events = swing({ sundering: true, pitch });
    assert.ok(events.some((e) => e.type === 'groundStrike'), `the forehand slams the ground (aimed ${pitch})`);
    assert.ok(events.some((e) => e.type === 'rupture'));
    assert.ok(!events.some((e) => e.type === 'swordMiss'), 'the ground took it: no miss');
  }
  assert.ok(!swing({ sundering: false, pitch: -0.45, chain: true }).some((e) => e.type === 'rupture' || e.type === 'groundStrike'), 'nor an ordinary chain, aimed down');
});

test('a slam goes through the knight it strikes and on into the ground: its rupture catches them too, and the next', () => {
  const { room, a, b } = duel({ third: true });
  const c = room.players.get('c');
  sunder(room, a);
  place(b, 0, 1.8);
  Object.assign(c.position, { x: 4.5, y: 0, z: 0 });
  c.history = [];
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  run(room, 10, 10.55);
  endAttack(room, 'a', 10.55);
  run(room, 10.56, 12);
  const damage = room.events.filter((e) => e.type === 'damage');
  assert.deepEqual(damage.filter((e) => e.victimId === 'b').map((e) => e.source), ['sword', 'rupture'], 'b: the sword, then the ground under them');
  assert.deepEqual(damage.filter((e) => e.victimId === 'c').map((e) => e.source), ['rupture'], 'c: the ground');
  assert.equal(room.events.find((e) => e.type === 'groundStrike').through, 'b');
  assert.ok(damage.filter((e) => e.source === 'rupture').every((e) => e.amount === RUPTURE.damage && e.ultimate));
});

test('a knight who stays where the ground splits again and again is caught by every rupture (the warning is to move)', () => {
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 4.5);
  room.events.length = 0;
  const pin = () => { Object.assign(b.position, { x: 4.5, y: 0, z: 0 }); b.velocity = { x: 0, y: 0, z: 0 }; b.impulse = { x: 0, z: 0 }; b.grounded = true; b.health = 100; };
  beginAttack(room, 'a', 10);
  for (let now = 10; now <= 13 + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
  const ruptures = room.events.filter((e) => e.type === 'rupture').length;
  const caught = room.events.filter((e) => e.type === 'damage' && e.source === 'rupture');
  assert.ok(ruptures >= 3, `every strike ruptured (${ruptures})`);
  assert.equal(caught.length, ruptures, `caught by ${caught.length} of ${ruptures}: none passes over them`);
  // (but each rupture once: its three fissures are one rupture)
  assert.equal(new Set(caught.map((e) => e.at)).size, caught.length);
});

test('struck by the slam and standing where it splits the ground, a knight takes both: the sword and the rupture', () => {
  for (const distance of [0.6, 0.9, 1.2, 1.8, 2.4]) {
    const { room, a, b } = duel();
    sunder(room, a);
    place(b, 0, distance);
    room.events.length = 0;
    const pin = () => { place(b, 0, distance); b.velocity = { x: 0, y: 0, z: 0 }; b.impulse = { x: 0, z: 0 }; b.grounded = true; };
    beginAttack(room, 'a', 10);
    for (let now = 10; now <= 10.55 + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
    endAttack(room, 'a', 10.55);
    run(room, 10.56, 11.5);
    const sources = room.events.filter((e) => e.type === 'damage' && e.victimId === 'b').map((e) => e.source);
    assert.deepEqual(sources, ['sword', 'rupture'], `at ${distance} m`);
  }
});

test('a knight pressed close beside the slam is struck; further off it is as narrow a cut as ever', () => {
  const struck = (deg, distance) => {
    const { room, a, b } = duel();
    sunder(room, a);
    room.events.length = 0;
    beginAttack(room, 'a', 10);
    for (let now = 10; now <= 10.55 + 1e-9; now += 0.01) { place(b, deg, distance); stepRoom(room, 0.01, now, openWorld); }
    return room.events.some((e) => e.type === 'damage' && e.victimId === 'b' && e.source === 'sword');
  };
  // pressed against the shoulder, well off the aim: struck
  for (const deg of [-45, 45]) assert.equal(struck(deg, 0.9), true, `${deg} degrees, close`);
  // at reach, off the aim: the slam is still narrow
  assert.equal(struck(20, 2.2), false, 'not a broad sweep');
  assert.equal(struck(40, 1.6), false);
});

test('a rupture runs along the ground, never through what stands on it, and catches whoever stands on its line', () => {
  const walled = { ...openWorld, solids: [{ id: 'wall', center: [3, 1.5, 0], size: [0.5, 3, 6] }] };
  const fissures = planRupture(walled, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 });
  assert.equal(fissures.length, RUPTURE.count);
  for (const fissure of fissures) assert.ok(fissure.dir.x * fissure.length <= 2.75, `stopped at the wall's foot (${fissure.length.toFixed(2)})`);
  // over a drop it stops at the edge
  const edge = { ...openWorld, floors: [{ id: 'ledge', center: [0, -0.1, 0], size: [4, 0.2, 4], y: 0 }] };
  for (const fissure of planRupture(edge, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 })) assert.ok(fissure.length <= 2.3);
  // live: a knight beyond the wall is untouched, one in the open is caught (and one in the air clears it)
  const strike = (world, target) => {
    const { room, a, b } = duel();
    sunder(room, a);
    Object.assign(b.position, target);
    b.history = [];
    room.events.length = 0;
    // one slam, and its fissures left to run
    beginAttack(room, 'a', 10);
    run(room, 10, 10.55, world);
    endAttack(room, 'a', 10.55);
    run(room, 10.56, 12, world);
    return room.events.filter((e) => e.type === 'damage' && e.source === 'rupture');
  };
  assert.equal(strike(openWorld, { x: 4.5, y: 0, z: 0 }).length, 1, 'caught in the open');
  assert.equal(strike(walled, { x: 4.5, y: 0, z: 0 }).length, 0, 'not through the wall');
  // one in the air as it passes clears it (a jump is the counter)
  const fissure = planRupture(openWorld, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 })[1];   // (the middle one: straight on)
  assert.ok(fissureCatches({ x: 0, y: 0, z: 0 }, fissure, 2, 3, { x: 2.5, y: 0, z: 0 }), 'on the ground');
  assert.ok(!fissureCatches({ x: 0, y: 0, z: 0 }, fissure, 2, 3, { x: 2.5, y: RUPTURE.airborne + 0.1, z: 0 }), 'in the air');
});

test('nothing is left to chance: no random roll anywhere in how a blow, a stagger, a rupture or an ultimate resolves', () => {
  for (const file of ['../../shared/src/combat.mjs', '../../shared/src/stagger.mjs', '../../shared/src/prowess.mjs',
    '../../shared/src/ultimates.mjs', '../../shared/src/rupture.mjs', '../../shared/src/blade.mjs']) {
    assert.ok(!/Math\.random/.test(readFileSync(new URL(file, import.meta.url), 'utf8')), file);
  }
  const amounts = new Set();
  for (let i = 0; i < 5; i += 1) {
    const { room, a } = duel();
    sunder(room, a);
    room.events.length = 0;
    amounts.add(forehand(room).find((e) => e.type === 'damage').amount);
  }
  assert.deepEqual([...amounts], [GAME.swordElevated]);
  assert.ok(Math.abs(aimQuality(0) - 1) < 1e-9 && closingImpact(0) === 0);
  void tryCastSpell;
});

test('the host says who broke a knight\'s balance, and whether a fall lost the match (for the voice)', () => {
  const { room, a, b } = duel();
  place(b, 0);
  b.stagger = { level: STAGGER.max - 1, recoverUntil: -Infinity, lastAt: 10 };
  const broke = forehand(room).find((e) => e.type === 'staggerBreak');
  assert.equal(broke?.by, 'a');
  // the winning kill: the fall that lost it is decisive; an ordinary one is not
  const decide = (score) => {
    const duelled = duel();
    duelled.room.scoreToWin = score;
    applyDamage(duelled.room, 'a', 'b', 200, 'sword', 10);
    return duelled.room.events.find((e) => e.type === 'death');
  };
  assert.equal(decide(1).decisive, true);
  assert.equal(decide(5).decisive, undefined);
});

test('the host says when a knight fell with their plate still hardened', () => {
  const fall = (steel) => {
    const { room, b } = duel();
    if (steel) b.steel = { calledAt: 9.9, fullUntil: 14.9, struck: false };
    applyDamage(room, 'a', 'b', 500, 'rupture', 10);
    return room.events.find((e) => e.type === 'death');
  };
  assert.equal(fall(true).steeled, true);
  assert.equal(fall(false).steeled, undefined);
});

// --- what stops a Sundering blade -------------------------------------------------------------------------------

// one slam from a (Sundering) at 10 s, with `solids` in the world; the events of it
function slamInto(solids, { withB = null } = {}) {
  const { room, a, b } = duel();
  place(b, 0, withB ?? 9);
  sunder(room, a);
  room.events.length = 0;
  const world = { ...openWorld, solids };
  beginAttack(room, 'a', 10);
  const events = run(room, 10, 10.55, world);
  endAttack(room, 'a', 10.55);
  return { events, b };
}

test('a Sundering blow is not caught by what it only brushes: a loose furnishing in its way, or something off its aim, never stops it', () => {
  // a barrel standing in front of the slam (a small loose furnishing: shared/worlds/props.mjs marks them incidental)
  const barrel = { id: 'barrel', center: [1.4, 0.42, 0], size: [0.64, 0.84, 0.64], material: 'timber', incidental: true };
  const past = slamInto([barrel]).events;
  assert.ok(!past.some((e) => e.type === 'swordWorldImpact'), 'the barrel does not stop it');
  assert.ok(past.some((e) => e.type === 'groundStrike') && past.some((e) => e.type === 'rupture'), 'it goes on into the ground');
  // a beam overhead in front: the blade passes it well above where the slam is driven (an ordinary blade would be stopped)
  const beam = { id: 'beam', center: [1.5, 1.75, 0], size: [0.3, 0.2, 3], material: 'timber' };
  const under = slamInto([beam]).events;
  assert.ok(!under.some((e) => e.type === 'swordWorldImpact'), 'the beam it brushes on the way down does not stop it');
  assert.ok(under.some((e) => e.type === 'groundStrike'));
  // the same blade, swept as an ordinary chop, is stopped by both (the ordinary rule is as it was)
  const eye = { x: 0, y: 1.35, z: 0 };
  const frame = aimFrame(-Math.PI / 2, ULTIMATES.sunder.slamPitch);
  const chop = (solids, options = {}) => {
    let from = bladeDirection(2, -MELEE_CONTACT.window.early, frame);
    for (let dt = -MELEE_CONTACT.window.early + 0.01; dt <= MELEE_CONTACT.window.late + 1e-9; dt += 0.01) {
      const to = bladeDirection(2, dt, frame);
      const met = sweepBlade(eye, from, to, [], solids, { aim: frame.forward, ...options });
      if (met) return met;
      from = to;
    }
    return null;
  };
  assert.equal(chop([beam])?.kind, 'solid', 'an ordinary chop is stopped by the beam');
  assert.equal(chop([barrel])?.kind, 'solid', 'and by the barrel');
  const sundering = { blade: { ...BLADE, worldStopDeg: ULTIMATES.sunder.worldStopDeg }, spares: (solid) => Boolean(solid.incidental) };
  assert.equal(chop([beam], sundering), null);
  assert.equal(chop([barrel], sundering), null);
  assert.ok(ULTIMATES.sunder.worldStopDeg < BLADE.worldStopDeg);
});

test('driven straight into a wall, a Sundering blow is still stopped by it; and nobody behind a wall is struck', () => {
  const wall = { id: 'wall', center: [1.3, 1.5, 0], size: [0.4, 3, 6], material: 'stone' };
  const { events, b } = slamInto([wall], { withB: 2.2 });
  assert.ok(events.some((e) => e.type === 'swordWorldImpact' && e.surfaceId === 'wall'), 'the wall dead ahead stops it');
  assert.ok(!events.some((e) => e.type === 'groundStrike' || e.type === 'rupture'), 'and it never reaches the ground');
  assert.ok(!events.some((e) => e.type === 'swordHit'), 'b, behind the wall, is not struck');
  assert.equal(b.health, 100);
  // a loose furnishing spares nobody either: it still hides whoever stands behind it
  const crate = { id: 'crate', center: [1.2, 0.9, 0], size: [0.7, 1.8, 0.7], material: 'timber', incidental: true };
  const hidden = slamInto([crate], { withB: 2.0 });
  assert.ok(!hidden.events.some((e) => e.type === 'swordHit'), 'b, behind the crate, is not struck through it');
});

// --- a Sundering blow ends what its victim was doing -------------------------------------------------------------

// a Sundering; b 1.8 m in front; a's first slam lands on b at about 10.4 s. `before(room, b)` sets b doing something
function struckWhile(before, { until = 10.6, at = 10.25 } = {}) {
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  let done = false;
  for (let now = 10; now <= until + 1e-9; now += 0.01) {
    if (!done && now >= at) { before(room, b, now); done = true; }
    stepRoom(room, 0.01, now, openWorld);
  }
  endAttack(room, 'a', until);
  const hit = room.events.find((e) => e.type === 'swordHit' && e.targetId === 'b');
  assert.ok(hit && hit.level === 'elevated', 'the Sundering blow landed');
  const cut = room.events.find((e) => e.type === 'actionInterrupted' && e.playerId === 'b');
  return { room, a, b, hit, cut };
}

test('a Sundering blow on a body ends a spell being gathered: it is lost, and never flies', () => {
  const { room, b, cut } = struckWhile((r, knight, now) => {
    knight.spellReadyAt = 0;
    knight.spell = 'fireball';
    // (b turns its palm on a, and is struck before the gather ends)
    assert.equal(tryCastSpell(r, 'b', { x: -1, y: 0, z: 0 }, now + 0.13), true);
  });
  assert.ok(cut && cut.what.includes('spell') && cut.by === 'a');
  assert.equal(b.pendingSpell, null);
  assert.equal(room.events.some((e) => e.type === 'projectileSpawned' && e.projectile.ownerId === 'b'), false);
});

test('it ends a sword chain under way, a fist already thrown, a dash and a sprint', () => {
  const sword = struckWhile((r, knight, now) => { beginAttack(r, 'b', now); });
  assert.ok(sword.cut.what.includes('sword'));
  assert.equal(sword.b.attackActive, false);
  assert.equal(sword.b.attackSweep, null);
  assert.equal(sword.room.events.some((e) => e.type === 'swordHit' && e.playerId === 'b'), false, 'its own blow never lands');

  const fist = struckWhile((r, knight, now) => {
    // (thrown just before the blow lands: it would have landed after it)
    assert.equal(tryGauntletStrike(r, 'b', now + 0.1), true);
  });
  assert.ok(fist.cut.what.includes('gauntlet'));
  assert.equal(fist.b.gauntlet, null);
  assert.equal(fist.room.events.some((e) => e.type === 'gauntletHit' || e.type === 'gauntletMiss'), false, 'it never lands');

  const dash = struckWhile((r, knight, now) => {
    knight.dashReadyAt = 0;
    // (straight at a, a moment before the blow: the blade still meets them, mid-dash)
    assert.equal(tryDash(r, 'b', { x: -1, z: 0 }, now), true);
  }, { at: 10.3 });
  assert.ok(dash.cut.what.includes('dash'));
  assert.ok(dash.b.dashUntil <= dash.hit.at + 1e-9, 'the dash ends where it was struck');

  // (b at a full sprint at a: the blow takes the speed it had built; it may begin again, from nothing)
  const sprint = struckWhile((r, knight) => {
    knight.input = { forward: 1, right: 0, jump: false, sprint: true, yaw: knight.yaw, pitch: 0 };
    knight.sprinting = true;
    knight.sprintBlend = 1;
  }, { until: 10.4 });
  assert.ok(sprint.cut.what.includes('sprint'));
  assert.ok(sprint.b.sprintBlend < 0.3, `its speed is gone: ${sprint.b.sprintBlend.toFixed(2)}`);
});

test('it interrupts an ultimate still being braced into (the charge kept, the usual lockout); one already committed is not undone', () => {
  const bracing = struckWhile((r, knight, now) => {
    knight.prowess = PROWESS.full;
    assert.equal(tryUltimate(r, 'b', now), true);
  });
  assert.ok(bracing.cut.what.includes('ultimate'));
  assert.equal(bracing.b.ultimateState, null);
  assert.equal(bracing.b.prowess, PROWESS.full, 'the charge is kept');
  const interrupted = bracing.room.events.find((e) => e.type === 'ultimateInterrupted' && e.playerId === 'b');
  assert.ok(interrupted && Math.abs(interrupted.at - bracing.hit.at) < 1e-9, 'there and then');
  assert.ok(bracing.b.ultimateLockedUntil > bracing.hit.at + 1);
  // committed: b is Sundering too (its own chain is cut short, as any sword chain is; its Sunder is not taken away)
  const { room, a, b } = duel();
  place(b, 0, 1.8);
  b.prowess = PROWESS.full;
  a.prowess = PROWESS.full;
  assert.ok(tryUltimate(room, 'a', 9) && tryUltimate(room, 'b', 9));
  run(room, 9, 9 + ULTIMATES.sunder.startupSec + 0.02);
  assert.equal(b.ultimateState?.phase, 'active');
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  run(room, 10, 10.6);
  assert.ok(room.events.some((e) => e.type === 'swordHit' && e.targetId === 'b' && e.level === 'elevated'));
  assert.equal(b.ultimateState?.phase, 'active', 'still Sundering');
  assert.ok(b.prowess < PROWESS.full * 0.2, 'and its charge is not handed back (only what the blow itself earns the one struck)');
  assert.equal(room.events.some((e) => e.type === 'ultimateInterrupted'), false);
});

test('only a Sundering blow on the body does it: not an ordinary blow, not one caught on a guard, not one met by hardened plate', () => {
  // an ordinary blow leaves a gathering spell alone
  const plain = duel();
  place(plain.b, 0, 1.8);
  plain.b.spell = 'gale';
  plain.b.spellReadyAt = 0;
  beginAttack(plain.room, 'a', 10);
  let cast = false;
  for (let now = 10; now <= 10.5 + 1e-9; now += 0.01) {
    if (!cast && now >= 10.2) { cast = tryCastSpell(plain.room, 'b', { x: -1, y: 0, z: 0 }, now); }
    stepRoom(plain.room, 0.01, now, openWorld);
  }
  assert.ok(plain.room.events.some((e) => e.type === 'swordHit' && e.targetId === 'b'));
  assert.equal(plain.room.events.some((e) => e.type === 'actionInterrupted'), false);
  assert.ok(plain.b.pendingSpell, 'the gather goes on');
  // caught on a guard: a block, and nothing cut short
  const guarded = struckOnGuard();
  assert.equal(guarded.some((e) => e.type === 'actionInterrupted'), false);
  // met by hardened plate (an ordinary blow by ordinary rules): nothing cut short
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  b.spell = 'steel';
  b.spellReadyAt = 0;
  assert.equal(tryCastSpell(room, 'b', { x: -1, y: 0, z: 0 }, 10.05), true);
  b.sprinting = true; b.sprintBlend = 1;
  room.events.length = 0;
  beginAttack(room, 'a', 10.06);
  run(room, 10.06, 10.6);
  assert.ok(room.events.some((e) => e.type === 'swordHit' && e.sunderMet));
  assert.equal(room.events.some((e) => e.type === 'actionInterrupted'), false);
});

function struckOnGuard() {
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  setGuard(room, 'b', true, 9);
  b.sprintBlend = 0.5;
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  run(room, 10, 10.5);
  assert.ok(room.events.some((e) => e.type === 'block' || e.type === 'guardBreak'));
  return room.events;
}

// --- the rupture's part in a broken balance -----------------------------------------------------------------------

test('a Sundering blow and the ground it splits are most of a balance between them, and the next blow tips it', () => {
  assert.ok(RUPTURE.stagger >= 36 && RUPTURE.stagger <= 40);
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  room.events.length = 0;
  const pin = () => { Object.assign(b.position, { x: 1.8, y: 0, z: 0 }); b.velocity = { x: 0, y: 0, z: 0 }; b.impulse = { x: 0, z: 0 }; b.grounded = true; b.health = 100; };
  beginAttack(room, 'a', 10);
  // the first slam and its rupture
  for (let now = 10; now <= 10.75 + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
  assert.ok(room.events.some((e) => e.type === 'damage' && e.source === 'rupture' && e.victimId === 'b'));
  assert.equal(room.events.some((e) => e.type === 'staggerBreak'), false, 'one slam alone does not break a fresh balance');
  assert.ok(Math.abs(b.stagger.level - (ULTIMATES.sunder.stagger + RUPTURE.stagger)) < 1e-6, `it holds: ${b.stagger.level}`);
  assert.ok(b.stagger.level >= 0.7 * STAGGER.max, 'most of a balance');
  // the slams go on: the balance breaks, and who broke it is said
  for (let now = 10.76; now <= 12 + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
  const broke = room.events.find((e) => e.type === 'staggerBreak' && e.playerId === 'b');
  assert.ok(broke && broke.by === 'a', 'a real break');
  assert.ok(broke.at <= 11.15, `by the next slam: ${broke.at.toFixed(2)}`);
});

test('the ground alone, split under a knight again and again, breaks a balance by the third time (it took five)', () => {
  // (what the rupture adds, with the hold and the drain between catches a slam apart)
  const between = 0.7;
  const stagger = { level: 0, shakenAt: -Infinity, recoverUntil: -Infinity };
  let breaks = 0;
  let catches = 0;
  for (let now = 0; now < 3 - 1e-9 && !breaks; now += between) {
    // (drained since the last catch: nothing while it holds, then steadily)
    const idle = Math.max(0, between - STAGGER.holdSec);
    stagger.level = Math.max(0, stagger.level - (catches ? STAGGER.drainPerSec * idle : 0));
    catches += 1;
    stagger.level += RUPTURE.stagger;
    if (stagger.level >= STAGGER.max) breaks += 1;
  }
  assert.equal(breaks, 1);
  assert.equal(catches, 3);
});

test('a broken balance is still not broken again straight away, however the slams and ruptures go on', () => {
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  room.events.length = 0;
  const pin = () => { Object.assign(b.position, { x: 1.8, y: 0, z: 0 }); b.velocity = { x: 0, y: 0, z: 0 }; b.impulse = { x: 0, z: 0 }; b.grounded = true; b.health = 100; };
  beginAttack(room, 'a', 10);
  for (let now = 10; now <= 9 + ULTIMATES.sunder.startupSec + ULTIMATES.sunder.activeSec + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
  const breaks = room.events.filter((e) => e.type === 'staggerBreak' && e.playerId === 'b');
  assert.ok(breaks.length >= 1);
  for (let i = 1; i < breaks.length; i += 1) {
    assert.ok(breaks[i].at - breaks[i - 1].at >= STAGGER.breakSec + STAGGER.recoverSec - 1e-6, `breaks ${(breaks[i].at - breaks[i - 1].at).toFixed(2)} s apart`);
  }
  // and between breaks they have their feet: staggered for about a second each time, no longer
  const staggered = breaks.reduce((sum, e) => sum + (e.until - e.at), 0);
  const span = 9 + ULTIMATES.sunder.startupSec + ULTIMATES.sunder.activeSec - 10;
  assert.ok(staggered <= span * 0.4, `staggered ${staggered.toFixed(2)} s of ${span.toFixed(1)} s under constant slams`);
});

// --- the heaviest single contact: its own stagger, a brief reel, and a perfect guard that still turns it ----------

test('a Sundering blow on the body shakes a balance by about forty; an ordinary blow, or one met by hardened plate, as ever', () => {
  assert.ok(ULTIMATES.sunder.stagger >= 38 && ULTIMATES.sunder.stagger <= 42);
  // (b held off the ground a's blade splits, so only the blow itself is counted)
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 1.8);
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  let level = null;
  for (let now = 10; now <= 10.45 + 1e-9; now += 0.01) {
    stepRoom(room, 0.01, now, openWorld);
    if (level === null && room.events.some((e) => e.type === 'swordHit')) level = b.stagger.level;
  }
  assert.equal(level, ULTIMATES.sunder.stagger);
  // an ordinary blow at its very best is still an ordinary blow
  const plain = duel();
  forehand(plain.room);
  assert.ok(plain.b.stagger.level <= STAGGER.gain.sword + 1e-9);
  // hardened plate: an ordinary blow by ordinary rules, and no reel
  const steeled = duel();
  sunder(steeled.room, steeled.a);
  place(steeled.b, 0, 1.8);
  steeled.b.spell = 'steel';
  steeled.b.spellReadyAt = 0;
  assert.equal(tryCastSpell(steeled.room, 'b', { x: -1, y: 0, z: 0 }, 10.05), true);
  steeled.room.events.length = 0;
  beginAttack(steeled.room, 'a', 10.06);
  let met = null;
  for (let now = 10.06; now <= 10.5 + 1e-9; now += 0.01) {
    stepRoom(steeled.room, 0.01, now, openWorld);
    if (!met && steeled.room.events.some((e) => e.type === 'swordHit' && e.sunderMet)) met = { level: steeled.b.stagger.level, staggerUntil: steeled.b.staggerUntil, at: now };
  }
  assert.ok(met && met.level <= STAGGER.gain.sword + 1e-9, 'no more than an ordinary blow');
  assert.ok(!(met.staggerUntil > met.at), 'and nothing reels');
});

test('struck by it, a knight reels for a moment: what they were doing is over and nothing new begins, then they have their hands again', () => {
  assert.ok(ULTIMATES.sunder.reelSec >= 0.2 && ULTIMATES.sunder.reelSec <= 0.25);
  const { room, b, hit, cut } = struckWhile(() => {}, { until: 10.34 });
  assert.ok(cut, 'said even when nothing was under way (the reel itself)');
  assert.ok(Math.abs(cut.reelUntil - (hit.at + ULTIMATES.sunder.reelSec)) < 1e-9);
  const during = hit.at + ULTIMATES.sunder.reelSec * 0.5;
  b.spellReadyAt = 0; b.dashReadyAt = 0;
  assert.equal(beginAttack(room, 'b', during), false, 'no swing');
  assert.equal(tryCastSpell(room, 'b', { x: -1, y: 0, z: 0 }, during), false, 'no spell');
  assert.equal(tryDash(room, 'b', { x: 0, z: 1 }, during), false, 'no dash');
  assert.equal(tryGauntletStrike(room, 'b', during), false, 'no fist');
  // a quarter of a second, not a stun: then all of it again
  const after = hit.at + ULTIMATES.sunder.reelSec + 0.02;
  assert.equal(tryDash(room, 'b', { x: 0, z: 1 }, after), true);
  assert.equal(beginAttack(room, 'b', after), true);
  // a knight whose own ultimate is committed reels too (their Sunder is not taken from them)
  const both = duel();
  place(both.b, 0, 1.8);
  both.a.prowess = PROWESS.full; both.b.prowess = PROWESS.full;
  assert.ok(tryUltimate(both.room, 'a', 9) && tryUltimate(both.room, 'b', 9));
  run(both.room, 9, 9 + ULTIMATES.sunder.startupSec + 0.02);
  both.room.events.length = 0;
  beginAttack(both.room, 'a', 10);
  run(both.room, 10, 10.36);
  const struck = both.room.events.find((e) => e.type === 'swordHit' && e.targetId === 'b');
  assert.ok(struck && both.b.staggerUntil >= struck.at + ULTIMATES.sunder.reelSec - 1e-9);
  assert.equal(both.b.ultimateState?.phase, 'active');
});

test('a perfect guard still turns a Sundering blow; the Sundering knight is staggered for less than an ordinary one', () => {
  assert.ok(ULTIMATES.sunder.parriedSec >= 0.35 && ULTIMATES.sunder.parriedSec <= 0.45);
  assert.ok(ULTIMATES.sunder.parriedSec < GAME.parryStaggerMs / 1000);
  const parried = (sundering) => {
    const { room, a, b } = duel();
    if (sundering) sunder(room, a);
    place(b, 0, 1.8);
    room.events.length = 0;
    beginAttack(room, 'a', 10);
    let raised = false;
    for (let now = 10; now <= 10.6 + 1e-9; now += 0.01) {
      // (the guard raised just as the blade arrives)
      if (!raised && now >= 10.27) { raised = setGuard(room, 'b', true, now); }
      stepRoom(room, 0.01, now, openWorld);
    }
    const parry = room.events.find((e) => e.type === 'parry');
    assert.ok(parry, `${sundering ? 'Sundering' : 'ordinary'}: parried`);
    assert.equal(room.events.some((e) => e.type === 'damage' && e.source === 'sword' && e.victimId === 'b'), false, 'the blow is stopped');
    return { held: a.staggerUntil - parry.at, room, a };
  };
  const ordinary = parried(false);
  const sunderer = parried(true);
  assert.ok(Math.abs(ordinary.held - GAME.parryStaggerMs / 1000) < 1e-9, 'an ordinary sword as ever');
  assert.ok(Math.abs(sunderer.held - ULTIMATES.sunder.parriedSec) < 1e-9, `${sunderer.held.toFixed(2)} s`);
  assert.equal(sunderer.a.attackActive, false, 'the chain is stopped all the same');
  assert.equal(sunderer.a.ultimateState?.phase, 'active');
});

// --- torn ground ----------------------------------------------------------------------------------------------------

// a's Sundering slam at 10 s splits the ground along +x (its middle fissure runs from about x = 2 out to its reach);
// b far off to the side until asked for. Returns once the fissures have stopped running
function tornGround() {
  const { room, a, b } = duel({ third: true });
  sunder(room, a);
  Object.assign(b.position, { x: 0, y: 0, z: 25 });
  b.history = [];
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  run(room, 10, 10.55);
  endAttack(room, 'a', 10.55);
  const rupture = room.events.find((e) => e.type === 'rupture');
  assert.ok(rupture, 'the ground split');
  const middle = rupture.fissures.find((f) => Math.abs(f.dir.z) < 1e-6);
  run(room, 10.56, rupture.at + middle.length / RUPTURE.speed + 0.1);
  // a place well along the middle fissure
  const on = { x: rupture.origin.x + middle.length * 0.6, y: 0, z: rupture.origin.z };
  return { room, a, b, rupture, middle, on, stoppedBy: rupture.at + middle.length / RUPTURE.speed + 0.1 };
}

const sprintAlong = (knight, yaw = -Math.PI / 2) => { knight.input = { forward: 1, right: 0, jump: false, sprint: true, crouch: false, yaw, pitch: 0 }; knight.yaw = yaw; };

test('a knight sprinting onto ground an enemy\'s Sunder has torn stops sprinting, and cannot sprint again while their feet are on it', () => {
  const { room, b, on, stoppedBy } = tornGround();
  Object.assign(b.position, on);
  b.grounded = true;
  b.sprinting = true;
  b.sprintBlend = 1;
  sprintAlong(b);
  b.guardStamina = 100;
  stepRoom(room, 0.01, stoppedBy + 0.01, openWorld);
  assert.equal(b.tornGround, true);
  assert.equal(b.sprinting, false, 'the sprint ends at once');
  assert.equal(b.sprintBlend, 0, 'and its speed with it');
  assert.equal(serializeSnapshot(room, stoppedBy + 0.01).players.find((p) => p.id === 'b').tornGround, true, 'their own view is told');
  // held on it, the sprint never comes back; but they run as ever
  let ran = 0;
  let sprinted = false;
  for (let now = stoppedBy + 0.02; now <= stoppedBy + 0.5; now += 0.01) {
    const before = b.position.x;
    Object.assign(b.position, { z: on.z, x: Math.min(b.position.x, on.x + 0.5) });
    stepRoom(room, 0.01, now, openWorld);
    if (b.sprinting) sprinted = true;
    ran = Math.max(ran, Math.hypot(b.velocity.x, b.velocity.z));
    void before;
  }
  assert.equal(sprinted, false);
  assert.ok(Math.abs(ran - MOVEMENT.runSpeed) < 0.2, `they run at a run: ${ran.toFixed(2)} m/s`);
  assert.ok(ran < SPRINT.speed - 2);
});

test('on torn ground a knight can still dash, and jumping it clears it: in the air over a fissure they are not on it', () => {
  const { room, b, on, stoppedBy } = tornGround();
  Object.assign(b.position, on);
  b.grounded = true;
  sprintAlong(b);
  stepRoom(room, 0.01, stoppedBy + 0.01, openWorld);
  assert.equal(b.tornGround, true);
  b.dashReadyAt = 0;
  assert.equal(tryDash(room, 'b', { x: 0, z: 1 }, stoppedBy + 0.02), true, 'a dash is as ever');
  // sprinting, in the air over it (a jump carried them across): still sprinting
  const over = tornGround();
  Object.assign(over.b.position, { x: over.on.x, y: 1.0, z: over.on.z });
  over.b.grounded = false;
  over.b.velocity = { x: 0, y: 1, z: 0 };
  over.b.sprinting = true;
  over.b.sprintBlend = 1;
  over.b.guardStamina = 100;
  sprintAlong(over.b);
  stepRoom(over.room, 0.01, over.stoppedBy + 0.01, openWorld);
  assert.equal(over.b.tornGround, false);
  assert.equal(over.b.sprinting, true);
  assert.equal(over.b.sprintBlend, 1);
});

test('off the torn ground, or once it has settled, the sprint is theirs again; and the knight who tore it is never slowed by it', () => {
  const { room, a, b, on, stoppedBy } = tornGround();
  // well clear of every fissure: sprinting as ever
  Object.assign(b.position, { x: on.x, y: 0, z: on.z - 7 });
  b.grounded = true;
  b.guardStamina = 100;
  sprintAlong(b);
  run(room, stoppedBy + 0.01, stoppedBy + 0.2, openWorld, 0.01);
  assert.equal(b.tornGround, false);
  assert.equal(b.sprinting, true, 'off it, the sprint begins');
  // its owner, standing on it, sprints
  Object.assign(a.position, on);
  a.grounded = true;
  a.guardStamina = 100;
  sprintAlong(a);
  for (let now = stoppedBy + 0.21; now <= stoppedBy + 0.4; now += 0.01) { Object.assign(a.position, { z: on.z, x: on.x }); stepRoom(room, 0.01, now, openWorld); }
  assert.equal(a.tornGround, false);
  assert.equal(a.sprinting, true, 'their own fissures are no hindrance to them');
  // it settles: this long after its fissures stopped, it is only ground again
  const settled = tornGround();
  const until = settled.stoppedBy + RUPTURE.lastsSec;
  Object.assign(settled.b.position, settled.on);
  settled.b.grounded = true;
  settled.b.guardStamina = 100;
  sprintAlong(settled.b);
  stepRoom(settled.room, 0.01, until - 0.3, openWorld);
  assert.equal(settled.b.tornGround, true, 'still torn a little before');
  for (let now = until + 0.1; now <= until + 0.3; now += 0.01) { Object.assign(settled.b.position, { z: settled.on.z, x: settled.on.x }); stepRoom(settled.room, 0.01, now, openWorld); }
  assert.equal(settled.b.tornGround, false);
  assert.equal(settled.b.sprinting, true);
  assert.equal(settled.room.ruptures.length, 0, 'and the host forgets it');
});

test('torn ground is not a blender: standing on it hurts nobody again, and it is the fissures themselves, not a ring about the blow', () => {
  const { room, b, rupture, middle, on, stoppedBy } = tornGround();
  room.events.length = 0;
  Object.assign(b.position, on);
  b.grounded = true;
  for (let now = stoppedBy + 0.01; now <= stoppedBy + RUPTURE.lastsSec - 0.1; now += 0.02) {
    Object.assign(b.position, on);
    b.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: 0, pitch: 0 };
    stepRoom(room, 0.02, now, openWorld);
    assert.equal(b.tornGround, true);
  }
  assert.equal(room.events.filter((e) => e.type === 'damage').length, 0, 'no damage for standing there');
  assert.equal(room.events.filter((e) => e.type === 'staggerBreak').length, 0);
  assert.equal(b.health, 100);
  // between two fissures (as far from the blow as they were, but on whole ground): not on it
  const side = rupture.fissures.find((f) => f.dir.z > 0.1);
  const between = { x: rupture.origin.x + (middle.dir.x + side.dir.x) / 2 * middle.length * 0.8, y: 0, z: rupture.origin.z + (middle.dir.z + side.dir.z) / 2 * middle.length * 0.8 };
  Object.assign(b.position, between);
  stepRoom(room, 0.01, stoppedBy + 0.2 + RUPTURE.lastsSec * 0, openWorld);
  const fresh = tornGround();
  Object.assign(fresh.b.position, between);
  fresh.b.grounded = true;
  stepRoom(fresh.room, 0.01, fresh.stoppedBy + 0.01, openWorld);
  assert.equal(fresh.b.tornGround, false, 'the gaps between the fissures are whole ground');
  // and past a fissure's end
  Object.assign(fresh.b.position, { x: fresh.rupture.origin.x + fresh.middle.length + 1.2, y: 0, z: fresh.rupture.origin.z });
  stepRoom(fresh.room, 0.01, fresh.stoppedBy + 0.02, openWorld);
  assert.equal(fresh.b.tornGround, false);
  assert.ok(RUPTURE.tornWidth <= RUPTURE.width);
});

// --- the ultimate has the knight from the moment its key is pressed ---------------------------------------------------

test('from rest, Sunder begins at once and nothing swings of itself', () => {
  const { room, a, b } = duel();
  place(b, 0, 9);
  a.prowess = PROWESS.full;
  assert.equal(tryUltimate(room, 'a', 9), true);
  assert.equal(a.ultimateState?.phase, 'startup');
  run(room, 9, 9 + ULTIMATES.sunder.startupSec + 0.6);
  assert.equal(a.ultimateState?.phase, 'active');
  assert.equal(room.events.some((e) => e.type === 'swordSwing'), false);
  assert.equal(a.attackActive, false);
});

// a's attack held (or pressed again, or mid-chain) as the key is pressed at `press`; b in reach. The events from then on
function heldInto({ chainFrom = 8.95, press = 9.0, queued = false, letGoAt = null } = {}) {
  const { room, a, b } = duel();
  place(b, 0, 1.8);
  a.prowess = PROWESS.full;
  beginAttack(room, 'a', chainFrom);
  run(room, chainFrom, press - 0.01, openWorld, 0.01);
  if (queued) beginAttack(room, 'a', press - 0.02);
  // (whatever the old chain did to b is put right: only what follows the key is asked about)
  b.health = 100;
  b.stagger.level = 0;
  b.staggerUntil = -Infinity;
  const before = { active: a.attackActive, wanting: Boolean(a.attackHeld || a.attackQueued), restartAt: a.attackRestartAt };
  room.events.length = 0;
  assert.equal(tryUltimate(room, 'a', press), true, 'the key is taken at once, sword or no sword');
  const taken = { active: a.attackActive, sweep: a.attackSweep, held: a.attackHeld, state: a.ultimateState?.phase };
  const commitAt = a.ultimateState.commitAt;
  let healthAtCommit = null;
  for (let now = press; now <= commitAt + 0.6 + 1e-9; now += 0.01) {
    if (letGoAt !== null && Math.abs(now - letGoAt) < 0.005) endAttack(room, 'a', now);
    b.health = Math.max(b.health, 1);
    if (healthAtCommit === null && now >= commitAt - 0.011) healthAtCommit = b.health;
    stepRoom(room, 0.01, now, openWorld);
  }
  return { room, a, b, before, taken, commitAt, healthAtCommit, events: room.events };
}

test('with the attack already held, the key still takes the knight at once: the old chain is over, and the first slam comes as the brace ends', () => {
  const lead = ULTIMATES.sunder.firstSlamLead;
  for (const [name, options] of [
    ['held from a fresh swing', {}],
    ['a second strike asked for (queued)', { chainFrom: 8.8, queued: true }],
    ['deep in a chain, its heavy strike just swung', { chainFrom: 7.15, press: 9.0 }],
  ]) {
    const { a, before, taken, commitAt, events, healthAtCommit } = heldInto(options);
    assert.equal(before.wanting, true, `${name}: the button was down`);
    // (the last case: its chain has just run out and is in its recovery, the next swing waiting on the button)
    if (!name.startsWith('deep')) assert.equal(before.active, true, `${name}: a chain was under way`);
    assert.deepEqual([taken.state, taken.active, taken.sweep, taken.held], ['startup', false, null, true], `${name}: superseded at once, the button still counted as held`);
    // nothing of the old chain lands after the key, and nothing lands before the commit
    const early = events.filter((e) => ['swordHit', 'swordSwing', 'groundStrike'].includes(e.type) && e.at < commitAt - 1e-9);
    assert.deepEqual(early, [], `${name}: no blow between the key and the commit`);
    assert.equal(healthAtCommit, 100, `${name}: the startup does no damage`);
    // the first slam: swung as the brace ends, landing a moment after the commit
    const swing = events.find((e) => e.type === 'swordSwing');
    assert.ok(swing?.slam, `${name}: a slam`);
    const landed = events.find((e) => (e.type === 'swordHit' && e.level === 'elevated') || e.type === 'groundStrike');
    assert.ok(landed, `${name}: it lands`);
    assert.ok(landed.at >= commitAt && landed.at <= commitAt + lead + 0.03, `${name}: ${(landed.at - commitAt).toFixed(2)} s after the commit`);
    assert.equal(a.prowess, 0, 'the charge spent at the commit, as ever');
  }
  assert.ok(lead > 0 && lead < 0.31, 'never so early that its blade could be live before the commit');
});

test('pressed during the brace it is the same slam; let go before the commit, no slam comes; and the startup is as exposed as ever', () => {
  // the attack pressed after the key
  const { room, a, b } = duel();
  place(b, 0, 1.8);
  a.prowess = PROWESS.full;
  tryUltimate(room, 'a', 9);
  beginAttack(room, 'a', 9.2);
  const commitAt = a.ultimateState.commitAt;
  run(room, 9, commitAt + 0.5);
  const landed = room.events.find((e) => e.type === 'swordHit' && e.level === 'elevated');
  assert.ok(landed && landed.at <= commitAt + ULTIMATES.sunder.firstSlamLead + 0.03);
  // held, then let go while bracing
  const letGo = heldInto({ letGoAt: 9.3 });
  assert.equal(letGo.events.some((e) => e.type === 'swordSwing'), false, 'no slam for a button no longer held');
  assert.equal(letGo.a.ultimateState?.phase, 'active');
  // interrupted while bracing with the button held: the charge kept, no slam, the lockout as ever
  const broken = duel();
  place(broken.b, 0, 9);
  broken.a.prowess = PROWESS.full;
  beginAttack(broken.room, 'a', 8.95);
  tryUltimate(broken.room, 'a', 9);
  staggerBy(broken.room, broken.a, STAGGER.max, 9.3, 'b');
  run(broken.room, 9.3, 9 + ULTIMATES.sunder.startupSec + 0.5);
  assert.equal(broken.a.ultimateState, null);
  assert.equal(broken.a.prowess, PROWESS.full);
  assert.ok(broken.room.events.some((e) => e.type === 'ultimateInterrupted'));
  assert.equal(broken.room.events.some((e) => e.type === 'swordSwing' && e.slam), false);
});

test('the key pressed while a spell is gathering is not lost: it is taken the moment the hand is free', async () => {
  const { ULTIMATE_PRESS_KEPT_SEC } = await import('../../shared/src/ultimates.mjs');
  const { room, a, b } = duel();
  place(b, 0, 9);
  a.prowess = PROWESS.full;
  a.spell = 'fireball';
  a.spellReadyAt = 0;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 9), true);
  assert.equal(tryUltimate(room, 'a', 9.05), false, 'not this instant: the palm is full');
  assert.ok(SPELLS.fireball.gatherSec < ULTIMATE_PRESS_KEPT_SEC);
  run(room, 9.05, 9.05 + ULTIMATE_PRESS_KEPT_SEC);
  assert.ok(room.events.some((e) => e.type === 'projectileSpawned'), 'the spell flies');
  const began = room.events.find((e) => e.type === 'ultimateStart');
  assert.ok(began && began.at <= 9 + SPELLS.fireball.gatherSec + 0.03, 'and the ultimate begins as it leaves the hand');
  // with the meter short, nothing is kept
  const short = duel();
  short.a.prowess = PROWESS.full - 1;
  short.a.spell = 'fireball';
  short.a.spellReadyAt = 0;
  tryCastSpell(short.room, 'a', { x: 1, y: 0, z: 0 }, 9);
  assert.equal(tryUltimate(short.room, 'a', 9.05), false);
  short.a.prowess = PROWESS.full;
  run(short.room, 9.05, 9.6);
  assert.equal(short.room.events.some((e) => e.type === 'ultimateStart'), false);
});

test('on the Ruined Keep, a slam is not stopped by the low things it comes down onto; a wall dead ahead still stops it', async () => {
  const { getWorld } = await import('../../shared/worlds/registry.mjs');
  const keep = getWorld('ruined-keep');
  const face = (dx, dz) => Math.atan2(-dx, -dz);
  const slam = (position, yaw) => {
    const room = new Room('KEEP', { mode: 'FFA', worldId: 'ruined-keep' });
    room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
    room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
    room.setReady('a', true, 0);
    room.setReady('b', true, 0);
    room.tick(3.1);
    const a = room.players.get('a');
    const b = room.players.get('b');
    Object.assign(b.position, { x: 0, y: 0, z: 12 });
    b.history = [];
    const hold = () => { Object.assign(a.position, position); a.velocity = { x: 0, y: 0, z: 0 }; };
    hold();
    a.history = [];
    a.yaw = yaw; a.input.yaw = yaw; a.pitch = 0; a.input.pitch = 0;
    a.prowess = PROWESS.full;
    tryUltimate(room, 'a', 9);
    for (let now = 9; now <= 9 + ULTIMATES.sunder.startupSec + 0.02; now += 0.01) { hold(); stepRoom(room, 0.01, now, keep); }
    room.events.length = 0;
    beginAttack(room, 'a', 10);
    for (let now = 10; now <= 10.55; now += 0.01) { hold(); stepRoom(room, 0.01, now, keep); }
    if (room.events.some((e) => e.type === 'swordWorldImpact')) return 'stopped';
    return room.events.some((e) => e.type === 'groundStrike') ? 'driven in' : 'missed';
  };
  // the terrace's lip, column drums, a fallen beam, the stair's footing, the Breach's rubble: ground to a blade driven down
  assert.equal(slam({ x: -12.2, y: 0, z: -8.8 }, face(-1, 0)), 'driven in', 'the terrace lip');
  assert.equal(slam({ x: -4.8, y: 0, z: -7.7 }, face(-1, 0)), 'driven in', 'the column drums');
  assert.equal(slam({ x: 2.7, y: 0, z: 3.9 }, face(0, 1)), 'driven in', 'the fallen beam');
  assert.equal(slam({ x: 9.25, y: 0, z: -3.7 }, face(0, -1)), 'driven in', 'the stair footing');
  assert.equal(slam({ x: -7.9, y: 0, z: -3.9 }, face(-1, 0)), 'driven in', 'the Breach rubble');
  // a standing wall a step ahead is still in the way
  assert.equal(slam({ x: -0.7, y: 0, z: -5.0 }, face(0, -1)), 'stopped', 'the toppled wall');
});
