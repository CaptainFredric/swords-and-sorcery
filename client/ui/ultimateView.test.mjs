import test from 'node:test';
import assert from 'node:assert/strict';
import { ultimateView, vortexHint } from './ultimateView.mjs';
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
  assert.equal(ultimateView({ ultimate: 'sunder', prowess: PROWESS.full, ultimateState: { id: 'sunder', phase: 'startup', commitAt: 10.6 } }, 10).label, 'BRACE');
  assert.equal(ultimateView({ prowess: 0 }, 10).ultimate.id, 'sunder', 'nothing said: Sunder');
});

test('while a Vortex runs the tile says how long is left and what it has been steered to, as the host has it', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const spinning = (emphasis, now = 10) => ultimateView({
    ultimate: 'vortex', prowess: 0, ultimateState: { id: 'vortex', phase: 'active', commitAt: 6, until: 6 + ULTIMATES.vortex.activeSec, emphasis },
  }, now);
  const balanced = spinning(0);
  assert.equal(balanced.state, 'active');
  assert.equal(balanced.left, ULTIMATES.vortex.activeSec - 4, 'the seconds left');
  assert.equal(balanced.label, (ULTIMATES.vortex.activeSec - 4).toFixed(1));
  assert.equal(balanced.charge, 0.5, 'and the share of its stretch (for the ring round the tile)');
  assert.deepEqual([balanced.emphasis, balanced.word], ['balanced', 'VORTEX']);
  assert.deepEqual([spinning(1).emphasis, spinning(1).word], ['blade', 'BLADE']);
  assert.deepEqual([spinning(-1).emphasis, spinning(-1).word], ['fire', 'FIRE']);
  // on its way from one to the other it is balanced until it is well over (it does not flicker with a tap)
  assert.equal(spinning(0.3).emphasis, 'balanced');
  assert.equal(spinning(-0.3).emphasis, 'balanced');
  // a Sunder running has no emphasis to show
  const sunder = ultimateView({ ultimate: 'sunder', prowess: 0, ultimateState: { id: 'sunder', phase: 'active', until: 14 } }, 10);
  assert.equal(sunder.emphasis, undefined);
  assert.equal(sunder.left, 4);
});

test('in the Practice Yard the tile says READY whenever the key would work: the key readies the ultimate itself', () => {
  assert.equal(ultimateView({ prowess: 0 }, 10, { practice: true }).state, 'ready');
  assert.equal(ultimateView({ prowess: 0 }, 10).state, 'charging', 'a real match waits for the meter');
  // not while one runs, nor in the moment after a Vortex, nor after an interruption
  assert.equal(ultimateView({ prowess: 0, ultimateState: { id: 'sunder', phase: 'active', until: 14 } }, 10, { practice: true }).state, 'active');
  const after = ultimateView({ prowess: 0, recoverUntil: 10.4 }, 10, { practice: true });
  assert.deepEqual([after.state, after.label], ['locked', '0.4']);
  assert.equal(ultimateView({ prowess: 0, ultimateLockedUntil: 12 }, 10, { practice: true }).state, 'locked');
});

test('the line under a Vortex\'s name says how it is steered, by the buttons the player has', () => {
  assert.equal(vortexHint({ bindings: { attack: ['Mouse0'], guard: ['Mouse2'] } }), 'LEFT CLICK — FIRE   ·   RIGHT CLICK — BLADE');
  assert.equal(vortexHint({ bindings: { attack: ['KeyJ'], guard: ['KeyK'] } }), 'J — FIRE   ·   K — BLADE', 'rebound: their own keys');
  assert.equal(vortexHint({ touch: true, bindings: { attack: ['Mouse0'], guard: ['Mouse2'] } }), 'ATTACK — FIRE   ·   GUARD — BLADE', 'on a touch screen: the buttons\' names');
  assert.equal(vortexHint({ bindings: {} }), 'ATTACK — FIRE   ·   GUARD — BLADE');
});
