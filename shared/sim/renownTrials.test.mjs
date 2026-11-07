import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RENOWNER_VERDICTS, RENOWN_TRIAL_PHASES, RENOWN_TRIAL_TUNING,
  beginRenownTrial, drawRenownerVerdict, overtimeVerdictWeights,
  renownTrialCombatOpen, serializeRenownTrial, stepRenownTrial,
  timelyWaveReward, trialWavePlan,
} from './renownTrials.mjs';

function room() {
  const human = { id: 'human', actorKind: 'human', alive: true };
  return {
    code: 'TEST1', tickNumber: 0, state: 'PLAYING',
    players: new Map([[human.id, human]]), projectiles: new Map(),
    ruptures: [], events: [], results: [],
    addServerActor({ id, name, actorKind, spell }) {
      const bot = { id, name, actorKind, spell, alive: true };
      this.players.set(id, bot); return bot;
    },
    finish(winnerId, at, reason) {
      this.state = 'FINISHED'; this.results.push({ winnerId, at, reason });
    },
  };
}
const startWave = (r, at = 0) => {
  beginRenownTrial(r, at);
  stepRenownTrial(r, at + RENOWN_TRIAL_TUNING.introSec);
  return r.renownTrial.wave;
};
function defeatWave(r) {
  for (const id of r.renownTrial.wave.enemyIds) r.players.get(id).alive = false;
}
function advance(r, nowSec) {
  stepRenownTrial(r, nowSec);
  stepRenownTrial(r, nowSec + RENOWN_TRIAL_TUNING.ceremonySec.timely + 0.1);
  stepRenownTrial(r, nowSec + RENOWN_TRIAL_TUNING.ceremonySec.timely + RENOWN_TRIAL_TUNING.interWaveSec + 0.2);
}
test('wave blueprints scale bot roles and skill, never health or passive runner stalling', () => {
  assert.equal(trialWavePlan(1).count, 1);
  assert.equal(trialWavePlan(9).count, 4);
  assert.equal(trialWavePlan(30).count, 4);
  assert.ok(trialWavePlan(5).deadlineSec > trialWavePlan(1).deadlineSec);
  assert.ok(trialWavePlan(9).rivals.some((b) => b.skill === 'spellblade'));
  for (let wave = 1; wave < 16; wave++) {
    for (const bot of trialWavePlan(wave).rivals) assert.notEqual(bot.role, 'runner');
  }
  assert.throws(() => trialWavePlan(0), RangeError);
});
test('overtime probabilities rise strictly; the nonfatal outcomes both shrink', () => {
  let last = overtimeVerdictWeights(0);
  for (let second = 1; second <= 180; second++) {
    const next = overtimeVerdictWeights(second);
    assert.ok(next.execution > last.execution);
    assert.ok(next.none < last.none);
    assert.ok(next.coin < last.coin);
    assert.ok(Math.abs(next.execution + next.none + next.coin - 1) < 1e-12);
    last = next;
  }
  assert.ok(last.execution < 1);
});
test('one uniform sample produces every verdict including BOTH execution variants', () => {
  const p = overtimeVerdictWeights(12);
  assert.deepEqual(drawRenownerVerdict(12, () => 0),
    { verdict: RENOWNER_VERDICTS.EXECUTION, variant: 'sword' });
  assert.deepEqual(drawRenownerVerdict(12, () => p.execution * 0.75),
    { verdict: RENOWNER_VERDICTS.EXECUTION, variant: 'retaliation' });
  assert.deepEqual(drawRenownerVerdict(12, () => p.execution + p.none * 0.5),
    { verdict: RENOWNER_VERDICTS.NONE, variant: null });
  assert.deepEqual(drawRenownerVerdict(12, () => 0.999999),
    { verdict: RENOWNER_VERDICTS.COIN, variant: null });
});
test('real bot actors spawn after intro; combat is open only during waves', () => {
  const r = room();
  beginRenownTrial(r, 100);
  assert.equal(r.renownTrial.phase, RENOWN_TRIAL_PHASES.PREPARING);
  assert.equal(renownTrialCombatOpen(r), false);
  stepRenownTrial(r, 100.8);
  assert.equal(r.players.size, 1);
  stepRenownTrial(r, 101.5);
  assert.equal(r.players.size, 2);
  assert.equal(renownTrialCombatOpen(r), true);
  assert.equal(r.renownTrial.wave.enemyIds.length, 1);
  assert.equal(serializeRenownTrial(r, 101.5).verdict, null);
});
test('timely speed award recorded only once, with no premature persistent settlement', () => {
  const r = room();
  const wave = startWave(r);
  const time = wave.startedAt + wave.deadlineSec / 2;
  defeatWave(r);
  stepRenownTrial(r, time, () => { throw Error('No RNG for timely waves'); });
  assert.equal(r.renownTrial.wave.verdict, RENOWNER_VERDICTS.AWARD);
  assert.equal(r.renownTrial.wave.reward, timelyWaveReward(wave, wave.deadlineSec / 2));
  assert.equal(r.renownTrial.ledger[0].status, 'UNSETTLED');
  assert.equal(r.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
  stepRenownTrial(r, time + 1);
  assert.equal(r.renownTrial.ledger.length, 1);
  assert.equal(r.renownTrial.wave.endedAt, time);
  advance(r, time + 1.1);
  assert.equal(r.renownTrial.waveIndex, 2);
  assert.equal(r.renownTrial.wave.enemyIds.length, 1);
  assert.equal(r.players.size, 2); // earlier bot deleted before next wave
});
test('overtime is combat, not an immediate fail; exactly one decision after last enemy dies', () => {
  const r = room();
  const wave = startWave(r);
  const expired = wave.deadlineAt + 10;
  let draws = 0;
  const random = () => { draws++; return 0.999999; };
  stepRenownTrial(r, expired, random);
  assert.equal(r.renownTrial.phase, RENOWN_TRIAL_PHASES.WAVE_OVERTIME);
  assert.equal(draws, 0);
  assert.ok(serializeRenownTrial(r, expired).executionChance > 0);
  assert.equal(serializeRenownTrial(r, expired).verdict, null);
  stepRenownTrial(r, expired + 2, random);
  assert.equal(draws, 0);
  defeatWave(r);
  stepRenownTrial(r, expired + 3, random);
  assert.equal(draws, 1);
  assert.equal(r.renownTrial.wave.verdict, RENOWNER_VERDICTS.COIN);
  assert.equal(r.renownTrial.ledger[0].reward, 0);
  stepRenownTrial(r, expired + 3.1, random);
  assert.equal(draws, 1);
});
test('on-time clear at the exact deadline does NOT require an overtime roll', () => {
  const r = room(); const wave = startWave(r);
  defeatWave(r);
  stepRenownTrial(r, wave.deadlineAt, () => { throw Error('No draw at the deadline'); });
  assert.equal(r.renownTrial.wave.verdict, RENOWNER_VERDICTS.AWARD);
});
test('sword execution ends run after its ceremony, never turns into a coin payout', () => {
  const r = room(); const wave = startWave(r);
  defeatWave(r);
  const now = wave.deadlineAt + 5;
  stepRenownTrial(r, now, () => 0);
  assert.equal(r.renownTrial.wave.variant, 'sword');
  assert.equal(serializeRenownTrial(r, now + 4).ceremony.cue, 'SWORD_RESET');
  stepRenownTrial(r, now + RENOWN_TRIAL_TUNING.ceremonySec.sword + 0.01);
  assert.equal(r.results[0].reason, 'renown-trial-executed');
  assert.equal(r.renownTrial.ledger[0].reward, 0);
  assert.equal(r.renownTrial.phase, RENOWN_TRIAL_PHASES.TERMINATED);
});
test('coin retaliation preserves both creator lines in order and remains lethal', () => {
  const r = room(); const wave = startWave(r);
  defeatWave(r);
  const now = wave.deadlineAt + 5;
  const chance = overtimeVerdictWeights(5).execution;
  stepRenownTrial(r, now, () => chance * 0.75);
  assert.equal(r.renownTrial.wave.variant, 'retaliation');
  assert.equal(serializeRenownTrial(r, now + 4).ceremony.cue, 'I_HAVE_SURPASSED_JUDGEMENT');
  assert.equal(serializeRenownTrial(r, now + 8).ceremony.cue, 'RECEIVE_COMPENSATION');
  assert.equal(serializeRenownTrial(r, now + 10).ceremony.cue, 'COIN_RETALIATION');
  stepRenownTrial(r, now + RENOWN_TRIAL_TUNING.ceremonySec.retaliation + 0.01);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].reason, 'renown-trial-executed');
});
test('dead Spellblade ends run rather than respawning into a new wave', () => {
  const r = room(); startWave(r);
  r.players.get('human').alive = false;
  stepRenownTrial(r, 9);
  assert.equal(r.results[0].reason, 'renown-trial-defeated');
  assert.equal(r.renownTrial.phase, RENOWN_TRIAL_PHASES.TERMINATED);
  stepRenownTrial(r, 20);
  assert.equal(r.results.length, 1);
});
test('the last provisional wave completes a run without spawning wave 13', () => {
  const r = room(); startWave(r);
  r.renownTrial.waveIndex = RENOWN_TRIAL_TUNING.maxWaves;
  r.renownTrial.wave.index = RENOWN_TRIAL_TUNING.maxWaves;
  defeatWave(r);
  stepRenownTrial(r, 3);
  stepRenownTrial(r, 3 + RENOWN_TRIAL_TUNING.ceremonySec.timely + 0.01);
  assert.equal(r.results[0].reason, 'renown-trial-completed');
});
