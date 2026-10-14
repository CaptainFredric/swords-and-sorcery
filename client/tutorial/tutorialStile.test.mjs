import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { jumpCallDistance } from './tutorialScript.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { MOVEMENT, createMovementState, movePlayer } from '../../shared/src/movement.mjs';

// The orchard stile: the hints on the move, the narrator's "Jump." at the wall, the JUMP prompt in time to be used.
const wall = GREENER_ROUTE.jump.obstacleBounds;

// a Spellblade coming at the stile at `speed`, who leaves the ground `react` seconds after the call: over in one Jump?
function answered(speed, react) {
  const world = getWorld('greener-pastures'), hz = 60, dt = 1 / hz;
  const call = jumpCallDistance(speed);
  let state = createMovementState({ x: 55, y: 0, z: wall.maxZ + call + speed * react + 0.01 });
  state.sprinting = speed > MOVEMENT.runSpeed;
  const forward = Math.min(1, speed / MOVEMENT.runSpeed);
  let jumps = 0, takeoff = null;
  for (let i = 0; i < hz * 4; i += 1) {
    const due = state.position.z <= wall.maxZ + call - speed * react + 1e-6 || state.position.z - wall.maxZ < 0.5;
    const jump = due && state.grounded && state.position.z > wall.minZ && jumps === 0;
    if (jump) { jumps += 1; takeoff = state.position.z - wall.maxZ; }
    // (the sprint already built: a running start at this pace)
    if (state.sprinting) state.sprintBlend = 1;
    state = movePlayer(state, { forward, yaw: 0, jump }, dt, i * dt, world);
  }
  return { over: state.position.z < wall.minZ - 0.3, takeoff };
}

test('"Jump." is called by the Spellblade\'s pace: answered quickly or on hearing it, one Jump clears the stile', () => {
  for (const speed of [5.6, MOVEMENT.runSpeed, 11]) {
    for (const react of [0.35, 0.8]) {
      const { over, takeoff } = answered(speed, react);
      assert.ok(over, `${speed} m/s, ${react} s: one Jump from ${takeoff?.toFixed(2)} m clears it`);
    }
  }
  // and never called halfway across the field: within a second and a bit of the wall at any pace
  for (const speed of [5.6, MOVEMENT.runSpeed, 11]) assert.ok(jumpCallDistance(speed) / speed < 1.05);
});

test('the hints are had in pairs that are over before the call; "I do not get hints." only after a hint', () => {
  const play = (room) => {
    const d = new TutorialDirector(); d.start(); d.resumeAt('minor-obstacle-gloat');
    d.mainRoom = () => room;
    const heard = [];
    for (let i = 0; i < 12 && d.current?.kind === 'dialogue'; i += 1) {
      const cue = d.cue; heard.push(cue.id); d.beginAudio(cue); d.completeDialogue(cue); d.tick(10 + i);
    }
    return heard;
  };
  assert.deepEqual(play(60), ['minor-obstacle-gloat', 'what-should-do', 'minor-ledges', 'what-does-mean', 'rises-occasion', 'jump-no-hints']);
  // room for the first pair and the last word, not the long answer: the question that wants it is not asked either
  assert.deepEqual(play(6.5), ['minor-obstacle-gloat', 'what-should-do', 'minor-ledges', 'jump-no-hints']);
  // no room for the first pair: nothing but the gloat (no "I do not get hints." out of nowhere)
  assert.deepEqual(play(1), ['minor-obstacle-gloat']);
});

function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { now += 1 / 30; host.tick(); } };
  return { host, session, tick };
}

test('the JUMP prompt is up from the call until the Spellblade is over: through a failed attempt, never a belated "Jump."', () => {
  const { host, session, tick } = fixture();
  session.stage('jump-obstacle'); session.director.resumeAt('jump-arrival');
  // Rival is over and gloating: his line has the floor
  session.director.fact('rival-jumped');
  const gloat = session.director.cue;
  assert.equal(gloat.id, 'minor-obstacle-gloat');
  session.director.beginAudio(gloat);
  // the Spellblade reaches the wall's immediate approach at a run while he gloats: the prompt is up at once
  host.player.position = { x: 55, y: 0, z: wall.maxZ + jumpCallDistance(MOVEMENT.runSpeed) - 0.2 };
  host.player.velocity = { x: 0, y: 0, z: -MOVEMENT.runSpeed };
  tick();
  assert.ok(session.director.facts.has('jump-approach-ready'));
  assert.equal(session.present().standing?.line, 'JUMP');
  // he jumps before the gloat is over, and comes down short of the wall: the prompt stays; when the gloat ends, the
  // narrator does not tell him to do what he has just done
  session.director.fact('jump-used');
  session.director.completeDialogue(gloat); session.director.tick(host.now() + 1);
  assert.notEqual(session.director.current?.id, 'jump-instruction');
  assert.equal(session.present().standing?.line, 'JUMP');
  session.director.fact('jump-crossed');
  assert.equal(session.present().standing, null);
  host.close();
});

test('Jump is the Spellblade\'s the moment Rival is over the stile, even while the escape\'s last lines are being said', () => {
  const { host, session, tick } = fixture();
  session.stage('rival-escape'); session.director.resumeAt('remains-ahead');
  const line = session.director.cue; session.director.beginAudio(line);
  assert.equal(session.allows('jump', false), false);
  // he is over and landed while "My reputation will become dead if he remains ahead!" is still playing
  session.director.fact('rival-jumped');
  assert.equal(session.director.current.id, 'remains-ahead');
  assert.equal(session.allows('jump', false), true);
  // and at the wall's immediate approach the JUMP prompt is up, though that line still has the floor
  host.player.position = { x: 55, y: 0, z: wall.maxZ + 3 };
  host.player.velocity = { x: 0, y: 0, z: -MOVEMENT.runSpeed };
  tick();
  assert.equal(session.present().standing?.line, 'JUMP');
  host.close();
});
