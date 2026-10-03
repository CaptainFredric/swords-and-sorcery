import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, challengeView, publicChallengeState } from './challenges.mjs';

test('nine mastery feats use extensible rewards and three populated curriculum families',()=>{
  assert.equal(Object.keys(CHALLENGES).length,9);
  assert.equal(Object.values(CHALLENGES).reduce((sum,c)=>sum+c.reward.renown,0),175);
  assert.deepEqual(new Set(Object.values(CHALLENGES).map(c=>c.family)),new Set(['swordsmanship','sorcery','chivalry']));
});
test('hinted feats hide title, condition, numeric progress and reward until settled completion',()=>{
  const state={progress:{wind_correction:1},completed:{}};
  const hidden=challengeView(state).find(c=>c.id==='wind_correction');
  assert.equal(hidden.title,'HIDDEN CHALLENGE');assert.equal(hidden.condition,undefined);
  assert.equal(hidden.progress,undefined);assert.equal(hidden.reward,undefined);
  assert.match(hidden.hint,/straight lines/);
  assert.deepEqual(publicChallengeState(state),{progress:{},completed:{}});
  state.completed.wind_correction=1700000000000;
  const revealed=challengeView(state).find(c=>c.id==='wind_correction');
  assert.equal(revealed.title,'WIND CORRECTION');assert.match(revealed.condition,/same owned projectile/);
  assert.equal(revealed.reward.renown,20);assert.equal(revealed.complete,true);
});
test('visible progress is safe and unknown IDs never become player-facing entries',()=>{
  const state={progress:{three_part_argument:2,obsolete:99},completed:{future:1}};
  assert.deepEqual(publicChallengeState(state),{progress:{three_part_argument:2},completed:{}});
  assert.equal(challengeView(state).find(c=>c.id==='three_part_argument').progress,2);
});
