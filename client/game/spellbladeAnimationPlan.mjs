import { concurrentPresentation } from './spellbladePose.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { GAME, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { disasterHolding, disasterWindupSec } from './oneHitCamera.mjs';
import { chainPresentation } from './swordChainPresentation.mjs';

const SLASH_DURATIONS = Object.freeze([0.72, 0.72, 0.64]);
const ATTACK_CYCLE = SLASH_DURATIONS.reduce((sum, value) => sum + value, 0);
const RESPAWN_SEC = 3;
// Guard: frames 1-8 raise the guard, frames 8-56 are a breathing hold that loops (30 fps)
export const GUARD_HOLD_START = 8 / 30;
export const GUARD_HOLD_SECONDS = 48 / 30;
const MAX_STAGGER_SEC = Math.max(GAME.parryStaggerMs, GAME.guardBreakStaggerMs) / 1000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value));
}

function fixed(clip, time = 0, loop = false) {
  return { clip, time: nonNegative(time), loop, weight: 1 };
}

// the heavy strike's contact, this far into Slash_3 (its slot begins at the chain's third start)
const SLAM_CONTACT = SWORD_STRIKE_TIMES[2] - SWORD_CHAIN.starts[2];

// a Blazing Vortex's held poses: Slash_3 with the sword raised (as it is lit), Slash_1 at its contact (the blade level
// along the aim); it comes down level this long before the spin takes hold
const VORTEX_HELD = Object.freeze({ raised: Math.max(0, SLAM_CONTACT - 0.16), level: SWORD_STRIKE_TIMES[0], levelBefore: 0.5 });

// An alternate chain loads a little later into each cut and relaxes sooner.
// The offset and its slope go to zero at each contact window and chain seam.
export function swordPresentationTime(elapsed,style=0) {
  if(!style||elapsed<=0||elapsed>=ATTACK_CYCLE)return elapsed;
  const slot=elapsed<SWORD_CHAIN.starts[1]?0:elapsed<SWORD_CHAIN.starts[2]?1:2;
  const first=SWORD_CHAIN.starts[slot],last=SWORD_CHAIN.starts[slot+1]??ATTACK_CYCLE;
  const contact=SWORD_STRIKE_TIMES[slot],early=contact-MELEE_CONTACT.window.early,late=contact+MELEE_CONTACT.window.late;
  if(elapsed>=early&&elapsed<=late)return elapsed;
  const winding=elapsed<early;
  const start=winding?first:late,span=winding?early-first:last-late;
  const t=(elapsed-start)/span,shape=16*t*t*(1-t)*(1-t);
  return elapsed+(winding?-1:1)*shape*Math.min(.048,span*.19)*Math.max(0,Math.min(1,style));
}

function attackPlan(player, serverNow, { guarded = false } = {}) {
  const startedAt = finite(player?.attackStartedAt, serverNow);
  const elapsed = nonNegative(serverNow - startedAt);
  const age = elapsed % ATTACK_CYCLE;
  // (the chain's form is its own clips now, swordChainPresentation.mjs: the guarded and Sundering paths keep the clock)
  const cycle = age;

  // a chain begun Sundering: every strike is the heavy one's slam, each timed to its own contact
  if (player?.attackSlam) {
    const slot = cycle < SLASH_DURATIONS[0] ? 0 : cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1] ? 1 : 2;
    return fixed('Slash_3', cycle - SWORD_STRIKE_TIMES[slot] + SLAM_CONTACT);
  }

  // an ordinary chain: each strike's authored cut through its contact, linked into the next without a reset, its last
  // swing played out after the server's chain is over (swordChainPresentation.mjs). (Spells & Chivalry's guarded cuts
  // keep their own clips and clocks below.)
  if (!guarded && !player?.attackChivalry && !player?.concurrent) {
    const shown = chainPresentation(player, serverNow);
    if (shown) return { ...fixed(shown.clip, shown.time), ...(shown.blend ? { blend: shown.blend } : {}), carry: true };
  }
  if (cycle < SLASH_DURATIONS[0]) return fixed('Slash_1', cycle);
  if (cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1]) {
    return fixed('Slash_2', cycle - SLASH_DURATIONS[0]);
  }
  return fixed('Slash_3', cycle - SLASH_DURATIONS[0] - SLASH_DURATIONS[1]);
}

// All-Natural Disaster's authored clips (spellblade.glb), and where in each the blow lands: the moment the authored
// blade reaches the ground (its tip crossing the floor), measured from the shipped GLB (the test measures it again):
//   ground:  two turns of the whole body with the sword low, a rise overhead, and the slam: the blade meets the
//            ground 0.85 s in and is driven on into it (the ordinary wind-up is 0.92 s: the clip waits its first
//            frame out for the difference);
//   fast:    one turn and the slam, blade down 0.33 s in, for Half Lightning's 0.36 s wind-up;
//   arrival: the slam alone, for the instant strike out of a Full Lightning teleport: joined where its blade lands;
//   aerial:  two turns in the air and the cut that throws the wave, 0.85 s in (the aerial form's own delay);
//   the two charges: the held aim, on the ground (blade planted) and in the air.
// These are Argon's clips as delivered. The blade is driven well into the floor at each slam and rides below it
// through the ground spins (docs/verification/refinement-v-combat-acceptance.md has the figures): the presentation
// treats that as what it looks like, a blade scoring and then breaking the ground, and puts its debris where the
// blade really is. Nothing here moves a bone.
export const DISASTER_CLIPS = Object.freeze({
  ground: Object.freeze({ clip: 'AllNatural_Ground_DualSpin_Slam', contact: 0.85, duration: 1.44 }),
  fast: Object.freeze({ clip: 'AllNatural_FastLightning_DualSpin_Slam', contact: 0.33, duration: 0.92 }),
  arrival: Object.freeze({ clip: 'AllNatural_Lightning_Arrival_Slam', contact: 0.085, duration: 0.6 }),
  aerial: Object.freeze({ clip: 'AllNatural_Aerial_Vortex_Wave', contact: 0.85, duration: 1.25 }),
  chargeGround: Object.freeze({ clip: 'AllNatural_Lightning_Charge_Ground', duration: 0.8 }),
  chargeAir: Object.freeze({ clip: 'AllNatural_Lightning_Charge_Air', duration: 0.8 }),
});
const DISASTER_CLIP_NAMES = new Set(Object.values(DISASTER_CLIPS).map((entry) => entry.clip));
/** Whether a plan is one of the authored Disaster clips (their turns are in the clip: nothing else turns the body). */
export const disasterAuthored = (clip) => DISASTER_CLIP_NAMES.has(clip);

function disasterPlan(player, serverNow) {
  const action = player.ultimateState ?? {};
  const windup = disasterWindupSec(action);
  const tiers = action.oneHit?.tiers ?? action.preparedTiers ?? {};
  // Form follows the server's resolved post-teleport grounded state.
  const airborne = action.phase === 'active' ? action.oneHit?.form === 'aerial' : player.grounded === false && (tiers.gale ?? 0) >= 2;
  // (the model without them: the plain heavy strike, wound up to its contact as before)
  const provisional = (time) => ({ requiredClip: true, fallback: 'Slash_3', fallbackTime: Math.max(0, Math.min(SLASH_DURATIONS[2] - .01, time)) });
  const authored = (entry, time, extra = {}) => ({
    ...fixed(entry.clip, Math.min(entry.duration - 1 / 60, time)), ...extra, disaster: true,
  });
  if (action.phase === 'startup') {
    // the held Full Lightning aim: its own charge, looping, on the ground or in the air
    if (disasterHolding(action)) {
      const entry = airborne ? DISASTER_CLIPS.chargeAir : DISASTER_CLIPS.chargeGround;
      const held = Math.max(0, serverNow - finite(action.teleportHoldAt, serverNow));
      return { ...fixed(entry.clip, held % entry.duration, true), disaster: true, ...provisional(SLAM_CONTACT * .18) };
    }
    const remaining = Math.max(0, finite(action.commitAt, serverNow) - serverNow);
    const share = Math.max(0, Math.min(1, 1 - remaining / windup));
    const old = SLAM_CONTACT * (.18 + .82 * share);
    // in the air (Full Gale): the charge gathers until the commit; the turns and the wave are the active clip's
    if (airborne) return { ...authored(DISASTER_CLIPS.chargeAir, (windup - remaining) % DISASTER_CLIPS.chargeAir.duration), loop: true, ...provisional(old) };
    const entry = tiers.lightning >= 1 ? DISASTER_CLIPS.fast : DISASTER_CLIPS.ground;
    // (a held ground release waits one frame short of the ground; the commit then lands it)
    const latest = entry.contact - (action.groundRelease ? 1 / 30 : 0);
    return { ...authored(entry, Math.max(0, Math.min(latest, entry.contact - remaining))), ...provisional(Math.min(action.groundRelease ? SLAM_CONTACT - 1 / 30 : SLAM_CONTACT, old)) };
  }
  const elapsed = Math.max(0, serverNow - finite(action.commitAt, serverNow));
  const follow = provisional(SLAM_CONTACT + elapsed * .75);
  if(action.oneHit?.form==='plunge'){
    // The knight keeps the slam drawn back while falling. The blade does
    // NOT strike an imaginary floor or accidentally play Gale's aerial form.
    const entry=tiers.lightning>=1?DISASTER_CLIPS.fast:DISASTER_CLIPS.ground;
    return { ...authored(entry,Math.max(0,entry.contact-1/30)), ...provisional(SLAM_CONTACT-1/30) };
  }
  const teleported = Number.isFinite(action.teleportHoldAt);
  if (airborne) {
    // After an aerial teleport, pose the sword while the player adjusts aim.
    // Only the authoritative launch event can advance the clip past its cut.
    if(teleported&&!action.oneHit?.waveLaunched){
      const charge=DISASTER_CLIPS.chargeAir;
      return { ...fixed(charge.clip, elapsed%charge.duration,true), disaster:true, ...follow };
    }
    const sinceLaunch=Math.max(0,serverNow-finite(action.oneHit?.waveLaunchedAt,serverNow));
    return { ...authored(DISASTER_CLIPS.aerial,
      teleported?DISASTER_CLIPS.aerial.contact+sinceLaunch:elapsed,
      teleported?{blend:.05}:{}), ...follow };
  }
  if (teleported) return { ...authored(DISASTER_CLIPS.arrival, DISASTER_CLIPS.arrival.contact + elapsed, { blend: .04 }), ...follow };
  const entry = tiers.lightning >= 1 ? DISASTER_CLIPS.fast : DISASTER_CLIPS.ground;
  return { ...authored(entry, entry.contact + elapsed), ...follow };
}

// Animation clips share the action's authoritative clock. Enter is blended
// into the EXISTING 0.22 s Rigid interception and first 0.6 s Whirl, never
// inserted as extra startup. The supplied GLBs must be shipped separately.
export function swordTechniqueAnimationPlan(action, serverNow, firstPerson=false, grounded=true) {
  if(!action)return null;
  const clipPrefix=firstPerson?'FP_':'';
  const age=Math.max(0,serverNow-(action.startedAt??serverNow));
  const key=action.initialStartedAt??action.startedAt;
  const clip=(name,at,extra={})=>({
    ...fixed(clipPrefix+name,at),actionKey:key,blend:.08,
    fallback:firstPerson?'Idle':'Guard',...extra,
  });
  if(action.id==='rigid_riposte'){
    if(action.phase==='interrupted')return clip(
      action.reason==='parried'?'Technique_RigidRiposte_Parried':'Technique_RigidRiposte_Recovery',age);
    if(action.aerial&&age<.48)return clip('Technique_RigidRiposte_Air',age);
    if(age<.1)return clip('Technique_RigidRiposte_Enter',age);
    if(age<.22)return clip('Technique_RigidRiposte_Interception',age);
    if(age<.48)return clip('Technique_RigidRiposte_Thrust',age-.22);
    return clip('Technique_RigidRiposte_Recovery',age-.48);
  }
  if(action.id==='whirl_wind'){
    if(action.phase==='interrupted')return clip(
      action.aerial?'Technique_Whirl_AirRecovery':'Technique_Whirl_Interrupted',age);
    if(action.phase==='recovery'){
      const began=(action.endsAt??serverNow)-.25;
      return clip(grounded?'Technique_Whirl_Exit':'Technique_Whirl_AirRecovery',
        serverNow-began);
    }
    // The entry occupies the start of the active revolution. Its source
    // clip is not allowed to delay sword-contact authority.
    if(action.revolutions===1&&age<.2)return clip('Technique_Whirl_Enter',age);
    return clip(action.galeLift?'Technique_Whirl_GaleLift':'Technique_Whirl_Revolution',
      age,{loop:true});
  }
  return null;
}

export function resolveSpellbladeAnimationPlan({ state, player = {}, serverNow = 0, localTime = 0 }) {
  if(player.swordTechnique&&state!=='dead'){
    const technique=swordTechniqueAnimationPlan(player.swordTechnique,serverNow,false,player.grounded);
    if(technique)return technique;
  }
  const layers = concurrentPresentation(player, serverNow, player.castPoseUntil, player.castPoseStartAt);
  if (layers.concurrent && !['dead', 'stagger'].includes(state)) {
    const still = fixed('Idle', idleTime(localTime), true);
    const guard = fixed('Guard', guardHoldTime(localTime));
    const attack = { ...attackPlan(player, serverNow, { guarded: true }), actionKey: player.attackStartedAt };
    const defensive = { ...attack, clip: attack.clip.replace('Slash_', 'GuardCut_'), fallback: attack.clip };
    const cut = layers.guard ? defensive : attack;
    const cast = { ...fixed('Cast', serverNow - finite(player.castPoseStartAt, serverNow)), actionKey: player.castPoseStartAt };
    const locomotion = layers.dash
      ? fixed('Dash', serverNow - (finite(player.dashUntil, serverNow) - MOVEMENT.dashDuration))
      : resolveSpellbladeAnimationPlan({ state: locomotionState(player), player: { ...player, ultimateState: null }, serverNow, localTime });
    const posture = layers.attack ? cut : layers.guard ? guard : layers.cast ? cast : still;
    // A small share of the authored Sprint torso carries its forward weight beneath the action.
    // Sword and sorcery retain their own complete tracks and contact clocks.
    const movingPosture = locomotion.clip === 'Sprint'
      ? { ...posture, overlay: { ...locomotion, weight: 0.16 * Math.max(0, Math.min(1, player.sprintBlend ?? 1)) } }
      : posture;
    return { ...locomotion, layers: {
      locomotion,
      posture: movingPosture,
      sword: layers.attack ? cut : layers.guard ? guard : still,
      sorcery: layers.cast ? cast : layers.guard ? layers.attack ? defensive : guard : still,
    }, concurrent: layers };
  }
  if (state === 'attack') {
    const attack = attackPlan(player, serverNow);
    // on the move (or in the air) the legs keep their gait and only the body above them swings: a whole-body strike
    // planted its feet while the knight ran on (every planted frame skated). Standing, the strike has the whole body.
    const moving = locomotionState(player);
    if (moving === 'idle' || player.attackSlam) return attack;
    const locomotion = resolveSpellbladeAnimationPlan({ state: moving, player, serverNow, localTime });
    return { ...locomotion, layers: { locomotion, posture: attack, sword: attack, sorcery: attack }, moving: true };
  }

  // a Blazing Vortex: the sword held out level in both hands, where the forehand's blade crosses the aim (the whole
  // knight is turned round by the spin: RemotePlayers); as it is lit, raised first (the heavy strike's raise)
  if (state === 'vortex') {
    const vortex = player.ultimateState ?? {};
    const lighting = vortex.phase === 'startup' && serverNow < finite(vortex.commitAt, serverNow) - VORTEX_HELD.levelBefore;
    return lighting ? fixed('Slash_3', VORTEX_HELD.raised) : fixed('Slash_1', VORTEX_HELD.level);
  }

  // All-Natural Disaster: Argon's authored Disaster clips, each placed on the host's own clock so that the frame in
  // which the blade meets the ground (or leaves the sword as a wave) is shown at the authoritative moment it does.
  if (state === 'one-hit') return disasterPlan(player, serverNow);

  // the brace into Sunder: the opening of the slam's own swing (the sword taken up overhead), played through the
  // startup so that the first slam drives down out of it as the brace ends (the host begins that slam's chain
  // `firstSlamLead` before the commit: attackPlan then carries on from the very frame this ends at)
  if (state === 'brace') {
    const brace = player.ultimateState ?? {};
    const sunder = ULTIMATES.sunder;
    const share = Math.max(0, Math.min(1, 1 - (finite(brace.commitAt, serverNow) - serverNow) / sunder.startupSec));
    const eased = share * share * (3 - 2 * share);
    return fixed('Slash_3', Math.max(0, sunder.firstSlamLead - SWORD_STRIKE_TIMES[0] + SLAM_CONTACT) * eased);
  }

  if (state === 'cast') {
    return fixed('Cast', serverNow - finite(player.castPoseStartAt, serverNow));
  }

  if (state === 'dash') {
    const startAt = finite(player.dashUntil, serverNow) - MOVEMENT.dashDuration;
    return fixed('Dash', serverNow - startAt);
  }

  if (state === 'stagger') {
    const remaining = Math.max(0, finite(player.staggerUntil, serverNow) - serverNow);
    return fixed('Stagger', MAX_STAGGER_SEC - remaining);
  }

  if (state === 'dead') {
    // A staged corpse can remain indefinitely; its death clock must survive a missing respawn deadline.
    const deathAt = finite(player.deathAt, finite(player.respawnAt, serverNow + RESPAWN_SEC) - RESPAWN_SEC);
    return fixed('Death', serverNow - deathAt);
  }

  // The guard stays raised but breathes: loop the hold section on the local clock.
  if (state === 'guard') return fixed('Guard', guardHoldTime(localTime));
  // the air pose follows the jump: take-off at the start of the clip, falling toward its end
  if (state === 'air') return { ...fixed('Air', airPhase(player.velocity?.y)), normalized: true };
  if (state === 'sprint') return { ...fixed('Sprint', localTime, true), fallback: 'Run', rate: strideRate(player, SPRINT.speed) };
  if (state === 'run') return { ...fixed('Run', localTime, true), rate: strideRate(player, MOVEMENT.runSpeed) };
  return fixed('Idle', idleTime(localTime), true);
}

// stride cadence follows ground speed (the sprint builds up), so feet do not skate
function strideRate(player, clipSpeed) {
  const velocity = player?.velocity;
  if (!velocity) return 1;
  const speed = Math.hypot(finite(velocity.x), finite(velocity.z));
  // (down to a walk: a bot easing off, a chilled knight)
  return Math.max(0.4, Math.min(1.2, speed / clipSpeed));
}

function airPhase(verticalVelocity) {
  const v = finite(verticalVelocity);
  return Math.max(0, Math.min(1, (MOVEMENT.jumpImpulse - v) / (2 * MOVEMENT.jumpImpulse)));
}

// Blender exports frame 1 at 1/30 s. Loop only the authored frame 1..60 span,
// excluding the constant pre-roll that otherwise pauses the breath at every reset.
function idleTime(clock) {
  const duration = 59 / 30;
  const t = finite(clock);
  return 1 / 30 + (((t % duration) + duration) % duration);
}

function guardHoldTime(clock) {
  const t = finite(clock);
  return GUARD_HOLD_START + (((t % GUARD_HOLD_SECONDS) + GUARD_HOLD_SECONDS) % GUARD_HOLD_SECONDS);
}

export function resolveFirstPersonAnimationPlan(pose, view, timeSec) {
  if(view.combatPlayer?.swordTechnique){
    const authority=view.combatServerNow+Math.max(0,timeSec-(view.combatLocalNow??timeSec));
    const authored=swordTechniqueAnimationPlan(view.combatPlayer.swordTechnique,
      authority,true,view.combatPlayer.grounded);
    if(authored)return authored;
  }
  if (view.concurrent) {
    const still = { clip: 'Idle', loop: true, time: idleTime(timeSec) };
    const guard = { clip: 'Guard', loop: false, time: guardHoldTime(timeSec) };
    return { ...still, layers: {
      locomotion: still,
      posture: view.guard ? guard : still,
      sword: view.guard && !view.attackHeld ? guard : still,
      sorcery: view.guard && !(view.castUntil > timeSec) ? guard : still,
    } };
  }
  if (pose.state === 'attack') return attackPlan(view, timeSec);
  if (pose.state === 'guard') return { clip: 'Guard', loop: false, time: guardHoldTime(timeSec) };
  if (pose.state === 'cast') return { clip: 'Cast', loop: false, time: Math.max(0, timeSec - view.castStartedAt) };
  if (pose.state === 'dash') return { clip: 'Dash', loop: false, time: Math.max(0, timeSec - (view.dashUntil - 0.18)) };
  return { clip: 'Idle', loop: true, time: idleTime(timeSec) };
}

function locomotionState(player) {
  if (Math.abs(player.velocity?.y ?? 0) > 0.45) return 'air';
  if (Math.hypot(player.velocity?.x ?? 0, player.velocity?.z ?? 0) > 0.8) return player.sprinting ? 'sprint' : 'run';
  return 'idle';
}
