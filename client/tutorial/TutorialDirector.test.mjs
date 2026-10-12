import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_BEATS, TUTORIAL_STATUS } from './tutorialScript.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';

test('draft has stable unique recording cues and explicit combat gates', () => {
  assert.equal(TUTORIAL_STATUS.phase, 'ready');
  assert.equal(new Set(TUTORIAL_BEATS.map(x => x.id)).size, TUTORIAL_BEATS.length);
  assert.equal(TUTORIAL_BEATS.find(x => x.id === 'attack-prompt').advanceOn, 'sword-contact');
  assert.equal(TUTORIAL_BEATS.find(x => x.id === 'guard-prompt').advanceOn, 'successful-guard');
  const postscript = TUTORIAL_BEATS.find(x => x.id === 'postscript-hit');
  assert.equal(postscript.advanceOn, 'player-damaged');
  assert.match(postscript.direction, /ordinary sword strike/);
  assert.match(postscript.direction, /Guard lowers/);
  assert.ok(TUTORIAL_BEATS.some(x => x.recordingKey === 'tutorial.technically-correct'));
});

test('director blocks premature action completion and preserves beat order', () => {
  const beats = [
    { id: 'intro', kind: 'dialogue', line: 'Hello', advanceOn: 'continue' },
    { id: 'attack', kind: 'prompt', line: 'Attack', advanceOn: 'sword-contact' },
    { id: 'guard', kind: 'prompt', line: 'Guard', advanceOn: 'successful-guard' },
    { id: 'hurt', kind: 'stage', advanceOn: 'player-damaged' },
    { id: 'duel', kind: 'stage', advanceOn: 'duel-complete' },
  ];
  const steps = [];
  const director = new TutorialDirector({ beats, onChange: s => steps.push(s.state) });
  assert.equal(director.current, null);
  assert.equal(director.start().id, 'intro');
  assert.equal(director.accept('sword-contact'), false);
  assert.equal(director.accept('continue'), true);
  assert.equal(director.current.id, 'attack');
  assert.equal(director.accept('continue'), false);
  for (const [cue, next] of [['sword-contact', 'guard'], ['successful-guard', 'hurt'], ['player-damaged', 'duel']]) {
    assert.equal(director.accept(cue), true);
    assert.equal(director.current.id, next);
  }
  assert.equal(director.accept('duel-complete'), true);
  assert.equal(director.progress.state, 'complete');
  assert.equal(director.accept('duel-complete'), false);
  assert.ok(steps.includes('complete'));
});

test('skip and reset never advance combat', () => {
  const director = new TutorialDirector({ beats: [{ id: 'a', kind: 'stage', advanceOn: 'hit' }] });
  director.start();
  assert.equal(director.skip(), true);
  assert.equal(director.accept('hit'), false);
  director.reset();
  assert.equal(director.progress.state, 'idle');
  assert.equal(director.start().id, 'a');
  assert.throws(() => new TutorialDirector({ beats: [{ id: 'x', line: 'Hello', advanceOn: 'continue' }, { id: 'x', line: 'Again', advanceOn: 'continue' }] }), /unique/);
});

test('late audio completion cannot skip dialogue after a restart or advance an action gate', () => {
  const director = new TutorialDirector();
  director.start();
  const oldCue = director.cue;
  director.skip();
  director.start();
  assert.equal(director.completeDialogue(oldCue), false);
  assert.equal(director.completeDialogue(director.cue), true);
  assert.equal(director.completeDialogue(oldCue), false);
  while (director.current.kind === 'dialogue') director.completeDialogue(director.cue);
  assert.equal(director.current.id, 'look-prompt');
  assert.equal(director.cue, null);
  assert.equal(director.completeDialogue(oldCue), false);
});

test('construction does not notify before the owner can install its director reference', () => {
  const changes = [];
  let director;
  director = new TutorialDirector({ onChange: () => changes.push(director.cue) });
  assert.equal(changes.length, 0);
  director.start();
  assert.equal(changes[0].recordingKey, 'tutorial.greeting');
});

test('a demonstrated mechanic skips obsolete authored hints at a clean spoken boundary',()=>{
  const d=new TutorialDirector({beats:[
    {id:'gloat',kind:'dialogue',line:'Test gloat',advanceOn:'continue',chapter:'pursuit'},
    {id:'hint',kind:'dialogue',line:'Test hint',advanceOn:'continue',chapter:'pursuit',skipWhen:'crossed'},
    {id:'near',kind:'stage',advanceOn:'near-wall',chapter:'pursuit',skipWhen:'crossed'},
    {id:'regret',kind:'dialogue',line:'Test regret',advanceOn:'continue',chapter:'pursuit'},
  ]});d.start();d.tick(1);const cue=d.cue;d.beginAudio(cue);d.fact('crossed');
  assert.equal(d.cue.id,'gloat');d.completeDialogue(cue);d.tick(1.4);
  assert.equal(d.cue.id,'regret');assert.equal(d.facts.has('crossed'),true);
});

test('a spatial wait can become obsolete after real completion without inventing its missing fact',()=>{
  const d=new TutorialDirector({beats:[{id:'near',kind:'stage',advanceOn:'near-wall',skipWhen:'crossed'},
    {id:'regret',kind:'dialogue',line:'Test regret',advanceOn:'continue'}]});d.start();d.fact('crossed');
  assert.equal(d.cue.id,'regret');assert.equal(d.facts.has('near-wall'),false);
});
