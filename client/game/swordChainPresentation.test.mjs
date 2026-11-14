import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { CHAIN_CYCLE, RECOVERY_SEC, STRIKE_CLIPS, chainPresentation, strikeClipTime } from './swordChainPresentation.mjs';
import { SCENARIOS, run } from '../../scripts/sword-loop-audit.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const held = (startedAt, extra = {}) => ({ attackActive: true, attackStartedAt: startedAt, attackCommitted: 3, ...extra });

test('every strike shows its authored contact frame exactly at the server contact', () => {
  ['Slash_1', 'Slash_2', 'Slash_3'].forEach((clip, slot) => {
    for (const linked of [false, true]) {
      if (slot === 0 && linked) continue;
      assert.ok(near(strikeClipTime(clip, slot, SWORD_STRIKE_TIMES[slot], { linked }), STRIKE_CLIPS[clip].contact), `${clip} linked=${linked}`);
      // and through the cut at the authored rate
      const a = strikeClipTime(clip, slot, SWORD_STRIKE_TIMES[slot] - 0.05, { linked });
      const b = strikeClipTime(clip, slot, SWORD_STRIKE_TIMES[slot] + 0.03, { linked });
      assert.ok(near(b - a, 0.08, 1e-6), `${clip} cut rate`);
    }
  });
});

test('a held chain links each follow-through into the next raise: no return to Idle between strikes', () => {
  // the forehand comes to rest at the far end of its follow-through as its slot ends...
  const end1 = chainPresentation(held(0), SWORD_CHAIN.starts[1] - 1e-4);
  assert.equal(end1.clip, 'Slash_1');
  assert.ok(near(end1.time, STRIKE_CLIPS.Slash_1.far, 1e-3));
  // ...and the backhand picks up part-way up its raise, handed over with a real blend
  const start2 = chainPresentation(held(0), SWORD_CHAIN.starts[1] + 1e-4);
  assert.equal(start2.clip, 'Slash_2');
  assert.ok(near(start2.time, STRIKE_CLIPS.Slash_2.linkIn, 1e-3));
  assert.ok(start2.blend > 0.1);
  // the heavy strike's follow-through plays to its last frame (the Idle stance) as the chain restarts
  const done = { attackActive: false, attackStartedAt: 0, attackLanded: 3, attackEnd: 'done' };
  assert.equal(chainPresentation(done, SWORD_STRIKE_TIMES[2] + 0.1).clip, 'Slash_3');
  assert.ok(near(chainPresentation(done, CHAIN_CYCLE - 1e-6).time, STRIKE_CLIPS.Slash_3.end, 1e-3));
  assert.equal(chainPresentation(done, CHAIN_CYCLE + 0.01), null);
});

test('a let-go chain plays its last strike home; a broken one gives way at once', () => {
  const letGo = { attackActive: false, attackStartedAt: 0, attackLanded: 1, attackEnd: 'letGo' };
  const home = chainPresentation(letGo, SWORD_CHAIN.starts[1] + RECOVERY_SEC - 1e-6);
  assert.equal(home.clip, 'Slash_1');
  assert.ok(near(home.time, STRIKE_CLIPS.Slash_1.end, 1e-3));
  assert.ok(home.recovering);
  assert.equal(chainPresentation(letGo, SWORD_CHAIN.starts[1] + RECOVERY_SEC + 0.01), null);
  assert.equal(chainPresentation({ ...letGo, attackEnd: 'broken' }, SWORD_CHAIN.starts[1] + 0.1), null);
});

test('the shipped clips through the real sim: ten held chains show every contact and never snap', () => {
  const result = run('ten held chains', SCENARIOS['ten held chains']);
  assert.equal(result.contacts.length, 30 + 1);
  assert.deepEqual(result.contacts.filter((c) => c.offContactDeg > 20), []);
  assert.deepEqual(result.snaps, []);
});

test('the shipped clips through the real sim: taps, let-go, guard, cast, dash, jump and parry transitions do not snap', () => {
  for (const name of ['one tap', 'let go after two', 'guard into attack', 'cast after a strike', 'dash mid-chain', 'jump mid-chain', 'parried', 'blocked chain']) {
    const result = run(name, SCENARIOS[name]);
    assert.deepEqual(result.snaps, [], name);
    assert.deepEqual(result.contacts.filter((c) => c.offContactDeg > 20), [], name);
  }
  // a cut broken off into the Guard swings round into it no faster than the fastest authored cut
  const guard = run('attack into guard mid-swing', SCENARIOS['attack into guard mid-swing']);
  // (the fastest authored cut: the forehand through its contact, as a tap shows it)
  const cut = Math.max(...run('one tap', SCENARIOS['one tap']).frames.filter((f) => f.state === 'attack').map((f) => f.step ?? 0));
  const swing = Math.max(...guard.frames.filter((f) => f.state === 'guard').map((f) => f.step ?? 0));
  assert.ok(swing <= cut, `into the Guard the point moves ${swing.toFixed(2)} m in a frame, the cut ${cut.toFixed(2)}`);
});

test('on the move the legs keep their gait under the strike (layered), standing the strike has the whole body', () => {
  const moving = run('running chain', SCENARIOS['running chain']);
  assert.ok(moving.frames.filter((f) => f.state === 'attack').every((f) => f.layered));
  const standing = run('one tap', SCENARIOS['one tap']);
  assert.ok(standing.frames.filter((f) => f.state === 'attack').every((f) => !f.layered));
});
