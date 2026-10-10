import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_BEATS, TUTORIAL_CHAPTERS, TUTORIAL_BRANCHES } from './tutorialScript.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { tutorialRecordingPlan } from './tutorialRecordings.mjs';

test('chapters retain established identifiers and exact new creator wording, with separate optional recordings', () => {
  assert.deepEqual(TUTORIAL_CHAPTERS.map(x=>x.id),['spellblade','approach','introductions','negotiations','correspondence','duel']);
  assert.equal(TUTORIAL_BEATS.find(x=>x.id==='run-faster').line,'Yes... you can run faster.');
  assert.equal(TUTORIAL_BEATS.find(x=>x.id==='name-matters').line,'Of course. I have a name.');
  const plan=tutorialRecordingPlan();
  for(const id of ['greeting','you-did','technically-correct','extra','indeed']) assert.ok(plan.some(x=>x.key===`tutorial.${id}`));
  for(const beat of TUTORIAL_BRANCHES.frolic) assert.ok(plan.some(x=>x.key===beat.recordingKey));
  assert.equal(new Set(plan.map(x=>x.key)).size,plan.length);
  assert.equal(plan.find(x=>x.key==='tutorial.name-matters').speaker,'spellblade');
});
test('prototype stops deliberately at a completed chapter without reporting full completion', () => {
  const director=new TutorialDirector({prototypeStop:'spellblade'});
  director.start();
  while(director.current) director.accept(director.current.advanceOn);
  assert.equal(director.state,'prototype-ended');
  assert.equal(director.progress.chapter.id,'spellblade');
  assert.equal(director.accept('continue'),false);
  director.start(); assert.equal(director.current.id,'greeting');
});
test('optional frolic never blocks a main cue, inserts once and rejects stale runs', () => {
  const director=new TutorialDirector(); director.start();
  const old=director.cue;
  assert.equal(director.offerBranch('frolic'),true);
  assert.equal(director.offerBranch('frolic'),false);
  assert.equal(director.current.id,old.id);
  assert.equal(director.completeDialogue(old),true);
  const next=director.current.id;
  for(const line of TUTORIAL_BRANCHES.frolic) {
    assert.equal(director.optionalCue.id,line.id);
    assert.equal(director.completeOptionalDialogue(director.optionalCue),true);
    assert.equal(director.current.id,next);
  }
  assert.equal(director.completeDialogue(old),false);
  director.start(); director.offerBranch('frolic');
  const optional=director.optionalCue;
  director.start(); director.offerBranch('frolic');
  assert.equal(director.completeOptionalDialogue(optional),false);
});

test('a prototype cannot claim an unimplemented chapter as playable', () => {
  assert.throws(()=>new TutorialDirector({prototypeStop:'duel'}),/implemented/);
});
