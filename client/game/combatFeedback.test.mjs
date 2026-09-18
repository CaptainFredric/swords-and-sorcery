import test from 'node:test';
import assert from 'node:assert/strict';
import { localCombatFeedback } from './combatFeedback.mjs';

test('parry feedback plays only when the local player is involved', () => {
  assert.equal(localCombatFeedback({ type: 'parry', attackerId: 'me', defenderId: 'them' }, 'me'), 'parry');
  assert.equal(localCombatFeedback({ type: 'parry', attackerId: 'them', defenderId: 'me' }, 'me'), 'parry');
  assert.equal(localCombatFeedback({ type: 'parry', attackerId: 'a', defenderId: 'b' }, 'me'), null);
});

test('block and guard-break feedback route to involved local players', () => {
  assert.equal(localCombatFeedback({ type: 'block', attackerId: 'me', defenderId: 'them' }, 'me'), 'block');
  assert.equal(localCombatFeedback({ type: 'guardBreak', attackerId: 'them', defenderId: 'me' }, 'me'), 'guardBreak');
  assert.equal(localCombatFeedback({ type: 'guardBreak', attackerId: 'a', defenderId: 'b' }, 'me'), null);
});

test('unrelated event types do not request generic melee feedback', () => {
  assert.equal(localCombatFeedback({ type: 'fireballCast', playerId: 'me' }, 'me'), null);
  assert.equal(localCombatFeedback(null, 'me'), null);
});
