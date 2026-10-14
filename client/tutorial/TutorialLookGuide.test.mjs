import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TURN_RATE, TutorialLookGuide } from './TutorialLookGuide.mjs';
import { TUTORIAL_BEATS } from './tutorialScript.mjs';

// a director whose current line is `beat`; the Spellblade at the origin looking toward -z (yaw 0), Rival 20 m off to
// his right (+x) and running on, away along -z
function rig(beat, { rival = { x: 20, z: 0 }, velocity = { x: 0, z: -6 } } = {}) {
  const director = { state: 'running', runId: 1, current: beat };
  const input = { enabled: true, yaw: 0, pitch: -.3 };
  const guide = new TutorialLookGuide({
    session: () => ({ director }),
    rival: () => ({ alive: true, position: { ...rival, y: 0 }, velocity: { ...velocity, y: 0 } }),
    player: () => ({ position: { x: 0, y: 0, z: 0 } }),
  });
  return { director, input, guide };
}
const goalYaw = (target) => Math.atan2(-target.x, -target.z);

test('"Oh dear..." turns the Spellblade\'s head slowly after Rival as he runs off, holds it there a moment, and lets go', () => {
  const beat = TUTORIAL_BEATS.find(b => b.id === 'hardly-wellbeing');
  assert.ok(beat.lookGuide, 'the line asks for it');
  const { input, guide } = rig(beat);
  const goal = goalYaw({ x: 20, z: -6 * beat.lookGuide.leadSec });
  const yaws = [];
  for (let i = 0; i < 60 * 5; i += 1) { guide.step(1 / 60, input); yaws.push(input.yaw); }
  // slowly: no faster than a slow head turn, and it does come round
  const steps = yaws.slice(1).map((y, i) => Math.abs(y - yaws[i]) * 60);
  assert.ok(MAX_TURN_RATE <= 1.25 && Math.max(...steps) <= MAX_TURN_RATE + 1e-9, `a slow turn (${Math.max(...steps).toFixed(2)} rad/s)`);
  const arrived = yaws.findIndex(y => Math.abs(y - goal) < .06);
  assert.ok(arrived > 45 && arrived < 60 * 3, `round in about the turn's time (${(arrived / 60).toFixed(2)} s)`);
  assert.ok(Math.abs(input.pitch) < .05, 'and level');
  assert.equal(guide.guide.phase, 'done', 'held a moment, then let go');
  // let go: the view is the player's again (nothing more is done to it)
  const before = input.yaw; guide.step(1 / 60, input); assert.equal(input.yaw, before);
});

test('the player\'s own look always wins: one turn of theirs and the guide lets go for the rest of the line', () => {
  const beat = TUTORIAL_BEATS.find(b => b.id === 'hardly-wellbeing');
  const { input, guide } = rig(beat);
  for (let i = 0; i < 10; i += 1) guide.step(1 / 60, input);
  input.yaw -= .2;   // the mouse, the other way
  const theirs = input.yaw;
  for (let i = 0; i < 60; i += 1) guide.step(1 / 60, input);
  assert.equal(input.yaw, theirs);
  assert.equal(guide.guide.phase, 'done');
});

test('no other line turns the view, and a disabled look (not in the arena) is never turned', () => {
  const { input, guide } = rig(TUTORIAL_BEATS.find(b => b.id === 'remains-ahead'));
  for (let i = 0; i < 60; i += 1) guide.step(1 / 60, input);
  assert.equal(input.yaw, 0);
  const off = rig(TUTORIAL_BEATS.find(b => b.id === 'hardly-wellbeing'));
  off.input.enabled = false;
  for (let i = 0; i < 60; i += 1) off.guide.step(1 / 60, off.input);
  assert.equal(off.input.yaw, 0);
});
