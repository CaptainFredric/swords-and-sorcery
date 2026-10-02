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
  assert.ok(Math.abs(b.stagger.level - (STAGGER.gain.sword + RUPTURE.stagger)) < 1e-6, `it holds: ${b.stagger.level}`);
  assert.ok(b.stagger.level >= 0.6 * STAGGER.max, 'most of a balance');
  // the slams go on: the balance breaks, and who broke it is said
  for (let now = 10.76; now <= 12 + 1e-9; now += 0.01) { pin(); stepRoom(room, 0.01, now, openWorld); }
  const broke = room.events.find((e) => e.type === 'staggerBreak' && e.playerId === 'b');
  assert.ok(broke && broke.by === 'a', 'a real break');
  assert.ok(broke.at <= 11.85, `by the third slam at the latest: ${broke.at.toFixed(2)}`);
});

test('the ground alone, split under a knight again and again, breaks a balance by the third time (it took five)', () => {
  // (what the rupture adds, with the hold and the drain between catches a second apart)
  const stagger = { level: 0, shakenAt: -Infinity, recoverUntil: -Infinity };
  let breaks = 0;
  let catches = 0;
  for (let now = 0; now < 3 - 1e-9 && !breaks; now += RUPTURE.recatchSec) {
    // (drained since the last catch: nothing while it holds, then steadily)
    const idle = Math.max(0, RUPTURE.recatchSec - STAGGER.holdSec);
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
