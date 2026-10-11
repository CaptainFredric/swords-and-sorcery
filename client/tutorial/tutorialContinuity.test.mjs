import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialDirector } from './TutorialDirector.mjs';

test('reactive rehearsal captions progress without Continue while gameplay gates still need facts', () => {
  const director = new TutorialDirector({beats:[
    {id:'moving',kind:'dialogue',line:'Moving.',advanceOn:'continue',presentation:'reactive',rehearsalSec:2},
    {id:'hit',kind:'prompt',line:'Hit.',advanceOn:'fireball-hit'},
  ]});
  director.start(); director.tick(10); director.tick(11);
  assert.equal(director.current.id,'moving');
  director.tick(12); assert.equal(director.current.id,'hit');
  director.tick(50); assert.equal(director.current.id,'hit');
  director.fact('fireball-hit'); assert.equal(director.state,'complete');
});
test('genuine early facts carry through captions, and checkpoint restart invalidates stale cues', () => {
  const director=new TutorialDirector({beats:[
    {id:'talk',kind:'dialogue',line:'Talk',advanceOn:'continue',segment:'first'},
    {id:'contact',kind:'prompt',line:'Attack',advanceOn:'sword-contact',segment:'second'},
    {id:'next',kind:'dialogue',line:'Next',advanceOn:'continue',segment:'second'},
  ]});director.start();const stale=director.cue;
  director.fact('sword-contact');director.completeDialogue(stale);
  assert.equal(director.current.id,'next');
  director.resumeAt('contact');assert.equal(director.current.id,'contact');
  assert.equal(director.completeDialogue(stale),false);
  director.fact('sword-contact');assert.equal(director.current.id,'next');
});
