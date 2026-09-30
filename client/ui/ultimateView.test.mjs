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
