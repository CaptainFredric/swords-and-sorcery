import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, STRIKE_DISTANCE, createDuel, presentKnight, setPlayerInput, stepDuel } from './cadenceDuel.mjs';
import { CADENCE, CUTS, DEFENCE } from '../../shared/src/combatFrameData.mjs';

// a duel with the player squared up to a dummy at sword's length
function squaredUp(opponent = 'dummy', variants = {}) {
  const duel = createDuel({ opponent, variants });
  duel.player.pos = { x: 0, z: 1.6 };
  duel.foe.pos = { x: 0, z: 0 };
  return duel;
}
const runUntil = (duel, at, input = {}) => { const events = []; while (duel.now < at - 1e-9) { setPlayerInput(duel, { yaw: 0, ...input }); events.push(...stepDuel(duel)); } return events; };
const press = (duel) => { setPlayerInput(duel, { yaw: 0, pressed: true }); return stepDuel(duel); };

test('a press starts a forehand that lands on its contact', () => {
  const duel = squaredUp();
  runUntil(duel, 0.5);
  const events = press(duel);
  const start = events.find((e) => e.type === 'cutStart');
  assert.equal(start.cut, 'forehand');
  const later = runUntil(duel, duel.now + CUTS.forehand.startup.fresh + 0.05);
  const hit = later.find((e) => e.type === 'contact');
  assert.equal(hit.outcome, 'hit');
  assert.ok(Math.abs(hit.at - start.contactAt) <= DT + 1e-9);
  assert.ok(later.some((e) => e.type === 'tell' && e.at < hit.at));
});

test('on the beat the next cut comes sooner and harder than holding', () => {
  const run = (how) => {
    const duel = squaredUp();
    runUntil(duel, 0.5);
    const start = press(duel).find((e) => e.type === 'cutStart');
    const beat = start.contactAt + CADENCE.beat;
    let next = null, firstDamage = null, secondDamage = null;
    while (duel.now < start.contactAt + 0.6) {
      const pressNow = how === 'beat' && Math.abs(duel.now - beat) < DT / 2 + 1e-9;
      setPlayerInput(duel, { yaw: 0, pressed: pressNow, attack: how === 'hold' });
      for (const e of stepDuel(duel)) {
        if (e.type === 'cutStart' && !next) next = e;
        if (e.type === 'contact' && e.outcome === 'hit') { if (firstDamage == null) firstDamage = e.damage; else secondDamage ??= e.damage; }
      }
    }
    return { delay: next.at - start.contactAt, grade: next.grade, firstDamage, duel, next };
  };
  const beat = run('beat'), hold = run('hold');
  assert.equal(beat.next.cut, 'backhand');
  assert.equal(beat.grade, 'perfect');
  assert.equal(hold.grade, 'held');
  assert.ok(beat.delay < hold.delay - 0.1, `on the beat ${beat.delay} vs held ${hold.delay}`);
  assert.ok(Math.abs(hold.delay - CADENCE.next.held) <= DT + 1e-9);
});

test('mashing early earns no more than holding, and a late press starts over', () => {
  const duel = squaredUp();
  runUntil(duel, 0.5);
  const start = press(duel).find((e) => e.type === 'cutStart');
  runUntil(duel, start.at + 0.1);
  const early = press(duel).find((e) => e.type === 'press');
  assert.equal(early.grade, 'early');
  const events = runUntil(duel, start.contactAt + CADENCE.next.held + 0.05);
  const next = events.find((e) => e.type === 'cutStart');
  assert.ok(Math.abs(next.at - start.contactAt - CADENCE.next.held) <= DT + 1e-9);

  const late = squaredUp();
  runUntil(late, 0.5);
  const s2 = press(late).find((e) => e.type === 'cutStart');
  const lapsed = runUntil(late, s2.contactAt + CADENCE.lapse + 0.05);
  assert.ok(lapsed.some((e) => e.type === 'chainEnd' && e.why === 'lapsed'));
  const again = press(late);
  assert.equal(again.find((e) => e.type === 'press').grade, 'late');
  assert.equal(again.find((e) => e.type === 'cutStart').cut, 'forehand');
});

test('a guard raised in the last instant is a Perfect Parry: the attacker reels and a riposte opens', () => {
  const duel = createDuel({ opponent: 'drill', seed: 3 });
  duel.player.pos = { x: 0, z: 1.8 };
  duel.foe.pos = { x: 0, z: 0 };
  duel.foe.yaw = Math.PI; duel.foe.input.yaw = Math.PI;
  duel.bot.nextAttackAt = 0.2;
  let tell = null;
  while (!tell && duel.now < 3) { setPlayerInput(duel, { yaw: 0 }); tell = stepDuel(duel).find((e) => e.type === 'cutStart' && e.who === 'foe') ?? null; }
  assert.ok(tell, 'the drill knight attacks');
  runUntil(duel, tell.contactAt - 0.04);
  const events = runUntil(duel, tell.contactAt + 0.05, { guard: true });
  const contact = events.find((e) => e.type === 'contact');
  assert.equal(contact.outcome, 'perfect');
  assert.ok(duel.foe.staggerUntil - contact.at >= DEFENCE.perfectStagger - 1e-9);
  assert.ok(duel.player.riposteUntil > duel.now);
  // the riposte: faster and harder
  const out = runUntil(duel, duel.now + 0.02);
  void out;
  const r = press(duel).find((e) => e.type === 'cutStart');
  assert.equal(r.riposte, true);
  assert.ok(r.contactAt - r.at < CUTS.forehand.startup.fresh);
});

test('a guard raised early blocks, and costs stamina; a tapped guard is a whiff', () => {
  const duel = createDuel({ opponent: 'drill', seed: 3 });
  duel.player.pos = { x: 0, z: 1.8 };
  duel.foe.pos = { x: 0, z: 0 };
  duel.bot.nextAttackAt = 0.2;
  let start = null;
  while (!start && duel.now < 3) { setPlayerInput(duel, { yaw: 0, guard: duel.now > 0.1 }); start = stepDuel(duel).find((e) => e.type === 'cutStart' && e.who === 'foe') ?? null; }
  const events = runUntil(duel, start.contactAt + 0.05, { guard: true });
  assert.equal(events.find((e) => e.type === 'contact').outcome, 'block');
  assert.ok(duel.player.stamina < 100);

  const tap = squaredUp();
  runUntil(tap, 0.3);
  runUntil(tap, 0.4, { guard: true });
  const dropped = runUntil(tap, 0.45);
  assert.ok(dropped.some((e) => e.type === 'whiff'));
  // and it cannot go straight back up
  const again = runUntil(tap, 0.5, { guard: true });
  assert.ok(!again.some((e) => e.type === 'guardUp'));
});

test('a guard raised before your own cut goes live calls it off (a feint)', () => {
  const duel = squaredUp();
  runUntil(duel, 0.5);
  press(duel);
  const events = runUntil(duel, duel.now + 0.12, { guard: true });
  assert.ok(events.some((e) => e.type === 'feint'));
  assert.equal(duel.player.cut, null);
});

test("a clip's root motion moves the knight by its step", () => {
  const rootMotion = [{ t: 0, x: 0, z: 0 }, { t: 0.2, x: 0, z: -0.1 }, { t: 0.45, x: 0, z: -0.5 }, { t: 0.767, x: 0, z: -0.6 }];
  const duel = createDuel({ opponent: 'dummy', variants: { forehand: { ...CUTS.forehand, clip: 'Kimodo', rootMotion } } });
  duel.player.pos = { x: 0, z: 4 };
  duel.foe.pos = { x: 0, z: -3 };
  runUntil(duel, 0.2);
  const z0 = duel.player.pos.z;
  press(duel);
  runUntil(duel, duel.now + 0.75);
  assert.ok(Math.abs((z0 - duel.player.pos.z) - 0.6) < 0.03, `stepped ${z0 - duel.player.pos.z}`);
  assert.equal(presentKnight(duel, duel.player, duel.now - 0.3).clip, 'Kimodo');
});

test('motion warping: the step stops at striking distance from the knight in front, never through him', () => {
  const rootMotion = [{ t: 0, x: 0, z: 0 }, { t: 0.45, x: 0, z: -0.5 }, { t: 0.767, x: 0, z: -0.7 }];
  const S = STRIKE_DISTANCE;
  for (const gap of [S + 0.25, S + 0.5, S - 0.2]) {
    const duel = createDuel({ opponent: 'dummy', variants: { forehand: { ...CUTS.forehand, clip: 'Kimodo', rootMotion } } });
    duel.player.pos = { x: 0, z: gap };
    duel.foe.pos = { x: 0, z: 0 };
    runUntil(duel, 0.2);
    press(duel);
    runUntil(duel, duel.now + 0.8);
    const end = duel.player.pos.z;
    // (the step is 0.7 m: from further off it stops at striking distance; from already inside it, it takes none)
    const expected = gap > S ? S : gap;
    assert.ok(Math.abs(end - expected) < 0.03, `from ${gap} m ended at ${end}`);
  }
});

test('the body shows the cut with its contact frame on the contact', () => {
  const duel = squaredUp();
  runUntil(duel, 0.5);
  const start = press(duel).find((e) => e.type === 'cutStart');
  runUntil(duel, start.contactAt);
  const shown = presentKnight(duel, duel.player, start.contactAt);
  assert.equal(shown.clip, 'Slash_1');
  assert.ok(Math.abs(shown.time - CUTS.forehand.clipContact) < 1e-6);
});
