// The Spellblade's motion sidecar (tools/assets/build-spellblade-motion.mjs): what it is, that it is the file the
// blade tracks were sampled from, that the canonical model is the one it was built against, and what its clips do
// on that model (measured: scripts/lib/glbPose.mjs, glbSkin.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadGlb, localPose, overlayMotion, worldMatrices, apply } from '../../scripts/lib/glbPose.mjs';
import { skinnedHeights, skinnedMeshes } from '../../scripts/lib/glbSkin.mjs';
import { SWORD_TECHNIQUE_TRACKS, SWORD_TECHNIQUE_TRACK_SOURCE } from '../../shared/src/swordTechniqueTracks.mjs';
import { SWORD_TECHNIQUES, techniqueBlade } from '../../shared/src/swordTechniques.mjs';
import { STRIKE_CLIPS } from '../../client/game/swordChainPresentation.mjs';

const dir = new URL('../../client/assets/characters/spellblade/', import.meta.url);
const sha = (name) => createHash('sha256').update(readFileSync(new URL(name, dir))).digest('hex');
const meta = JSON.parse(readFileSync(new URL('spellblade-motion.json', dir), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const canonical = () => loadGlb(new URL('spellblade.glb', dir).pathname);
const withMotion = () => overlayMotion(canonical(), new URL('spellblade-motion.glb', dir).pathname);
const TIP = [0.131, 1.3383, -0.1661];

test('the sidecar is the file its record and the server\'s blade tracks name, built against the canonical model', () => {
  assert.equal(sha('spellblade-motion.glb'), meta.sha256);
  assert.equal(SWORD_TECHNIQUE_TRACK_SOURCE.motionSha256, meta.sha256);
  // the canonical GLB is untouched: still the promoted one
  assert.equal(sha('spellblade.glb'), manifest.thirdPerson.sha256);
  assert.equal(meta.canonicalSha256, manifest.thirdPerson.sha256);
  const motion = loadGlb(new URL('spellblade-motion.glb', dir).pathname);
  // animation only: no mesh, no skin, no image
  assert.equal(motion.gltf.meshes, undefined);
  assert.equal(motion.gltf.skins, undefined);
  assert.equal(motion.gltf.images, undefined);
  assert.deepEqual([...motion.clips.keys()], meta.clips.map((c) => c.name));
  // every bone it animates is a bone of the canonical model, with the same parent
  const model = canonical();
  for (const [i, node] of motion.gltf.nodes.entries()) {
    const k = model.byName.get(node.name);
    assert.ok(k != null, node.name);
    const parent = motion.parent[i] < 0 ? null : motion.gltf.nodes[motion.parent[i]].name;
    assert.equal(parent, model.parent[k] < 0 ? null : model.gltf.nodes[model.parent[k]].name, node.name);
  }
});

test('every technique clip the rules name is in the sidecar and has its blade track, of the same length', () => {
  const motion = loadGlb(new URL('spellblade-motion.glb', dir).pathname);
  const lengths = { enter: 'enterSec', brace: 'braceSec', thrust: 'thrustSec', recovery: 'recoverySec', parried: 'parriedSec', revolution: 'revolutionSec', lift: 'revolutionSec', exit: 'exitSec', interrupted: 'interruptedSec' };
  for (const technique of Object.values(SWORD_TECHNIQUES)) for (const [role, clip] of Object.entries(technique.clips)) {
    assert.ok(motion.clips.has(clip), clip);
    const track = SWORD_TECHNIQUE_TRACKS[clip];
    assert.ok(track?.length > 2, `${clip} track`);
    assert.ok(Math.abs(track.at(-1).time - motion.clips.get(clip).duration) < 1e-3, clip);
    if (lengths[role]) assert.ok(Math.abs(motion.clips.get(clip).duration - technique[lengths[role]]) < 0.012, `${clip} is ${motion.clips.get(clip).duration}s, the rules say ${technique[lengths[role]]}`);
  }
});

test('the blade the server sweeps is the blade the clip draws', () => {
  const model = withMotion();
  const hand = model.byName.get('hand.R');
  for (const [clip, time] of [['Technique_RigidRiposte_Interception', 0.11], ['Technique_RigidRiposte_Thrust', 0.13], ['Technique_Whirl_Revolution', 0.2], ['Technique_Whirl_Revolution', 0.47]]) {
    const world = worldMatrices(model, localPose(model, [{ clip, time, weight: 1 }]));
    const drawn = apply(world[hand], TIP), swept = techniqueBlade(clip, time).tip;
    assert.ok(Math.hypot(drawn[0] - swept.x, drawn[1] - swept.y, drawn[2] - swept.z) < 0.02, `${clip} at ${time}`);
  }
});

test('the techniques stand on the canonical floor and their clips meet end to end', () => {
  const model = withMotion();
  const meshes = skinnedMeshes(model);
  const sole = (clip, time) => { const h = skinnedHeights(model, meshes, localPose(model, [{ clip, time, weight: 1 }]), ['Boot.L', 'Boot.R']); return Math.min(h['Boot.L'][0], h['Boot.R'][0]); };
  for (const clip of ['Technique_RigidRiposte_Enter', 'Technique_RigidRiposte_Interception', 'Technique_RigidRiposte_Thrust', 'Technique_RigidRiposte_Recovery', 'Technique_Whirl_Enter', 'Technique_Whirl_Revolution', 'Technique_Whirl_Exit']) {
    const duration = model.clips.get(clip).duration;
    let low = Infinity;
    for (let t = 0; t <= duration + 1e-9; t += 1 / 30) low = Math.min(low, sole(clip, Math.min(duration, t)));
    // (as Argon authored them they stand 5 to 7 cm into the floor on this model)
    assert.ok(low > -0.012 && low < 0.05, `${clip}: lowest sole ${low.toFixed(3)} m`);
  }
  const tip = (clip, time) => apply(worldMatrices(model, localPose(model, [{ clip, time, weight: 1 }]))[model.byName.get('hand.R')], TIP);
  const gap = (a, b) => { const p = tip(a, model.clips.get(a).duration), q = tip(b, 0); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  for (const [a, b] of [['Technique_RigidRiposte_Enter', 'Technique_RigidRiposte_Interception'], ['Technique_RigidRiposte_Interception', 'Technique_RigidRiposte_Thrust'],
    ['Technique_RigidRiposte_Thrust', 'Technique_RigidRiposte_Recovery'], ['Technique_Whirl_Enter', 'Technique_Whirl_Revolution'], ['Technique_Whirl_Revolution', 'Technique_Whirl_Revolution']]) {
    assert.ok(gap(a, b) < 0.01, `${a} into ${b}: ${gap(a, b).toFixed(3)} m`);
  }
  // nothing but the pelvis turns a Whirl: the root is never animated (the runtime does not turn it either)
  const root = model.byName.get('root');
  for (const clip of Object.values(SWORD_TECHNIQUES.whirl_like_the_wind.clips)) assert.ok(!model.clips.get(clip).channels.some((c) => c.node === root), clip);
});

test('the revised first cut: begun and ended on the canonical stance, driven by the torso, finished in control, home clear of the floor', () => {
  const before = canonical(), after = withMotion();
  const pose = (model, time) => worldMatrices(model, localPose(model, [{ clip: 'Slash_1', time, weight: 1 }]));
  const point = (model, time, bone, p = [0, 0, 0]) => apply(pose(model, time)[model.byName.get(bone)], p);
  const tip = (model, time) => point(model, time, 'hand.R', TIP);
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const clip = STRIKE_CLIPS.Slash_1;
  // the same stance at both ends, and the same raise
  for (const t of [0, 0.1, clip.raised, clip.end]) assert.ok(far(tip(before, t), tip(after, t)) < 0.02, `at ${t}`);
  // the legs are the canonical ones throughout (nothing new to slide)
  for (let t = 0; t <= clip.end; t += 1 / 30) for (const foot of ['foot.L', 'foot.R']) assert.ok(far(point(before, t, foot), point(after, t, foot)) < 1e-3);
  // the chest turns with the cut (it did not turn at all)
  const heading = (model, time) => { const m = pose(model, time)[model.byName.get('chest')]; return Math.atan2(-m[8], -m[10]) * 180 / Math.PI; };
  const turn = (model) => { const a = heading(model, 0.3), b = heading(model, 0.5); return Math.abs(((b - a + 540) % 360) - 180); };
  assert.ok(turn(before) < 2, `canonical chest turn ${turn(before).toFixed(1)}`);
  assert.ok(turn(after) > 30, `revised chest turn ${turn(after).toFixed(1)}`);
  // the blade crosses the knight's front at the authored contact
  const at = tip(after, clip.contact);
  assert.ok(Math.abs(at[0]) < 0.35 && at[2] < -1.5, `contact tip ${at.map((v) => v.toFixed(2))}`);
  // the follow-through: the point carried round to the left and held up there (it sank through the follow-through)
  const elevation = (model, time) => { const h = point(model, time, 'hand.R'), p = tip(model, time); return Math.asin((p[1] - h[1]) / far(p, h)) * 180 / Math.PI; };
  for (let t = clip.contact + 1 / 30; t <= clip.far + 1e-9; t += 1 / 30) assert.ok(elevation(after, t) > -12, `the blade droops to ${elevation(after, t).toFixed(0)} deg at ${t.toFixed(3)}`);
  assert.ok(elevation(before, 0.5) < -15, 'the canonical follow-through droops');
  assert.ok(tip(after, clip.far)[1] > tip(before, clip.far)[1] + 0.2);
  // and home again without the point going near the floor (it swept within 6 cm of it)
  let low = Infinity, lowBefore = Infinity;
  for (let t = clip.far; t <= clip.end - 0.05; t += 1 / 60) { low = Math.min(low, tip(after, t)[1]); lowBefore = Math.min(lowBefore, tip(before, t)[1]); }
  assert.ok(lowBefore < 0.1, `canonical recovery lowest ${lowBefore.toFixed(2)}`);
  assert.ok(low > 0.2, `revised recovery lowest ${low.toFixed(2)}`);
});
