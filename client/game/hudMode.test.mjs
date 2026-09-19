import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInfoText } from '../ui/HUD.mjs';

test('Practice HUD is explicitly untimed instead of showing the FFA six-minute clock', () => {
  assert.equal(matchInfoText({ mode: 'PRACTICE', matchStartedAt: 5, suddenDeath: false }, 999), 'PRACTICE YARD  ·  UNTIMED');
});

test('timed modes keep the normal first-to-ten clock and sudden-death label', () => {
  assert.equal(matchInfoText({ mode: 'FFA', matchStartedAt: 10, suddenDeath: false }, 70), 'FIRST TO 10  ·  5:00');
  assert.equal(matchInfoText({ mode: 'BOT_DUEL', matchStartedAt: 10, suddenDeath: true }, 70), 'SUDDEN DEATH');
});
