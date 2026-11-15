import test from 'node:test';
import assert from 'node:assert/strict';
import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { BRIDGES, CHAIN_CYCLE, RECOVERY_SEC, STRIKE_CLIPS, bridgeTime, chainPresentation, strikeClipTime, swingWindow } from './swordChainPresentation.mjs';
import { audit } from '../../scripts/spellblade-chain-sync-audit.mjs';
import { SCENARIOS, authoredPeak, run } from '../../scripts/sword-loop-audit.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const held = (startedAt, extra = {}) => ({ attackActive: true, attackStartedAt: startedAt, attackCommitted: 3, ...extra });

test('every strike shows its contact frame exactly at the server contact, and the swing window at the server blade\'s pace', () => {
  ['Slash_1', 'Slash_2', 'Slash_3'].forEach((clip, slot) => {
    for (const linked of [false, true]) {
      if (slot === 0 && linked) continue;
      const at = (e) => strikeClipTime(clip, slot, e, { linked, bridgeEnd: SWORD_CHAIN.starts[slot] + 0.2, bridgePace: 1.4 });
      assert.ok(near(at(SWORD_STRIKE_TIMES[slot]), STRIKE_CLIPS[clip].contact), `${clip} linked=${linked}`);
      // the window's ends are the frames whose blade lies where the server's does then
      const w = swingWindow(clip, slot);
      assert.ok(near(at(w.from), STRIKE_CLIPS[clip].swing[0]), `${clip} window opens on its swing frame`);
      assert.ok(near(at(w.to), STRIKE_CLIPS[clip].swing[1]), `${clip} window closes on its swing frame`);
      // and never runs backwards
      let last = -1;
      for (let e = 0; e <= w.to + 0.3; e += 1 / 240) { const t = at(e); assert.ok(t >= last - 1e-9, `${clip} runs backwards at ${e.toFixed(3)}`); last = t; }
    }
  });
});

test('a held chain hands each follow-through on through Argon\'s bridge: no return to Idle, no cross-fade through the body', () => {
  // the forehand comes to rest on the frame its bridge begins from (never further round) as its slot ends...
  const end1 = chainPresentation(held(0), SWORD_CHAIN.starts[1] - 1e-4);
  assert.equal(end1.clip, 'Slash_1');
  assert.ok(near(end1.time, STRIKE_CLIPS.Slash_1.far, 1e-3));
  // ...the bridge takes it from there...
  const bridge = chainPresentation(held(0), SWORD_CHAIN.starts[1] + 1e-4);
  assert.equal(bridge.clip, BRIDGES.Slash_1.Slash_2.clip);
  assert.ok(bridge.time < 0.01 && bridge.blend <= 0.06);
  assert.equal(bridge.fallback, 'Slash_2', 'a model without the bridge shows the next cut instead');
  // ...and lands on the backhand's raise, which carries on from that very frame
  const { until } = bridgeTime('Slash_1', 'Slash_2', 1, SWORD_CHAIN.starts[1] + 0.01);
  const landed = chainPresentation(held(0), until + 1e-4);
  assert.equal(landed.clip, 'Slash_2');
  assert.ok(near(landed.time, STRIKE_CLIPS.Slash_2.pickUp, 2e-3));
  assert.ok(until < SWORD_STRIKE_TIMES[1] - 0.09, 'landed before the swing window opens');
  // the rising chain uses its own bridges
  assert.equal(chainPresentation(held(0, { attackVariant: 1 }), SWORD_CHAIN.starts[1] + 0.01).clip, 'Slash_2_to_1');
  assert.equal(chainPresentation(held(0, { attackVariant: 1 }), SWORD_CHAIN.starts[2] + 0.01).clip, 'Slash_1_to_3');
  // the heavy strike's follow-through plays to its last frame (the Idle stance) as the chain restarts
  const done = { attackActive: false, attackStartedAt: 0, attackLanded: 3, attackEnd: 'done' };
  assert.equal(chainPresentation(done, SWORD_STRIKE_TIMES[2] + 0.1).clip, 'Slash_3');
  assert.ok(near(chainPresentation(done, CHAIN_CYCLE - 1e-6).time, STRIKE_CLIPS.Slash_3.end, 1e-3));
  assert.equal(chainPresentation(done, CHAIN_CYCLE + 0.01), null);
});

test('a let-go strike is handed back to the stance from the end of its follow-through; a broken one gives way at once', () => {
  const letGo = { attackActive: false, attackStartedAt: 0, attackLanded: 1, attackEnd: 'letGo' };
  // (held at the far end until its slot is over...)
  const resting = chainPresentation(letGo, SWORD_CHAIN.starts[1] - 0.01);
  assert.equal(resting.clip, 'Slash_1');
  assert.ok(resting.time <= STRIKE_CLIPS.Slash_1.far + 1e-9);
  // ...then cross-faded home into the Idle stance, never swung on round behind the shoulder
  const home = chainPresentation(letGo, SWORD_CHAIN.starts[1] + 0.01);
  assert.equal(home.clip, 'Idle');
  assert.ok(home.idle && home.recovering && near(home.blend, RECOVERY_SEC));
  assert.equal(chainPresentation(letGo, SWORD_CHAIN.starts[1] + RECOVERY_SEC + 0.01), null);
  assert.equal(chainPresentation({ ...letGo, attackEnd: 'broken' }, SWORD_CHAIN.starts[1] + 0.1), null);
});

test('the third-person blade is the server\'s blade at every contact, and the forehand never swings round behind the knight', () => {
  // (the shipped model as the client composes it, through the real sim: scripts/spellblade-chain-sync-audit.mjs)
  const chains = audit('ten held chains', SCENARIOS['ten held chains']).strikes;
  for (const kind of [0, 1, 2]) {
    const strikes = chains.filter((s) => s.kind === kind);
    const mean = strikes.reduce((sum, s) => sum + Math.abs(s.contactErr), 0) / strikes.length;
    // (before: the forehand 16 degrees ahead of the server's blade at its contact, the backhand 70, the chop 36 behind)
    assert.ok(mean < 8, `kind ${kind}: the shown blade is ${mean.toFixed(1)} degrees off the server's at its contacts`);
    assert.ok(strikes.every((s) => Math.abs(s.contactErr) < 15), `kind ${kind}: ${strikes.map((s) => s.contactErr).join(', ')}`);
  }
  // the forehand's follow-through goes no further round than the frame Argon's bridges start from (101 degrees from the
  // aim, just past straight out to his left); before, it rested at 123, behind his left shoulder, the wrist folded
  for (const name of ['ten held chains', 'one tap', 'let go after two']) {
    for (const s of audit(name, SCENARIOS[name]).strikes.filter((x) => x.kind === 0 && x.reach !== null)) {
      assert.ok(s.reach <= 105, `${name}: the forehand reaches ${s.reach} degrees round`);
    }
  }
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
    // (a parried strike is stopped before its contact: the knight is staggered, there is no contact frame to show)
    if (name !== 'parried') assert.deepEqual(result.contacts.filter((c) => c.offContactDeg > 20), [], name);
  }
  // a cut broken off into the Guard swings round into it no faster than the fastest authored cut
  const guard = run('attack into guard mid-swing', SCENARIOS['attack into guard mid-swing']);
  // (the fastest authored cut: the forehand through its contact, at its own rate; the game shows it at the server
  // blade's pace, which is slower)
  const cut = authoredPeak('Slash_1');
  const swing = Math.max(...guard.frames.filter((f) => f.state === 'guard').map((f) => f.step ?? 0));
  assert.ok(swing <= cut, `into the Guard the point moves ${swing.toFixed(2)} m in a frame, the cut ${cut.toFixed(2)}`);
});

test('on the move the legs keep their gait under the strike (layered), standing the strike has the whole body', () => {
  const moving = run('running chain', SCENARIOS['running chain']);
  assert.ok(moving.frames.filter((f) => f.state === 'attack').every((f) => f.layered));
  const standing = run('one tap', SCENARIOS['one tap']);
  assert.ok(standing.frames.filter((f) => f.state === 'attack').every((f) => !f.layered));
});
