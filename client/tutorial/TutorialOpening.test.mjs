import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialOpening, TUTORIAL_OPENING_MS, TUTORIAL_OPENING_LIMIT_MS } from './TutorialOpening.mjs';
function setup(ready) {
  const pending=[],events=[];
  const opening=new TutorialOpening({hold:()=>events.push('title'),reveal:result=>events.push(result),ready,
    schedule:(callback,ms)=>{pending.push({callback,ms});return pending.length;},cancel:()=>{}});
  return {opening,pending,events};
}
test('normal, cached and muted openings share one minimum title deadline',()=>{
  for(const audio of ['normal','cached','muted']) {
    const {opening,pending,events}=setup();opening.begin();
    assert.equal(opening.waiting,true,audio);assert.deepEqual(events,['title']);
    assert.equal(pending[0].ms,TUTORIAL_OPENING_MS);pending[0].callback();
    assert.equal(opening.waiting,false);assert.deepEqual(events,['title',{audioReady:true}]);
  }
});
test('slow decoding reveals caption and narration together after the title, with a bounded caption fallback',async()=>{
  let resolve;
  const {opening,pending,events}=setup(()=>new Promise(done=>resolve=done));opening.begin();pending[0].callback();
  assert.equal(opening.waiting,true);resolve(true);await Promise.resolve();
  assert.deepEqual(events,['title',{audioReady:true}]);
  const stalled=setup(()=>new Promise(done=>resolve=done));stalled.opening.begin();stalled.pending[0].callback();
  assert.equal(stalled.pending[1].ms,TUTORIAL_OPENING_LIMIT_MS);stalled.pending[1].callback();
  assert.deepEqual(stalled.events,['title',{audioReady:false}]);resolve(true);await Promise.resolve();
  assert.equal(stalled.opening.audioReady,false);assert.equal(stalled.events.length,2);
});
test('restart and leave invalidate old title timers and decoder completion without changing the Director',async()=>{
  let resolve;
  const {opening,pending,events}=setup(()=>new Promise(done=>resolve=done));opening.begin();const oldResolve=resolve;
  opening.begin();pending[0].callback();oldResolve(true);await Promise.resolve();assert.equal(opening.waiting,true);
  resolve(true);await Promise.resolve();pending[2].callback();assert.equal(opening.waiting,false);
  opening.begin();opening.stop();pending[4].callback();pending[5].callback();resolve(true);await Promise.resolve();
  assert.deepEqual(events,['title','title',{audioReady:true},'title']);
});
