import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialRecordingPlan, playTutorialCue } from './tutorialRecordings.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';

test('recording plan includes dialogue only with stable keys, filenames and distinct speakers', () => {
  const plan = tutorialRecordingPlan();
  assert.equal(plan.length, 33);
  assert.equal(new Set(plan.map(take => take.key)).size, plan.length);
  assert.deepEqual(plan.find(take => take.key === 'tutorial.you-did'), {
    key: 'tutorial.you-did', beatId: 'you-did', speaker: 'narrator', text: 'You did.',
    sourceFile: 'tutorial.you-did.wav', fileBase: 'narrator/tutorial.you-did-1',
  });
  assert.equal(plan.find(take => take.key === 'tutorial.extra').speaker, 'rival');
});

test('missing or muted takes leave captions available without inventing completion timing', () => {
  const director = new TutorialDirector(); director.start();
  const captions = [];
  assert.equal(playTutorialCue({ cue: director.cue, engine: { running: true }, onCaption: x => captions.push(x) }), null);
  assert.equal(playTutorialCue({ cue: director.cue, buffer: {}, engine: { running: false }, onCaption: x => captions.push(x) }), null);
  assert.equal(playTutorialCue({ cue: director.cue, buffer: {}, engine: { running: true, playBuffer: () => null }, onCaption: x => captions.push(x) }), null);
  assert.equal(captions.length, 3);
  assert.equal(director.current.id, 'greeting');
});

test('voice completion uses the real audio source and stopped takes never advance the director', () => {
  const director = new TutorialDirector(); director.start();
  let ended, stopped = 0;
  const engine = { running: true, playBuffer(buffer, options) {
    assert.equal(options.bus, 'voice');
    return { source: { addEventListener(type, listener) { assert.equal(type, 'ended'); ended = listener; } }, stop() { stopped++; } };
  } };
  let handle = playTutorialCue({ cue: director.cue, buffer: { duration: 2 }, engine,
    onComplete: cue => director.completeDialogue(cue) });
  handle.stop(); ended();
  assert.equal(stopped, 1);
  assert.equal(director.current.id, 'greeting');
  handle = playTutorialCue({ cue: director.cue, buffer: { duration: 2 }, engine,
    onComplete: cue => director.completeDialogue(cue) });
  ended();
  assert.equal(director.current.id, 'exemplary');
});
