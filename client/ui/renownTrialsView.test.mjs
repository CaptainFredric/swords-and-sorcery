import test from 'node:test';
import assert from 'node:assert/strict';
import { renownTrialsView } from './renownTrialsView.mjs';

const sample = (phase, rest = {}) => ({
  mode: 'RENOWN_TRIALS',
  renownTrial: {
    runId: 'TEST:1', phase, waveIndex: 3, maxWaves: 12, remaining: 2, totalEnemies: 2,
    startedAt: 10, deadlineAt: 65, deadlineSec: 55, timeLeftSec: 5,
    overtimeSec: 0, executionChance: null, potentialReward: 18, waveReward: 0,
    ledger: [{ wave: 1, reward: 13 }, { wave: 2, reward: 19 }],
    ceremony: null, ...rest,
  },
});
test('trial HUD never predicts execution before a wave clears', () => {
  const normal = renownTrialsView(sample('WAVE_ACTIVE'), 60);
  assert.equal(normal.visible, true);
  assert.equal(normal.ceremony, false);
  assert.match(normal.title, /RIVALS REMAIN/);
  assert.match(normal.details, /BASE REWARD/);
  assert.doesNotMatch(JSON.stringify(normal), /EXECUTION/);
  const overtime = renownTrialsView(sample('WAVE_OVERTIME', {
    overtimeSec: 11, executionChance: .28,
    verdict: null,
  }), 76);
  assert.equal(overtime.clock, 'OVERTIME +0:11');
  assert.match(overtime.details, /28%/);
  assert.doesNotMatch(overtime.title, /EXECUTION/);
});
test('execution variation does not spoil the harmless-looking coin reversal', () => {
  const judgment = sample('JUDGMENT', { verdict: 'EXECUTION', variant: 'retaliation',
    ceremony: { cue: 'SWORD_RAISE', kind: 'retaliation' } });
  const initial = renownTrialsView(judgment, 80);
  assert.equal(initial.ceremony, true);
  assert.equal(initial.placeholder, true);
  assert.doesNotMatch(initial.title + initial.details + initial.footer, /EXECUTION|RETALIATION|COIN/);
  judgment.renownTrial.ceremony.cue = 'I_HAVE_SURPASSED_JUDGEMENT';
  assert.equal(renownTrialsView(judgment, 84).line, 'AHAHAHA! I have surpassed judgement');
  judgment.renownTrial.ceremony.cue = 'RECEIVE_COMPENSATION';
  assert.equal(renownTrialsView(judgment, 88).line, 'I shall receive your compensation');
  judgment.renownTrial.ceremony.cue = 'COIN_RETALIATION';
  assert.match(renownTrialsView(judgment, 90).details, /ordinary-looking coin/);
});
test('provisional Renown is marked unsettled and not misrepresented as profile award', () => {
  const judgment = sample('JUDGMENT', {
    verdict: 'AWARD', waveReward: 21,
    ceremony: { cue: 'REWARD_COIN', kind: 'timely' },
  });
  const view = renownTrialsView(judgment, 80);
  assert.match(view.footer, /21.*UNSETTLED/);
  const other = renownTrialsView({ mode: 'PRACTICE' }, 80);
  assert.deepEqual(other, { visible: false });
});
