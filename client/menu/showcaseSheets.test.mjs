import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMORY_SHOWCASES, CHIVALRY_SHOTS, PALM_CYCLE, SHOWCASE_TIMING, armoryShowcaseSeconds, framingAt, hasShowcase, showcaseShot, vortexTurn } from './showcaseSheets.mjs';
import { armoryPose, ARMORY_PREVIEW_SEC } from './armoryPreview.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';

// The Armory's ultimates are performed from written sheets (showcaseSheets.mjs). What can be checked here is that
// each is the real thing at the real pace, that each moment happens to whom it should, and that each ends where it
// began. How it looks and sounds is for the eye and the ear, in the Armory.

const cuesOf = (id, type) => ARMORY_SHOWCASES[id].cues.filter((cue) => cue.type === type);
const wrapped = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

test('the three ultimates are performed; the spells keep their short gestures', () => {
  assert.deepEqual(Object.keys(ARMORY_SHOWCASES), ['sunder', 'vortex', 'chivalry']);
  for (const id of ['fireball', 'frostfire', 'gale', 'steel']) {
    assert.equal(hasShowcase(id), false);
    assert.equal(armoryShowcaseSeconds(id, ARMORY_PREVIEW_SEC), ARMORY_PREVIEW_SEC);
  }
  for (const id of Object.keys(ARMORY_SHOWCASES)) assert.equal(armoryShowcaseSeconds(id, ARMORY_PREVIEW_SEC), ARMORY_SHOWCASES[id].duration);
  // compact: a few seconds each, Spells & Chivalry (six beats) the longest
  assert.ok(ARMORY_SHOWCASES.sunder.duration < 4 && ARMORY_SHOWCASES.vortex.duration < 4);
  assert.ok(ARMORY_SHOWCASES.chivalry.duration > 9 && ARMORY_SHOWCASES.chivalry.duration < 12);
});

test('every showcase is heard from its first moment and ends where it began: facing front, on his feet, nothing lit', () => {
  for (const [id, sheet] of Object.entries(ARMORY_SHOWCASES)) {
    assert.ok(sheet.cues.some((cue) => cue.at <= 0.1), `${id} heard at once`);
    for (let i = 1; i < sheet.cues.length; i += 1) assert.ok(sheet.cues[i].at >= sheet.cues[i - 1].at, `${id} cues in order`);
    const end = sheet.hero(sheet.duration - 1e-3);
    assert.ok(Math.abs(wrapped(end.turn)) < 0.02, `${id} facing front (${end.turn})`);
    assert.ok(end.lift < 1e-6 && end.crouch < 0.01, `${id} standing`);
    assert.equal(end.plan.clip, 'Idle', `${id} at rest`);
    assert.ok(!end.sunder && !end.vortex?.lit && !(end.steel?.strength > 0.01) && !(end.palm?.amount > 0.01), `${id} nothing left lit`);
    assert.equal(sheet.framing.weight.at(-1)[1], 0, `${id} the camera back on the Armory's own shot`);
  }
});

test('Sunder: the brace and the bell at the game\'s own moments, then the blade driven down into the ground as it splits', () => {
  const sheet = ARMORY_SHOWCASES.sunder;
  const { SLAM_RAISED, SLAM_GROUND } = SHOWCASE_TIMING;
  assert.equal(cuesOf('sunder', 'brace')[0].at, 0);
  assert.equal(cuesOf('sunder', 'bell')[0].at, ULTIMATES.sunder.startupSec);
  const slam = cuesOf('sunder', 'slam')[0].at;
  // the heavy strike's own swing: raised overhead through the brace, held at the top, then down to the ground as the
  // ground is struck
  assert.equal(sheet.hero(ULTIMATES.sunder.startupSec).plan.clip, 'Slash_3');
  assert.ok(Math.abs(sheet.hero(ULTIMATES.sunder.startupSec).plan.time - SLAM_RAISED) < 1e-6);
  const drive = cuesOf('sunder', 'swing')[0].at;
  assert.ok(Math.abs(sheet.hero(drive - 0.01).plan.time - SLAM_RAISED) < 1e-6, 'held high until it is driven down');
  assert.ok(Math.abs(sheet.hero(slam).plan.time - SLAM_GROUND) < 1e-6, 'in the ground at the blow');
  // and quick: the drive down takes no longer than the game's own slam after its brace
  assert.ok(slam - drive <= ULTIMATES.sunder.firstSlamLead + 0.05);
  // the weight goes into it, and the heat is in the blade from the bell until after the blow
  assert.ok(sheet.hero(slam + 0.08).crouch > sheet.hero(slam - 0.1).crouch + 0.1);
  assert.ok(!sheet.hero(0.3).sunder && sheet.hero(ULTIMATES.sunder.startupSec + 0.01).sunder && sheet.hero(slam + 0.5).sunder);
  // side on to the camera (turned well round to his left) as it comes down
  assert.ok(sheet.hero(slam).turn > 1.3);
});

test('the Vortex: lit as the game lights one, spun at its pace, its fire thrown off into the background on completed turns', () => {
  const sheet = ARMORY_SHOWCASES.vortex;
  const vortex = ULTIMATES.vortex;
  assert.equal(cuesOf('vortex', 'catch')[0].at, vortex.startupSec);
  // the hop, as high as a knight's (its speed against gravity)
  let peak = 0;
  for (let t = 0; t < vortex.startupSec; t += 0.01) peak = Math.max(peak, sheet.hero(t).lift);
  assert.ok(Math.abs(peak - vortex.hop ** 2 / (2 * MOVEMENT.gravity)) < 0.02, `hop ${peak}`);
  // a whole turn gathered through the startup, then the spin at the balanced pace
  assert.ok(Math.abs(vortexTurn(vortex.startupSec) - 2 * Math.PI) < 1e-6);
  const rate = (vortexTurn(vortex.startupSec + 0.6) - vortexTurn(vortex.startupSec + 0.2)) / 0.4;
  assert.ok(Math.abs(rate - 2 * Math.PI * vortex.balanced.revPerSec) < 1e-6);
  // a couple of turns and more at full pace, then winding down to face the front as it stops
  const stop = sheet.beats.stop;
  assert.ok((vortexTurn(sheet.beats.slow) - vortexTurn(vortex.startupSec)) / (2 * Math.PI) >= 2.5);
  assert.ok(Math.abs(wrapped(vortexTurn(stop))) < 1e-6);
  // the blade lit and spinning while it goes round; the body plan the game's own (the blade held out level)
  assert.ok(sheet.hero(vortex.startupSec + 0.3).vortex.spinning);
  assert.equal(sheet.hero(vortex.startupSec + 0.3).plan.clip, 'Slash_1');
  // its fire leaves on completed turns, now and then (not every turn), each into the background behind him, each
  // somewhere else
  const launches = cuesOf('vortex', 'launch');
  assert.ok(launches.length >= 2 && launches.length < 5);
  for (const launch of launches) {
    const turns = vortexTurn(launch.at) / (2 * Math.PI);
    assert.ok(Math.abs(turns - Math.round(turns)) < 0.01, `on a completed turn (${turns})`);
    assert.ok(launch.to[2] > 8 && launch.to[1] > 1, 'off behind him, over the town');
    assert.equal(launch.spell, vortex.balanced.fire);
  }
  assert.equal(new Set(launches.map((launch) => Math.sign(launch.to[0]) + launch.to.join())).size, launches.length);
  // one rush of the blade a turn
  assert.equal(cuesOf('vortex', 'whoosh').length, 4);
});

test('Spells & Chivalry: Steel on the fist\'s contact, the guard held while his own cuts land, the blow on him only a clash', () => {
  const sheet = ARMORY_SHOWCASES.chivalry;
  const steel = cuesOf('chivalry', 'steel')[0].at;
  assert.ok(armoryPose('steel', steel).fist > 0.9, 'the fist closed on the chest as the plate is called');
  assert.ok(sheet.hero(steel + 0.15).steel.strength > 0.99);
  const { A_CLASH, CUTS } = SHOWCASE_TIMING;
  // the first knight's blow meets his guard: a clash, his guard flinching (no blow taken, nothing like a hurt)
  assert.equal(cuesOf('chivalry', 'clash')[0].at, A_CLASH);
  const clash = sheet.hero(A_CLASH);
  assert.ok(clash.plan.concurrent.guard);
  assert.deepEqual(clash.reactions.map((r) => r.kind), ['block']);
  assert.ok(!sheet.cues.some((cue) => ['hurt', 'damage'].includes(cue.type)));
  // ...while his own guarded cuts go on: guard and sword at once, each strike landing on that knight
  const hits = cuesOf('chivalry', 'hit');
  assert.deepEqual(hits.map((cue) => cue.at), CUTS);
  for (const at of CUTS) {
    const concurrent = sheet.hero(at).plan.concurrent;
    assert.ok(concurrent.guard && concurrent.attack, `guard and cut at ${at}`);
  }
  assert.ok(sheet.hero(CUTS[0]).plan.layers.sword.clip.startsWith('GuardCut_'));
  assert.ok(hits.every((cue) => cue.rival === 0) && hits[1].heavy && !hits[0].heavy);
  // the second blow throws him down, away from the Spellblade
  const [first] = sheet.rivals;
  const before = first(CUTS[1] - 0.01);
  const after = first(CUTS[1] + 0.6);
  assert.equal(after.plan.clip, 'Death');
  assert.ok(Math.hypot(after.x, after.z) > Math.hypot(before.x, before.z) + 1);
});

test('Spells & Chivalry: the second knight blown away by a Gale cast from under the guard; the spells go past the camera', () => {
  const sheet = ARMORY_SHOWCASES.chivalry;
  const { GALE_RELEASE, B_HIT } = SHOWCASE_TIMING;
  const second = sheet.rivals[1];
  // the two come from either side of him
  assert.ok(Math.sign(sheet.rivals[0](2.2).x) !== Math.sign(second(4.2).x));
  const gale = cuesOf('chivalry', 'gale')[0];
  assert.equal(gale.at, GALE_RELEASE);
  assert.equal(gale.rival, 1);
  const casting = sheet.hero(GALE_RELEASE - 0.1).plan.concurrent;
  assert.ok(casting.cast && casting.guard, 'cast from under the guard');
  const stood = second(B_HIT - 0.01);
  const thrown = second(B_HIT + 0.4);
  const landed = second(B_HIT + 1.2);
  assert.ok(thrown.lift > 0.5 && thrown.tumble > 0.3, 'off his feet');
  assert.ok(Math.hypot(landed.x, landed.z) > Math.hypot(stood.x, stood.z) + 2.5, 'blown well away');
  // a Fireball and a Frostfire, each going by the camera to one side, never through it
  const casts = cuesOf('chivalry', 'cast');
  assert.deepEqual(casts.map((cue) => cue.spell), ['fireball', 'frostfire']);
  for (const cue of casts) {
    assert.ok(Math.hypot(...cue.past) >= 1.2, `${cue.spell} goes by, ${cue.past}`);
    assert.deepEqual(cue.past, CHIVALRY_SHOTS[cue.spell].past);
  }
  assert.ok(Math.sign(casts[0].past[0]) !== Math.sign(casts[1].past[0]), 'one either side');
  assert.notEqual(casts[0].past[1], casts[1].past[1], 'at different heights');
});

test('Spells & Chivalry ends in his guard, the palm turning through the prepared spells', () => {
  const sheet = ARMORY_SHOWCASES.chivalry;
  const mastery = sheet.beats.mastery;
  const seen = [];
  for (let t = mastery; t < sheet.duration; t += 0.05) {
    const pose = sheet.hero(t);
    assert.ok(pose.plan.concurrent.guard, 'in his guard');
    if (pose.palm.amount > 0.9 && seen.at(-1) !== pose.palm.spell) seen.push(pose.palm.spell);
  }
  assert.deepEqual(seen.slice(0, 3), [...PALM_CYCLE]);
  assert.deepEqual(PALM_CYCLE, ['fireball', 'frostfire', 'gale']);
  // the rivals are gone by then (out of the shot, and put away at the end)
  assert.ok(sheet.rivals.every((rival) => rival(sheet.duration).hidden));
});

test('the showcase shot keeps every point in the part of the screen clear of the panel, at any screen\'s shape', () => {
  const look = [-1.45, 5.82];
  const points = [[-1, 5.5, 0.7], [-2.4, 4.6, 0.6], [0.6, 6.4, 0.6]];
  for (const [aspect, clear] of [[4 / 3, [0.46, 0.97]], [16 / 9, [0.23, 0.97]], [2.16, [0.5, 0.97]], [0.75, [0.1, 0.97]]]) {
    const shot = showcaseShot(points, look, { aspect, clear, fov: 40 });
    const eye = shot.camera;
    const l = [shot.target[0] - eye[0], shot.target[2] - eye[2]];
    const length = Math.hypot(...l);
    const forward = [l[0] / length, l[1] / length];
    const right = [-forward[1], forward[0]];
    const spread = Math.tan((40 * Math.PI) / 360) * aspect;
    for (const [x, z, reach] of points) {
      const dx = x - eye[0];
      const dz = z - eye[2];
      const depth = dx * forward[0] + dz * forward[1];
      const across = dx * right[0] + dz * right[1];
      for (const edge of [across - reach, across + reach]) {
        const share = (edge / (depth * spread) + 1) / 2;
        assert.ok(share >= clear[0] - 0.02 && share <= clear[1] + 0.02, `aspect ${aspect.toFixed(2)}: ${share.toFixed(3)}`);
      }
    }
  }
});

test('a showcase\'s shots ease from one to the next, never cut', () => {
  const framing = ARMORY_SHOWCASES.chivalry.framing;
  let last = null;
  for (let t = 0; t < ARMORY_SHOWCASES.chivalry.duration; t += 1 / 60) {
    const now = framingAt(framing, t);
    const position = now.from + now.share;
    if (last !== null) assert.ok(position - last >= -1e-9 && position - last < 0.06, `at ${t.toFixed(2)}: ${last} -> ${position}`);
    last = position;
  }
  assert.equal(last, framing.shots.length - 1);
});
