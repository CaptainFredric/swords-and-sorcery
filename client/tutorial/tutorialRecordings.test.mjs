import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tutorialRecordingPlan, tutorialCueForDevice, playTutorialCue } from './tutorialRecordings.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';

test('recording plan includes dialogue only with stable keys, filenames and distinct speakers', () => {
  const plan = tutorialRecordingPlan();
  assert.equal(new Set(plan.map(take => take.key)).size, plan.length);
  assert.deepEqual(plan.find(take => take.key === 'tutorial.you-did'), {
    key: 'tutorial.you-did', beatId: 'you-did', speaker: 'narrator', text: 'You did.',
    sourceFile: 'tutorial.you-did.wav', fileBase: 'narrator/tutorial.you-did-1',
    chapter: 'spellblade', segment: 'greener-introduction', presentation: 'blocking', optionalBranch: null,
  });
  assert.equal(plan.find(take => take.key === 'tutorial.extra').speaker, 'rival');
  const desktopStamina = plan.find(take => take.key === 'tutorial.what-is-below');
  const touchStamina = plan.find(take => take.key === 'tutorial.what-is-above');
  assert.equal(desktopStamina.device, 'desktop');
  assert.equal(desktopStamina.text, 'This is indeed much faster. Wait, what is that down there?');
  assert.equal(touchStamina.device, 'touch');
  assert.equal(touchStamina.beatId, 'what-is-above');
  assert.equal(touchStamina.text, 'This is indeed much faster. Wait, what is that up there?');
});

test('all established recording keys survive the full route and generated plan matches actual data', () => {
  const established = [
    'greeting', 'exemplary', 'you-did', 'another-like-you', 'introduce-yourself',
    'he-may-introduce', 'also-walk', 'quite-a-distance', 'run-faster', 'reminding-me',
    'what-is-below', 'your-stamina', 'did-not-order', 'consumes-energy', 'not-typical',
    'clearly', 'cannot-sprint', 'time-to-recover', 'sound-recover', 'good-question',
    'say-hello', 'admire-me', 'one-job', 'resemblance', 'likewise', 'despise-this',
    'worth-speaking', 'seem-certain', 'name-matters', 'properly-defeat', 'remain-strangers',
    'negotiations', 'placate', 'stand-down', 'sword-pen', 'own-pen', 'teach-you',
    'harsh-lesson', 'opinion', 'revise', 'good-health', 'mixed-message', 'disallow',
    'interception', 'blocked-message', 'guarded', 'technically-correct', 'extra', 'hint',
    'no-hints', 'imminent-demise', 'not-my-plan', 'plans-change', 'indeed',
    'frolic-fields', 'remembering-move',
  ];
  const plan = tutorialRecordingPlan();
  const keys = new Set(plan.map(take => take.key));
  for (const id of established) assert.ok(keys.has(`tutorial.${id}`), id);
  const generated = JSON.parse(readFileSync(new URL('../../docs/tutorial-recording-plan.json', import.meta.url), 'utf8'));
  assert.deepEqual(generated, plan);
  assert.ok(plan.every(take => ['narrator', 'spellblade', 'rival'].includes(take.speaker)));
  assert.deepEqual(plan.filter(take => take.optionalBranch).map(take => take.beatId), [
    'frolic-fields', 'remembering-move', 'constitution-strange', 'not-strange', 'not-fallen',
    'thank-noticing',
    'rival-over-there', 'scorch-mark', 'bridge-senses-failure', 'hence-i-crossed', 'permission-stop', 'no-longer-ruin', 'permission-no', 'then-no',
    'burn-subsided', 'reforged', 'not-too-many', 'fight-yourself', 'already-told', 'feelings-health',
  ]);
  const report = JSON.parse(readFileSync(new URL('../../docs/tutorial-one-recording-changes.json', import.meta.url), 'utf8'));
  assert.equal(report.total, plan.length);
  assert.equal(report.priorTotal, established.length);
  assert.deepEqual(report.added, plan.filter(take => !established.includes(take.beatId)).map(take => take.key));
  assert.deepEqual(report.optional, plan.filter(take => take.optionalBranch).map(take => take.key));
  assert.deepEqual(report.optionalSegments, plan.filter(take => take.optionalSegment).map(take => take.key));
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.refinement.missing, []);
  const polish = JSON.parse(readFileSync(new URL('../../docs/tutorial-polish-recording-changes.json', import.meta.url), 'utf8'));
  assert.equal(report.refinement.priorTotal + report.refinement.added.length + (report.postRefinement?.added.length ?? 0) + polish.added.length - polish.replaced.length
    + (polish.authoredPass?.added.length ?? 0), plan.length);
  // (the Greener Pastures authored pass: its recordings each have their place, and the final Guard's three lines are
  // the final duel's own beats now)
  for (const take of polish.authoredPass.added) assert.equal(plan.find(other => other.key === take.key)?.text, take.text, take.key);
  for (const moved of polish.authoredPass.promoted) assert.equal(plan.find(take => take.key === moved.key)?.segment, moved.to);
  for (const change of polish.authoredPass.changed ?? []) assert.equal(plan.find(take => take.key === change.key)?.text, change.after);
  assert.ok(report.refinement.added.every(key => keys.has(key) || polish.replaced.some(take => take.key === key)));
  for (const change of report.refinement.changed) {
    const take = plan.find(take => take.key === change.key);
    if (take) assert.equal(take.text, change.after);
    else assert.equal(polish.replaced.find(take => take.key === change.key)?.text, change.after);
  }
  for (const change of polish.followup.changed) {
    assert.equal(plan.find(take => take.key === change.key).text, change.after);
  }
  for (const moved of polish.followup.relocated) {
    const take = plan.find(take => take.key === moved.key);
    assert.equal(take.segment, moved.toSegment);
    assert.equal(take.chapter, moved.chapter);
    assert.equal(take.sourceFile, `${moved.key}.wav`);
  }
});

test('recording plan carries onset synchronization and reactive rehearsal metadata', () => {
  const plan = tutorialRecordingPlan();
  const well = plan.find(take => take.key === 'tutorial.well');
  const plans = plan.find(take => take.key === 'tutorial.plans-change');
  assert.equal(well.text, 'Well.');
  assert.equal(well.stageCue, undefined);
  assert.equal(plans.text, 'Things do not always go according to plan.');
  assert.deepEqual(plans.performanceCue, { at: 'onset', action: 'rival-attack', stageBeat: 'duel-onset', precedingBeat: 'well' });
  assert.equal(plans.stageCue, undefined);
  assert.equal(plans.presentation, 'reactive');
  assert.ok(plans.rehearsalSec > 1.5);
  assert.equal(plan.find(take => take.key === 'tutorial.greeting').rehearsalSec, undefined);
  assert.equal(plan.find(take => take.key === 'tutorial.burn-subsided').optionalBranch, 'burned');
  assert.equal(plan.find(take => take.key === 'tutorial.final-hello').optionalSegment, 'pursuit-banter');
});

test('tutorial voice selection follows the HUD device without changing the authored beat', () => {
  const cue = { id: 'what-is-below', speaker: 'spellblade',
    line: 'This is indeed much faster. Wait, what is that down there?', recordingKey: 'tutorial.what-is-below',
    touchLine: 'This is indeed much faster. Wait, what is that up there?', touchRecordingKey: 'tutorial.what-is-above' };
  assert.equal(tutorialCueForDevice(cue, { touch: false }), cue);
  const touch = tutorialCueForDevice(cue, { touch: true });
  assert.equal(touch.line, 'This is indeed much faster. Wait, what is that up there?');
  assert.equal(touch.recordingKey, 'tutorial.what-is-above');
  assert.equal(cue.line, 'This is indeed much faster. Wait, what is that down there?');
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
