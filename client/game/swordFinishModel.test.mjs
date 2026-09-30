import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_FINISH, finishedSwordColour } from './swordFinishModel.mjs';

test('the sword\'s kit colours become a sword\'s: a neutral steel blade, a gilt guard; anything else is left alone', () => {
  const blade = finishedSwordColour([0.4, 0.37, 0.64]);
  assert.ok(Math.max(...blade) - Math.min(...blade) < 0.15, 'steel is near neutral, not lavender');
  const guard = finishedSwordColour([1, 0.66, 0.59]);
  assert.ok(guard[0] > guard[1] && guard[1] > guard[2] * 2, 'gilt: warm and golden, not salmon');
  assert.deepEqual(finishedSwordColour([0.41, 0.08, 0.14]), [0.41, 0.08, 0.14], 'a colour that is none of them');
  for (const entry of SWORD_FINISH) assert.deepEqual(finishedSwordColour(entry.from), entry.to, entry.part);
});
