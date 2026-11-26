import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom, tryCastOrGauntlet, tryCastSpell, tryDash } from '../../shared/sim/combat.mjs';
import { PRACTICE_RECAST, practiceOverride } from '../../shared/src/practiceRecast.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';

// The Practice Yard's recast gate (shared/src/practiceRecast.mjs): an ability comes back after a moment, while its
// real cooldown runs on and shows exactly as in a match; a match keeps its cooldowns as ever.

const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 8, y: 0, z: 0, yaw: 0 }],
  abyssY: -9,
};

function room(mode, spell = 'gale') {
  const r = new Room('PRACT', { mode });
  const a = r.addPlayer({ id: 'a', token: 'ta', name: 'A', spell }, 0);
  if (mode !== 'PRACTICE') {
    r.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
    r.setReady('a', true, 0);
    r.setReady('b', true, 0);
  } else {
    r.armAutoStart(0);
  }
  r.tick(3.2);
  for (let t = 3.2; t < 4; t += 0.05) stepRoom(r, 0.05, t, openWorld);
  assert.equal(r.state, 'PLAYING');
  a.spawnProtectionUntil = 0;
  a.spellReadyAt = 0;
  a.dashReadyAt = 0;
  return { room: r, a };
}

const run = (r, from, to) => { for (let t = from; t <= to + 1e-9; t += 0.02) stepRoom(r, 0.02, t, openWorld); };
const cast = (r, at) => tryCastOrGauntlet(r, 'a', { x: 0, y: 0, z: -1 }, at);

test('in the yard a Gale can be cast again after the short gate, its real cooldown counting down untouched', () => {
  const { room: r, a } = room('PRACTICE');
  const gale = SPELLS.gale;
  assert.ok(cast(r, 10), 'the first Gale');
  const readyAt = a.spellReadyAt;
  assert.ok(Math.abs(readyAt - (10 + gale.cooldownSec)) < 1e-9, 'the real cooldown, as in a match');
  // (its breath: the palm is busy while it gathers; the gate opens as it leaves)
  run(r, 10, 10 + Math.max(PRACTICE_RECAST.gateSec, gale.gatherSec) + 0.05);
  const again = 10 + Math.max(PRACTICE_RECAST.gateSec, gale.gatherSec) + 0.06;
  assert.ok(practiceOverride(a, 'spell', again, true), 'the yard lets it through, and says so');
  assert.ok(cast(r, again), 'cast again long before the cooldown');
  assert.equal(a.spellReadyAt, readyAt, 'the running cooldown not started over');
  let t = again;
  let casts = 2;
  while (t + 0.6 < readyAt) {
    run(r, t, t + 0.6);
    t += 0.6;
    if (cast(r, t)) casts += 1;
    assert.equal(a.spellReadyAt, readyAt, `still the first cooldown at ${t.toFixed(1)}`);
  }
  assert.ok(casts >= 8, `many Gales inside one cooldown (${casts})`);
  // once the real cooldown has run out, the next cast starts a fresh one
  // (the last Gale's breath let go first)
  const next = Math.max(readyAt, t + gale.gatherSec) + 0.1;
  run(r, t, next);
  assert.ok(cast(r, next));
  assert.ok(Math.abs(a.spellReadyAt - (next + gale.cooldownSec)) < 1e-9, 'a fresh cooldown');
});

test('the gate itself holds for a moment: not twice in a breath', () => {
  const { room: r, a } = room('PRACTICE', 'fireball');
  assert.ok(cast(r, 10));
  run(r, 10, 10.35);
  assert.equal(tryCastSpell(r, 'a', { x: 0, y: 0, z: -1 }, 10.1), false, 'within the gate');
  assert.ok(cast(r, 10 + Math.max(PRACTICE_RECAST.gateSec, SPELLS.fireball.gatherSec) + 0.02), 'after it');
  void a;
});

test('Sheathe in Steel and the dash take the same gate in the yard', () => {
  const { room: r, a } = room('PRACTICE', 'steel');
  assert.ok(cast(r, 10));
  const steelReady = a.spellReadyAt;
  assert.ok(cast(r, 10 + PRACTICE_RECAST.gateSec + 0.01), 'Steel again');
  assert.equal(a.spellReadyAt, steelReady);
  assert.ok(tryDash(r, 'a', { x: 0, z: -1 }, 10));
  const dashReady = a.dashReadyAt;
  assert.ok(Math.abs(dashReady - (10 + MOVEMENT.dashCooldown)) < 1e-9);
  run(r, 10, 10.4);
  assert.ok(tryDash(r, 'a', { x: 1, z: 0 }, 10.4), 'a second dash as a drill');
  assert.equal(a.dashReadyAt, dashReady, 'its real cooldown untouched');
});

test('a match keeps its ordinary cooldowns: no gate, no early recast, the fist on the spell\'s key', () => {
  const { room: r, a } = room('FFA');
  assert.ok(cast(r, 10));
  run(r, 10, 11);
  assert.equal(tryCastSpell(r, 'a', { x: 0, y: 0, z: -1 }, 11), false, 'still cooling');
  assert.equal(a.practiceGate ?? null, null, 'no gate ever set');
  assert.equal(practiceOverride(a, 'spell', 11, false), false);
  assert.ok(tryDash(r, 'a', { x: 0, z: -1 }, 11));
  run(r, 11, 11.5);
  assert.equal(tryDash(r, 'a', { x: 0, z: -1 }, 11.5), false, 'the dash waits out its cooldown');
});

test('Practice preserves earned and lost Prowess across simulation ticks', async () => {
  const { gainProwess, prowessForDamage } = await import('../../shared/src/prowess.mjs');
  const { Room } = await import('../../shared/sim/Room.mjs');
  const { applyDamage, stepRoom } = await import('../../shared/sim/combat.mjs');
  const room = new Room('PRACTMETER',{mode:'PRACTICE',worldId:'castleward'});
  const human=room.addPlayer({id:'human',token:'human',name:'Human'},0);
  const opponent=room.addServerActor({id:'opponent',name:'Opponent',actorKind:'dummy'},0);
  room.startMatch(0);room.state='PLAYING';
  human.prowess=0;opponent.prowess=0;human.spawnProtectionUntil=0;
  assert.equal(gainProwess(room,human,25),25);
  prowessForDamage(room,opponent,human,10);
  assert.equal(human.prowess,26.4);assert.equal(opponent.prowess,0);
  applyDamage(room,opponent.id,human.id,10,'fight-flight-terminal',3,null,{ultimate:true});
  assert.ok(Math.abs(human.prowess-16.4)<1e-8);
  stepRoom(room,1/30,3.04,room.world);
  assert.ok(Math.abs(human.prowess-16.4)<1e-8,'no automatic 100 refill');
});
