import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_CYCLE, LocalSwordChain } from './localSwordChain.mjs';

// the chain's strikes landed by `until`, stepping every frame (60 fps) from 0
function run(script, until = 3) {
  const chain = new LocalSwordChain();
  const seen = [];
  let last = null;
  for (let frame = 0; frame <= until * 60; frame += 1) {
    const now = frame / 60;
    for (const [at, action] of script) if (Math.abs(at - now) < 1 / 120) chain[action](now);
    const under = chain.step(now);
    const key = under ? `${under.startedAt.toFixed(2)}:${under.landed}` : null;
    if (key !== last && under?.landed) seen.push(key);
    last = key;
    if (!under && seen.length && seen.at(-1) !== 'end') seen.push('end');
  }
  return seen;
}

test('a tap is one swing: it plays out even if let go at once, and the arms go back to rest', () => {
  assert.deepEqual(run([[0, 'press'], [0.05, 'release']], 2), ['0.00:1', 'end']);
  const chain = new LocalSwordChain();
  chain.press(0);
  chain.release();
  assert.ok(chain.step(0.7), 'still swinging through its follow-through');
  assert.equal(chain.step(0.73), null, 'over where the next swing would have begun');
});

test('holding runs the whole chain and comes straight round into the next, on the cycle', () => {
  const seen = run([[0, 'press']], 2.5);
  assert.deepEqual(seen.slice(0, 3), ['0.00:1', '0.00:2', '0.00:3']);
  assert.equal(seen[3], `${CHAIN_CYCLE.toFixed(2)}:1`, 'the next chain starts exactly a cycle later');
});

test('let go in the middle of the second swing: it finishes, no third', () => {
  assert.deepEqual(run([[0, 'press'], [0.9, 'release']], 2.5), ['0.00:1', '0.00:2', 'end']);
});

test('quick taps chain, and a guard or a spell stops it outright', () => {
  assert.deepEqual(run([[0, 'press'], [0.1, 'release'], [0.5, 'press'], [0.6, 'release']], 2.5), ['0.00:1', '0.00:2', 'end']);
  const chain = new LocalSwordChain();
  chain.press(0);
  chain.cancel();
  assert.equal(chain.step(0.1), null);
});

test('the arms keep the same gate as the server: pressing again never swings sooner than holding would', () => {
  // let go after the first strike and press again the moment the chain has ended: the next swing lands no sooner
  // than holding's second would have
  const tapped = run([[0, 'press'], [0.05, 'release'], [0.74, 'press'], [0.8, 'release']], 2);
  assert.equal(tapped.length, 3);
  assert.equal(tapped[0], '0.00:1');
  assert.ok(Number(tapped[1].split(':')[0]) >= 0.72 && tapped[1].endsWith(':1'), `a fresh first strike, no sooner: ${tapped[1]}`);
  // broken off into a guard just after the first strike, then pressed straight away: it waits for the gate
  const chain = new LocalSwordChain();
  chain.press(0);
  for (let t = 0; t <= 0.45; t += 1 / 60) chain.step(t);
  chain.cancel(0.45);
  chain.press(0.5);
  assert.equal(chain.step(0.6), null, 'not yet: the backhand would not have begun');
  const next = chain.step(0.73);
  assert.ok(next && next.startedAt >= 0.72 - 1e-9, 'it starts once the held chain could have');
  // a swing broken off after it went live is spent too (it could already have met someone)
  const feint = new LocalSwordChain();
  feint.press(0);
  for (let t = 0; t <= 0.35; t += 1 / 60) feint.step(t);
  feint.cancel(0.35);
  feint.press(0.36);
  assert.equal(feint.step(0.4), null);
  // but one broken off before it could meet anyone costs nothing
  const early = new LocalSwordChain();
  early.press(0);
  early.step(0.1);
  early.cancel(0.1);
  early.press(0.15);
  assert.ok(early.step(0.16), 'a fresh chain at once');
});
