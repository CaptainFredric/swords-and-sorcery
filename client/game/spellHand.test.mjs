import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_HAND, easeSpellHand, spellHandTurns } from './spellHand.mjs';

test('a hand at rest turns nothing: the sculpted cup stays', () => {
  assert.deepEqual(spellHandTurns(), []);
  assert.deepEqual(spellHandTurns({ open: 0, fist: 0 }), []);
});

test('open spreads every lame back, a fist closes every one, each about its own x', () => {
  const open = spellHandTurns({ open: 1 });
  const fist = spellHandTurns({ fist: 1 });
  // four fingers of three lames, and the thumb's three
  assert.equal(open.length, 15);
  assert.ok(open.some((t) => t.bone === 'finger_index_1.L') && open.some((t) => t.bone === 'thumb_3.L'));
  for (const turn of open) {
    assert.deepEqual(turn.axis, [1, 0, 0]);
    assert.equal(turn.space, 'local');
    assert.ok(turn.angle < 0);
  }
  for (const turn of fist) assert.ok(turn.angle > 0);
  assert.equal(fist.find((t) => t.bone === 'finger_little_2.L').angle, SPELL_HAND.fist.finger[1]);
  assert.equal(fist.find((t) => t.bone === 'thumb_1.L').angle, SPELL_HAND.fist.thumb[0]);
});

test('a fist wins over an open hand, and asks beyond 0..1 are held to it', () => {
  assert.deepEqual(spellHandTurns({ open: 1, fist: 1 }), spellHandTurns({ fist: 1 }));
  assert.deepEqual(spellHandTurns({ fist: 4 }), spellHandTurns({ fist: 1 }));
  assert.deepEqual(spellHandTurns({ open: Number.NaN }), []);
});

test('the hand eases toward what it is asked, never past it', () => {
  let hand = easeSpellHand(null, { open: 0, fist: 1 }, 1 / 60);
  assert.ok(hand.fist > 0 && hand.fist < 1);
  for (let i = 0; i < 120; i += 1) hand = easeSpellHand(hand, { open: 0, fist: 1 }, 1 / 60);
  assert.ok(hand.fist > 0.999 && hand.fist <= 1);
  assert.deepEqual(easeSpellHand(hand, { open: 1, fist: 0 }, 0), hand);
});
