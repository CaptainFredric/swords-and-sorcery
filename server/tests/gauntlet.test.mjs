import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, tryCastOrGauntlet } from '../../shared/sim/combat.mjs';
import { GAUNTLET } from '../../shared/src/gauntlet.mjs';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

// The gauntlet strike: with the spell on its cooldown, the spell's key throws the magic hand's fist at a foe within
// arm's reach, and nothing at all otherwise. Light, a small shove, no stun or guard break, and it shares the sword's
// one line of attack, so it can never be woven into more damage than holding the sword.

const TICK = 1 / 30;
const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [80, 0.2, 80], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 30, y: 0, z: 0, yaw: 0 }],
  abyssY: -9,
};

// A faces B (straight ahead, -z) at `gap` metres; A's spell is on its cooldown unless `spellReady`
function duel({ gap = 1.1, spellReady = false } = {}) {
  const room = new Room('FIST');
  room.world = openWorld;
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 0, y: 0, z: -gap });
  a.yaw = 0; a.input.yaw = 0;
  b.yaw = Math.PI; b.input.yaw = Math.PI;
  a.spawnProtectionUntil = 0;
  b.spawnProtectionUntil = 0;
  a.spellReadyAt = spellReady ? 0 : 1000;
  room.events.length = 0;
  return { room, a, b };
}

function run(room, from, to, each = () => {}) {
  const events = [];
  for (let now = from; now <= to + 1e-9; now += TICK) {
    each(now);
    events.push(...stepRoom(room, TICK, now, openWorld).splice(0));
  }
  return events;
}

test('with the spell ready, its key casts the spell: never a fist', () => {
  const { room, a } = duel({ spellReady: true });
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10), true);
  assert.ok(a.pendingSpell, 'the spell gathers');
  assert.ok(!room.events.some((e) => e.type === 'gauntletStrike'));
});

test('on its cooldown, a foe within arm\'s reach gets the fist: light, a small shove, no stun and no throw', () => {
  const { room, a, b } = duel();
  beginAttack(room, 'b', 9.9);
  const before = { ...b.position };
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10), true);
  const events = run(room, 10, 10 + GAUNTLET.startup + 0.1);
  const hit = events.find((e) => e.type === 'damage' && e.source === 'gauntlet');
  assert.ok(hit, 'it lands');
  assert.equal(hit.amount, GAUNTLET.damage);
  assert.ok(hit.push && Math.hypot(hit.push.x, hit.push.z) <= GAUNTLET.shove + 1e-9 && hit.push.y < 0.5, 'a small shove');
  assert.ok(b.position.z < before.z, 'pushed away from the fist');
  assert.ok(!(b.staggerUntil > 10), 'no stun');
  assert.ok(b.attackActive, 'their own swing carries on');
  assert.ok(Math.abs(a.velocity.y) < 1e-9, 'the fist throws nobody (not its knight either)');
});

test('on command: with nobody in reach the fist still goes out, and meets only air', () => {
  const { room, a } = duel({ gap: GAUNTLET.reach + GAUNTLET.landSlack + 1 });
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10), true);
  const events = run(room, 10, 10.6);
  assert.ok(events.some((e) => e.type === 'gauntletStrike' && e.targetId === null), 'thrown');
  assert.ok(events.some((e) => e.type === 'gauntletMiss' && e.reason === 'air'), 'at the air');
  assert.ok(!events.some((e) => e.type === 'damage'));
  // and it is still a blow: its recovery holds the next
  assert.ok(a.gauntletReadyAt >= 10 + GAUNTLET.startup + GAUNTLET.recovery - 1e-9);
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.3), false, 'not again before its recovery');
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.6), true, 'and again after it');
});

test('it reaches a foe at an ordinary fighting distance, and one who walks into it as it goes home', () => {
  // squared up at sword distance (bodies apart, as in a fight): the fist lands
  const fight = duel({ gap: 1.7 });
  tryCastOrGauntlet(fight.room, 'a', { x: 0, y: 0, z: -1 }, 10);
  assert.ok(run(fight.room, 10, 10.4).some((e) => e.type === 'damage' && e.source === 'gauntlet'), 'lands at 1.7 m');
  // thrown at the air, then a foe steps into it before it lands
  const late = duel({ gap: 3 });
  tryCastOrGauntlet(late.room, 'a', { x: 0, y: 0, z: -1 }, 10);
  late.b.position.z = -1.4;
  late.b.history = [];
  assert.ok(run(late.room, 10, 10.4).some((e) => e.type === 'damage' && e.source === 'gauntlet'), 'caught stepping in');
});

test('never through the sword: refused while a committed strike has yet to land or its blade is live; from a chain\'s recovery it ends the chain', () => {
  const { room, a } = duel();
  beginAttack(room, 'a', 10);
  // the first strike is committed and not yet landed
  run(room, 10, 10.2);
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.2), false, 'not in the windup');
  run(room, 10.2 + TICK, 10.37);
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.37), false, 'not while the blade is live');
  // held on: the second strike is committed as soon as it is due, and the fist waits for it too
  run(room, 10.37 + TICK, 10.8);
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.8), false, 'not in the backhand\'s windup');
  // let go after the first: in its recovery the fist may come, and it ends the chain (standing close: the sword's own
  // blow shoves them back a little)
  const next = duel({ gap: 0.85 });
  beginAttack(next.room, 'a', 10);
  endAttack(next.room, 'a', 10.05);
  run(next.room, 10, 10.6);
  assert.equal(tryCastOrGauntlet(next.room, 'a', { x: 0, y: 0, z: -1 }, 10.6), true);
  assert.equal(next.a.attackActive, false, 'the chain is over');
});

test('after the fist nothing attacks again before its recovery, nor before the sword\'s next strike would have come', () => {
  const { room, a } = duel();
  beginAttack(room, 'a', 10);
  endAttack(room, 'a', 10.05);
  run(room, 10, 10.55);
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10.55), true);
  const readyAt = a.gauntletReadyAt;
  assert.ok(readyAt >= 10.55 + GAUNTLET.startup + GAUNTLET.recovery - 1e-9);
  // pressed straight away: the sword waits for the fist's recovery (and the chain's own gate)
  beginAttack(room, 'a', 10.6);
  const swings = [];
  run(room, 10.6, 11.6, () => {}).forEach((e) => { if (e.type === 'swordSwing' && e.playerId === 'a') swings.push(e.at); });
  const gate = Math.max(readyAt, 10 + SWORD_CHAIN.starts[1]);
  assert.ok(swings.length && swings[0] >= gate + SWORD_STRIKE_TIMES[0] - 0.09 - TICK - 1e-6, `the sword came round at ${swings[0]?.toFixed(3)}`);
  // and a second fist waits for the first's recovery
  assert.equal(tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, readyAt - 0.05), false);
});

test('a guard facing the fist pays a little and is never broken', () => {
  const { room, a, b } = duel();
  setGuard(room, 'b', true, 9);
  // a guard all but spent, and still under pressure (a raised guard's stamina comes back once the pressure lets up)
  b.guardStamina = 4;
  b.lastGuardDrainAt = 10;
  tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10);
  const events = run(room, 10, 10.3);
  assert.equal(b.health, 100, 'no damage through the guard');
  assert.ok(events.some((e) => e.type === 'gauntletHit' && e.guarded));
  assert.ok(!events.some((e) => e.type === 'guardBreak'), 'no guard break');
  assert.ok(!(b.staggerUntil > 10), 'no stagger');
  assert.equal(b.guarding, false, 'the spent guard is lowered');
  assert.ok(a.alive);
});

test('weaving the fist between cuts never out-damages simply holding the sword', () => {
  const window = 6;
  const damageTo = (events) => events.filter((e) => e.type === 'damage' && e.victimId === 'b').reduce((sum, e) => sum + e.amount, 0);
  // B stays squarely in front, in reach of both (every blow shoves them, and this is about the rate, not the chase)
  const pin = (b) => { Object.assign(b.position, { x: 0, y: 0, z: -1.1 }); b.impulse = { x: 0, z: 0 }; b.lastDamageAt = 1e9; };
  // holding the sword on a foe in reach (B has health to spare, and never regains it in the window)
  const held = duel({ gap: 1.1 });
  held.b.health = 10000;
  beginAttack(held.room, 'a', 10);
  const heldDamage = damageTo(run(held.room, 10, 10 + window, () => pin(held.b)));
  // the fist thrown as early as allowed after each landed strike, and the sword pressed as early as allowed after
  let best = 0;
  for (const after of [0.12, 0.15, 0.2, 0.3]) {
    for (const lead of [0, 0.05, 0.1]) {
      const weave = duel({ gap: 1.1 });
      weave.b.health = 10000;
      let pressAt = 10;
      let fistAt = null;
      const events = run(weave.room, 10, 10 + window, (now) => {
        pin(weave.b);
        const a = weave.a;
        if (pressAt !== null && now >= pressAt - 1e-9) {
          beginAttack(weave.room, 'a', now);
          endAttack(weave.room, 'a', now + 0.01);
          pressAt = null;
          fistAt = null;
        }
        // after a strike has landed, the fist; then the sword again as soon as it would start
        if (pressAt === null && fistAt === null && a.attackActive && a.attackNextStrike >= 1) fistAt = now + after;
        if (fistAt !== null && now >= fistAt - 1e-9 && tryCastOrGauntlet(weave.room, 'a', { x: 0, y: 0, z: -1 }, now)) {
          pressAt = Math.max(a.gauntletReadyAt, a.attackRestartAt ?? -Infinity) - lead;
          fistAt = Infinity;
        }
      });
      best = Math.max(best, damageTo(events));
    }
  }
  assert.ok(best > 0, 'the weave lands something');
  assert.ok(best <= heldDamage, `a weave did ${best} to holding's ${heldDamage}`);
});

test('Sheathed in Steel blunts the fist as it would a clean sword blow, and the shove is the same', () => {
  const blow = (steel) => {
    const { room, b } = duel();
    if (steel) { b.spell = 'steel'; b.spellReadyAt = 0; assert.equal(tryCastOrGauntlet(room, 'b', { x: 0, y: 0, z: 1 }, 9.9), true); }
    tryCastOrGauntlet(room, 'a', { x: 0, y: 0, z: -1 }, 10);
    const events = run(room, 10, 10.4);
    return { hurt: events.find((e) => e.type === 'damage' && e.victimId === 'b'), vz: b.velocity.z, impulse: b.impulse.z };
  };
  const bare = blow(false);
  const steeled = blow(true);
  assert.equal(bare.hurt.amount, GAUNTLET.damage);
  assert.ok(steeled.hurt.amount < bare.hurt.amount && steeled.hurt.amount >= Math.round(GAUNTLET.damage * 2 / 3), `${steeled.hurt.amount}`);
  assert.ok(steeled.hurt.steel > 0.9 && !bare.hurt.steel, 'the damage word says how strong the plate was');
  assert.equal(steeled.hurt.turned, GAUNTLET.damage - steeled.hurt.amount, 'and what it turned aside');
  assert.ok(Math.abs(steeled.impulse - bare.impulse) < 1e-6, 'the same shove');
});

test('the gauntlet\'s own key throws the fist with the spell ready, and leaves the spell for later', async () => {
  const { applyRoomCommand } = await import('../../shared/sim/wire.mjs');
  const { room, a } = duel({ spellReady: true });
  applyRoomCommand(room, a, { type: 'gauntlet', clientTime: 10 }, 10);
  assert.ok(a.gauntlet, 'the fist is going out');
  assert.equal(a.pendingSpell, null, 'no spell gathered');
  assert.equal(a.spellReadyAt, 0, 'the spell is still ready');
  const events = run(room, 10, 10.4);
  assert.ok(events.some((e) => e.type === 'damage' && e.source === 'gauntlet'));
});
