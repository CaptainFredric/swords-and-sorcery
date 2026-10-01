import test from 'node:test';
import assert from 'node:assert/strict';
import { VORTEX_CAMERA, aimVector, chaseAim, chaseCamera, chaseLimit, chaseWanted, reticleDistance, stepChase } from './vortexCamera.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

// The Blazing Vortex seen from outside: the view goes out behind the knight only once it has committed, comes back
// as it ends, is never turned by the spinning body, and keeps out of walls and the ground.

const vortex = ULTIMATES.vortex;
const feet = { x: 0, y: 0, z: 0 };
const open = { feet, eyeHeight: 1.58, yaw: 0, pitch: 0 };

test('the view goes out only once the Vortex has committed: in the helm through the startup, and back in the helm after it', () => {
  const lit = { alive: true, ultimateState: { id: 'vortex', phase: 'startup', commitAt: 10.9, until: null } };
  assert.equal(chaseWanted(lit, 10.2), false, 'lit: still in the helm');
  assert.equal(chaseWanted(lit, 10.95), true, 'committed (the host\'s word for it may be a moment behind)');
  const spinning = { alive: true, ultimateState: { id: 'vortex', phase: 'active', commitAt: 10.9, until: 10.9 + vortex.activeSec } };
  assert.equal(chaseWanted(spinning, 12), true);
  assert.equal(chaseWanted(spinning, 10.9 + vortex.activeSec + 0.01), false, 'over');
  assert.equal(chaseWanted({ alive: true, ultimateState: null }, 12), false);
  assert.equal(chaseWanted({ alive: false, ultimateState: spinning.ultimateState }, 12), false, 'not for the fallen');
  assert.equal(chaseWanted({ alive: true, ultimateState: { id: 'sunder', phase: 'active', commitAt: 10, until: 18 } }, 12), false, 'nor for Sunder');
  // out in about a fifth of a second, back in a little slower; never a snap
  let blend = 0;
  let steps = 0;
  while (blend < 1) { const next = stepChase(blend, true, 1 / 60); assert.ok(next - blend <= (1 / 60) / VORTEX_CAMERA.inSec + 1e-9); blend = next; steps += 1; }
  assert.ok(steps / 60 >= 0.19 && steps / 60 <= 0.25, `out in ${(steps / 60).toFixed(2)} s`);
  steps = 0;
  while (blend > 0) { blend = stepChase(blend, false, 1 / 60); steps += 1; }
  assert.ok(steps / 60 >= 0.3 && steps / 60 <= 0.45, `back in ${(steps / 60).toFixed(2)} s`);
  assert.equal(stepChase(0, false, 1), 0);
});

test('in the helm it is the first-person view exactly; all the way out it sits behind and above the knight', () => {
  const helm = chaseCamera({ ...open, blend: 0 });
  assert.deepEqual(helm.position, [0, 1.58, 0]);
  assert.equal(helm.thirdPerson, false, 'the helm\'s arms are shown, the body is not');
  const out = chaseCamera({ ...open, blend: 1 });
  assert.equal(out.thirdPerson, true, 'the body is drawn, the arms are not');
  // (yaw 0 looks along -z: behind is +z)
  assert.ok(out.position[2] > 3 && out.position[2] <= 4, `${out.position[2].toFixed(2)} m behind`);
  assert.ok(out.position[1] > 1.9, 'and above the head');
  assert.ok(Math.abs(out.position[0]) < 1e-9);
  // the way out is one smooth move (no jump between frames)
  let before = helm.position;
  for (let i = 1; i <= 12; i += 1) {
    const at = chaseCamera({ ...open, blend: i / 12 }).position;
    assert.ok(Math.hypot(at[0] - before[0], at[1] - before[1], at[2] - before[2]) < 0.7);
    before = at;
  }
});

test('the view looks where the player looks and nowhere else: the spinning body never turns it', () => {
  for (const [yaw, pitch] of [[0, 0], [1.2, -0.4], [-2.5, 0.6]]) {
    const view = chaseCamera({ feet, eyeHeight: 1.58, yaw, pitch, blend: 1 });
    assert.equal(view.yaw, yaw);
    assert.equal(view.pitch, pitch);
    // (it takes no word of where the blade is at all: the same view whatever the body is doing)
    assert.equal(Object.keys({ feet, eyeHeight: 1.58, yaw, pitch, blend: 1 }).includes('angle'), false);
    // and it sits back along that same line, so the reticle's line passes over the knight's head
    const forward = aimVector(yaw, pitch);
    const over = [feet.x, feet.y + VORTEX_CAMERA.over, feet.z];
    const along = over.map((v, i) => v - view.position[i]);
    const length = Math.hypot(...along);
    assert.ok(along.every((v, i) => Math.abs(v / length - forward[i]) < 1e-9));
  }
});

test('a wall behind keeps the view in front of it, and looking up never sinks it into the ground', () => {
  // a wall 1.5 m behind the knight (at z = +1.5): the straight way back is clear only that far
  const reach = (from, to) => {
    if (to[2] <= 1.5 || from[2] >= 1.5) return 1;
    return Math.max(0, (1.5 - from[2]) / (to[2] - from[2]));
  };
  const walled = chaseCamera({ ...open, blend: 1, reach });
  assert.ok(walled.position[2] < 1.5 - 0.2, `kept in front of the wall: z ${walled.position[2].toFixed(2)}`);
  assert.ok(walled.out < VORTEX_CAMERA.distance);
  // right against it, the view stays in the helm's place rather than in the wall, and the arms come back
  const tight = chaseCamera({ ...open, blend: 1, reach: () => 0 });
  assert.ok(tight.out < 1e-6);
  assert.equal(tight.thirdPerson, false);
  // the wall gone, the view eases back out from where it was (never a jump)
  let sits = walled.out;
  let frames = 0;
  while (sits < VORTEX_CAMERA.distance - 1e-6 && frames < 600) {
    const next = chaseCamera({ ...open, blend: 1, limit: chaseLimit(sits, 1 / 60) }).out;
    assert.ok(next - sits <= VORTEX_CAMERA.outRate / 60 + 1e-9);
    sits = next;
    frames += 1;
  }
  assert.ok(frames > 5 && frames < 60, `back out over ${frames} frames`);
  // looking steeply up, the view would sink behind the knight: it stops over the ground
  const up = chaseCamera({ feet, eyeHeight: 1.58, yaw: 0, pitch: 1.2, blend: 1, groundAt: () => 0 });
  assert.ok(up.position[1] >= VORTEX_CAMERA.floor - 1e-9, `over the ground: ${up.position[1].toFixed(2)} m`);
  const free = chaseCamera({ feet, eyeHeight: 1.58, yaw: 0, pitch: 1.2, blend: 1 });
  assert.ok(free.position[1] < 0, '(it would have been under it)');
});

test('the fire goes where the reticle is: the aim sent is from the knight\'s own eyes to what the reticle is on', () => {
  const view = chaseCamera({ ...open, pitch: -0.25, blend: 1, groundAt: () => 0 });
  const forward = aimVector(0, -0.25);
  // the reticle is on the ground some way ahead
  const distance = reticleDistance(view.position, forward, { groundAt: () => 0 });
  const on = view.position.map((v, i) => v + forward[i] * distance);
  assert.ok(Math.abs(on[1]) < 0.02, 'the ground under the reticle');
  const eye = [0, 1.48, 0];
  const aim = chaseAim(view.position, forward, eye, distance);
  assert.ok(Math.abs(aim.yaw) < 1e-9, 'the same heading');
  // a line from the eyes along that aim comes down on the same spot (along the view's own pitch it would fall short)
  const eyeLine = aimVector(aim.yaw, aim.pitch);
  const down = eye[1] / -eyeLine[1];
  assert.ok(Math.abs(eye[2] + eyeLine[2] * down - on[2]) < 0.05, 'it lands where the reticle is');
  const naive = eye[1] / -forward[1];
  assert.ok(Math.abs(eye[2] + forward[2] * naive - on[2]) > 1, '(uncorrected, it would land well short)');
  // a knight under the reticle is what it is on; a wall nearer than them is
  const foe = { x: 0, y: 0, z: -8, crown: 1.8 };
  const level = chaseCamera({ ...open, blend: 1 });
  const ahead = aimVector(0, -0.06);
  const toFoe = reticleDistance(level.position, ahead, { bodies: [foe] });
  assert.ok(Math.abs(level.position[2] - toFoe * Math.cos(0.06) - foe.z) < 0.6, `the knight under it: ${toFoe.toFixed(2)} m`);
  assert.ok(reticleDistance(level.position, ahead, { bodies: [foe], reach: () => 0.05 }) < toFoe, 'the wall in front of them first');
  assert.equal(reticleDistance(level.position, aimVector(0, 0.3), {}), VORTEX_CAMERA.aimReach, 'the open sky: far off');
});

test('with the reticle on a foe close in front, the foe is seen over the knight, not hidden behind them', () => {
  // the knight at the origin looking along -z; a foe 2.6 m in front; the reticle put on the foe's chest
  const chest = [0, 1.35, -2.6];
  const pitch = Math.atan2(chest[1] - VORTEX_CAMERA.over, 2.6);
  const view = chaseCamera({ feet, eyeHeight: 1.58, yaw: 0, pitch, blend: 1 });
  // how far below the reticle a point is seen (degrees)
  const below = ([, y, z]) => (pitch - Math.atan2(y - view.position[1], view.position[2] - z)) * 180 / Math.PI;
  const myHead = below([0, 1.8, 0]);
  const foeHead = below([0, 1.8, -2.6]);
  const foeFeet = below([0, 0, -2.6]);
  assert.ok(Math.abs(below(chest)) < 0.5, 'the reticle is on them');
  assert.ok(foeHead < 0 && foeFeet > 0, 'the foe stands across the reticle');
  assert.ok(myHead >= foeFeet - 2, `the knight begins about where the foe ends: my head ${myHead.toFixed(1)} below, their feet ${foeFeet.toFixed(1)} below`);
});

test('the game shows my own body, and not the helm\'s arms, exactly while the view is outside it; and sends the reticle\'s aim', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./GameRuntime.mjs', import.meta.url), 'utf8');
  // out only for a committed Vortex (the host's word for it), eased each frame
  assert.match(source, /this\.chase = stepChase\(this\.chase \?\? 0, chaseWanted\(this\.localAuth, serverNow\), dt\);/);
  // the arms and the body are each other's opposite, by the view's own word for where it is
  assert.match(source, /outside = out\.thirdPerson;/);
  assert.match(source, /this\.weapon\.group\.visible = !outside;/);
  assert.match(source, /this\.remotePlayers\.showSelf\(this\.localAuth, \{[\s\S]{0,200}\}, serverNow, nowMs, dt, outside\);/);
  // the view is given the player's own yaw and pitch, never the blade's angle
  assert.match(source, /chaseCamera\(\{\s*feet: this\.localState\.position, eyeHeight: this\.viewHeight, yaw: this\.input\.yaw, pitch: this\.input\.pitch, blend: this\.chase,/);
  // walls and the ground are minded with the death camera's own reach
  assert.match(source, /reach: this\.#reach, groundAt, limit: chaseLimit\(this\.chaseOut, dt\)/);
  // and the host is told the aim from my own eyes to what the reticle is on
  assert.match(source, /\.\.\.\(this\.chaseAim \? \{ pitch: this\.chaseAim\.pitch \} : \{\}\)/);
  // fallen, or between matches: back in the helm at once
  assert.match(source, /#viewInHelm\(nowMs, dt\) \{[\s\S]{0,200}this\.chase = 0;/);
});
