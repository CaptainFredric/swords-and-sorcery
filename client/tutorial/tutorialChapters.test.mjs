import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TUTORIAL_BEATS, TUTORIAL_CHAPTERS, TUTORIAL_SEGMENTS, TUTORIAL_BRANCHES,
  TUTORIAL_BRANCH_METADATA, TUTORIAL_STATUS, tutorialRouteSegments, tutorialRouteBeats,
} from './tutorialScript.mjs';
import { tutorialRecordingPlan } from './tutorialRecordings.mjs';

const beat = id => TUTORIAL_BEATS.find(item => item.id === id);

test('the complete declared route preserves chapter identifiers and reaches the ending', () => {
  assert.deepEqual(TUTORIAL_CHAPTERS.map(item => item.id), [
    'spellblade', 'approach', 'introductions', 'negotiations', 'correspondence', 'duel',
    'pursuit', 'fireball', 'bridge', 'counterfire', 'final-guard', 'ending',
  ]);
  assert.deepEqual(TUTORIAL_SEGMENTS.map(item => item.id), [
    'greener-introduction', 'meaningful-look', 'approach', 'stamina', 'introductions',
    'first-attack', 'first-guard', 'health-regen', 'real-duel', 'duel-constitution', 'duel-arrangement', 'duel-knockdown',
    'escape-head-start', 'false-exit', 'tattle-threat',
    'rival-escape', 'jump-obstacle', 'pursuit-banter', 'fireball', 'tattle-reveal', 'dead-end',
    'bridge-dash', 'counterfire', 'complaint-approach', 'pride-stop', 'duel-terms',
    'rival-defeat', 'title-ending',
  ]);
  assert.deepEqual(TUTORIAL_BEATS, TUTORIAL_CHAPTERS.flatMap(item => item.beats));
  assert.deepEqual(TUTORIAL_BEATS, TUTORIAL_SEGMENTS.flatMap(item => item.beats));
  assert.equal(new Set(TUTORIAL_BEATS.map(item => item.id)).size, TUTORIAL_BEATS.length);
  assert.ok(TUTORIAL_CHAPTERS.every(item => item.implemented));
  assert.equal(TUTORIAL_STATUS.phase, 'ready');
  assert.equal(TUTORIAL_BEATS.at(-1).advanceOn, 'title-ended');
});

test('creator wording retains intentional punctuation and revised stable recording keys', () => {
  const exact = {
    'greener-pastures': 'This is Greener Pastures, a land fertile of hope and opportunity.',
    'much-to-do': 'Yes... there is...much to do here..',
    'need-look-around': 'You need to look around',
    'nothing-of-value': 'I have. I see nothing of value',
    'truly-look-around': 'With your eyes.',
    'look-ah': 'Ah...',
    'still-nothing': 'Still nothing',
    'quite-a-distance': 'He is quite a distance away. Do I have any method of moving faster?',
    'run-faster': 'Yes... you can sprint.',
    'think-more': 'Mhm. Remember to think more often as well.',
    'can-do-all-day': 'Ah, hahaha! I can do this all day!',
    'good-question': '...A sound argument...',
    'blocked-message': 'You blocked me!',
    guarded: 'No. I was guarding.',
    'need-a-moment': 'I need a moment.',
    well: 'Well.',
    'plans-change': 'Things do not always go according to plan.',
    'depends-go-down': 'That depends, if you go down, I will cease as well',
    'spell-blade': 'Because I can spell ‘blade’!',
    'rival-cold': 'That was cold of you, ow!',
    'grow-maturity': 'You have grown, maturity awaits you after all, Spellblade.',
    'cease-singeing': 'Cease this singeing, I insist',
    'true-master': 'If I see ANYONE else who dares to resemble me, as you did... I shall correct their ignorance... and show who is the true master of',
    'closing-hope': 'Let us hope there are not many like him.',
  };
  for (const [id, line] of Object.entries(exact)) {
    assert.equal(beat(id)?.line, line, id);
    assert.equal(beat(id)?.recordingKey, `tutorial.${id}`);
  }
  assert.equal(beat('own-pen').line, 'Oh brother. Tell him off. With your own ‘pen’...');
});

test('gameplay phases declare genuine gates and progressively available actions', () => {
  const expected = {
    'look-prompt': 'player-looked', 'walk-prompt': 'approach-progress',
    'sprint-prompt': 'sprint-started', 'stamina-prompt': 'stamina-decreased',
    'sustained-sprint': 'sprint-sustained', 'winded-prompt': 'player-winded',
    'recover-prompt': 'stamina-recovered', 'reach-rival': 'rival-reached',
    'attack-prompt': 'sword-contact', 'guard-prompt': 'successful-guard',
    'lower-guard': 'guard-lowered', 'postscript-hit': 'player-damaged',
    'health-regen-prompt': 'health-settled', 'duel-midway': 'duel-damage-midway', 'real-duel': 'duel-damage-threshold',
    'rival-downed': 'rival-downed', 'rival-rising': 'rival-recovered', 'departure-start': 'rival-departing',
    'leave-prompt': 'exit-walk-started', 'exit-approach': 'exit-near', 'threat-halt': 'player-halted',
    'pursuit-release': 'rival-escaping', 'jump-near-approach': 'jump-approach-ready', 'jump-prompt': 'jump-used',
    'dead-end-arrival': 'dead-end-rival-over', 'dead-end-crossing': 'dead-end-crossed', 'fireball-prompt': 'fireball-hit',
    'dash-prompt': 'dash-used', 'bridge-crossing': 'bridge-crossed',
    'counterfire-hit': 'subsequent-fireball-hit', 'counterfire-pursuit': 'counterfire-complete',
    'final-opening': 'final-first-parry', 'final-guard': 'rival-guard-broken', 'defeat-rival': 'rival-defeated',
    'tutorial-ended': 'title-ended',
  };
  for (const [id, cue] of Object.entries(expected)) assert.equal(beat(id)?.advanceOn, cue, id);
  const permitted = new Set(['look', 'move', 'sprint', 'attack', 'guard', 'spell', 'dash', 'jump', 'crouch']);
  for (const segment of TUTORIAL_SEGMENTS) {
    assert.ok(segment.permissions.every(action => permitted.has(action)), segment.id);
    assert.ok(segment.beats.every(item => item.segment === segment.id && item.chapter === segment.chapter));
    assert.ok(segment.completionCue);
    assert.equal(segment.retry.behavior, 'checkpoint');
  }
  const actions = id => TUTORIAL_SEGMENTS.find(item => item.id === id).permissions;
  assert.equal(actions('approach').includes('sprint'), false);
  assert.equal(actions('stamina').includes('sprint'), true);
  assert.equal(actions('first-attack').includes('attack'), true);
  assert.equal(actions('first-attack').includes('guard'), false);
  assert.equal(actions('first-guard').includes('guard'), true);
  assert.equal(actions('fireball').includes('spell'), true);
  assert.equal(actions('bridge-dash').includes('dash'), false);
  assert.equal(beat('dash-prompt').permissions.includes('dash'), true);
  assert.equal(beat('duel-onset').stageCue, 'rival-attack');
  assert.equal(beat('plans-change').stageCue, undefined);
  assert.equal(beat('well').stageCue, undefined);
});

test('only stationary rehearsal blocks; gameplay captions carry presentation timing separately', () => {
  const duelIndex = TUTORIAL_BEATS.findIndex(item => item.segment === 'real-duel');
  const stamina = TUTORIAL_SEGMENTS.find(item => item.id === 'stamina');
  const reactive = [...stamina.beats, ...TUTORIAL_BEATS.slice(duelIndex), ...Object.values(TUTORIAL_BRANCHES).flat()]
    .filter(item => item.kind === 'dialogue');
  for (const item of reactive) {
    assert.equal(item.presentation, 'reactive', item.id);
    assert.ok(item.rehearsalSec >= 1.5 && item.rehearsalSec <= 6, item.id);
    assert.equal(item.advanceOn, 'continue', item.id);
  }
  assert.equal(beat('greeting').presentation, 'blocking');
  assert.equal(beat('say-hello').presentation, 'blocking');
  assert.equal(beat('greeting').rehearsalSec, undefined);
  assert.equal(beat('well').rehearsalSec, 1.5);
  assert.equal(beat('true-master').rehearsalSec, 6);
  assert.equal(beat('title-first').kind, 'stage');
  assert.equal(beat('title-final').kind, 'stage');
  assert.equal(beat('title-first').recordingKey, null);
});

test('optional exchanges stay outside progression, are attached to segments, and play once', () => {
  assert.deepEqual(Object.keys(TUTORIAL_BRANCHES), ['frolic', 'rival-constitution', 'first-fireball-miss', 'scratch', 'mutual-clash', 'bridge-fall', 'bridge-growth', 'permission-to-stop', 'burned', 'final-loss-1', 'final-loss-2', 'final-feelings']);
  const plan = tutorialRecordingPlan();
  for (const [id, branch] of Object.entries(TUTORIAL_BRANCHES)) {
    const metadata = TUTORIAL_BRANCH_METADATA[id];
    assert.equal(metadata.oncePerRun, true);
    assert.equal(metadata.blocking, false);
    assert.equal(metadata.required, false);
    assert.ok(TUTORIAL_SEGMENTS.find(item => item.id === metadata.segment).branches.includes(id));
    for (const item of branch) {
      assert.equal(TUTORIAL_BEATS.some(main => main.id === item.id), false);
      assert.ok(plan.some(take => take.key === item.recordingKey));
    }
  }
  assert.equal(TUTORIAL_BRANCHES.burned[0].line, 'AHH, AH AH- Oh it has subsided.');
  assert.equal(TUTORIAL_BRANCHES['first-fireball-miss'][1].line, 'And I wanted a scorch mark, over there.');
});

test('segments can be removed, inserted, reordered and enabled without changing stable keys', () => {
  const withoutLook = tutorialRouteBeats(TUTORIAL_SEGMENTS, { omitSegments: ['meaningful-look'] });
  assert.equal(withoutLook.some(item => item.id === 'look-prompt'), false);
  assert.equal(withoutLook.find(item => item.id === 'greeting').recordingKey, 'tutorial.greeting');
  assert.equal(withoutLook.find(item => item.id === 'introduce-yourself').recordingKey, 'tutorial.introduce-yourself');
  const optional = { id: 'optional-test', required: false, beats: [{ id: 'optional-beat' }] };
  assert.equal(tutorialRouteBeats([optional, TUTORIAL_SEGMENTS[0]])[0].id, 'optional-beat');
  assert.equal(tutorialRouteBeats([optional, TUTORIAL_SEGMENTS[0]], { includeOptional: false })[0].id, 'greeting');
  assert.equal(tutorialRouteBeats([optional], { includeOptional: true })[0].id, 'optional-beat');
  assert.equal(tutorialRouteBeats([{ ...optional, enabled: false }, TUTORIAL_SEGMENTS[0]])[0].id, 'greeting');
  const reversed = tutorialRouteBeats([TUTORIAL_SEGMENTS[1], TUTORIAL_SEGMENTS[0]]);
  assert.equal(reversed[0].id, 'look-prompt');
  assert.equal(reversed.at(-1).id, 'truly-look-around');
});

test('complaint, pride and pursuit banter preserve the exact new authored arc', () => {
  const exact = {
    'legend-ends': 'This is not where your legend ends, Spellblade. Knights are not made to be made fun of.',
    'knight-help': 'A real knight never asks for help!',
    'final-hello': 'Hello!',
    'too-late-hello': 'It is too late for that!',
    'reconsider-meeting': 'Then allow me to reconsider ever meeting you!',
    'sword-remains': 'The sword remains mightier than the pen...',
    'remain-mightier': '...and I remain mightier than anything that is not me!',
    'lot-of-things': 'That is a lot of things.',
  };
  for (const [id, text] of Object.entries(exact)) {
    assert.equal(beat(id).line, text);
    assert.equal(beat(id).presentation, 'reactive');
    assert.equal(beat(id).recordingKey, `tutorial.${id}`);
  }
  assert.equal(beat('complaint-arrival').advanceOn, 'complaint-approached');
  assert.equal(beat('pride-turn').stageCue, 'rival-pride');
  assert.equal(beat('pride-turn').advanceOn, 'rival-turned');
  assert.equal(TUTORIAL_BEATS[TUTORIAL_BEATS.indexOf(beat('pride-turn')) - 1].id, 'knight-help');
  assert.equal(beat('final-guard-prompt'), undefined);
  // the final duel: his first Parry, his held Guard, then the fight to the end, each line in its place
  assert.deepEqual(TUTORIAL_SEGMENTS.find(segment => segment.id === 'rival-defeat').beats.map(item => item.id),
    ['final-opening', 'stop-you', 'convince-unblock', 'final-guard', 'did-not-stop', 'defeat-rival']);
  assert.equal(beat('did-not-stop').recordingKey, 'tutorial.did-not-stop');
  assert.equal(beat('defeat-rival').advanceOn, 'rival-defeated');
  assert.equal(beat('defeat-rival').stageCue, 'rival-final-fight');
  assert.equal(TUTORIAL_BRANCH_METADATA['final-loss-1'].triggerCue, 'player-defeated-final');
  assert.equal(TUTORIAL_BRANCHES['final-loss-1'][0].recordingKey, 'tutorial.fight-yourself');
  assert.equal(TUTORIAL_BRANCHES['final-loss-2'][0].recordingKey, 'tutorial.already-told');
  assert.equal(TUTORIAL_BRANCHES['final-feelings'][0].recordingKey, 'tutorial.feelings-health');
});

test('scene actions and checkpoint destinations are explicit data separate from spoken sentences', () => {
  const allowedCheckpoints = new Set(['opening', 'introductions', 'duel', 'pursuit', 'jump', 'fireball', 'bridge', 'counterfire', 'final']);
  for (const segment of TUTORIAL_SEGMENTS) {
    assert.equal(segment.enabled, true);
    assert.ok(allowedCheckpoints.has(segment.scene.checkpoint), segment.id);
    assert.ok(Array.isArray(segment.scene.gates), segment.id);
    assert.ok(Object.isFrozen(segment.scene), segment.id);
  }
  const scene = id => TUTORIAL_SEGMENTS.find(segment => segment.id === id).scene;
  assert.equal(scene('real-duel').enter, 'rival-idle');
  assert.equal(scene('rival-escape').enter, 'rival-escape');
  assert.equal(scene('health-regen').enter, 'rival-give-space');
  assert.equal(scene('pursuit-banter').enter, 'rival-escape');
  assert.equal(scene('rival-defeat').enter, 'rival-final-opening');
  assert.equal(scene('escape-head-start').enter, 'rival-depart');
  assert.equal(scene('false-exit').enter, 'rival-hold-afar');
  assert.deepEqual(scene('complaint-approach').gates[0], {
    cue: 'complaint-approached', kind: 'near-entrance', actor: 'rival', distance: 100,
  });
  assert.ok(TUTORIAL_BEATS.filter(item => item.kind === 'dialogue').every(item => !item.stageCue));
  const onset = TUTORIAL_BEATS.indexOf(beat('duel-onset'));
  assert.equal(TUTORIAL_BEATS[onset + 1].id, 'plans-change');
  assert.equal(beat('duel-onset').advanceOn, 'rival-attack-started');
  assert.equal(beat('counterfire-response').stageCue, 'rival-counterfire');
  assert.equal(beat('counterfire-response').advanceOn, 'rival-counterfire-started');
  assert.deepEqual(TUTORIAL_SEGMENTS.find(segment => segment.id === 'stamina').captionRehearsal, { scale: 0.55, minSec: 1 });
});

test('compiled scene routes recompute links and can remove the optional pursuit exchange without removing combat', () => {
  const reduced = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['pursuit-banter'] });
  const pride = reduced.find(segment => segment.id === 'pride-stop');
  assert.equal(pride.next, 'duel-terms');
  assert.equal(reduced.find(segment => segment.id === 'duel-terms').next, 'rival-defeat');
  assert.equal(reduced.some(segment => segment.id === 'pursuit-banter'), false);
  assert.equal(reduced.find(segment => segment.id === 'rival-defeat').scene.enter, 'rival-final-opening');
  const beats = tutorialRouteBeats(reduced);
  assert.equal(beats.some(item => item.id === 'final-hello'), false);
  assert.equal(beats.some(item => item.id === 'final-guard-prompt'), false);
  assert.ok(beats.some(item => item.id === 'defeat-rival'));
  const original = TUTORIAL_SEGMENTS.find(segment => segment.id === 'pride-stop');
  assert.equal(original.next, 'duel-terms');
  const reversed = tutorialRouteSegments([TUTORIAL_SEGMENTS[1], TUTORIAL_SEGMENTS[0]]);
  assert.equal(reversed[0].next, 'greener-introduction');
  assert.equal(reversed[1].next, null);
});

test('removing a provider removes only explicitly dependent scenes and preserves unrelated later gameplay', () => {
  const withoutGuard = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['first-guard'] });
  const ids = withoutGuard.map(segment => segment.id);
  assert.equal(ids.includes('first-guard'), false);
  assert.equal(ids.includes('health-regen'), false);
  for (const id of ['first-attack', 'real-duel', 'fireball', 'bridge-dash', 'counterfire', 'rival-defeat', 'title-ending']) {
    assert.ok(ids.includes(id), id);
  }
  const disabledGuard = tutorialRouteSegments(TUTORIAL_SEGMENTS.map(segment =>
    segment.id === 'first-guard' ? { ...segment, enabled: false } : segment));
  assert.equal(disabledGuard.some(segment => segment.id === 'health-regen'), false);
  const withoutAttack = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['first-attack'] });
  assert.ok(withoutAttack.some(segment => segment.id === 'first-guard'));
  const withoutFireball = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['fireball'] });
  assert.ok(withoutFireball.some(segment => segment.id === 'counterfire'));
  const withoutBanter = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['pursuit-banter'] });
  assert.ok(withoutBanter.some(segment => segment.id === 'rival-defeat'));
  assert.ok(withoutBanter.some(segment => segment.id === 'title-ending'));
});

test('raw inserted scenes normalize authored beats and inherit the active permissions', () => {
  const fireball = TUTORIAL_SEGMENTS.find(segment => segment.id === 'fireball');
  const bridge = TUTORIAL_SEGMENTS.find(segment => segment.id === 'bridge-dash');
  const inserted = {
    id: 'added-exchange', chapter: 'fireball', presentation: 'reactive',
    beats: [{ id: 'new-id', speaker: 'narrator', line: 'A caption for the compiler test.' }],
  };
  const route = tutorialRouteSegments([fireball, inserted, bridge]);
  const segment = route[1];
  const caption = segment.beats[0];
  assert.equal(caption.kind, 'dialogue');
  assert.equal(caption.chapter, 'fireball');
  assert.equal(caption.segment, 'added-exchange');
  assert.equal(caption.presentation, 'reactive');
  assert.equal(caption.advanceOn, 'continue');
  assert.equal(caption.recordingKey, 'tutorial.new-id');
  assert.ok(caption.rehearsalSec >= 1.5);
  assert.deepEqual(segment.permissions, fireball.permissions);
  assert.equal(segment.enabled, true);
  assert.deepEqual(segment.scene, {});
  assert.deepEqual(segment.branches, []);
  assert.equal(route[0].next, 'added-exchange');
  assert.equal(segment.next, 'bridge-dash');
  assert.equal(route[2].next, null);
  assert.ok(Object.isFrozen(segment));
  assert.ok(Object.isFrozen(segment.permissions));
  assert.ok(Object.isFrozen(caption));
  assert.equal(inserted.beats[0].segment, undefined);
  assert.equal(inserted.permissions, undefined);
  assert.equal(fireball.next, 'tattle-reveal');
});

test('normalization preserves explicit stable keys and inherits from selected scenes only', () => {
  const duel = TUTORIAL_SEGMENTS.find(segment => segment.id === 'real-duel');
  const disabled = { ...TUTORIAL_SEGMENTS.find(segment => segment.id === 'fireball'), enabled: false };
  const inserted = {
    id: 'added-followup', beats: [{ id: 'moved-greeting', speaker: 'narrator', line: 'A test line.', recordingKey: 'tutorial.greeting' }],
  };
  const route = tutorialRouteSegments([duel, disabled, inserted]);
  assert.equal(route[1].id, 'added-followup');
  assert.deepEqual(route[1].permissions, duel.permissions);
  assert.equal(route[1].chapter, 'duel');
  assert.equal(route[1].beats[0].chapter, 'duel');
  assert.equal(route[1].beats[0].presentation, 'reactive');
  assert.equal(route[1].beats[0].recordingKey, 'tutorial.greeting');
  assert.equal(duel.beats[0].recordingKey, 'tutorial.well');
  assert.equal(inserted.beats[0].chapter, undefined);
  const reordered = tutorialRouteSegments([inserted, duel]);
  assert.equal(reordered[0].next, 'real-duel');
  assert.equal(reordered[1].next, null);
  assert.deepEqual(reordered[0].permissions, []);
  assert.equal(reordered[0].beats[0].recordingKey, 'tutorial.greeting');
});
