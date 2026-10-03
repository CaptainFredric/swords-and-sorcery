import test from 'node:test';
import assert from 'node:assert/strict';
import { chivalryTellState, CHIVALRY_END_SEC, chivalryTellStyle } from './chivalryPresentation.mjs';
import { resolveSpellbladeAnimationPlan, resolveFirstPersonAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { resolveRemoteSpellbladePose } from './remoteSpellbladePose.mjs';
import { resolveWeaponPose } from './weaponPose.mjs';
import { canPresentLocalAction, localWeaponReleaseForEvent } from './localActionPresentation.mjs';

const active = {
  alive: true, guarding: true, guardStamina: 90, attackActive: true, attackStartedAt: 10,
  velocity: { x: 0, y: 0, z: -7 }, dashUntil: 10.5, castPoseStartAt: 10.1, castPoseUntil: 10.7,
  preparedSpells: ['fireball', 'frostfire', 'gale'],
  ultimateState: { id: 'chivalry', phase: 'active', commitAt: 9.9, until: 18.9 },
};
const planFor = (player, serverNow = 10.2) => resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow, localTime: 12 });

test('all four authored ownership channels coexist at their original accepted clocks', () => {
  const plan = planFor(active);
  assert.equal(plan.layers.locomotion.clip, 'Dash');
  assert.equal(plan.layers.posture.clip, 'Slash_1');
  assert.equal(plan.layers.posture.overlay.clip, 'Guard');
  assert.equal(plan.layers.posture.overlay.weight, 0.35);
  assert.equal(plan.layers.sword.clip, 'Slash_1');
  assert.equal(plan.layers.sorcery.clip, 'Cast');
  assert.ok(Math.abs(plan.layers.sword.time - 0.2) < 1e-9);
  assert.ok(Math.abs(plan.layers.sorcery.time - 0.1) < 1e-9);
  for (const change of [{ guarding: false }, { dashUntil: 0 }, { castPoseUntil: 0 }]) {
    assert.deepEqual(planFor({ ...active, ...change }).layers.sword, plan.layers.sword, 'ordinary action changes preserve strike clock');
  }
  assert.deepEqual(planFor({ ...active, attackActive: false }).layers.sorcery, plan.layers.sorcery, 'sword ending preserves accepted gather');
  assert.equal(planFor(active, 10.85).layers.sword.clip, 'Slash_2');
});

test('concurrent Guard torso and casting offhand remain visible above fallback Dash legs', () => {
  const pose = resolveRemoteSpellbladePose({ state: 'attack', player: active, serverNow: 10.2, localTime: 12 });
  assert.equal(pose.torso.ry, 0.14);
  assert.equal(pose.leftUpperArm.rx, -1.28);
  assert.equal(pose.leftThigh.rx, -0.16);
  assert.equal(pose.rightThigh.rx, 0.34);
  assert.notEqual(pose.rightUpperArm.rz, -0.62, 'sword moves while guard torso remains defensive');
});

test('first person fallback preserves sword and cast together while Dash remains under them', () => {
  const pose = resolveWeaponPose({ timeSec: 10.2, attackHeld: true, attackStartedAt: 10, guard: true, castStartedAt: 10.1, castUntil: 10.46, dashUntil: 10.5, concurrent: true });
  assert.equal(pose.state, 'attack');
  assert.deepEqual(pose.concurrent, { attack: true, guard: true, cast: true, dash: true });
  assert.ok(pose.castPhase);
  const fp = resolveFirstPersonAnimationPlan(pose, { concurrent: true, guard: true, attackHeld: true, castUntil: 10.46 }, 10.2);
  assert.equal(fp.layers.posture.clip, 'Guard');
  assert.equal(fp.layers.sword.clip, 'Idle', 'procedural original sword solver keeps its own clock');
  assert.equal(fp.layers.sorcery.clip, 'Idle', 'accepted cast gesture independently owns the magic arm');
});

test('incapacitation and expiry return authored presentation to ordinary ownership', () => {
  assert.equal(planFor({ ...active, alive: false }).layers, undefined);
  assert.equal(planFor({ ...active, staggerUntil: 11 }).layers, undefined);
  assert.equal(planFor(active, 19).layers, undefined);
  assert.equal(planFor({ ...active, ultimateState: { ...active.ultimateState, phase: 'startup', commitAt: 11 } }).layers, undefined);
});

test('the three signature tell persists, then folds away completely on expiry or death', () => {
  const committed = chivalryTellState(active, 10);
  assert.equal(committed.active, true);
  assert.deepEqual(committed.signatures, active.preparedSpells);
  const end = chivalryTellState(active, 19, committed);
  assert.equal(end.active, false);
  assert.equal(end.opacity, 1);
  assert.equal(chivalryTellState(active, 19 + CHIVALRY_END_SEC + 0.001, end).opacity, 0);
  assert.equal(chivalryTellState({ ...active, alive: false }, 10.1, committed).active, false);
});

test('prepared cast prediction follows requested identity and projectile gate, with one gather', () => {
  const player = { ...active, spell: 'fireball', spellReadyAt: 20, spellReadyById: { fireball: 20, gale: 21 }, chivalryProjectileReadyAt: 10.1 };
  assert.equal(canPresentLocalAction('cast', player, {}, 10.2, { spell: 'frostfire' }), true);
  assert.equal(canPresentLocalAction('cast', player, {}, 10.2, { spell: 'gale' }), false);
  assert.equal(canPresentLocalAction('cast', player, {}, 10.2, { spell: 'steel' }), false);
  assert.equal(canPresentLocalAction('cast', player, {}, 10.2, { spell: 'frostfire', gate: { projectile: 10.5 } }), false);
  assert.equal(canPresentLocalAction('cast', player, {}, 10.2, { spell: 'frostfire', gate: { gatherUntil: 10.5 } }), false);
  assert.equal(canPresentLocalAction('cast', { ...player, castEndsAt: 10.4 }, {}, 10.2, { spell: 'frostfire' }), false);
});

test('ordinary coexistence events keep held actions and a parry still permits true interruptions', () => {
  for (const type of ['spellCast', 'attackStarted', 'guardStarted']) assert.equal(localWeaponReleaseForEvent({ type, playerId: 'me', at: 10.2 }, 'me', active), null);
  assert.equal(localWeaponReleaseForEvent({ type: 'parry', attackerId: 'me', at: 10.2 }, 'me', active), null);
  assert.equal(localWeaponReleaseForEvent({ type: 'parry', attackerId: 'me', at: 10.2, suppressParryReel: true }, 'me', { ...active, ultimateState: null }), null, 'delayed event retains authoritative reel decision after expiry');
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'guardBreak', defenderId: 'me', at: 10.2 }, 'me', active), { attack: true, guard: true, cast: true, dash: true });
  assert.deepEqual(localWeaponReleaseForEvent({ type: 'ultimateStart', playerId: 'me', ultimate: 'chivalry', at: 10.2 }, 'me', active), { attack: true, guard: true, cast: true, dash: true });
});

test('commit signatures stay beside the palm with no link or center crest', () => {
  const fp = chivalryTellStyle({ firstPerson: true });
  const remote = chivalryTellStyle();
  assert.ok(fp.opacity <= 0.25);
  for (const style of [fp, remote]) {
    assert.equal(style.crestRadius, undefined);
    assert.equal(style.thickness, undefined);
    assert.equal(style.archY, undefined);
    assert.ok(style.spacing > style.signatureRadius * 2);
  }
  const projected = 2 * fp.signatureRadius * 1.5 * 716 / (2 * 0.35 * Math.tan(78 * Math.PI / 360));
  assert.ok(projected < 20);
});

test('opponent active tell uses existing visor light and fades on expiry', async () => {
  const { chivalryVisorAccent } = await import('./chivalryPresentation.mjs');
  const start = chivalryTellState(active, 9.9);
  assert.equal(chivalryVisorAccent(start, 9.9), 0);
  const holding = chivalryTellState(active, 11, start);
  assert.ok(chivalryVisorAccent(holding, 11) > 0.5);
  const end = chivalryTellState(active, 19, holding);
  assert.ok(chivalryVisorAccent(chivalryTellState(active, 19.15, end), 19.15) < chivalryVisorAccent(end, 19));
  assert.equal(chivalryVisorAccent(chivalryTellState(active, 19.31, end), 19.31), 0);
});
