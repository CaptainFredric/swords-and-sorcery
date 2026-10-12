import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { playTutorialCue } from './tutorialRecordings.mjs';
import { GREENER_PASTURES, GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { killPlayer } from '../../shared/sim/combat.mjs';
import { TUTORIAL_BRANCHES } from './tutorialScript.mjs';

function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += 1/30; host.tick(); } };
  return { host, session, tick, rival: () => host.room.players.get(session.rivalId) };
}

test('only actual player bridge abyss failures grow a capped local floor and restart restores the base', () => {
  const { host, session, tick } = fixture();
  session.stage('bridge-dash'); session.director.resumeAt('dash-prompt');
  assert.equal(host.room.world, GREENER_PASTURES);
  for (let failure = 1; failure <= 5; failure++) {
    host.player.position = { x: 32, y: -8.99, z: -669 };
    host.player.velocity.y = -5; host.player.grounded = false;
    tick(3);
    assert.equal(host.player.alive, true);
    assert.equal(session.bridgeFailures, Math.min(3, failure));
    assert.equal(serializeSnapshot(host.room, host.now()).tutorialBridgeFailures, Math.min(3, failure));
    const floor = host.room.world.floors.find(f => f.id === 'bridge-retry-deck');
    assert.ok(Math.abs(floor.size[2] - 1.2 * Math.min(3, failure)) < 1e-9);
    assert.equal(surfaceHeightAt(32, -675.2, 0, host.room.world), 0);
    assert.equal(surfaceHeightAt(32, -675.2, 0, GREENER_PASTURES), null);
  }
  session.retry(); assert.equal(session.bridgeFailures, 0);
  assert.equal(host.room.world, GREENER_PASTURES);
  session.restart(); assert.equal(host.room.world, GREENER_PASTURES);
  host.close();
});

test('Rival runs through the approach and only brakes for the completed pride taunt, then waits ready', () => {
  const { host, session, tick, rival } = fixture();
  session.stage('complaint-approach'); session.director.resumeAt('knight-help');
  rival().position = { x: 36, y: 0, z: -1040 }; rival().yaw = 0;
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(p => p.id === 'pride');
  host.player.position = { x: 36, y: 0, z: -1028 };
  tick(); assert.equal(session.rival.mode, 'complaint');
  assert.ok(Math.abs(Math.hypot(rival().input.forward, rival().input.right) - 1) < 1e-9);
  session.director.completeDialogue(session.director.cue);
  assert.equal(session.rival.mode, 'pride');
  tick(240);
  assert.equal(session.rival.mode, 'ready');
  assert.ok(session.director.facts.has('rival-turned'));
  assert.equal(rival().guarding, true);
  assert.ok(rival().position.z <= -1069 && rival().position.z > GREENER_ROUTE.entrance.z);
  const at = { ...rival().position }; tick(30);
  assert.ok(Math.hypot(rival().position.x-at.x, rival().position.z-at.z) < .1);
  assert.equal(rival().attackActive, false);
  host.close();
});

test('recorded reactive takes own duration and scoped pauses run after real completion', () => {
  const d = new TutorialDirector({ beats: [
    { id: 'first', kind: 'dialogue', recordingKey: 'tutorial.first', line: 'First.', presentation: 'reactive', advanceOn: 'continue', rehearsalSec: 1, pauseAfterSec: .15 },
    { id: 'second', kind: 'dialogue', line: 'Second.', presentation: 'reactive', advanceOn: 'continue', rehearsalSec: 1 },
  ] });
  d.start(); d.tick(10);
  let ended;
  playTutorialCue({ cue: d.cue, director: d, buffer: { duration: 9 }, engine: { running: true,
    playBuffer() { return { source: { addEventListener(type, fn) { ended = fn; } }, stop() {} }; } } });
  d.tick(18); assert.equal(d.current.id, 'first');
  ended(); d.tick(18.1); assert.equal(d.current.id, 'first');
  d.tick(18.16); assert.equal(d.current.id, 'second');
});

test('ordinary defeat, a fall elsewhere and Rival falling never extend the bridge', () => {
  const { host, session, tick, rival } = fixture();
  session.stage('bridge-dash'); session.director.resumeAt('dash-prompt');
  host.player.position = { x: 32, y: -9, z: -669 };
  killPlayer(host.room, host.player.id, null, 'sword', host.now());
  session.events(host.room.events.splice(0)); tick();
  assert.equal(session.bridgeFailures, 0);
  host.player.position = { x: 70, y: -8.99, z: -669 }; host.player.grounded = false; host.player.velocity.y = -5;
  tick(3); assert.equal(session.bridgeFailures, 0);
  rival().position = { x: 32, y: -8.99, z: -669 }; rival().grounded = false; rival().velocity.y = -5;
  tick(3); assert.equal(session.bridgeFailures, 0);
  host.close();
});

test('later Fireball aggression offers the permission exchange once from actual legal emissions', () => {
  const { host, session, tick, rival } = fixture();
  session.stage('counterfire'); session.director.resumeAt('counterfire-pursuit');
  let casts = 0;
  for (let i = 0; i < 30 * 24 && !session.director.branchesSeen.has('permission-to-stop'); i++) {
    const p = host.player, r = rival();
    const dx = r.position.x-p.position.x, dz = r.position.z-p.position.z;
    const length = Math.hypot(dx,dz), yaw = Math.atan2(-dx,-dz);
    host.input({ forward: length > 15 ? 1 : 0, right: .3, yaw, pitch: 0, sprint: length > 20 });
    if (host.now() >= p.spellReadyAt && !p.pendingSpell) { host.cast({ x: dx/length, y: 0, z: dz/length }); casts++; }
    tick();
  }
  assert.ok(casts >= 3);
  assert.ok(session.director.branchesSeen.has('permission-to-stop'));
  assert.equal(session.director.offerBranch('permission-to-stop'), false);
  session.retry(); assert.equal(session.director.offerBranch('permission-to-stop'), false);
  session.restart(); assert.equal(session.director.branchesSeen.has('permission-to-stop'), false);
  host.close();
});

test('both optional rapid replies delay from actual completion and stale recorded tokens stay harmless', () => {
  for (const [branch, before, after, pause] of [
    ['rival-constitution', 'not-strange', 'not-fallen', .15], ['permission-to-stop', 'permission-no', 'then-no', .08],
  ]) {
    const d = new TutorialDirector({ beats: [{ id:'gate',kind:'stage',advanceOn:'done' }], branches: { reply: TUTORIAL_BRANCHES[branch] } });
    d.start(); d.offerBranch('reply'); d.tick(10);
    while (d.optionalCue.id !== before) d.completeOptionalDialogue(d.optionalCue);
    const cue = d.optionalCue; d.beginAudio(cue); d.tick(25);
    assert.equal(d.optionalCue.id, before);
    d.completeOptionalDialogue(cue); d.tick(25 + pause - .01);
    assert.equal(d.optionalCue.id, before);
    d.tick(25 + pause + .01); assert.equal(d.optionalCue.id, after);
    d.start(); assert.equal(d.completeOptionalDialogue(cue), false);
  }
});
