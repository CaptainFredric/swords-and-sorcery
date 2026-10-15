import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_SEGMENTS, TUTORIAL_BEATS, TUTORIAL_BRANCHES, tutorialRouteBeats } from './tutorialScript.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';

const segment = id => TUTORIAL_SEGMENTS.find(item => item.id === id);
const beat = id => TUTORIAL_BEATS.find(item => item.id === id);
const permissions = id => beat(id).permissions ?? segment(beat(id).segment).permissions;

test('opening look, walk and sprint become available at their actual prompts', () => {
  assert.deepEqual(permissions('greeting'), []);
  assert.deepEqual(permissions('truly-look-around'), []);
  assert.deepEqual(permissions('look-prompt'), ['look']);
  assert.deepEqual(permissions('also-walk'), ['look']);
  assert.deepEqual(permissions('walk-prompt'), ['look', 'move']);
  assert.deepEqual(permissions('quite-a-distance'), ['look', 'move']);
  assert.equal(permissions('sprint-prompt').includes('sprint'), true);
  assert.equal(permissions('sprint-prompt').includes('jump'), false);
  assert.equal(permissions('negotiations').includes('attack'), false);
  assert.equal(permissions('placate').includes('attack'), true);
  assert.equal(permissions('jump-prompt').includes('jump'), true);
  assert.equal(permissions('get-over-it').includes('dash'), false);
  assert.equal(permissions('dash-prompt').includes('dash'), true);
});

test('the departure, the false exit and the threat come before the pursuit, whose objective then persists', () => {
  assert.ok(segment('escape-head-start').permissions.includes('move'));
  assert.equal(segment('escape-head-start').scene.releaseControls,undefined);
  assert.equal(beat('successful-expulsion').line, 'And thus the Spellblade had successfully convinced the meddlesome miscommunication Rival to return to sender');
  assert.equal(beat('not-admired').line, 'He did not admire me.');
  // the narration of his departure starts as he walks off (never once he is already sprinting)
  assert.equal(segment('escape-head-start').beats[0].advanceOn, 'rival-departing');
  assert.equal(segment('escape-head-start').scene.enter, 'rival-depart');
  // the false exit: its own objective, a quiet instruction, the two lines, a moment's quiet
  assert.deepEqual(segment('false-exit').objective, { title: 'OBJECTIVE', text: 'LEAVE GREENER PASTURES' });
  assert.deepEqual(segment('false-exit').beats.map(item => item.id), ['leave-prompt', 'time-to-exit', 'barely-did-anything', 'exit-quiet', 'exit-approach']);
  assert.equal(beat('time-to-exit').line, 'Time to exit like a proper Spellblade.');
  assert.equal(beat('barely-did-anything').line, 'You barely did anything.');
  assert.ok(beat('exit-quiet').advanceAfterSec >= 1.5);
  // the threat stops him dead at its first word; then the pursuit and its objective
  assert.deepEqual(segment('tattle-threat').beats.map(item => item.id), ['threat-halt', 'escape-made-fun', 'realization', 'pursuit-release']);
  assert.equal(beat('threat-halt').stageCue, 'player-halt');
  assert.equal(beat('pursuit-release').stageCue, 'pursuit-release');
  assert.equal(beat('pursuit-release').advanceOn, 'rival-escaping');
  assert.deepEqual(beat('pursuit-release').objective, { title: 'OBJECTIVE', text: 'STOP THE RIVAL FROM TELLING ON YOU' });
  assert.equal(permissions('hardly-wellbeing').includes('move'), true);
  for (const id of ['rival-escape', 'jump-obstacle', 'fireball', 'tattle-reveal', 'dead-end', 'bridge-dash', 'counterfire']) {
    assert.deepEqual(segment(id).objective, { title: 'OBJECTIVE', text: 'STOP THE RIVAL FROM TELLING ON YOU' });
  }
});

test('Jump and tattle are independently authored named-landmark scenes before the bridge', () => {
  const ids = TUTORIAL_SEGMENTS.map(item => item.id);
  assert.ok(ids.indexOf('jump-obstacle') < ids.indexOf('fireball'));
  assert.ok(ids.indexOf('tattle-reveal') < ids.indexOf('bridge-dash'));
  assert.equal(segment('jump-obstacle').scene.enter, 'rival-jump');
  assert.equal(beat('jump-prompt').advanceOn, 'jump-used');
  assert.equal(beat('jump-crossing').advanceOn, 'jump-crossed');
  assert.deepEqual(segment('tattle-reveal').scene.gates[0], {
    cue: 'tattle-reveal-reached', kind: 'past-landmark', actor: 'player', landmark: 'tattle-reveal',
  });
  assert.equal(tutorialRouteBeats(TUTORIAL_SEGMENTS, { omitSegments: ['jump-obstacle', 'tattle-reveal'] }).some(item => item.id === 'jump-prompt'), false);
  assert.ok(tutorialRouteBeats(TUTORIAL_SEGMENTS, { omitSegments: ['jump-obstacle', 'tattle-reveal'] }).some(item => item.id === 'dash-prompt'));
  assert.deepEqual(segment('jump-obstacle').beats.filter(item => item.kind === 'dialogue').map(item => item.line), [
    'Ahahaha! You cannot overcome this!', 'What should I do?',
    "The Spellblade's journey is not impeded by minor ledges.", 'What does that mean?',
    'He rises to the occasion, climbs the ranks, and bounds onward toward greater glory.',
    'I do not get hints.', 'Jump.', 'Haha! Took US long enough.', 'Us?',
    'No! I should not have stopped running for such a minor tactical advantage!',
  ]);
  assert.deepEqual(segment('tattle-reveal').beats.filter(item => item.kind === 'dialogue').map(item => item.line), [
    'I know exactly how this matter must be settled.', 'How?', 'It will be at a place of utmost dignity!',
    'Where you will be rightfully condemned!', '...and be told on.', 'NOW this has acquired my attention!',
  ]);
});

test('constitution is an optional lethal-survival response and existing Dash recording keys survive', () => {
  assert.deepEqual(TUTORIAL_BRANCHES['rival-constitution'].map(item => item.line), [
    'Hmm. This is strange.', 'No I am not!', 'Your rival appears not to have fallen yet.',
    'Thank you for noticing!!',
  ]);
  // (his condition is asked after where he is first knocked down, in the first duel: never twice)
  assert.deepEqual(['what-condition', 'current-constitution', 'constitution-amended', 'cannot-settled'].map(id => beat(id).segment),
    ['duel-constitution', 'duel-constitution', 'duel-constitution', 'duel-constitution']);
  assert.ok(TUTORIAL_BRANCHES['rival-constitution'].every(item => item.presentation === 'reactive'));
  assert.equal(beat('but-knight').line, 'Never! I am a knight!');
  assert.equal(beat('but-knight').recordingKey, 'tutorial.but-knight');
});

test('optional dialogue queues behind a spoken line then pauses the next caption clock', () => {
  const director = new TutorialDirector({ beats: [
    { id: 'first', kind: 'dialogue', line: 'First line.', presentation: 'reactive', rehearsalSec: 2, advanceOn: 'continue' },
    { id: 'next', kind: 'dialogue', line: 'Next line.', presentation: 'reactive', rehearsalSec: 2, advanceOn: 'continue' },
    { id: 'gate', kind: 'stage', advanceOn: 'jump-crossed' },
  ], branches: { joke: [
    { id: 'optional', kind: 'dialogue', line: 'Optional line.', presentation: 'reactive', rehearsalSec: 3 },
  ] } });
  director.start(); director.tick(10); director.tick(11);
  assert.equal(director.offerBranch('joke'), true);
  assert.equal(director.optionalCue, null);
  assert.equal(director.current.id, 'first');
  director.tick(12);
  assert.equal(director.current.id, 'next');
  assert.equal(director.optionalCue.id, 'optional');
  assert.equal(director.cue, null);
  director.tick(15);
  assert.equal(director.optionalCue, null);
  assert.equal(director.current.id, 'next');
  director.tick(16); assert.equal(director.current.id, 'next');
  director.tick(17); assert.equal(director.current.id, 'gate');
});

test('queued reactions are discarded at the authored ending and stale optional takes cannot resume', () => {
  const director = new TutorialDirector({ beats: [
    { id: 'fight', kind: 'stage', segment: 'rival-defeat', chapter: 'final-guard', advanceOn: 'rival-defeated' },
    { id: 'ending', kind: 'dialogue', line: 'Who are you?', segment: 'title-ending', chapter: 'ending', advanceOn: 'continue' },
  ], branches: { joke: [{ id: 'optional', kind: 'dialogue', line: 'Too late.', presentation: 'reactive', rehearsalSec: 3 }] } });
  director.start(); director.offerBranch('joke'); const stale = director.optionalCue;
  director.fact('rival-defeated');
  assert.equal(director.optionalCue, null);
  assert.equal(director.branchQueue.length, 0);
  assert.equal(director.completeOptionalDialogue(stale), false);
});
