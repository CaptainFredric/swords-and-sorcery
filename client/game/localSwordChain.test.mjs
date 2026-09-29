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
