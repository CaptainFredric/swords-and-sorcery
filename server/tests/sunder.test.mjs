import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room } from '../../shared/sim/Room.mjs';
import { applyDamage, beginAttack, endAttack, setGuard, staggerBy, stepRoom, tryCastSpell, tryUltimate } from '../../shared/sim/combat.mjs';
import { GAME, MELEE_CONTACT, closingImpact, guardBlockCost, swordDamageFor } from '../../shared/src/combat.mjs';
import { aimQuality } from '../../shared/src/blade.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { RUPTURE, fissureCatches, planRupture } from '../../shared/src/rupture.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';

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
  // and the most it can shake a knight's balance (and the ground it split under them shakes it again)
  assert.ok(sundered.b.stagger.level >= STAGGER.gain.sword + RUPTURE.stagger - 1, `${sundered.b.stagger.level}`);
  assert.ok(sundered.b.stagger.level <= STAGGER.gain.sword + RUPTURE.stagger + 1e-6);
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

test('one knight\'s ruptures catch the same knight at most once a second: a warning to move, not a blender', () => {
  const { room, a, b } = duel();
  sunder(room, a);
  place(b, 0, 4.5);
  room.events.length = 0;
  beginAttack(room, 'a', 10);
  run(room, 10, 13);
  const ruptures = room.events.filter((e) => e.type === 'rupture').length;
  const caught = room.events.filter((e) => e.type === 'damage' && e.source === 'rupture').map((e) => e.at);
  assert.ok(ruptures >= 3, `every strike ruptured (${ruptures})`);
  assert.ok(caught.length >= 2 && caught.length < ruptures, `${caught.length} of ${ruptures}`);
  for (let i = 1; i < caught.length; i += 1) assert.ok(caught[i] - caught[i - 1] >= RUPTURE.recatchSec - 1e-6);
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
