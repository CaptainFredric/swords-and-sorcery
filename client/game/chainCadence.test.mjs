// The local arms keep the chain in time as the server does (the same shared rule), take the server's word when it
// differs, and the body shown catches up with a jump of the chain's clock instead of jumping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSwordChain } from './localSwordChain.mjs';
import { chainClockShown, CHAIN_CATCH_UP } from './chainClock.mjs';
import { CUT_TELL, cutTellStrength } from './cutTellTiming.mjs';
import { CADENCE, chainCadence } from '../../shared/src/combatFrameData.mjs';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

const step = (chain, from, to) => { for (let t = from; t <= to + 1e-9; t += 1 / 120) chain.step(t); };

test('the arms judge a press for the next cut exactly as the server does, and the chain jumps to it as it begins', () => {
  const local = new LocalSwordChain();
  local.press(10);
  const contact = 10 + SWORD_STRIKE_TIMES[0];
  step(local, 10, contact + 0.05);
  const pressAt = contact + CADENCE.beat;
  step(local, contact + 0.05, pressAt);
  const judged = local.press(pressAt);
  const server = chainCadence({ startedAt: 10, landed: 1, pressAt });
  assert.equal(judged.grade, server.grade);
  assert.ok(Math.abs(judged.shift - server.shift) < 1e-9);
  step(local, pressAt, pressAt + 0.02);
  // the chain's clock jumped: the next cut has begun (committed) already
  assert.ok(Math.abs(local.chain.startedAt - (10 - server.shift)) < 1e-9);
  assert.equal(local.chain.committed, 2);
  // and the chain is the same chain (its id), only its clock moved
  assert.equal(local.chain.id, 1);
});

test('held through, the arms keep the old chain to the instant', () => {
  const local = new LocalSwordChain();
  local.press(10);
  step(local, 10, 10 + SWORD_CHAIN.starts[1] + 0.01);
  assert.equal(local.chain.startedAt, 10);
  assert.equal(local.chain.committed, 2);
});

test("the server's word sets the arms right: a jump they made is corrected by the difference", () => {
  const local = new LocalSwordChain();
  local.press(10);
  const contact = 10 + SWORD_STRIKE_TIMES[0];
  step(local, 10, contact + CADENCE.beat);
  local.press(contact + CADENCE.beat);
  step(local, contact + CADENCE.beat, contact + CADENCE.beat + 0.02);
  const jumped = local.chain.startedAt;
  // the server judged it a little later (its clock): a smaller jump
  local.adoptCadence({ strike: 1, grade: 'good', shift: 0.05 });
  assert.ok(Math.abs(local.chain.startedAt - (10 - 0.05)) < 1e-9, `${jumped} -> ${local.chain.startedAt}`);
});

test("a cut is told a quarter of a second before its contact, and only a committed one", () => {
  const p = { attackActive: true, attackStartedAt: 10, attackNextStrike: 0, attackCommitted: 1 };
  const contact = 10 + SWORD_STRIKE_TIMES[0];
  assert.ok(cutTellStrength(p, contact - CUT_TELL.lead) > 0.99, 'the peak');
  assert.equal(cutTellStrength(p, contact - CUT_TELL.lead - CUT_TELL.width - 0.01), 0, 'not before');
  assert.equal(cutTellStrength(p, contact), 0, 'over by the contact itself');
  // the backhand is not told until it is committed
  assert.equal(cutTellStrength(p, 10 + SWORD_STRIKE_TIMES[1] - CUT_TELL.lead), 0);
  assert.ok(cutTellStrength({ ...p, attackNextStrike: 1, attackCommitted: 2 }, 10 + SWORD_STRIKE_TIMES[1] - CUT_TELL.lead) > 0.99);
  // the tell comes before a Parry's window opens, so it can be answered (0.25 s ahead; the Parry is the last 0.18 s)
  assert.ok(CUT_TELL.lead - CUT_TELL.width >= 0.17);
});

test('a body shown catches up with a jump of the chain clock within a few hundredths of a second', () => {
  const d = {};
  const dt = 1 / 60;
  assert.equal(chainClockShown(d, 10, dt), 10);
  // the chain is hastened by 0.12 s
  const first = chainClockShown(d, 9.88, dt);
  assert.ok(first > 9.88 + 0.08, 'shown behind the jump at first, not jumping');
  let shown = first;
  for (let i = 0; i < 12; i += 1) shown = chainClockShown(d, 9.88, dt);
  assert.ok(shown - 9.88 < 0.005, `caught up within 0.2 s (${shown - 9.88})`);
  // a later start is another chain: shown as it is at once
  assert.equal(chainClockShown(d, 12, dt), 12);
  assert.ok(CHAIN_CATCH_UP.halflife < 0.06);
});
