// The Spellblade's motion sidecar (tools/assets/build-spellblade-motion.mjs): what it is, that the canonical model is
// the one it was built against, that its technique clips draw the blade the server sweeps
// (shared/src/swordTechniqueContracts.mjs), and what its clips do on that model (scripts/lib/glbPose.mjs, glbSkin.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadGlb, localPose, overlayMotion, worldMatrices, apply } from '../../scripts/lib/glbPose.mjs';
import { skinnedHeights, skinnedMeshes } from '../../scripts/lib/glbSkin.mjs';
import { SWORD_TECHNIQUE_CONTRACTS } from '../../shared/src/swordTechniqueContracts.mjs';
import { swordTechniqueAnimationPlan } from '../../client/game/spellbladeAnimationPlan.mjs';
import { STRIKE_CLIPS } from '../../client/game/swordChainPresentation.mjs';

const dir = new URL('../../client/assets/characters/spellblade/', import.meta.url);
const sha = (name) => createHash('sha256').update(readFileSync(new URL(name, dir))).digest('hex');
const meta = JSON.parse(readFileSync(new URL('spellblade-motion.json', dir), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const canonical = () => loadGlb(new URL('spellblade.glb', dir).pathname);
const withMotion = () => overlayMotion(canonical(), new URL('spellblade-motion.glb', dir).pathname);
const TIP = [0.131, 1.3383, -0.1661];

test('the sidecar is the file its record names, built against the canonical model', () => {
  assert.equal(sha('spellblade-motion.glb'), meta.sha256);
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

const TECHNIQUE_CLIPS = ['Technique_RigidRiposte_Enter', 'Technique_RigidRiposte_Interception', 'Technique_RigidRiposte_Thrust', 'Technique_RigidRiposte_Recovery',
  'Technique_RigidRiposte_Parried', 'Technique_RigidRiposte_Air', 'Technique_Whirl_Enter', 'Technique_Whirl_Revolution', 'Technique_Whirl_GaleLift',
  'Technique_Whirl_Exit', 'Technique_Whirl_Interrupted', 'Technique_Whirl_AirRecovery'];
// (the rules' guard point: the sword socket, 0.12 m up the blade from the hand)
const BASE = TIP.map((v) => v * (0.117 / Math.hypot(...TIP)));

test('every clip the technique animation plan asks for is in the sidecar, as long as the rules say', () => {
  const motion = loadGlb(new URL('spellblade-motion.glb', dir).pathname);
  for (const clip of TECHNIQUE_CLIPS) assert.ok(motion.clips.has(clip), clip);
  // every clip the plan can name, through a Riposte and two turns of a Whirl, their endings included
  const asked = new Set();
  for (const action of [{ id: 'rigid_riposte' }, { id: 'rigid_riposte', aerial: true }, { id: 'rigid_riposte', phase: 'interrupted', reason: 'parried' },
    { id: 'whirl_wind', revolutions: 1 }, { id: 'whirl_wind', revolutions: 2, galeLift: true }, { id: 'whirl_wind', phase: 'recovery', endsAt: 0.25 },
    { id: 'whirl_wind', phase: 'interrupted' }, { id: 'whirl_wind', phase: 'interrupted', aerial: true }]) {
    for (let t = 0; t < 1.3; t += 1 / 60) for (const grounded of [true, false]) asked.add(swordTechniqueAnimationPlan({ ...action, startedAt: 0 }, t, false, grounded).clip);
  }
  for (const clip of asked) assert.ok(motion.clips.has(clip), `the plan asks for ${clip}`);
  const riposte = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte, whirl = SWORD_TECHNIQUE_CONTRACTS.whirl_wind;
  const near = (clip, sec) => assert.ok(Math.abs(motion.clips.get(clip).duration - sec) < 0.012, `${clip} is ${motion.clips.get(clip).duration}s, the rules say ${sec}`);
  near('Technique_RigidRiposte_Interception', riposte.braceUntil);
  near('Technique_RigidRiposte_Thrust', riposte.activeUntil - riposte.activeFrom);
  near('Technique_RigidRiposte_Recovery', riposte.recovery);
  near('Technique_Whirl_Revolution', whirl.revolutionSeconds);
  near('Technique_Whirl_GaleLift', whirl.revolutionSeconds);
  near('Technique_Whirl_Exit', whirl.recovery);
});

test('the blade the server sweeps is the blade the clips draw (but for the lift that stands them on the floor)', () => {
  const model = withMotion();
  const hand = model.byName.get('hand.R');
  const drawn = (clip, time) => { const world = worldMatrices(model, localPose(model, [{ clip, time, weight: 1 }])); return { tip: apply(world[hand], TIP), base: apply(world[hand], BASE) }; };
  // the clips are lifted so the canonical boots stand on the floor (Argon posed them on a lower stance); the server's
  // samples are his, unlifted: that lift is the whole of the difference
  const off = (p, q, lift) => Math.hypot(p[0] - q.x, p[1] - lift - q.y, p[2] - q.z);
  const whirl = SWORD_TECHNIQUE_CONTRACTS.whirl_wind;
  for (const s of whirl.track) {
    const d = drawn('Technique_Whirl_Revolution', Math.min(s.time, whirl.revolutionSeconds));
    assert.ok(off(d.tip, s.tip, meta.pelvisLiftM.whirl) < 0.03 && off(d.base, s.base, meta.pelvisLiftM.whirl) < 0.04, `Whirl at ${s.time}`);
  }
  // a Riposte, as the animation plan plays it. From the end of the brace on, the drawn blade is the swept one. In the
  // first 0.2 s it is not quite: the plan plays the 0.10 s Enter clip and then joins the brace clip part-way through,
  // where the rules' samples bring the sword up over the whole 0.22 s (measured: up to 0.32 m apart at the point)
  const riposte = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte;
  let startup = 0;
  for (const s of riposte.track) {
    const plan = swordTechniqueAnimationPlan({ id: 'rigid_riposte', startedAt: 0 }, s.time, false, true);
    const d = drawn(plan.clip, Math.min(plan.time, model.clips.get(plan.clip).duration));
    const tip = off(d.tip, s.tip, meta.pelvisLiftM.riposte), base = off(d.base, s.base, meta.pelvisLiftM.riposte);
    if (s.time < 0.2) { startup = Math.max(startup, tip); continue; }
    assert.ok(tip < 0.06 && base < 0.06, `Riposte at ${s.time}: point ${tip.toFixed(3)} m, guard ${base.toFixed(3)} m`);
  }
  assert.ok(startup < 0.35, `Riposte startup: ${startup.toFixed(3)} m`);
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
  for (const clip of TECHNIQUE_CLIPS.filter((c) => c.startsWith('Technique_Whirl_'))) assert.ok(!model.clips.get(clip).channels.some((c) => c.node === root), clip);
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
