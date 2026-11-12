// All-Natural Disaster: the elemental completion, the Steel infusion and what the blow leaves behind, run through the
// real room (the same code the server and the local Practice host run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, tryUltimate, releaseOneHitCharge, tryCastSpell, tryGauntletStrike, stepRoom, applyDamage, staggerBy } from '../../shared/sim/combat.mjs';
import { configurePracticeOneHit } from '../../shared/sim/practice.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { ONE_HIT_ELEMENTS, ONE_HIT_PRESETS, oneHitDamage, oneHitBacklashRemaining, shakenSprintFactor } from '../../shared/src/oneHitInfusions.mjs';
import { ONE_HIT_FIRST_INFUSION_DAMAGE } from '../../shared/src/oneHitOfWondersRules.mjs';
import { STEEL, steelStrength } from '../../shared/src/steel.mjs';
import { STEEL_RAM, ramEffect } from '../../shared/src/steelRam.mjs';
import { STEEL_DAMAGE_RANGES } from '../../shared/src/steel.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { ONE_HIT_REACH, ONE_HIT_BLUSTER, fieldSeconds, fieldStrength, distinctElements } from '../../shared/src/oneHitStatus.mjs';
import { setGuard, tryDash } from '../../shared/sim/combat.mjs';

const world = {
  floors: [{ id: 'ground', center: [0, -.1, 0], size: [200, .2, 200], y: 0 }],
  ramps: [], solids: [], spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 3, y: 0, z: 0, yaw: Math.PI / 2 }],
  abyssY: -9,
};
const DT = 1 / 30;

function battle({ mode = 'FFA', tiers = {}, at = { x: 1.8, y: 0, z: 0 } } = {}) {
  const room = new Room('DISAS', { mode });
  room.world = world;
  room.addPlayer({ id: 'a', token: 'aa', name: 'Swords' }, 0);
  room.addPlayer({ id: 'b', token: 'bb', name: 'Sorcery' }, 0);
  room.setReady('a', true, 0); room.setReady('b', true, 0); room.tick(3.1);
  if (mode === 'PRACTICE') room.state = 'PLAYING';
  const a = room.players.get('a'), b = room.players.get('b');
  a.ultimate = 'one_hit_of_wonders';
  a.position = { x: 0, y: 0, z: 0 }; b.position = { ...at };
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw; a.pitch = 0; a.input.pitch = 0;
  b.yaw = Math.PI / 2; b.input.yaw = b.yaw;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  Object.assign(a.oneHitInfusions, tiers);
  a.prowess = PROWESS.full;
  room.events.length = 0;
  return { room, a, b };
}
function add(room, id, position, nowSec = 9) {
  room.addPlayer({ id, token: id, name: id }, nowSec);
  const knight = room.players.get(id);
  knight.position = { ...position }; knight.spawnProtectionUntil = 0; knight.grounded = true;
  return knight;
}
// run the room from `from` (exclusive of nothing: a tick at each step) for `seconds`
function run(room, from, seconds, w = world) {
  const count = Math.round(seconds / DT);
  for (let i = 0; i < count; i++) stepRoom(room, DT, from + i * DT, w);
  return from + count * DT;
}
// a grounded Disaster from `a`, committed: returns the moment after its impact tick
function slam(room, at = 9, w = world) {
  assert.equal(tryUltimate(room, 'a', at), true, 'the Disaster begins');
  const state = room.players.get('a').ultimateState;
  const commit = state.commitAt;
  let now = at;
  while (now < commit + DT) { stepRoom(room, DT, now, w); now += DT; }
  return now;
}
const decisive = (room, id) => room.events.filter((e) => e.type === 'damage' && e.source === 'one_hit_of_wonders' && e.victimId === id);

// ---------------------------------------------------------------------------------------------------------------
test('damage contract: every first infusion adds its own minimum once; Gale is 1; Steel is the least qualifying ram', () => {
  assert.deepEqual({ ...ONE_HIT_FIRST_INFUSION_DAMAGE }, { fire: 13, frost: 11, gale: 1, lightning: 12, steel: 2 });
  assert.equal(ONE_HIT_FIRST_INFUSION_DAMAGE.fire, SPELLS.fireball.edgeDamage);
  assert.equal(ONE_HIT_FIRST_INFUSION_DAMAGE.frost, SPELLS.frostfire.edgeDamage);
  assert.equal(ONE_HIT_FIRST_INFUSION_DAMAGE.gale, STEEL_DAMAGE_RANGES.gale.min, 'the least a gust deals, not its 8-point heart');
  assert.equal(ONE_HIT_FIRST_INFUSION_DAMAGE.steel, ramEffect(STEEL_RAM.minStrength).damage, 'read from the ram rule, not written down');
  assert.equal(ramEffect(STEEL_RAM.minStrength - 0.01 >= STEEL_RAM.minStrength ? 1 : STEEL_RAM.minStrength).damage, 2);
  for (const element of ONE_HIT_ELEMENTS) {
    assert.equal(oneHitDamage({ [element]: 1 }), 46 + ONE_HIT_FIRST_INFUSION_DAMAGE[element]);
    assert.equal(oneHitDamage({ [element]: 2 }), 46 + ONE_HIT_FIRST_INFUSION_DAMAGE[element], `Full ${element} does not double it`);
  }
  assert.equal(oneHitDamage({ fire: 2, frost: 2, gale: 2, lightning: 2, steel: 2 }), 46 + 13 + 11 + 1 + 12 + 2);
});

test('all 243 infusion combinations: one decisive damage event per victim, worth exactly the contract', () => {
  for (let code = 0; code < 3 ** 5; code++) {
    const tiers = Object.fromEntries(ONE_HIT_ELEMENTS.map((element, i) => [element, Math.floor(code / 3 ** i) % 3]));
    const { room, a, b } = battle({ tiers });
    b.health = 1000; // (so that no combination kills: every one is read off the same event)
    let now;
    if (tiers.lightning === 2) {
      assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
      stepRoom(room, DT, 9 + DT, world);
      assert.equal(releaseOneHitCharge(room, 'a', 9 + 2 * DT), true); // a near-tap: it barely moves
      now = run(room, 9 + 2 * DT, .1);
    } else now = slam(room);
    now = run(room, now, 1.5);
    const hits = decisive(room, 'b');
    const label = JSON.stringify(tiers);
    assert.equal(hits.length, 1, `one decisive event ${label}`);
    assert.equal(hits[0].amount, oneHitDamage(tiers), `its damage ${label}`);
    assert.equal(room.events.filter((e) => e.type === 'oneHitImpact' && e.form === 'ground').length, 1, `one impact ${label}`);
    assert.ok(b.shaken, `Shaken ${label}`);
    assert.equal(Boolean(b.blustered), tiers.gale >= 1, `Blustered ${label}`);
    assert.equal(Boolean(b.electricalBacklash), tiers.lightning >= 1, `Shocking Conduct ${label}`);
    assert.equal(a.ultimateState?.phase ?? 'active', 'active');
    assert.deepEqual(Object.values(a.oneHitInfusions), [0, 0, 0, 0, 0], `spent ${label}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
test('Shocking Conduct shocks the SHOCKED knight who swings, never a healthy knight who strikes them', () => {
  // b carries the Conduct. A third knight, c, strikes b: the blow must land as any blow does, and c must be unharmed.
  // (the old code read the DEFENDER's status here, so c was shocked for hitting b)
  {
    const { room, b } = battle();
    const c = add(room, 'c', { x: 3.8, y: 0, z: 0 });
    c.yaw = Math.PI / 2; c.input.yaw = c.yaw; // faces -x: toward b
    b.electricalBacklash = { at: 10, initial: 12, sourceId: 'a' };
    beginAttack(room, 'c', 10);
    run(room, 10, .5);
    assert.ok(room.events.some((e) => e.type === 'swordHit' && e.playerId === 'c' && e.targetId === 'b'), 'the healthy knight\'s blow lands');
    assert.equal(c.health, 100, 'and they are not shocked for it');
    assert.ok(b.health < 100);
    assert.ok(b.electricalBacklash, 'being struck does not spend the status');
    assert.equal(room.events.some((e) => e.type === 'oneHitBacklash'), false);
  }
  // b carries the Conduct and swings at a: the blow is stopped before any damage, and b takes what is left of it.
  {
    const { room, a, b } = battle();
    b.electricalBacklash = { at: 10, initial: 12, sourceId: 'a' };
    beginAttack(room, 'b', 10);
    run(room, 10, .5);
    const shock = room.events.find((e) => e.type === 'oneHitBacklash');
    assert.ok(shock, 'discharged');
    assert.equal(shock.victimId, 'b'); assert.equal(shock.attackerId, 'a'); assert.equal(shock.sparedId, 'a');
    assert.equal(a.health, 100, 'the blow never lands');
    assert.equal(room.events.some((e) => e.type === 'swordHit'), false);
    const left = oneHitBacklashRemaining({ at: 10, initial: 12 }, shock.at);
    assert.ok(Math.abs(shock.amount - left) < 1e-9 && left < 12 && left > 10, 'what is left of the 12, decayed over four seconds');
    assert.ok(Math.abs(b.health - (100 - left)) < 1e-9);
    assert.equal(b.electricalBacklash, null, 'once');
    assert.equal(b.attackActive, false, 'and their chain is stopped');
  }
});

test('Shocking Conduct: a swing that misses does not trigger it, and it runs out by itself in four seconds', () => {
  const { room, a, b } = battle({ at: { x: 12, y: 0, z: 0 } });
  b.electricalBacklash = { at: 10, initial: 12, sourceId: 'a' };
  beginAttack(room, 'b', 10);
  run(room, 10, 1);
  assert.ok(b.electricalBacklash, 'a miss keeps it');
  assert.equal(b.health, 100); assert.equal(a.health, 100);
  run(room, 11, 3.2);
  assert.equal(b.electricalBacklash, null, 'gone after four seconds');
  assert.equal(b.health, 100, 'with no passive damage');
});

test('a direct Lightning-infused hit applies Shocking Conduct on the ground too, and a fist is a melee blow', () => {
  const { room, a, b } = battle({ tiers: { lightning: 1 } });
  const now = slam(room);
  assert.equal(b.electricalBacklash?.initial, 12);
  assert.equal(b.electricalBacklash.sourceId, 'a');
  // b's spell is cooling: the key throws the gauntlet, which would land on a
  b.spellReadyAt = now + 30;
  b.position = { x: 1.1, y: 0, z: 0 }; b.staggerUntil = -Infinity; b.velocity = { x: 0, y: 0, z: 0 };
  a.ultimateState = null;
  const health = b.health;
  assert.equal(tryGauntletStrike(room, 'b', now), true);
  run(room, now, .6);
  assert.ok(room.events.some((e) => e.type === 'oneHitBacklash' && e.victimId === 'b' && e.gauntlet));
  assert.ok(b.health < health);
  assert.equal(room.events.some((e) => e.type === 'gauntletHit' && !e.guarded), false);
});

// ---------------------------------------------------------------------------------------------------------------
test('the ground field: about four seconds, decaying; Shaken recovers more slowly in it; HP lost in it costs Guard stamina by its strength', () => {
  const { room, a, b } = battle();
  const now = slam(room);
  const impact = room.events.find((e) => e.type === 'oneHitImpact');
  assert.equal(room.oneHitFields.length, 1);
  const field = room.oneHitFields[0];
  assert.equal(field.until - field.bornAt, 4);
  assert.equal(impact.fieldId, field.id);
  assert.equal(serializeSnapshot(room, now).oneHitFields[0].radius, field.radius);

  // the decisive hit itself was not counted against the field (no Guard stamina lost to it)
  assert.equal(room.events.some((e) => e.type === 'oneHitFieldGuard'), false);
  assert.equal(b.guardStamina, 100);

  // two knights Shaken alike: one stays in the field, one is outside it
  b.position = { x: 1, y: 0, z: 0 }; b.velocity = { x: 0, y: 0, z: 0 };
  const out = add(room, 'out', { x: 30, y: 0, z: 0 }, now);
  out.shaken = { ...b.shaken };
  const later = run(room, now, 1.5);
  assert.ok(b.oneHitField && Math.abs(b.oneHitField.strength - (1 - (later - DT - field.bornAt) / 4)) < 1e-6, 'the field is read each tick, at its strength now');
  assert.equal(out.oneHitField, null);
  assert.ok(shakenSprintFactor(b.shaken, later) < shakenSprintFactor(out.shaken, later) - .2, 'Shaken is held back inside');
  assert.ok(shakenSprintFactor(b.shaken, later) > 0, 'but still recovering as the field fades');

  // HP damage taken inside: Guard stamina equal to the damage times what is left of the field, once
  const strength = b.oneHitField.strength;
  const before = b.guardStamina;
  room.events.length = 0;
  applyDamage(room, 'a', 'b', 10, 'sword', later);
  assert.ok(Math.abs(before - b.guardStamina - 10 * strength) < 1e-6, `${before - b.guardStamina} lost for 10 damage at strength ${strength}`);
  assert.equal(room.events.filter((e) => e.type === 'oneHitFieldGuard').length, 1);
  assert.equal(room.events.filter((e) => e.type === 'damage').length, 1, 'one damage event: nothing is dealt twice');
  // outside it, nothing
  const outBefore = out.guardStamina;
  applyDamage(room, 'a', 'out', 10, 'sword', later);
  assert.equal(out.guardStamina, outBefore);
  // its owner is not a "qualifying enemy" of their own field
  a.position = { x: 0, y: 0, z: 0 };
  run(room, later, DT);
  assert.equal(a.oneHitField, null);

  // and it is gone after four seconds; Shaken then recovers and clears
  run(room, later + DT, 6);
  assert.equal(room.oneHitFields.length, 0);
  assert.equal(b.oneHitField, null);
  assert.equal(b.shaken, null);
});

test('two overlapping fields cost one Guard loss (the stronger), never both', () => {
  const { room, b } = battle();
  room.oneHitFields = [
    { id: 'old', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, radius: 3.4, bornAt: 7, until: 11, tiers: {}, conducted: {} },
    { id: 'new', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, radius: 3.4, bornAt: 9, until: 13, tiers: {}, conducted: {} },
  ];
  stepRoom(room, DT, 10, world);
  assert.equal(b.oneHitField.id, 'new');
  assert.equal(b.oneHitField.strength, .75);
  applyDamage(room, 'a', 'b', 20, 'sword', 10);
  assert.equal(b.guardStamina, 100 - 15);
});

// ---------------------------------------------------------------------------------------------------------------
test('Half Fire is reach, not burn: a wider blow that also goes up; nothing burns on the knight', () => {
  // three knights: one beyond the ordinary 3.4 m, one on a deck 3 m up, one 4 m up (beyond even Fire's 3.5)
  const yard = { ...world, floors: [...world.floors, { id: 'deck', center: [0, 2.9, -2], size: [2, .2, 2], y: 3 }, { id: 'tower', center: [0, 3.9, 2], size: [2, .2, 2], y: 4 }] };
  const scene = (tiers) => {
    const { room, b } = battle({ tiers });
    b.health = 1000;
    const wide = add(room, 'wide', { x: 4.2, y: 0, z: 0 });
    const high = add(room, 'high', { x: 0, y: 3, z: -2 });
    const higher = add(room, 'higher', { x: 0, y: 4, z: 2 });
    for (const k of [wide, high, higher]) k.health = 1000;
    slam(room, 9, yard);
    return { room, b, wide, high, higher };
  };
  const plain = scene({});
  assert.equal(plain.room.events.find((e) => e.type === 'oneHitImpact').radius, 3.4);
  assert.equal(decisive(plain.room, 'wide').length + decisive(plain.room, 'high').length, 0, 'out of the ordinary blow\'s reach');
  const fire = scene({ fire: 1 });
  const impact = fire.room.events.find((e) => e.type === 'oneHitImpact');
  assert.equal(impact.radius, 4.6); assert.equal(impact.height, 3.5);
  assert.equal(decisive(fire.room, 'wide').length, 1, 'the wider blast');
  assert.equal(decisive(fire.room, 'high').length, 1, 'and its height: a knight three metres up');
  assert.equal(decisive(fire.room, 'higher').length, 0, 'but not beyond it');
  assert.equal(decisive(fire.room, 'wide')[0].amount, 59, 'the one decisive hit, 46 + 13');
  for (const k of [fire.b, fire.wide, fire.high]) assert.equal(k.burn, null, 'no burn status');
  run(fire.room, 10.2, 3);
  assert.equal(fire.room.events.some((e) => e.source === 'burn' || e.source === 'one_hit_ground_fire'), false, 'Half Fire burns nothing afterward');
  assert.equal(fire.room.oneHitBurnZones.length, 0);
});

test('Fire\'s wider contact carries every other infusion, once: a knight only the blast reaches gets the whole blow', () => {
  const { room, b } = battle({ tiers: { fire: 1, frost: 2, gale: 1, lightning: 1, steel: 2 } });
  b.health = 1000;
  const wide = add(room, 'wide', { x: 0, y: 0, z: 4.3 });
  wide.health = 1000; wide.spell = 'fireball'; wide.spellReadyAt = 0; wide.pendingSpell = { spell: 'fireball', direction: { x: 1, y: 0, z: 0 } }; wide.castEndsAt = 99;
  const now = slam(room);
  const hits = decisive(room, 'wide');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 46 + 13 + 11 + 1 + 12 + 2);
  assert.ok(wide.shaken && wide.blustered && wide.oneHitFrozenUntil > now - DT, 'Shaken, Blustered, frozen');
  assert.equal(wide.electricalBacklash.initial, 12);
  assert.equal(wide.pendingSpell, null, 'interrupted by Steel');
  assert.ok(wide.spellReadyAt > 9, 'cooldowns restarted by Full Steel');
  for (const type of ['oneHitConduct', 'oneHitBlustered', 'oneHitCooldownsRestarted', 'actionInterrupted'])
    assert.equal(room.events.filter((e) => e.type === type && e.playerId === 'wide').length, 1, `${type} once`);
  run(room, now, 1);
  assert.equal(decisive(room, 'wide').length, 1, 'and never again');
});

test('Full Fire: burning ground at a ground-supported impact, its licks dying down, and no second burn on the struck', () => {
  const { room, b } = battle({ tiers: { fire: 2 } });
  b.health = 1000;
  const now = slam(room);
  assert.equal(room.oneHitBurnZones.length, 1);
  const zone = room.oneHitBurnZones[0];
  assert.equal(zone.radius, 4.6);
  assert.ok(Math.abs(zone.until - zone.bornAt - 4.3) < 1e-9, 'one element: 4.3 seconds');
  assert.equal(b.burn, null, 'the struck knight carries no burn of their own');
  b.position = { x: 2, y: 0, z: 0 }; b.velocity = { x: 0, y: 0, z: 0 };
  run(room, now, 5.5);
  const licks = room.events.filter((e) => e.source === 'one_hit_ground_fire' && e.victimId === 'b').map((e) => e.amount);
  assert.ok(licks.length >= 7, `${licks.length} licks`);
  assert.equal(licks[0], 3, 'the existing lick, not a stronger one');
  assert.equal(licks.at(-1), 1);
  assert.deepEqual(licks, [...licks].sort((x, y) => y - x), `never rising: ${licks}`);
  assert.ok(Math.max(...licks) <= 3);
  assert.equal(room.events.some((e) => e.source === 'burn'), false, 'one burning source: the ground');
  assert.equal(room.oneHitBurnZones.length, 0, 'burnt out');
});

test('Frost: contact slows; Full Frost freezes briefly and leaves a field that chills less as it fades, and never freezes', () => {
  {
    const { room, b } = battle({ tiers: { frost: 1 } });
    const now = slam(room);
    assert.equal(b.oneHitFrostSlow.depth, .35);
    assert.ok(!(b.oneHitFrozenUntil > now), 'Half Frost does not freeze');
    run(room, now, DT);
    assert.ok(Math.abs(b.speedScale - .65) < 1e-9);
    assert.equal(room.oneHitFields[0].tiers.frost, 1);
  }
  const { room, a, b } = battle({ tiers: { frost: 2 } });
  const now = slam(room);
  assert.ok(b.oneHitFrozenUntil > now && b.oneHitFrozenUntil <= now + .9);
  // a knight who was never struck walks into the field later
  const late = add(room, 'late', { x: 30, y: 0, z: 0 }, now);
  run(room, now, 1);
  late.position = { x: 1.5, y: 0, z: 0 };
  run(room, now + 1, 2 * DT);
  const early = late.oneHitFrostSlow.depth;
  assert.ok(early > 0 && early < .35, `a weaker chill than the direct hit: ${early}`);
  assert.ok(!(late.oneHitFrozenUntil > now), 'the field never freezes');
  assert.equal(late.health, 100, 'nor hurts');
  run(room, now + 1 + 2 * DT, 2);
  assert.ok(late.oneHitFrostSlow.depth < early - .1, `weaker still as it fades: ${late.oneHitFrostSlow.depth}`);
  // at its rim, less again than at its heart
  const rim = add(room, 'rim', { x: room.oneHitFields[0].radius + .2, y: 0, z: 0 }, now);
  run(room, now + 3 + 2 * DT, 2 * DT);
  assert.ok(rim.oneHitFrostSlow.depth < late.oneHitFrostSlow.depth);
  // gone with the field
  run(room, now + 3 + 4 * DT, 2);
  assert.equal(late.oneHitFrostSlow, null);
  assert.equal(a.oneHitFrostSlow, null, 'its owner was never chilled');
});

// ---------------------------------------------------------------------------------------------------------------
test('Half Gale: a longer shove the way the blow went, and Blustered: the fighting facing turns slowly, the look does not', () => {
  const plain = battle(); plain.b.health = 1000; slam(plain.room);
  const gale = battle({ tiers: { gale: 1 } }); gale.b.health = 1000;
  const now = slam(gale.room);
  const push = (room) => decisive(room, 'b')[0].push;
  assert.ok(Math.abs(push(gale.room).x / push(plain.room).x - ONE_HIT_BLUSTER.knockback) < 1e-9 && ONE_HIT_BLUSTER.knockback >= 2);
  assert.equal(push(gale.room).z, 0);
  assert.equal(plain.b.blustered, null);

  const { room, b } = gale;
  assert.ok(b.blustered);
  b.staggerUntil = -Infinity;
  const facing = b.yaw;
  b.input = { ...b.input, yaw: facing + Math.PI }; // the look snaps right round
  stepRoom(room, DT, now, world);
  assert.equal(b.input.yaw, facing + Math.PI, 'the camera\'s own yaw is never rewritten');
  const first = Math.abs(b.yaw - facing);
  assert.ok(first > 0 && first < .2, `the facing follows slowly at first: ${first} rad in a tick`);
  // it loosens as the wind leaves them: the same turn takes less and less time
  run(room, now + DT, 2);
  const mid = b.yaw;
  b.input = { ...b.input, yaw: mid + 1 };
  stepRoom(room, DT, now + DT + 2, world);
  assert.ok(Math.abs(b.yaw - mid) > first * 1.5, 'faster by now');
  run(room, now + 2 * DT + 2, 2.2);
  assert.equal(b.blustered, null, 'gone in four seconds');
  b.input = { ...b.input, yaw: 0 };
  stepRoom(room, DT, now + 5, world);
  assert.equal(b.yaw, 0, 'and the facing is the look again');
});

test('Half Gale: the wind of the wind-up turns an enemy spell aside once, keeps its owner, and ends with the wind-up', () => {
  const incoming = (room, id = 'p1') => {
    const projectile = { id, ownerId: 'b', spell: 'fireball', position: { x: 2.2, y: 1, z: 0 }, velocity: { x: -20, y: 0, z: 0 }, bornAt: 9 };
    room.projectiles.set(id, projectile);
    return projectile;
  };
  {
    const { room, a, b } = battle({ tiers: { gale: 1 }, at: { x: 14, y: 0, z: 0 } });
    assert.equal(tryUltimate(room, 'a', 9), true);
    const p = incoming(room);
    room.freezeProjectiles = false;
    stepRoom(room, DT, 9 + DT, world);
    const turned = room.events.filter((e) => e.type === 'oneHitDeflect');
    assert.equal(turned.length, 1);
    assert.equal(p.ownerId, 'b', 'still its caster\'s spell');
    assert.ok(Math.abs(Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z) - 20) < 1e-6, 'at its own speed');
    assert.ok(p.velocity.x > 0 || Math.abs(p.velocity.x) < 20 * .2, 'no longer flying in');
    run(room, 9 + 2 * DT, .3);
    assert.equal(room.events.filter((e) => e.type === 'oneHitDeflect').length, 1, 'bent once, never again');
    assert.equal(a.health, 100);
    assert.equal(b.health, 100, 'and it is not thrown back at them as a hit of the knight\'s own');
  }
  { // a real Fireball cast from point blank and from across the yard: both are turned, neither hurts
    for (const distance of [1.9, 8]) {
      const { room, a, b } = battle({ tiers: { gale: 1 }, at: { x: distance, y: 0, z: 0 } });
      b.spell = 'fireball'; b.spellReadyAt = 0;
      assert.equal(tryCastSpell(room, 'b', { x: -1, y: .02, z: 0 }, 9), true);
      assert.equal(tryUltimate(room, 'a', 9), true);
      run(room, 9, .8);
      assert.equal(room.events.filter((e) => e.type === 'oneHitDeflect').length, 1, `turned from ${distance} m`);
      assert.equal(a.health, 100, `unhurt from ${distance} m`);
      assert.equal(room.events.some((e) => e.type === 'damage' && e.source === 'fireball' && e.victimId === 'a'), false);
    }
  }
  { // no Gale: nothing is turned
    const { room } = battle({ at: { x: 14, y: 0, z: 0 } });
    tryUltimate(room, 'a', 9); incoming(room);
    stepRoom(room, DT, 9 + DT, world);
    assert.equal(room.events.some((e) => e.type === 'oneHitDeflect'), false);
  }
  { // an ally's spell is not an eligible one
    const { room } = battle({ tiers: { gale: 1 }, at: { x: 14, y: 0, z: 0 } });
    tryUltimate(room, 'a', 9);
    incoming(room).ownerId = 'a'; // (the knight's own, as an ally's is: areAllies is the room's one team rule)
    stepRoom(room, DT, 9 + DT, world);
    assert.equal(room.events.some((e) => e.type === 'oneHitDeflect'), false);
  }
  { // a held Full Lightning aim: the wind lasts an ordinary wind-up's length and no longer, however long it is held
    const { room, a } = battle({ tiers: { gale: 1, lightning: 2 }, at: { x: 14, y: 0, z: 0 } });
    assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
    run(room, 9, 3);
    assert.equal(a.ultimateState.phase, 'startup', 'still held');
    incoming(room, 'late');
    stepRoom(room, DT, 12 + DT, world);
    assert.equal(room.events.some((e) => e.type === 'oneHitDeflect'), false, 'no perpetual projectile immunity');
  }
});

test('Full Gale gathers, flies and waves as before; Full Gale + Full Lightning aims its teleport in three dimensions', () => {
  { // grounded gathering
    const { room, b } = battle({ tiers: { gale: 2 }, at: { x: 5.5, y: 0, z: 0 } });
    b.health = 1000;
    slam(room);
    assert.equal(decisive(room, 'b').length, 1, 'drawn in, then struck once');
  }
  { // airborne activation needs Full Gale
    const { room, a } = battle({ tiers: { gale: 1 } });
    a.position.y = 6; a.grounded = false;
    assert.equal(tryUltimate(room, 'a', 9), false);
    a.oneHitInfusions.gale = 2;
    assert.equal(tryUltimate(room, 'a', 9), true);
    run(room, 9, 2.2);
    assert.ok(room.events.some((e) => e.type === 'oneHitWave'), 'the aerial sword wave');
  }
  { // 3D teleport: aimed upward from the air, it arrives higher
    const { room, a } = battle({ tiers: { gale: 2, lightning: 2 }, at: { x: 40, y: 0, z: 0 } });
    a.position.y = 6; a.grounded = false; a.velocity = { x: 0, y: 0, z: 0 };
    a.input = { ...a.input, pitch: .6 }; a.pitch = .6;
    assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
    run(room, 9, 1.5);
    const before = { ...a.position };
    assert.equal(releaseOneHitCharge(room, 'a', 10.5), true);
    const hop = room.events.find((e) => e.type === 'oneHitTeleport');
    assert.ok(hop, 'validated teleport');
    assert.ok(hop.to.y > before.y + 2, `up: ${before.y} -> ${hop.to.y}`);
    assert.ok(hop.to.x > before.x + 2, 'and forward');
  }
});

test('the three-dimensional teleport never arrives over the void: an aim past the arena\'s edge is drawn back to the last supported point', () => {
  const island = { ...world, floors: [{ id: 'island', center: [0, -.1, 0], size: [30, .2, 30], y: 0 }] };
  const aim = (pitch, hold) => {
    const { room, a } = battle({ tiers: { gale: 2, lightning: 2 }, at: { x: -10, y: 0, z: 10 } });
    room.world = island;
    a.position = { x: 0, y: 14, z: 0 }; a.grounded = false; a.velocity = { x: 0, y: 0, z: 0 };
    a.input = { ...a.input, pitch }; a.pitch = pitch;
    assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
    for (let now = 9; now < 9 + hold; now += DT) stepRoom(room, DT, now, island);
    releaseOneHitCharge(room, 'a', 9 + hold);
    return { a, hop: room.events.find((e) => e.type === 'oneHitTeleport') };
  };
  // (a faces +x: the island's edge is 15 m that way)
  const far = aim(.2, 3);
  assert.ok(far.hop, 'still a teleport');
  assert.ok(far.hop.to.x <= 15 + 1e-6 && far.hop.to.x > 12, `drawn back to the edge, not beyond it: x = ${far.hop.to.x}`);
  assert.ok(far.hop.to.y > far.hop.from.y, 'still up where it was aimed');
  assert.equal(far.a.alive, true);
  const near = aim(.2, .4);
  assert.ok(near.hop.to.x < 12 && near.hop.to.x > 3, 'a shorter aim inside the arena is untouched');
});

// ---------------------------------------------------------------------------------------------------------------
test('Full Lightning field: Conduct by field strength and by how much of the knight is in it; never stronger-overwritten, never topped up', () => {
  const { room, a, b } = battle({ tiers: { lightning: 2 } });
  assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
  stepRoom(room, DT, 9 + DT, world);
  releaseOneHitCharge(room, 'a', 9 + 2 * DT);
  const born = room.oneHitFields[0].bornAt;
  const field = room.oneHitFields[0];
  assert.equal(field.tiers.lightning, 2);
  assert.equal(b.electricalBacklash.initial, 12, 'the direct hit: the whole potential');

  // the struck knight stands in the field: its weaker contact never replaces the stronger status
  run(room, born + DT, 1);
  assert.equal(b.electricalBacklash.initial, 12);
  assert.equal(b.electricalBacklash.fieldId, undefined);

  // a fresh knight steps wholly in at half strength: half the potential
  const cx = field.position.x;
  const deep = add(room, 'deep', { x: cx + 1, y: 0, z: 0 }, born);
  stepRoom(room, DT, born + 2, world);
  const strengthNow = fieldStrength(field, born + 2);
  assert.ok(Math.abs(strengthNow - (1 - 2 / 4.3)) < 1e-9, 'one element: the field runs down over 4.3 seconds');
  assert.ok(Math.abs(deep.electricalBacklash.initial - 12 * strengthNow) < 1e-6, `12 x strength x full contact = ${deep.electricalBacklash.initial}`);
  assert.equal(deep.electricalBacklash.sourceId, 'a');
  // another only brushes the rim at the same moment: far less
  const brush = add(room, 'brush', { x: cx + field.radius + .2, y: 0, z: 0 }, born);
  stepRoom(room, DT, born + 2 + DT, world);
  assert.ok(brush.electricalBacklash.initial > 0 && brush.electricalBacklash.initial < 2, `a brush: ${brush.electricalBacklash.initial}`);
  assert.equal(deep.health, 100, 'the field itself does no damage');

  // leaving and coming back, and simply standing there, never tops it up
  const given = { ...deep.electricalBacklash };
  deep.position = { x: 30, y: 0, z: 0 };
  run(room, born + 2 + 2 * DT, .3);
  deep.position = { x: cx + 1, y: 0, z: 0 };
  run(room, born + 2.3 + 2 * DT, .5);
  assert.deepEqual(deep.electricalBacklash, given, 're-entering the same field changes nothing');
  // even once it has been discharged
  deep.electricalBacklash = null;
  run(room, born + 2.8 + 2 * DT, .3);
  assert.equal(deep.electricalBacklash, null, 'a field pays a knight once for a contact');
  // the brusher who then steps right in is in deeper than before: that is worth what the field still has
  brush.position = { x: cx + 1, y: 0, z: 0 };
  const was = oneHitBacklashRemaining(brush.electricalBacklash, born + 3.2);
  run(room, born + 3.1 + 2 * DT, 3 * DT);
  assert.ok(oneHitBacklashRemaining(brush.electricalBacklash, born + 3.2) > was, 'a deeper contact is a stronger one');

  // behind a wall from the field's heart: nothing. An ally of its owner: nothing.
  const walled = { ...world, solids: [{ id: 'wall', center: [cx, 1, 1.2], size: [8, 3, .2] }] };
  const hidden = add(room, 'hidden', { x: cx, y: 0, z: 2.2 }, born);
  run(room, born + 3.3, 3 * DT, walled);
  assert.equal(hidden.electricalBacklash, null, 'no line of sight, no Conduct');
  assert.equal(a.electricalBacklash, null, 'never its owner');

  run(room, born + 3.5, 1);
  assert.equal(room.oneHitFields.length, 0, 'gone');
});

test('Full Lightning: the held teleport reaches further the longer it is held, with no cap on the hold', () => {
  const reach = (hold) => {
    const { room, a } = battle({ tiers: { lightning: 2 }, at: { x: 150, y: 0, z: 90 } });
    tryUltimate(room, 'a', 9, { held: true });
    run(room, 9, hold);
    assert.equal(a.ultimateState.phase, 'startup', `still aiming after ${hold}s`);
    releaseOneHitCharge(room, 'a', 9 + hold);
    return a.position.x;
  };
  const one = reach(1), two = reach(2), four = reach(4), long = reach(30);
  assert.ok(one > 10 && two > one && four > two && long > four);
  assert.ok(two - one > (four - two) / 2 * .99 && four - two < (two - one) * 2, 'diminishing: logarithmic');
  assert.ok(Math.abs(two - 22 * Math.log1p(2 / .9)) < .6, `22 ln(1 + t/0.9): ${two}`);
});

// ---------------------------------------------------------------------------------------------------------------
test('Steel is earned by wearing one Sheathe in Steel through, uninterrupted: one stage a use, and the plate then lasts to its cooldown', () => {
  const { room, a } = battle();
  a.spell = 'steel'; a.preparedSpells = ['steel']; a.spellReadyAt = 0; a.spellReadyById = {};
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  assert.ok(a.steel.earning);
  run(room, 10, STEEL.fullSec - .2);
  assert.equal(a.oneHitInfusions.steel, 0, 'not before it has been worn through');
  run(room, 10 + STEEL.fullSec - .2, .4);
  assert.equal(a.oneHitInfusions.steel, 1, 'Half Steel');
  assert.equal(room.events.filter((e) => e.type === 'oneHitInfusion' && e.element === 'steel').length, 1);
  // the extension: fully hardened until the cooldown is over, then the ordinary wearing off
  assert.equal(a.steel.fullUntil, 10 + STEEL.cooldownSec);
  assert.equal(steelStrength(a.steel, 10 + STEEL.cooldownSec - .01), 1);
  assert.ok(Math.abs(steelStrength(a.steel, 10 + STEEL.cooldownSec + STEEL.fadeSec / 2) - .5) < 1e-9);
  assert.equal(steelStrength(a.steel, 10 + STEEL.cooldownSec + STEEL.fadeSec), 0);
  // the long plate earns nothing more
  run(room, 10 + STEEL.fullSec + .2, STEEL.cooldownSec - STEEL.fullSec);
  assert.equal(a.oneHitInfusions.steel, 1, 'the extended period makes no further progress');
  // a second use: Full Steel; a third: nothing more
  a.spellReadyAt = 0;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 40), true);
  run(room, 40, STEEL.fullSec + .1);
  assert.equal(a.oneHitInfusions.steel, 2, 'Full Steel');
  a.spellReadyAt = 0;
  tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 70);
  run(room, 70, STEEL.fullSec + .1);
  assert.equal(a.oneHitInfusions.steel, 2);
  assert.equal(a.steel.fullUntil, 70 + STEEL.cooldownSec, 'a qualifying use by a knight holding Steel still lasts');
});

test('Steel is not earned by an interrupted use, by a knight killed in it, or by one who does not carry the Disaster', () => {
  { // staggered while it is fully hardened
    const { room, a } = battle();
    a.spell = 'steel'; a.spellReadyAt = 0;
    tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10);
    run(room, 10, 2);
    a.staggerUntil = 12.5;
    run(room, 12, STEEL.fullSec);
    assert.equal(a.oneHitInfusions.steel, 0);
    assert.equal(a.steel.fullUntil, 10 + STEEL.fullSec, 'and no longer plate');
  }
  { // another ultimate equipped: Steel is exactly what it was
    const { room, a } = battle();
    a.ultimate = 'sunder'; a.spell = 'steel'; a.spellReadyAt = 0;
    tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10);
    run(room, 10, STEEL.fullSec + .5);
    assert.equal(a.oneHitInfusions.steel, 0);
    assert.equal(a.steel.fullUntil, 10 + STEEL.fullSec);
  }
});

test('Half Steel: +2, interrupts the struck, shrugs off ordinary blows in its wind-up, and fractures the ground all round', () => {
  const walled = { ...world, solids: [{ id: 'pillar', center: [0, 1, -3], size: [1.2, 3, 1.2] }] };
  const { room, a, b } = battle({ tiers: { steel: 1 } });
  b.health = 1000;
  // b is gathering a spell and has stamina to lose
  b.pendingSpell = { spell: 'fireball', castAt: 99 }; b.castEndsAt = 99;
  const far = add(room, 'far', { x: 0, y: 0, z: 5 });   // beyond the blow, on an arm of the fracture
  const behind = add(room, 'behind', { x: 0, y: 0, z: -5 }); // on the arm the pillar stops
  assert.equal(tryUltimate(room, 'a', 9), true);
  // an ordinary blow's worth of stagger, twice over, in the wind-up: it would have broken the brace
  run(room, 9, .3);
  assert.equal(staggerBy(room, a, 500, 9.3, 'b'), false, 'braced in plate');
  assert.equal(a.ultimateState.phase, 'startup');
  let now = 9.3;
  while (now < a.ultimateState.commitAt + DT) { stepRoom(room, DT, now, walled); now += DT; }

  assert.equal(decisive(room, 'b')[0].amount, 48);
  assert.equal(b.pendingSpell, null, 'what they were doing is ended');
  assert.ok(room.events.some((e) => e.type === 'actionInterrupted' && e.playerId === 'b' && e.by === 'a'));
  assert.equal(b.guardStamina, 100, 'Steel takes no Guard stamina of its own from the struck');

  const rupture = room.events.find((e) => e.type === 'rupture');
  assert.equal(rupture.radial, true);
  const angles = rupture.fissures.map((f) => Math.round((Math.atan2(f.dir.x, f.dir.z) * 180 / Math.PI + 360) % 360)).sort((x, y) => x - y);
  assert.equal(rupture.fissures.length, 8);
  assert.deepEqual(angles.map((angle, i) => (angle - angles[0]) - i * 45), Array(8).fill(0), `all round, evenly: ${angles}`);
  const toward = (dx, dz) => rupture.fissures.find((f) => f.dir.x * dx + f.dir.z * dz > .99);
  assert.ok(toward(0, 1).length >= 6, 'open ground: its whole reach');
  assert.ok(toward(0, -1).length < 2.6, `stopped at the pillar's foot: ${toward(0, -1).length}`);

  run(room, now, 1.2, walled);
  // the arm reaches `far`: the rupture's own small hurt and Shaken; never the decisive hit
  assert.equal(decisive(room, 'far').length, 0);
  assert.equal(room.events.filter((e) => e.type === 'damage' && e.source === 'rupture' && e.victimId === 'far').length, 1);
  assert.ok(far.shaken, 'Shaken by the fissure');
  assert.equal(far.guardStamina, 100, 'nor does its fracture');
  assert.ok(room.events.some((e) => e.type === 'oneHitFissure' && e.playerId === 'far'));
  // the one behind the pillar: the arm never reached them
  assert.equal(behind.health, 100);
  assert.equal(behind.shaken, null);
  // and the struck knight is not caught again by the fracture under their own feet
  assert.equal(room.events.filter((e) => e.type === 'damage' && e.victimId === 'b' && e.source !== 'one_hit_of_wonders').length, 0);
});

test('without Steel the wind-up is still broken by a stagger; a Guard pays its ordinary 40 whatever the blow carries', () => {
  {
    const { room, a } = battle();
    tryUltimate(room, 'a', 9); run(room, 9, .3);
    assert.equal(staggerBy(room, a, 500, 9.3, 'b'), true);
    stepRoom(room, DT, 9.3 + DT, world);
    assert.equal(a.ultimateState, null, 'interrupted, as it always was');
  }
  for (const tiers of [{}, { steel: 1 }, { steel: 2 }, { fire: 2, frost: 2, gale: 2, lightning: 1, steel: 2 }]) {
    const { room, b } = battle({ tiers });
    b.guarding = true; b.guardStartedAt = 0;
    slam(room);
    assert.equal(decisive(room, 'b').length, 0, 'guarded');
    assert.equal(b.guardStamina, 60, `40, once: ${JSON.stringify(tiers)}`);
    assert.equal(room.events.filter((e) => e.type === 'block' && e.oneHit).length, 1);
  }
});

test('Full Steel: more arms; the struck knight\'s Skills all start cooling again, ready or not; Prowess and the dash are left alone', () => {
  const { room, b } = battle({ tiers: { steel: 2 } });
  b.health = 1000;
  b.spell = 'fireball'; b.preparedSpells = ['fireball', 'frostfire', 'gale'];
  b.spellReadyAt = 0; b.spellReadyById = { frostfire: 5 };
  b.prowess = 37; b.dashReadyAt = 3;
  const now = slam(room);
  const at = decisive(room, 'b')[0].at;
  assert.equal(room.events.find((e) => e.type === 'rupture').fissures.length, 12);
  assert.equal(b.spellReadyAt, at + SPELLS.fireball.cooldownSec, 'a Skill that was ready');
  assert.equal(b.spellReadyById.frostfire, at + SPELLS.frostfire.cooldownSec);
  assert.equal(b.spellReadyById.gale, at + SPELLS.gale.cooldownSec);
  assert.ok(b.prowess >= 37, 'Prowess is not reset (being struck earns as it always does)');
  assert.equal(b.dashReadyAt, 3);
  assert.equal(tryCastSpell(room, 'b', { x: 1, y: 0, z: 0 }, now + 2), false, 'cooling');
  const restarted = room.events.filter((e) => e.type === 'oneHitCooldownsRestarted');
  assert.equal(restarted.length, 1);
  assert.deepEqual([...restarted[0].skills].sort(), ['fireball', 'frostfire', 'gale']);
  // Half Steel does not
  const half = battle({ tiers: { steel: 1 } }); half.b.health = 1000; half.b.spellReadyAt = 0;
  slam(half.room);
  assert.equal(half.b.spellReadyAt, 0);
});

test('Full Steel: HP cannot fall below 1 during the attack; what would have killed resolves the moment it ends', () => {
  const { room, a, b } = battle({ tiers: { steel: 2 }, at: { x: 30, y: 0, z: 0 } });
  a.health = 20;
  assert.equal(tryUltimate(room, 'a', 9), true);
  run(room, 9, .3);
  // a lethal blow in the wind-up
  applyDamage(room, 'b', 'a', 60, 'sword', 9.3);
  assert.equal(a.health, 1); assert.equal(a.alive, true);
  assert.equal(room.events.filter((e) => e.type === 'oneHitLastStand').length, 1);
  let now = run(room, 9.3, 1);
  assert.equal(a.ultimateState.phase, 'active', 'and the attack still comes');
  assert.ok(room.events.some((e) => e.type === 'oneHitImpact'));
  // more of it during the committed attack: still 1
  applyDamage(room, 'b', 'a', 60, 'sword', now);
  assert.equal(a.health, 1); assert.equal(a.alive, true);
  assert.equal(room.events.filter((e) => e.type === 'oneHitLastStand').length, 1, 'announced once');
  // the attack ends: dead at once, credited to whoever dealt it
  const until = a.ultimateState.until;
  now = run(room, now, until - now + 2 * DT);
  assert.equal(a.alive, false, 'deferred lethal damage resolves immediately after the attack');
  const death = room.events.find((e) => e.type === 'death' && e.victimId === 'a');
  assert.equal(death.killerId, 'b');
  assert.ok(death.at >= until && death.at <= until + 2 * DT);
  assert.ok(room.events.some((e) => e.type === 'oneHitLastStandEnded'));
});

test('Full Steel: non-lethal damage is ordinary; without Full Steel a lethal blow kills at once; the held Lightning aim gives no protection', () => {
  { // survivable damage: nothing deferred, the knight lives on
    const { room, a } = battle({ tiers: { steel: 2 }, at: { x: 30, y: 0, z: 0 } });
    tryUltimate(room, 'a', 9); run(room, 9, .3);
    applyDamage(room, 'b', 'a', 30, 'sword', 9.3);
    assert.equal(a.health, 70);
    run(room, 9.3, 4);
    assert.equal(a.alive, true);
    assert.equal(room.events.some((e) => e.type === 'oneHitLastStand'), false);
  }
  { // Half Steel: no floor
    const { room, a } = battle({ tiers: { steel: 1 }, at: { x: 30, y: 0, z: 0 } });
    tryUltimate(room, 'a', 9); run(room, 9, .3);
    applyDamage(room, 'b', 'a', 200, 'sword', 9.3);
    assert.equal(a.alive, false);
  }
  { // Full Steel + Full Lightning, aim held for a long time: mortal throughout the hold
    const { room, a } = battle({ tiers: { steel: 2, lightning: 2 }, at: { x: 30, y: 0, z: 0 } });
    assert.equal(tryUltimate(room, 'a', 9, { held: true }), true);
    run(room, 9, .2);
    applyDamage(room, 'b', 'a', 200, 'sword', 9.2);
    assert.equal(a.alive, false, 'no 1-HP protection while only aiming, even at once');
  }
  { // ...but the committed attack after the release is protected like any other
    const { room, a } = battle({ tiers: { steel: 2, lightning: 2 }, at: { x: 30, y: 0, z: 0 } });
    tryUltimate(room, 'a', 9, { held: true });
    run(room, 9, 5);
    releaseOneHitCharge(room, 'a', 14);
    assert.equal(a.ultimateState.phase, 'active');
    applyDamage(room, 'b', 'a', 200, 'sword', 14.1);
    assert.equal(a.health, 1);
    run(room, 14.1, 3);
    assert.equal(a.alive, false);
  }
});

test('aerial Steel: the wave\'s own blade interrupts and restarts cooldowns; its landing leaves no rupture and no ground field', () => {
  const { room, a, b } = battle({ tiers: { gale: 2, steel: 2 } });
  b.health = 1000; b.position = { x: 6, y: 0, z: 0 }; b.spellReadyAt = 0; b.pendingSpell = { spell: 'fireball', castAt: 99 };
  a.position = { x: 0, y: 0, z: 0 };
  room.oneHitWaves = [{ id: 'w', ownerId: 'a', position: { x: 4, y: 1, z: 0 }, direction: { x: 1, y: -.02, z: 0 },
    tiers: { fire: 0, frost: 0, gale: 2, lightning: 0, steel: 2 }, bornAt: 9, distance: 4, hitIds: [] }];
  run(room, 9, 1.5);
  const hit = decisive(room, 'b');
  assert.equal(hit.length, 1);
  assert.equal(b.pendingSpell, null, 'interrupted');
  assert.ok(b.spellReadyAt > 9, 'cooldowns restarted');
  assert.ok(b.blustered, 'and Blustered by the Gale in it');
  assert.equal(room.events.some((e) => e.type === 'rupture' || e.type === 'groundStrike'), false, 'no floating ground rupture');
  assert.equal(room.oneHitFields.length, 0);
});

test('terrain: the field lies on its own level; a knight on a platform above it, or behind a wall from it, is not in it', () => {
  const raised = { ...world,
    floors: [...world.floors, { id: 'deck', center: [2, 2.9, 0], size: [3, .2, 3], y: 3 }],
    solids: [{ id: 'wall', center: [0, 1.5, -2], size: [8, 3, .3] }] };
  const { room, a, b } = battle({ tiers: { frost: 2, lightning: 1 } });
  b.health = 1000;
  const above = add(room, 'above', { x: 2, y: 3, z: 0 });
  const behind = add(room, 'behind', { x: 0, y: 0, z: -2.8 });
  const now = slam(room, 9, raised);
  assert.equal(decisive(room, 'b').length, 1);
  assert.equal(decisive(room, 'above').length + decisive(room, 'behind').length, 0, 'the blow itself respects height and stone');
  run(room, now, .5, raised);
  assert.ok(b.oneHitField, 'the struck knight on the ground is in the field');
  assert.equal(above.oneHitField, null, 'three metres up is not');
  assert.equal(behind.oneHitField, null, 'nor is the far side of a wall');
  assert.equal(above.oneHitFrostSlow, null); assert.equal(behind.oneHitFrostSlow, null);
  assert.equal(a.health, 100);
});

// --- the supplemental specification ----------------------------------------------------------------------------
test('order: impact and Guard, the one decisive hit, then Shaken and the statuses, then the rupture, then the field', () => {
  const { room, b } = battle({ tiers: { gale: 1, lightning: 1, steel: 1 } });
  b.health = 1000;
  // (watch the struck knight at the moment the damage event is written: nothing of the aftermath exists yet)
  const seen = {};
  const push = room.events.push.bind(room.events);
  room.events.push = (...events) => {
    for (const e of events) if (e.type === 'damage' && e.source === 'one_hit_of_wonders') Object.assign(seen, { shaken: Boolean(b.shaken), blustered: Boolean(b.blustered), conduct: Boolean(b.electricalBacklash), fields: room.oneHitFields.length, ruptures: room.ruptures?.length ?? 0 });
    return push(...events);
  };
  slam(room);
  assert.deepEqual(seen, { shaken: false, blustered: false, conduct: false, fields: 0, ruptures: 0 }, 'at the decisive hit: no status, no rupture, no field yet');
  const order = (type, match = () => true) => room.events.findIndex((e) => e.type === type && match(e));
  const hit = order('damage', (e) => e.source === 'one_hit_of_wonders');
  assert.ok(hit >= 0 && hit < order('oneHitConduct') && hit < order('oneHitBlustered') && hit < order('actionInterrupted'), 'statuses after the hit');
  assert.ok(order('oneHitBlustered') < order('rupture') && order('rupture') < order('oneHitImpact'), 'then the rupture, then the field (announced with the impact)');
  assert.ok(b.shaken && room.oneHitFields.length === 1);
  // the field charged nothing for the hit that made it
  assert.equal(room.events.some((e) => e.type === 'oneHitFieldGuard'), false);
  assert.equal(b.guardStamina, 100, 'an unguarded struck knight loses no Guard stamina to the blow, Steel or not');
});

test('the Shaken field: later HP damage inside it costs Guard stamina by its strength, on the damage actually taken, once', () => {
  const { room, b } = battle();
  // a field at exactly 60%: 20 HP taken inside it costs 12 Guard stamina
  room.oneHitFields = [{ id: 'f', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, radius: 3.4, bornAt: 8.4, until: 12.4, tiers: {}, conducted: {} }];
  stepRoom(room, DT, 10, world);
  assert.ok(Math.abs(b.oneHitField.strength - .6) < 1e-9);
  applyDamage(room, 'a', 'b', 20, 'sword', 10);
  assert.ok(Math.abs(b.guardStamina - 88) < 1e-9, `100 - 20 x 0.6 = ${b.guardStamina}`);
  assert.equal(room.events.filter((e) => e.type === 'oneHitFieldGuard').length, 1);
  // mitigated damage: what the plate turned aside costs nothing
  b.steel = { calledAt: 9.9, fullUntil: 30, struck: true };
  const before = b.guardStamina, health = b.health;
  applyDamage(room, 'a', 'b', 30, 'gauntlet', 10);
  const taken = health - b.health;
  assert.ok(taken > 0 && taken < 30, `the plate turned some of it: ${taken} of 30`);
  assert.ok(Math.abs(before - b.guardStamina - taken * .6) < 1e-9, 'stamina for the damage actually suffered');
  // damage that takes no HP (spawn protection) costs nothing
  b.spawnProtectionUntil = 99; const kept = b.guardStamina;
  applyDamage(room, 'a', 'b', 20, 'sword', 10);
  assert.equal(b.guardStamina, kept);
});

test('field lifetimes: four seconds and 0.3 more for each distinct element, Half or Full alike; every field decays across all of it', () => {
  const sets = [{}, { gale: 1 }, { gale: 2, steel: 1 }, { fire: 2, frost: 1, steel: 2 }, { fire: 2, frost: 2, gale: 1, lightning: 1 }, { fire: 2, frost: 2, gale: 2, lightning: 1, steel: 2 }];
  sets.forEach((tiers, count) => {
    const expected = [4, 4.3, 4.6, 4.9, 5.2, 5.5][count];
    assert.equal(distinctElements(tiers), count);
    assert.ok(Math.abs(fieldSeconds(tiers) - expected) < 1e-9);
    const { room, b } = battle({ tiers });
    b.health = 1e6;
    const now = slam(room);
    const field = room.oneHitFields[0];
    assert.ok(Math.abs(field.until - field.bornAt - expected) < 1e-9, `the baseline field ${JSON.stringify(tiers)}`);
    for (const zone of room.oneHitBurnZones) assert.ok(Math.abs(zone.until - zone.bornAt - expected) < 1e-9, 'Full Fire\'s ground, the same');
    assert.equal(room.oneHitBurnZones.length, tiers.fire === 2 ? 1 : 0, 'Half Fire makes no burning ground');
    // decaying across the whole of it: half strength at half its life, still something just before the end
    assert.ok(Math.abs(fieldStrength(field, field.bornAt + expected / 2) - .5) < 1e-9);
    assert.ok(fieldStrength(field, field.bornAt + expected - .05) > 0 && fieldStrength(field, field.bornAt + expected - .05) < .02);
    run(room, now, expected - .2);
    assert.equal(room.oneHitFields.length, 1, 'still there just before');
    run(room, now + expected - .2, .4);
    assert.equal(room.oneHitFields.length, 0, 'gone just after');
    // Grounded Full Gale now launches a SECOND, later-travelling wave whose
    // Full Fire terminal can leave its own (later-expiring) burning patch.
    assert.equal(room.oneHitBurnZones.length,tiers.fire===2&&tiers.gale===2?1:0);
    run(room,now+expected+.2,1);
    assert.equal(room.oneHitBurnZones.length,0);
  });
});

test('Half Frost: the decisive contact stays open 0.3 s for a knight it has not met; never a second hit; Guard spends it once', () => {
  const late = (frost, delay) => {
    const { room, b } = battle({ tiers: frost ? { frost } : {} });
    b.health = 1000;
    const guard = add(room, 'guard', { x: 0, y: 0, z: 1.8 });
    guard.yaw = 0; guard.input.yaw = 0; guard.guarding = true; guard.guardStartedAt = 0; // (faces -z: toward the caster)
    const comer = add(room, 'comer', { x: 30, y: 0, z: 0 });
    comer.health = 1000;
    const now = slam(room);
    const impactAt = room.events.find((e) => e.type === 'oneHitImpact').at;
    run(room, now, Math.max(0, impactAt + delay - now));
    comer.position = { x: -2, y: 0, z: 0 };
    run(room, impactAt + delay, 1);
    return { room, b, guard, comer };
  };
  const caught = late(1, .2);
  assert.equal(decisive(caught.room, 'comer').length, 1, 'entering 0.2 s after the blow: caught by the same blow');
  assert.equal(decisive(caught.room, 'comer')[0].amount, 57, 'its one decisive hit');
  assert.ok(caught.comer.oneHitFrostSlow && caught.comer.shaken);
  assert.equal(caught.room.events.filter((e) => e.type === 'oneHitLateContact').length, 1);
  assert.equal(decisive(caught.room, 'b').length, 1, 'the knight it had already struck is not struck again');
  assert.equal(caught.room.events.filter((e) => e.type === 'block' && e.oneHit).length, 1, 'a Guard that spent its contact is not asked again');
  assert.ok(caught.guard.guardStamina >= 60 && caught.guard.guardStamina < 66, 'its 40, once (a little has come back since)');
  assert.equal(caught.room.events.filter((e) => e.type === 'oneHitImpact').length, 1, 'one blow');
  assert.equal(caught.room.events.filter((e) => e.type === 'rupture').length, 1);
  assert.equal(caught.room.oneHitFields.length, 1, 'and one field');
  assert.equal(decisive(late(1, .45).room, 'comer').length, 0, 'entering after 0.3 s: too late');
  assert.equal(decisive(late(0, .1).room, 'comer').length, 0, 'without Frost the contact is the instant of the blow');
  assert.equal(decisive(late(2, .2).room, 'comer').length, 1, 'Full Frost inherits it');
});

test('Flash Freeze holds; it does not interrupt: nothing is cancelled, nothing new begins, and it is not an Interrupted', () => {
  const { room, a, b } = battle({ tiers: { frost: 2 } });
  b.health = 1000; b.spell = 'fireball'; b.spellReadyAt = 0;
  // b is gathering a Fireball as the blow lands
  assert.equal(tryUltimate(room, 'a', 9), true);
  const commit = a.ultimateState.commitAt;
  run(room, 9, commit - 9 - .1);
  assert.equal(tryCastSpell(room, 'b', { x: -1, y: 0, z: 0 }, commit - .1), true);
  const dueAt = b.castEndsAt;
  let now = commit - .1;
  while (now < commit + DT) { stepRoom(room, DT, now, world); now += DT; }
  const frozenUntil = b.oneHitFrozenUntil;
  assert.ok(frozenUntil > now && frozenUntil - commit <= .9 + DT);
  assert.ok(b.pendingSpell, 'the gathering spell is still in the palm');
  assert.equal(room.events.some((e) => e.type === 'actionInterrupted'), false, 'no Interrupted');
  assert.equal(room.challengeFacts?.some?.((f) => f.type === 'swordChainInterrupted' || f.type === 'ultimateInterrupted') ?? false, false);
  // while frozen: no turning, no moving of their own, nothing new
  const facing = b.yaw, at = { ...b.position };
  b.input = { ...b.input, yaw: facing + 2, forward: 1 };
  b.velocity = { x: 0, y: 0, z: 0 }; b.impulse = { x: 0, z: 0 };
  const mid = now + .3;
  run(room, now, .3);
  assert.equal(b.yaw, facing, 'cannot turn');
  assert.ok(Math.hypot(b.position.x - at.x, b.position.z - at.z) < .9, 'does not walk (the blow\'s own shove aside)');
  assert.equal(beginAttack(room, 'b', mid), false);
  assert.equal(tryGauntletStrike(room, 'b', mid), false);
  assert.equal(tryDash(room, 'b', { x: 1, z: 0 }, mid), false);
  assert.equal(setGuard(room, 'b', true, mid), false);
  b.prowess = PROWESS.full; b.ultimate = 'sunder';
  assert.equal(tryUltimate(room, 'b', mid), false);
  assert.equal(room.projectiles.size, 0, 'and the spell has not flown while they were held');
  // it lets go: the spell flies, later than it would have by about as long as they were held
  run(room, mid, 1.2);
  const cast = room.events.find((e) => e.type === 'spellSpawn' || e.type === 'projectile' || e.type === 'spellFired' || e.type === 'spellRelease');
  assert.ok(room.projectiles.size > 0 || cast || !b.pendingSpell, 'the held spell is loosed after the thaw, not lost');
  assert.equal(b.pendingSpell, null);
  assert.ok(room.events.some((e) => e.type !== 'spellCast' && /spell|projectile/i.test(e.type) && e.at >= frozenUntil - DT && e.at > dueAt + .5), `released after the ice let go (due ${dueAt.toFixed(2)}, thawed ${frozenUntil.toFixed(2)})`);
  assert.equal(beginAttack(room, 'b', mid + 1.3), true, 'and they may act again');
});

test('Flash Freeze holds a sword chain where it was: the blow under way lands late, not never', () => {
  const { room, b } = battle();
  const c = add(room, 'c', { x: 3.6, y: 0, z: 0 }); // b's target, 1.8 m beyond b
  c.health = 1000;
  b.yaw = -Math.PI / 2; b.input.yaw = b.yaw; // faces +x: toward c
  beginAttack(room, 'b', 10);
  run(room, 10, .2);
  b.oneHitFrozenUntil = 10.2 + .9; // (frozen a fifth of a second into the swing, before its contact at 0.4)
  run(room, 10.2, .6);
  assert.equal(room.events.some((e) => e.type === 'swordHit' && e.playerId === 'b'), false, 'held: the blow has not landed while frozen');
  assert.equal(b.attackActive, true, 'and the chain is not broken');
  run(room, 10.8, .8);
  const hit = room.events.find((e) => e.type === 'swordHit' && e.playerId === 'b');
  assert.ok(hit, 'it lands after the thaw');
  assert.ok(hit.at > 11.1 && hit.at < 11.5, `about 0.9 s later than it would have: ${hit.at.toFixed(2)}`);
});

test('Gale with Fire: the shove is by where they stood, and the struck come down in the fire; alone, Gale throws them clear', () => {
  const rest = (tiers, distance) => {
    const { room, b } = battle({ tiers, at: { x: distance, y: 0, z: 0 } });
    b.health = 1000;
    const now = slam(room);
    run(room, now, 3);
    return { travelled: Math.hypot(b.position.x, b.position.z) - distance, at: Math.hypot(b.position.x, b.position.z) };
  };
  for (const gale of [1, 2]) for (const distance of [1, 2, 3, 4, 4.4]) {
    const end = rest({ fire: 2, gale }, distance).at;
    assert.ok(end <= ONE_HIT_REACH.fire.radius + .4, `Full Fire + Gale ${gale}: struck at ${distance} m rests at ${end.toFixed(2)} m, in or on the 4.6 m fire`);
  }
  const heart = rest({ fire: 2, gale: 1 }, 1).travelled, edge = rest({ fire: 2, gale: 1 }, 4.2).travelled;
  assert.ok(heart > 1.2, `still thrown from the heart: ${heart.toFixed(2)} m`);
  assert.ok(edge < heart / 3 && edge > 0, `far less at the edge: ${edge.toFixed(2)} m`);
  assert.ok(rest({ gale: 1 }, 3).at > 4.6, 'Gale alone throws a knight at 3 m well out');
  assert.ok(rest({ gale: 1 }, 3).travelled > rest({}, 3).travelled * 2, 'and much further than the plain blow');
  // no barrier: a knight shoved toward a drop still goes over it
  const ledge = { ...world, floors: [{ id: 'ledge', center: [0, -.1, 0], size: [9.2, .2, 9.2], y: 0 }] };
  const { room, b } = battle({ tiers: { fire: 2, gale: 1 }, at: { x: 4.5, y: 0, z: 0 } });
  b.health = 1000;
  const now = slam(room, 9, ledge);
  run(room, now, 2.5, ledge);
  assert.ok(b.position.y < -1 || !b.alive, 'the edge of the world is still an edge');
});

test('aerial: Half Fire widens the wave on every side and ends it in an explosion that is the same decisive contact', () => {
  const fly = (tiers, target, wall = true, height = 1.2) => {
    const { room, a, b } = battle({ at: { x: 60, y: 0, z: 0 } });
    const t = add(room, 't', target); t.health = 1000;
    const w = wall ? { ...world, solids: [{ id: 'wall', center: [12, 2, 0], size: [.4, 8, 12] }] } : world;
    room.oneHitWaves = [{ id: 'w', ownerId: 'a', position: { x: 2, y: height, z: 0 }, direction: { x: 1, y: 0, z: 0 }, tiers: { fire: 0, frost: 0, gale: 2, lightning: 0, steel: 0, ...tiers }, bornAt: 9, distance: 2, hitIds: [] }];
    run(room, 9, 1.5, w);
    return { room, t, hits: decisive(room, 't') };
  };
  // beside the wave's line: 1.3 m out is beyond the plain wave (0.9), inside Fire's (1.5); so is 1.3 m above it
  assert.equal(fly({}, { x: 6, y: 0, z: 1.3 }).hits.length, 0);
  assert.equal(fly({ fire: 1 }, { x: 6, y: 0, z: 1.3 }).hits.length, 1, 'beside');
  assert.equal(fly({ fire: 1 }, { x: 6, y: 1.3, z: 0 }).hits.length, 1, 'above');
  assert.equal(fly({ fire: 1 }, { x: 6, y: 0, z: 0 }, true, 2.4).hits.length, 1, 'below (the wave passing 1.4 m over a knight\'s chest)');
  assert.equal(fly({}, { x: 6, y: 0, z: 0 }, true, 2.4).hits.length, 0, 'which the plain wave clears');
  assert.equal(fly({ fire: 1 }, { x: 6, y: 0, z: 2 }).hits.length, 0, 'not beyond it');
  // where it ends (the wall at x = 11.8): 2.6 m from it is beyond the plain gust (2.2), inside Fire's explosion (3.4)
  const plain = fly({ frost: 1 }, { x: 10.6, y: 0, z: 2.4 });
  assert.equal(plain.hits.length, 0, 'the plain landing gust does not reach, and deals no HP when it does');
  const blast = fly({ fire: 1, frost: 1, lightning: 1 }, { x: 10.6, y: 0, z: 2.4 });
  assert.equal(blast.hits.length, 1, 'Fire\'s explosion: the one decisive hit for a knight the wave had not met');
  assert.ok(blast.t.oneHitFrostSlow && blast.t.electricalBacklash && blast.t.shaken && blast.t.blustered, 'with everything the wave carries');
  assert.equal(blast.t.burn, null);
  assert.equal(blast.room.oneHitBurnZones.length, 0, 'Half Fire leaves nothing burning');
  // a knight the moving wave already struck stands in the explosion too: not struck again
  const both = fly({ fire: 2 }, { x: 10.4, y: 0, z: .2 });
  assert.equal(both.hits.length, 1, 'wave and explosion share one registry');
  assert.equal(both.room.oneHitBurnZones.length, 1, 'Full Fire: burning ground where it ended on the ground');
  // ended in mid-air by its range: nothing left burning in the air
  const air = fly({ fire: 2 }, { x: 40, y: 0, z: 0 }, false);
  assert.equal(air.room.oneHitBurnZones.length, 0);
});

test('a fully infused wave: one decisive hit a victim, every status and Steel consequence once, across wave, explosion and Frost\'s longer contact', () => {
  const { room } = battle({ at: { x: 60, y: 0, z: 0 } });
  const tiers = { fire: 2, frost: 2, gale: 2, lightning: 2, steel: 2 };
  const onLine = add(room, 'onLine', { x: 6, y: 0, z: 0 }), inBlast = add(room, 'inBlast', { x: 10.2, y: 0, z: 2.2 }), late = add(room, 'late', { x: 30, y: 0, z: 9 });
  for (const k of [onLine, inBlast, late]) { k.health = 1000; k.spellReadyAt = 0; }
  const w = { ...world, solids: [{ id: 'wall', center: [12, 2, 0], size: [.4, 8, 12] }] };
  room.oneHitWaves = [{ id: 'w', ownerId: 'a', position: { x: 2, y: 1.2, z: 0 }, direction: { x: 1, y: 0, z: 0 }, tiers, bornAt: 9, distance: 2, hitIds: [] }];
  let now = 9;
  while (!room.events.some((e) => e.type === 'oneHitImpact')) { stepRoom(room, DT, now, w); now += DT; }
  late.position = { x: 10.5, y: 0, z: -1.5 }; // walks into where it ended, a tenth of a second on
  run(room, now + .1, 1.2, w);
  for (const id of ['onLine', 'inBlast', 'late']) {
    assert.equal(decisive(room, id).length, 1, `${id}: one decisive hit`);
    for (const type of ['oneHitConduct', 'oneHitBlustered', 'oneHitCooldownsRestarted', 'actionInterrupted'])
      assert.equal(room.events.filter((e) => e.type === type && e.playerId === id).length, 1, `${id}: ${type} once`);
  }
  assert.equal(room.events.filter((e) => e.type === 'oneHitImpact').length, 1);
  assert.equal(room.events.some((e) => e.type === 'rupture' || e.type === 'groundStrike'), false, 'no ground rupture from the air');
  assert.equal(room.oneHitFields.length, 0, 'and no ground field');
  assert.equal(room.oneHitBurnZones.length, 1);
  assert.ok(Math.abs(room.oneHitBurnZones[0].until - room.oneHitBurnZones[0].bornAt - 5.5) < 1e-9);
});

// ---------------------------------------------------------------------------------------------------------------
test('Practice presets carry all five tracks and commit like the real thing', () => {
  for (const [name, stages] of Object.entries(ONE_HIT_PRESETS)) {
    assert.deepEqual(Object.keys(stages), [...ONE_HIT_ELEMENTS], name);
    const { room, a, b } = battle({ mode: 'PRACTICE' });
    b.health = 1000;
    assert.equal(configurePracticeOneHit(room, 'a', { action: 'preset', preset: name }, 9), true, name);
    assert.deepEqual(a.practiceOneHit.stages, { ...stages });
    if (stages.lightning === 2) {
      tryUltimate(room, 'a', 9, { held: true }); stepRoom(room, DT, 9 + DT, world);
      releaseOneHitCharge(room, 'a', 9 + 2 * DT);
    } else slam(room);
    assert.equal(decisive(room, 'b')[0].amount, oneHitDamage(stages), name);
    assert.deepEqual(a.practiceOneHit.stages, { ...stages }, 'a Practice preset is kept for the next cast');
  }
  const { room, a } = battle({ mode: 'PRACTICE' });
  assert.equal(configurePracticeOneHit(room, 'a', { action: 'level', element: 'steel', tier: 2 }, 9), true);
  assert.equal(a.practiceOneHit.stages.steel, 2);
  const pvp = battle();
  assert.equal(configurePracticeOneHit(pvp.room, 'a', { action: 'preset', preset: 'full' }, 9), false, 'never in a real match');
});

test('every status and field is on the wire, and all of them are gone a few seconds after the blow', () => {
  const { room, b } = battle({ tiers: { fire: 2, frost: 2, gale: 2, lightning: 1, steel: 1 } });
  b.health = 1000;
  const now = slam(room);
  const seen = serializeSnapshot(room, now);
  const wire = seen.players.find((p) => p.id === 'b');
  assert.ok(wire.shaken && wire.blustered && wire.electricalBacklash && wire.oneHitFrostSlow);
  assert.equal(seen.oneHitFields.length, 1); assert.equal(seen.oneHitBurnZones.length, 1);
  assert.deepEqual(Object.keys(seen.players.find((p) => p.id === 'a').oneHitInfusions), [...ONE_HIT_ELEMENTS]);
  b.position = { x: 60, y: 0, z: 0 }; b.velocity = { x: 0, y: 0, z: 0 };
  run(room, now, 6.5);
  assert.equal(b.shaken, null); assert.equal(b.blustered, null); assert.equal(b.electricalBacklash, null);
  assert.equal(b.oneHitFrostSlow, null); assert.equal(b.burn, null); assert.equal(b.oneHitField, null);
  assert.equal(room.oneHitFields.length, 0); assert.equal(room.oneHitBurnZones.length, 0);
  assert.equal(b.speedScale, 1);
});
