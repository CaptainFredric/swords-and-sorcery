// Run from a local preview: await (await import('/client/game/chivalryComposition.browser.mjs')).checkChivalryComposition()
import * as THREE from 'three';
import { SpellbladeComposition } from './spellbladeComposition.mjs';
import { createSpellbladeAsset } from './SpellbladeAssets.mjs';
import { gaitTime } from './spellbladeMotion.mjs';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';
const require = (condition, message) => { if (!condition) throw new Error(message); };
export async function checkChivalryComposition() {
  const root = new THREE.Group();
  const hand = new THREE.Bone(); hand.name = 'handR'; root.add(hand);
  const clip = (name, speed) => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('handR.quaternion', [0, 1], [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), speed).toArray()])]);
  const composition = new SpellbladeComposition(root, [clip('Cast', 1), clip('Guard', -.7), clip('Slash_1', 1.5)]);
  const at = (name, time, dt) => { composition.apply({ sword: { clip: name, time } }, dt); return hand.quaternion.clone(); };
  for (let n = 0; n < 100; n++) at('Cast', n / 240, 1 / 240);
  const before = hand.quaternion.clone(), previous = at('Cast', 100 / 240, 1 / 240);
  const rate = before.angleTo(previous) * 240;
  at('Guard', .3, 0);
  require(previous.angleTo(hand.quaternion) < 1e-6, 'Pose jumps at zero dt handover');
  require(previous.angleTo(at('Guard', .3001, .0001)) * 10000 > .95 * rate, 'Outgoing motion was stopped at handover');
  for (let n = 1; n <= 5; n++) at('Guard', .3 + n / 240, 1 / 240);
  const middle = hand.quaternion.clone(); at('Slash_1', .08, 0);
  require(middle.angleTo(hand.quaternion) < 1e-6, 'Interrupted transition jumps');
  for (let n = 0; n <= 120; n++) at('Slash_1', .08 + n / 240, 1 / 240);
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.5 * .58);
  require(expected.angleTo(hand.quaternion) < 1e-5, 'Transition changed the accepted action clock');
  const instance = await createSpellbladeAsset();
  require(Boolean(instance), 'Production Spellblade failed to load');
  const report = [];
  let sprintFrames = 0, dashFrames = 0, continuedCadence = 0, previousWasDash = false;
  let ordinary = null;
  try {
    for (const name of ['GuardCut_1', 'GuardCut_2', 'GuardCut_3']) require(instance.animator.has(name), `Missing authored ${name}`);
    const player = { alive:true, guarding:true, attackActive:true, attackStartedAt:10, castPoseStartAt:10.1, castPoseUntil:10.7,
      sprinting:true, sprintBlend:1, velocity:{ x:0,y:0,z:-11 }, dashUntil:10.5, ultimateState:{id:'chivalry',phase:'active',until:19} };
    for (let n = 0; n < 540; n++) {
      const now = 10 + n / 60;
      const p = { ...player, attackStartedAt:10 + Math.floor((now - 10) / 2.08) * 2.08,
        guarding:n % 150 < 100, castPoseStartAt:10 + Math.floor(n / 50) * 50 / 60,
        castPoseUntil:10 + Math.floor(n / 50) * 50 / 60 + .36,
        dashUntil:10 + Math.floor(n / 100) * 100 / 60 + .18 };
      const plan = resolveSpellbladeAnimationPlan({state:'attack',player:p,serverNow:now,localTime:now});
      const phase = instance.animator.gaitPhase;
      instance.animator.apply(plan,1 / 60);
      if (plan.layers.locomotion.clip === 'Sprint') {
        sprintFrames++;
        require(plan.layers.posture.overlay?.clip === 'Sprint', 'Sprint lost its authored torso carriage');
        require(instance.animator.gaitPhase !== phase, 'Upper actions froze Sprint cadence');
        const overlay = instance.animator.composition.channels.get('posture').overlay;
        require(Math.abs(overlay.time - gaitTime(instance.animator.gaitPhase, overlay.clip.duration)) < 1e-6, 'Torso and feet lost their common stride clock');
        if (previousWasDash) continuedCadence++;
      } else {
        dashFrames++;
        require(instance.animator.gaitPhase === phase, 'Dash reset the locomotion phase');
      }
      previousWasDash = plan.layers.locomotion.clip === 'Dash';
      for (const bone of instance.animator.bones.values()) require(bone.quaternion.toArray().every(Number.isFinite), `Nonfinite ${bone.name}`);
      if (n % 60 === 0) report.push({ now, sword:plan.layers.sword.clip, sorcery:plan.layers.sorcery.clip });
    }
    const beforeExit = instance.animator.bone('hand.R').quaternion.clone();
    instance.animator.apply({clip:'Guard',time:.5},0);
    require(beforeExit.angleTo(instance.animator.bone('hand.R').quaternion) < 1e-5, 'Expiry jumps at zero dt');
    for(let n=0;n<30;n++) instance.animator.apply({clip:'Guard',time:.5},1/60);
    ordinary = await createSpellbladeAsset();
    for(let n=0;n<5;n++) ordinary.animator.apply({clip:'Guard',time:.5},.1);
    require(instance.animator.bone('hand.R').quaternion.angleTo(ordinary.animator.bone('hand.R').quaternion)<1e-5,'Expiry retained composed pose instead of the ordinary mixer sample');
    return { expirySettles:true, velocityHandover:true, interruptedHandover:true, acceptedClock:true, productionFrames:540, sprintFrames, dashFrames, continuedCadence, samples:report };
  } finally { instance.dispose(); ordinary?.dispose(); }
}
