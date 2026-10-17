import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TUTORIAL_BEATS, TUTORIAL_BRANCHES, TUTORIAL_SEGMENTS } from './tutorialScript.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

const segment = id => TUTORIAL_SEGMENTS.find(s => s.id === id);
const beat = id => TUTORIAL_BEATS.find(b => b.id === id);

function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { now += 1 / 30; host.tick(); } };
  return { host, session, tick, rival: () => host.room.players.get(session.rivalId), now: () => now };
}

test('Jump dialogue begins before rival-jumped and fast approach skips unstarted hints', () => {
  const jumpSeg = segment('jump-obstacle');
  const beatIds = jumpSeg.beats.map(b => b.id);
  const whatIndex = beatIds.indexOf('what-should-do');
  const arrivalIndex = beatIds.indexOf('jump-arrival');
  const gloatIndex = beatIds.indexOf('minor-obstacle-gloat');
  const promptIndex = beatIds.indexOf('jump-prompt');

  // Hints precede Rival arrival and gloat
  assert.ok(whatIndex < arrivalIndex, 'hint begins before rival-jumped');
  assert.ok(arrivalIndex < gloatIndex, 'rival jumps and lands before gloating');
  assert.ok(gloatIndex < promptIndex, 'gloat precedes jump prompt');

  // When ample room exists, hints are given in order
  const directorNormal = new TutorialDirector();
  directorNormal.start();
  directorNormal.resumeAt('what-should-do');
  assert.equal(directorNormal.current.id, 'what-should-do');

  // When room is constrained (fast runner nearing takeoff), unstarted hint units are cut
  const directorFast = new TutorialDirector();
  directorFast.mainRoom = () => 1.0; // insufficient for a 3s hint unit + pause
  directorFast.start();
  directorFast.resumeAt('what-should-do');
  // Both hint units (ledges, occasion) and no-hints are cut; director lands on jump-arrival
  assert.equal(directorFast.current.id, 'jump-arrival');
});

test('post-Jump banter begins without >80m landmark gate or 2.5s quiet stage timer', () => {
  const banter = segment('pursuit-banter');
  assert.equal(banter.entryCondition, 'jump-crossed');
  assert.deepEqual(banter.scene.gates, []);
  assert.equal(banter.beats[0].id, 'final-hello');
  assert.equal(banter.beats.some(b => b.id === 'pursuit-banter-clear'), false);

  const d = new TutorialDirector();
  d.start();
  d.resumeAt('minor-tactical-regret');
  d.tick(10);
  d.completeDialogue(d.cue);
  d.tick(10.4);
  // Directly enters final-hello with zero landmark wait
  assert.equal(d.current.id, 'final-hello');
  assert.equal(d.current.segment, 'pursuit-banter');
});

test('Fireball setup orders the magic reminder before almost-there and Halt', () => {
  const ids = segment('fireball').beats.map((beat) => beat.id);
  const from = ids.indexOf('impressive');
  assert.deepEqual(ids.slice(from, from + 6), [
    'impressive', 'magic-disposal', 'waiting-reminder', 'almost-there', 'halt-order', 'tell-on-me',
  ]);
});

test('Rival keeps fleeing through setup, then Halt itself owns the standoff', () => {
  const { host, session, tick, rival } = fixture();

  session.stage('fireball');
  session.rival.enter('rival-escape', host.now());
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(p => p.id === 'tattle-reveal');
  rival().position = { x: 24, y: 0, z: -385 }; // already inside the old meadow boundary
  host.player.position = { x: 24, y: 0, z: -367 };

  // Reaching the old clearing boundary no longer stops him before the words do.
  session.director.resumeAt('almost-there');
  assert.equal(session.rival.standingConfrontation, false);
  const startZ = rival().position.z;
  tick(6);
  assert.equal(session.rival.mode, 'escape');
  assert.ok(rival().position.z < startZ, 'Rival is still fleeing while saying almost-there');

  // The instant Halt becomes current, the standoff latches and persists through the reply/prompt.
  session.director.resumeAt('halt-order');
  tick(2);
  assert.equal(session.rival.standingConfrontation, true);
  assert.equal(rival().input.forward, 0, 'Halt line stops forward movement');
  assert.equal(rival().input.right, 0, 'Halt line stops lateral movement');

  for (const standoffBeat of ['tell-on-me', 'fireball-prompt']) {
    session.director.resumeAt(standoffBeat);
    tick(2);
    assert.equal(session.rival.standingConfrontation, true, `standoff remains latched during ${standoffBeat}`);
    assert.equal(rival().input.forward, 0);
    assert.equal(rival().input.right, 0);
  }
  host.close();
});
test('Scratch urgent reaction preempts an active multi-line exchange at the next clean line boundary', () => {
  const d = new TutorialDirector();
  d.start();
  d.resumeAt('fireball-prompt');
  d.tick(10);

  // Queue constitution exchange (4 lines)
  d.offerBranch('rival-constitution');
  // First line begins immediately since fireball-prompt is a prompt
  assert.equal(d.optionalCue.id, 'constitution-strange');

  // Scratch occurs while constitution-strange is active
  d.offerBranch('scratch');

  // Finish constitution-strange (single line, no rapid reply group)
  d.completeOptionalDialogue(d.optionalCue);
  d.tick(10.4);

  // Scratch taunt immediately preempts the remaining 3 lines of constitution!
  assert.equal(d.optionalCue.id, 'scratch-taunt');
});

test('Scratch preserves a genuinely inseparable rapid reply pair before inserting', () => {
  const d = new TutorialDirector();
  d.start();
  d.resumeAt('fireball-prompt');
  d.tick(10);

  // Queue constitution exchange
  d.offerBranch('rival-constitution');
  // Complete line 0 ('constitution-strange')
  d.completeOptionalDialogue(d.optionalCue);
  d.tick(10.4);

  // Line 1 ('not-strange') is now playing, which has replyGroup: 'constitution-correction'
  assert.equal(d.optionalCue.id, 'not-strange');

  // Scratch occurs during line 1 of the rapid pair
  d.offerBranch('scratch');

  // Line 1 completes
  d.completeOptionalDialogue(d.optionalCue);
  d.tick(10.55);

  // Line 2 ('not-fallen') must play to complete the rapid reply pair!
  assert.equal(d.optionalCue.id, 'not-fallen');

  // Once line 2 completes, scratch taunt takes over!
  d.completeOptionalDialogue(d.optionalCue);
  d.tick(10.9);
  assert.equal(d.optionalCue.id, 'scratch-taunt');
});

test('Fireball hit while Scratch is underway safely preempts to main reaction', () => {
  const d = new TutorialDirector();
  d.start();
  d.resumeAt('fireball-prompt');
  d.tick(10);

  // Player triggers scratch
  d.offerBranch('scratch');
  assert.equal(d.optionalCue.id, 'scratch-taunt');

  // Mid-scratch, Fireball hits Rival
  d.fact('fireball-hit');

  // Finish scratch-taunt
  d.completeOptionalDialogue(d.optionalCue);
  d.tick(10.4);

  // Optional aside is paused/exited and main fireball reaction rival-cold starts immediately
  assert.equal(d.optionalCue, null);
  assert.equal(d.cue.id, 'rival-cold');
});

test('Tattle reveal travel dialogue begins immediately post-fireball reaction with no landmark gate', () => {
  const tattle = segment('tattle-reveal');
  assert.equal(tattle.entryCondition, 'fireball-hit');
  assert.deepEqual(tattle.scene.gates, []);
  assert.equal(tattle.beats[0].id, 'matter-settled');

  const d = new TutorialDirector();
  d.start();
  d.resumeAt('concerning'); // last beat of fireball reactions
  d.tick(10);
  d.completeDialogue(d.cue);
  d.tick(10.4);

  // Directly enters tattle-reveal without any landmark delay
  assert.equal(d.current.id, 'matter-settled');
  assert.equal(d.current.segment, 'tattle-reveal');
});

test('continuous close pursuit (3.5s) triggers permission-to-stop, but fragmented pursuit resets duration', () => {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 });
  session.start();
  session.stage('counterfire');
  session.firstFireballHit = true;
  session.director.resumeAt('counterfire-pursuit');
  const rival = host.room.players.get(session.rivalId);

  // 1. Sprint closely for 60 ticks (~2.0s)
  host.input({ forward: 1, right: 0, yaw: 0, pitch: 0, sprint: true });
  for (let i = 0; i < 60; i++) {
    now += 1 / 30;
    host.player.position = { x: 0, y: 0, z: rival.position.z + 8 };
    host.tick();
  }
  assert.ok(session.closePursuitDuration >= 1.9 && session.closePursuitDuration <= 2.1);
  assert.equal(session.director.branchesSeen.has('permission-to-stop'), false);

  // 2. Break sprint for 2 ticks: duration must reset to 0
  host.input({ forward: 1, right: 0, yaw: 0, pitch: 0, sprint: false });
  for (let i = 0; i < 2; i++) {
    now += 1 / 30;
    host.player.position = { x: 0, y: 0, z: rival.position.z + 8 };
    host.tick();
  }
  assert.equal(session.closePursuitDuration, 0, 'close pursuit duration reset on sprint break');

  // 3. Sprint closely again for 60 ticks (~2.0s): non-continuous 4s total, but each chunk 2s
  host.input({ forward: 1, right: 0, yaw: 0, pitch: 0, sprint: true });
  for (let i = 0; i < 60; i++) {
    now += 1 / 30;
    host.player.position = { x: 0, y: 0, z: rival.position.z + 8 };
    host.tick();
  }
  assert.ok(session.closePursuitDuration >= 1.9 && session.closePursuitDuration <= 2.1);
  assert.equal(session.director.branchesSeen.has('permission-to-stop'), false);

  // 4. Continue sprinting closely until reaching 3.5s total continuous pursuit (another 55 ticks)
  for (let i = 0; i < 55; i++) {
    now += 1 / 30;
    host.player.position = { x: 0, y: 0, z: rival.position.z + 8 };
    host.tick();
  }
  assert.ok(session.closePursuitDuration >= 3.5);
  assert.equal(session.director.branchesSeen.has('permission-to-stop'), true, 'triggered after 3.5s continuous pursuit');

  host.close();
});

test('bridge-growth plays after first bridge retry and only once, without interference', () => {
  const { host, session, tick } = fixture();
  session.stage('bridge-dash');
  session.director.resumeAt('dash-prompt');

  // Initially bridgeFall is false, bridgeFailures is 0
  assert.equal(session.bridgeFall, false);
  assert.equal(session.bridgeFailures, 0);

  // First abyss fall into the bridge ravine
  host.player.position = { x: 32, y: -8.99, z: -669 };
  host.player.velocity.y = -5;
  host.player.grounded = false;
  tick(3);

  assert.equal(session.bridgeFailures, 1);
  assert.equal(session.director.branchesSeen.has('bridge-growth'), true);
  assert.equal(session.director.optionalCue.id, 'bridge-senses-failure');

  // Complete bridge-growth lines
  session.director.completeOptionalDialogue(session.director.optionalCue);
  tick(30);
  assert.equal(session.director.optionalCue.id, 'hence-i-crossed');
  session.director.completeOptionalDialogue(session.director.optionalCue);
  tick(30);
  assert.equal(session.director.optionalCue, null);

  // Second abyss fall: bridge-growth is NOT offered again
  host.player.position = { x: 32, y: -8.99, z: -669 };
  host.player.velocity.y = -5;
  host.player.grounded = false;
  tick(3);
  assert.equal(session.bridgeFailures, 2);
  assert.equal(session.director.optionalCue, null);

  host.close();
});
