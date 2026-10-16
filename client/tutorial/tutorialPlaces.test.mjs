import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialMovementCues } from './TutorialMovementCues.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TUTORIAL_BRANCHES } from './tutorialScript.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';

// The pursuit's places: their lines are said where they belong, whatever asides the Spellblade's Fireballs set off.
const say = (director, cue) => { director.beginAudio(cue); return cue.branch ? director.completeOptionalDialogue(cue) : director.completeDialogue(cue); };
// a take's own pause after it, then the next (the director's clock)
function speak(director, at) { const cue = director.optionalCue ?? director.cue; say(director, cue); director.tick(at + .4); return cue.id; }

test('an aside never begins inside a place\'s lines; one under way gives them the floor at its next pause, then resumes', () => {
  // (an aside of two exchanges: the constitution's, with a second exchange after it)
  const later = [
    { id: 'later-question', exchange: 'later', speaker: 'narrator', line: 'A later question.', presentation: 'reactive', rehearsalSec: 1 },
    { id: 'later-answer', exchange: 'later', speaker: 'rival', line: 'A later answer.', presentation: 'reactive', rehearsalSec: 1 },
  ].map(line => ({ ...line, branch: 'rival-constitution', kind: 'dialogue' }));
  const d = new TutorialDirector({ branches: { ...TUTORIAL_BRANCHES, 'rival-constitution': [...TUTORIAL_BRANCHES['rival-constitution'], ...later] } });
  d.start(); d.resumeAt('bridge-arrival');
  // the aside is offered while the route waits on the landmark: it begins
  d.offerBranch('rival-constitution'); d.tick(10);
  assert.equal(d.optionalCue.id, 'constitution-strange');
  // the Spellblade reaches the bridge mid-exchange: the exchange is heard to its end, not cut
  d.fact('bridge-reached');
  const heard = [];
  let t = 10;
  for (let i = 0; i < 4; i += 1) { heard.push(speak(d, t)); t += 1; }
  assert.deepEqual(heard, ['constitution-strange', 'not-strange', 'not-fallen', 'thank-noticing']);
  // then the place's lines, every one, before the rest of the aside
  assert.equal(d.optionalCue, null);
  assert.equal(d.cue.id, 'get-over-this');
  const bridgeLines = [];
  while (d.cue && d.current.kind === 'dialogue') { bridgeLines.push(speak(d, t)); t += 1; }
  assert.deepEqual(bridgeLines, ['get-over-this', 'decent-suggestion', 'get-over-it']);
  // the route waits at the dash prompt now: the aside's second exchange comes back (every recording kept)
  d.tick(t + 1);
  assert.equal(d.optionalCue?.id, 'later-question');
});

test('an aside waits for room: its next exchange must be over before the story\'s next place can come', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('bridge-arrival');
  let room = 4;
  d.optionalRoom = () => room;
  d.offerBranch('rival-constitution'); d.tick(10);
  assert.equal(d.optionalCue, null, 'four seconds is no room for a five-second exchange');
  room = 60; d.tick(11);
  assert.equal(d.optionalCue?.id, 'constitution-strange');
});

test('an aside overtaken by events is dropped where it has not begun; pursuit asides end with the pursuit', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('fireball-prompt');
  d.optionalRoom = () => 0;
  d.offerBranch('first-fireball-miss');
  assert.equal(d.branchQueue.length, 2);
  d.fact('fireball-hit');
  assert.equal(d.branchQueue.length, 0, 'a miss is no news after the hit');
  for (const id of ['rival-constitution', 'permission-to-stop', 'burned']) {
    assert.ok(TUTORIAL_BRANCHES[id].every(line => line.until === 'rival-turned'), id);
  }
});

test('"Hello? I can no longer sprint!" waits for the Spellblade really to be winded, and for silence', () => {
  const beats = [
    { id: 'clearly', chapter: 'approach', kind: 'dialogue', speaker: 'narrator', line: 'Clearly.', advanceOn: 'continue' },
    { id: 'winded-prompt', chapter: 'approach', kind: 'prompt', line: 'SPRINT UNTIL WINDED', advanceOn: 'player-winded', live: true },
    { id: 'cannot-sprint', chapter: 'approach', kind: 'dialogue', speaker: 'spellblade', line: 'Hello? I can no longer sprint!', advanceOn: 'continue' },
  ];
  const director = new TutorialDirector({ beats }); director.start();
  const cues = new TutorialMovementCues(director, { local: true, playerId: 'you', rivalId: 'rival' });
  let x = 0;
  const send = (extra) => { x -= .3; cues.snapshot({ players: [{ id: 'you', alive: true, position: { x, y: 0, z: 0 }, yaw: 0, pitch: 0, guardStamina: 100, sprinting: false, ...extra },
    { id: 'rival', alive: true, position: { x: 50, y: 0, z: 0 } }] }); };
  // winded during the line before the prompt...
  send({ sprinting: true, guardStamina: 40 }); send({ sprinting: true, guardStamina: 0 }); send({ guardStamina: 0 });
  assert.equal(director.current.id, 'clearly');
  // ...and recovered by the time it is over: the prompt stands, an earlier bout is not taken for this one
  send({ guardStamina: SPRINT.restartStamina + 5 });
  say(director, director.cue); director.tick(10);
  assert.equal(director.current.id, 'winded-prompt');
  send({ guardStamina: 60 });
  assert.equal(director.current.id, 'winded-prompt');
  // winded again, now, with nothing being said: the line
  send({ sprinting: true, guardStamina: 10 }); send({ sprinting: true, guardStamina: 0 }); send({ guardStamina: 0 });
  assert.equal(director.current.id, 'cannot-sprint');
});

function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { now += 1 / 30; host.tick(); } };
  return { host, session, tick, rival: () => host.room.players.get(session.rivalId) };
}

test('Rival does not vault the sheepfold wall while the TATTLE reveal is still being said: he says it to the Spellblade\'s face', () => {
  const { host, session, tick, rival } = fixture();
  session.stage('tattle-reveal'); session.director.resumeAt('matter-settled'); session.rival.enter('rival-escape', host.now());
  const reuse = GREENER_ROUTE.jumpReuse;
  rival().position = { x: reuse.approach.x, y: 0, z: reuse.approach.z + 12 };
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'dead-end-approach');
  host.player.position = { x: reuse.approach.x, y: 0, z: reuse.approach.z + 16 };
  for (let i = 0; i < 30 * 6; i += 1) { tick(); host.player.position = { x: reuse.approach.x, y: 0, z: reuse.approach.z + 4 }; }
  assert.ok(rival().position.z > reuse.obstacleBounds.maxZ, 'still on the near side of the wall');
  assert.equal(session.rival.deadEndCrossed, false);
  // the Spellblade's answer begins: he goes over
  session.director.resumeAt('acquired-attention'); session.rival.enter('rival-escape', host.now());
  for (let i = 0; i < 30 * 4 && !session.rival.deadEndCrossed; i += 1) tick();
  assert.equal(session.rival.deadEndCrossed, true);
  host.close();
});

test('following Rival straight over the sheepfold wall still hears his gloat; only being over first takes it from him', () => {
  const { host, session, tick, rival } = fixture();
  session.stage('dead-end'); session.director.resumeAt('dead-end-arrival'); session.rival.enter('rival-escape', host.now());
  const reuse = GREENER_ROUTE.jumpReuse;
  // he lands over the wall with the Spellblade in the air right behind him
  rival().position = { x: reuse.landing.x, y: 0, z: reuse.landing.z - 1 };
  host.player.position = { x: reuse.landing.x, y: 1, z: reuse.obstacleBounds.minZ + .1 };
  tick(2);
  assert.equal(session.director.current.id, 'your-dead-end');
  host.close();
});
