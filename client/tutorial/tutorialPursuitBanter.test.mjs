import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TUTORIAL_BEATS, TUTORIAL_BRANCHES, TUTORIAL_SEGMENTS, tutorialRouteSegments } from './tutorialScript.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

const lines = ['final-hello', 'too-late-hello', 'reconsider-meeting', 'sword-remains', 'remain-mightier', 'lot-of-things'];
const segment = () => TUTORIAL_SEGMENTS.find(s => s.id === 'pursuit-banter');

test('stable greeting takes belong to optional moving pursuit, with a spatial entry and a quiet exit', () => {
  const s = segment();
  assert.ok(s);
  assert.equal(s.chapter, 'pursuit');
  assert.equal(s.required, false);
  assert.equal(s.presentation, 'reactive');
  assert.equal(s.scene.enter, 'rival-escape');
  assert.deepEqual(s.beats.filter(b => b.kind === 'dialogue').map(b => b.id), lines);
  assert.ok(s.beats.filter(b => b.kind === 'dialogue').every(b => b.recordingKey === `tutorial.${b.id}`));
  assert.equal(TUTORIAL_SEGMENTS.find(s => s.id === 'jump-obstacle').next, s.id);
  assert.equal(s.next, 'fireball');
  assert.equal(TUTORIAL_SEGMENTS.find(s => s.id === 'duel-terms').next, 'rival-defeat');
  assert.equal(s.beats[0].advanceOn, 'pursuit-banter-reached');
  assert.ok(GREENER_ROUTE.landmarks['pursuit-banter'].z < GREENER_ROUTE.jump.waitPoint.z - 80);
  assert.ok(s.beats.at(-1).advanceAfterSec >= 2);
  assert.deepEqual(s.branches, []);
  const reduced = tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: [s.id] });
  assert.equal(reduced.find(s => s.id === 'jump-obstacle').next, 'fireball');
  assert.ok(reduced.some(s => s.id === 'rival-defeat'));
});

test('creator corrections retain semantic recording keys and the approved small-gaps replacement', () => {
  for (const [id, line] of [
    ['truly-look-around', 'With your eyes.'],
    ['remains-ahead', 'My reputation will become dead if he remains ahead!'],
  ]) {
    const b = TUTORIAL_BEATS.find(b => b.id === id);
    assert.equal(b.line, line); assert.equal(b.recordingKey, `tutorial.${id}`);
  }
  // (asked at the first duel's knockdown now: a main line of the duel's)
  const condition = TUTORIAL_BEATS.find(b => b.id === 'what-condition');
  assert.equal(condition.segment, 'duel-constitution');
  assert.equal(condition.line, 'Perhaps his armor is better tailored than yours. What is his condition?');
  assert.equal(condition.recordingKey, 'tutorial.what-condition');
  const bridge = TUTORIAL_BEATS.find(b => b.id === 'surpass-obstacle');
  assert.equal(bridge.line, 'Small gaps have never stopped anybody important.');
  assert.equal(bridge.recordingKey, 'tutorial.small-gaps');
});

test('genuine movement reaches the banter and both knights keep travelling throughout its captions', () => {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  session.stage('pursuit-banter'); session.director.resumeAt('pursuit-banter-arrival');
  const rival = host.room.players.get(session.rivalId), seen = new Set();
  const starts = { player: host.player.position.z, rival: rival.position.z };
  assert.equal(session.director.current.id, 'pursuit-banter-arrival');
  for (let i = 0; i < 30 * 45 && session.director.current.segment === 'pursuit-banter'; i++) {
    const p = host.player, r = rival;
    const dx = r.position.x-p.position.x, dz = r.position.z-p.position.z;
    host.input({ forward: 1, right: 0, yaw: Math.atan2(-dx, -dz), pitch: 0, sprint: true });
    now += 1/30; host.tick();
    assert.equal(session.rival.mode, 'escape');
    assert.equal(session.allows('move', false), true);
    if (lines.includes(session.director.current.id)) seen.add(session.director.current.id);
  }
  assert.deepEqual([...seen], lines);
  assert.ok(starts.player - host.player.position.z > 80);
  assert.ok(starts.rival - rival.position.z > 80);
  assert.equal(session.director.current.segment, 'fireball');
  host.close();
});

test('quiet travel starts after the last real take completes and has no orphan timer when omitted', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('lot-of-things'); d.tick(10);
  d.beginAudio(d.cue); d.tick(30);
  assert.equal(d.current.id, 'lot-of-things');
  d.completeDialogue(d.cue); d.tick(30.36);
  assert.equal(d.current.id, 'pursuit-banter-clear');
  d.tick(30.4); d.tick(32.89);
  assert.equal(d.current.id, 'pursuit-banter-clear');
  d.tick(32.91);
  assert.equal(d.current.id, 'why-spellblade');
  const omitted = new TutorialDirector({ segments: tutorialRouteSegments(TUTORIAL_SEGMENTS, { omitSegments: ['pursuit-banter'] }) });
  omitted.start(); omitted.resumeAt('minor-tactical-regret');
  omitted.completeDialogue(omitted.cue);
  assert.equal(omitted.current.id, 'why-spellblade');
});

test('a queued constitution reaction finishes before banter and leaves each main caption its full reading time', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('pursuit-banter-arrival'); d.tick(10);
  assert.equal(d.offerBranch('rival-constitution'), true);
  d.fact('pursuit-banter-reached');
  assert.equal(d.current.id, 'final-hello');
  assert.equal(d.cue, null);
  for (let now = 10; d.optionalCue; now++) {
    d.tick(now); d.completeOptionalDialogue(d.optionalCue);
  }
  assert.equal(d.offerBranch('rival-constitution'), false);
  assert.equal(d.current.id, 'final-hello');
  const started = d.lastTickAt;
  d.tick(started + .5); assert.equal(d.current.id, 'final-hello');
  d.tick(started + d.current.rehearsalSec + .01);
  assert.equal(d.current.id, 'too-late-hello');
});
