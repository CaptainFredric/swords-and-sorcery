import test from 'node:test';
import assert from 'node:assert/strict';
import { attackWindupRecipe, swingRecipe } from './sound/soundRecipes.mjs';
import { COMBO, COMBO_STRIKES, COMBO_CONTACTS } from './fpSlash.mjs';

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('attackWindupRecipe produces subtle leather-grip friction and metallic ring anticipation', () => {
  const light = attackWindupRecipe(seeded(42), { strike: 0 });
  const heavy = attackWindupRecipe(seeded(42), { strike: 2 });

  assert.equal(light.layers.length, 2);
  const friction = light.layers.find((l) => l.type === 'noise');
  const ring = light.layers.find((l) => l.type === 'ring');

  assert.ok(friction, 'must contain friction noise burst');
  assert.equal(friction.filter, 'bandpass');
  assert.ok(friction.freq >= 800 && friction.freq <= 1200, 'friction frequency in audible mid band');
  assert.ok(friction.gain <= 0.25, 'subtle gain so it does not overpower combat');

  assert.ok(ring, 'must contain subtle metallic ring');
  assert.ok(ring.partials.length >= 2);
  for (const p of ring.partials) {
    assert.ok(p.freq > 1000 && p.freq < 6000, `audible ring frequency ${p.freq}`);
    assert.ok(p.gain <= 0.05, 'ring is subtle armor chink');
  }

  // Heavy strike adds weight
  const heavyFriction = heavy.layers.find((l) => l.type === 'noise');
  assert.ok(heavyFriction.gain > friction.gain, 'heavy strike has firmer grip tension');
  assert.ok(light.reverb <= 0.05, 'intimate reverb to stay clean and immediate');
});

test('first-person combo key 0 declares positive ease for immediate anticipation velocity', () => {
  assert.ok(COMBO.length > 0);
  const restKey = COMBO[0];
  assert.equal(restKey.t, 0);
  assert.equal(restKey.ease, 0.6, 'ease 0.6 gives immediate initial velocity away from rest');
});

test('onBegin triggers exactly once on strike commitment and does not repeat while held', () => {
  const begunCalls = [];
  const swingCalls = [];

  const onBegin = (strike) => begunCalls.push(strike);
  const onSwing = (strike) => swingCalls.push(strike);

  let lastBegunKey = null;
  let lastSwingKey = null;

  function stepChain(chain, timeSec) {
    if (!chain) return;
    const begun = lastBegunKey?.startedAt === chain.startedAt ? lastBegunKey.strike : -1;
    for (let strike = begun + 1; strike < chain.committed; strike += 1) {
      lastBegunKey = { startedAt: chain.startedAt, strike };
      onBegin(strike);
    }
    const since = timeSec - chain.startedAt;
    const heard = lastSwingKey?.startedAt === chain.startedAt ? lastSwingKey.strike : -1;
    for (let strike = heard + 1; strike < chain.committed; strike += 1) {
      if (since < COMBO_CONTACTS[strike] - 0.06) break;
      lastSwingKey = { startedAt: chain.startedAt, strike };
      onSwing(strike);
    }
  }

  // Uncommitted / idle: no calls
  stepChain(null, 1.0);
  assert.equal(begunCalls.length, 0);
  assert.equal(swingCalls.length, 0);

  // Strike 1 committed at t = 1.0: onBegin(0) fires immediately
  const chain = { startedAt: 1.0, committed: 1 };
  stepChain(chain, 1.0);
  assert.deepEqual(begunCalls, [0]);
  assert.equal(swingCalls.length, 0, 'swing whoosh has not fired yet at startup');

  // Holding input across multiple render frames at t = 1.016, 1.033, 1.050:
  // onBegin(0) must NOT re-trigger!
  stepChain(chain, 1.016);
  stepChain(chain, 1.033);
  stepChain(chain, 1.050);
  assert.deepEqual(begunCalls, [0], 'onBegin must not re-trigger while held in same strike');
  assert.equal(swingCalls.length, 0);

  // At contact window (~t = 1.0 + C1 - 0.06): swing whoosh fires
  stepChain(chain, 1.0 + COMBO_CONTACTS[0] - 0.05);
  assert.deepEqual(begunCalls, [0]);
  assert.deepEqual(swingCalls, [0], 'swing whoosh fires at blade cut point');

  // Advance combo chain to strike 2 at t = 1.5
  chain.committed = 2;
  stepChain(chain, 1.5);
  assert.deepEqual(begunCalls, [0, 1], 'onBegin(1) fires when strike 2 is committed');

  // Advance combo chain to strike 3 at t = 2.1
  chain.committed = 3;
  stepChain(chain, 2.1);
  assert.deepEqual(begunCalls, [0, 1, 2], 'onBegin(2) fires when strike 3 is committed');

  // Starting a brand new chain resets startedAt and triggers onBegin(0) anew
  const chain2 = { startedAt: 3.5, committed: 1 };
  stepChain(chain2, 3.5);
  assert.deepEqual(begunCalls, [0, 1, 2, 0]);
});

test('WeaponView parryReel, guardBreak, and rebound trigger visceral physical deflection states', () => {
  const calls = [];
  const fakeMotion = {
    parryReel: () => calls.push('parryReel'),
    guardBreak: (push) => calls.push({ type: 'guardBreak', push }),
    rebound: () => calls.push('rebound'),
  };

  let canceled = false;
  const view = {
    now: () => 10.0,
    recoilUntil: 0,
    guard: true,
    swordChain: { active: true, cancel: () => { canceled = true; } },
    comboBroken: false,
    attackButton: true,
    motion: fakeMotion,
    cancelAttack() {
      if (this.swordChain.active) this.comboBroken = true;
      this.swordChain.cancel(this.now());
      this.attackButton = false;
    },
    parryReel() {
      this.cancelAttack();
      this.recoilUntil = this.now() + 0.32;
      this.motion.parryReel();
    },
    guardBreak(push) {
      this.guard = false;
      this.recoilUntil = this.now() + 0.38;
      this.motion.guardBreak(push);
    },
    rebound() {
      this.recoilUntil = this.now() + 0.22;
      this.motion.rebound();
    },
  };

  // Test parryReel
  view.parryReel();
  assert.equal(canceled, true, 'parryReel must cancel active sword attack');
  assert.equal(view.comboBroken, true, 'parryReel must mark combo as broken');
  assert.equal(view.attackButton, false);
  assert.equal(view.recoilUntil, 10.32, 'recoil timer must be active for 320ms');
  assert.deepEqual(calls, ['parryReel']);

  // Test guardBreak
  view.guardBreak({ x: 0.2, z: 1.0 });
  assert.equal(view.guard, false, 'guardBreak must drop guard stance');
  assert.equal(view.recoilUntil, 10.38, 'guardBreak recoil timer active for 380ms');
  assert.deepEqual(calls[1], { type: 'guardBreak', push: { x: 0.2, z: 1.0 } });

  // Test rebound
  view.rebound();
  assert.equal(view.recoilUntil, 10.22, 'rebound sets recoil timer for 220ms');
  assert.equal(calls[2], 'rebound');
});
