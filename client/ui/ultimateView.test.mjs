import test from 'node:test';
import assert from 'node:assert/strict';
import { ultimateView } from './ultimateView.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';

test('the ultimate tile: filling, ready, bracing, running (seconds left), and a moment locked after an interruption', () => {
  assert.deepEqual([ultimateView({ prowess: 0 }, 10).state, ultimateView({ prowess: 0 }, 10).label], ['charging', '0%']);
  const half = ultimateView({ prowess: PROWESS.full / 2 }, 10);
  assert.equal(half.state, 'charging');
  assert.equal(half.charge, 0.5);
  assert.equal(ultimateView({ prowess: PROWESS.full }, 10).state, 'ready');
  assert.equal(ultimateView({ prowess: PROWESS.full, ultimateState: { phase: 'startup', commitAt: 10.6 } }, 10).label, 'BRACE');
  const running = ultimateView({ prowess: 0, ultimateState: { phase: 'active', until: 14 } }, 10);
  assert.equal(running.state, 'active');
  assert.equal(running.label, '4.0');
  const locked = ultimateView({ prowess: PROWESS.full, ultimateLockedUntil: 11.5 }, 10);
  assert.equal(locked.state, 'locked');
  assert.equal(locked.label, '1.5');
});

test('the tile is the ultimate carried: a Vortex is lit, not braced into, and says so', () => {
  const lit = ultimateView({ ultimate: 'vortex', prowess: PROWESS.full, ultimateState: { id: 'vortex', phase: 'startup', commitAt: 10.9 } }, 10);
  assert.deepEqual([lit.state, lit.label, lit.ultimate.id, lit.ultimate.short], ['bracing', 'IGNITE', 'vortex', 'Vortex']);
  const spinning = ultimateView({ ultimate: 'vortex', prowess: 0, ultimateState: { id: 'vortex', phase: 'active', until: 12.25 } }, 10);
  assert.equal(spinning.state, 'active');
  assert.equal(spinning.charge, 0.5, 'half of its stretch left');
  assert.equal(ultimateView({ ultimate: 'sunder', prowess: PROWESS.full, ultimateState: { id: 'sunder', phase: 'startup', commitAt: 10.6 } }, 10).label, 'BRACE');
  assert.equal(ultimateView({ prowess: 0 }, 10).ultimate.id, 'sunder', 'nothing said: Sunder');
});
