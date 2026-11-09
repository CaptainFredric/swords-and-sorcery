import test from 'node:test';
import assert from 'node:assert/strict';
import { renownTrialControlsLocked } from './trialControlPolicy.mjs';

test('the wave deadline never freezes controls, even during overtime',()=>{
  for(const phase of ['WAVE_ACTIVE','WAVE_OVERTIME']) {
    assert.equal(renownTrialControlsLocked({
      mode:'RENOWN_TRIALS',roomState:'PLAYING',renownTrial:{phase},
    }),false);
  }
});
test('ceremonial presentation and pre-wave phases lock local predictions; other modes are untouched',()=>{
  for(const phase of ['PREPARING','JUDGMENT','TRANSITION']) {
    assert.equal(renownTrialControlsLocked({
      mode:'RENOWN_TRIALS',roomState:'PLAYING',renownTrial:{phase},
    }),true);
  }
  assert.equal(renownTrialControlsLocked({
    mode:'RESTLESS_DAY',roomState:'PLAYING',renownTrial:{phase:'JUDGMENT'},
  }),false);
  assert.equal(renownTrialControlsLocked({
    mode:'RENOWN_TRIALS',roomState:'FINISHED',renownTrial:{phase:'TERMINATED'},
  }),false);
  assert.equal(renownTrialControlsLocked({mode:'RENOWN_TRIALS',roomState:'PLAYING'}),false);
});
