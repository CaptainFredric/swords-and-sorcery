import { concurrentPresentation } from './spellbladePose.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { GAME, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { disasterHolding, disasterWindupSec } from './oneHitCamera.mjs';
import { ONE_HIT_AERIAL_DURATION } from '../../shared/src/oneHitInfusions.mjs';
import { ONE_HIT_RULES } from '../../shared/src/oneHitOfWondersRules.mjs';
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
//   aerial:  two turns and the cut that throws the wave, 0.85 s into its AUTHORED clip;
//            the complete wind-up is time-mapped across the server's preparation
//            and vortex phases, without a separate floating-idle pose;
//   the two charges: ONLY the genuinely held Lightning aim, on ground or in air.
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

/**
 * The same authored aerial cut runs from the first Gale wind-up frame to
 * the server-authoritative wave launch. The player never transitions from
 * a static airborne charge to a SECOND wind-up on commit.
 *
 * Ordinary Gale retains its existing interruptible startup and vortex time;
 * the .85-second authored cut is stretched across both as ONE continuous
 * motion. A Full-Lightning teleport instead enters the FINAL wind-up frames
 * immediately on arrival, ending exactly when its short aiming window ends.
 * The winding must never reach the actual cut before the server launches.
 */
export function disasterAerialWindupTime(action, nowSec, { teleported = false } = {}) {
  const contact = DISASTER_CLIPS.aerial.contact;
  const commitAt = finite(action?.commitAt, nowSec);
  const launchAt = Math.max(commitAt + 1 / 60,
    finite(action?.oneHit?.waveAt, commitAt + (teleported ? ONE_HIT_RULES.postTeleportAimSec : ONE_HIT_AERIAL_DURATION)));
  let frame;
  if (teleported) {
    const window = launchAt - commitAt;
    const authoredLead = Math.min(window, contact);
    const elapsed = Math.max(0, Math.min(window, nowSec - commitAt));
    // Use the LAST portion of the cut, not two full rotations in .35 s.
    frame = contact - authoredLead + elapsed * (authoredLead / window);
  } else {
    const started = finite(action?.startedAt, commitAt - disasterWindupSec(action));
    const span = Math.max(1 / 60, launchAt - started);
    frame = (nowSec - started) / span * contact;
  }
  // A late snapshot must not show the sword firing before waveLaunched.
  return Math.max(0, Math.min(contact - 1 / 60, frame));
}
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
    // Full Gale winds up from the FIRST frame, even while still in startup.
    // Do not insert the old stationary chargeAir section before the vortex.
    if (airborne) return { ...authored(DISASTER_CLIPS.aerial,
      disasterAerialWindupTime(action, serverNow)), ...provisional(old) };
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
    // Stay in the SAME aerial cut through the commit. On a teleport arrival
    // skip the static charge pose and play the last .35 s of the winding
    // while the knight can still steer the wave's launch direction.
    if (!action.oneHit?.waveLaunched) return {
      ...authored(DISASTER_CLIPS.aerial,
        disasterAerialWindupTime(action, serverNow, { teleported }),
        teleported ? { blend: .06 } : {}),
      ...follow,
    };
    const sinceLaunch=Math.max(0,serverNow-finite(action.oneHit?.waveLaunchedAt,serverNow));
    return { ...authored(DISASTER_CLIPS.aerial,
      DISASTER_CLIPS.aerial.contact+sinceLaunch,
      teleported?{blend:.05}:{}), ...follow };
  }
  if (teleported) return { ...authored(DISASTER_CLIPS.arrival, DISASTER_CLIPS.arrival.contact + elapsed, { blend: .04 }), ...follow };
  const entry = tiers.lightning >= 1 ? DISASTER_CLIPS.fast : DISASTER_CLIPS.ground;
  return { ...authored(entry, entry.contact + elapsed), ...follow };
}

// Animation clips share the action's authoritative clock. Enter is blended
// into the EXISTING 0.22 s Rigid interception and first 0.6 s Whirl, never
// inserted as extra startup. The supplied GLBs must be shipped separately.
const RIPOSTE_BRACE_SEC=.22, RIPOSTE_ENTER_CLIP_SEC=.1;
// Where the authored brace (Enter, then Interception: seconds through the two) is, each moment of the server's
// brace: fitted to the server's own samples of the blade (swordTechniqueContracts.mjs), which bring the sword up
// fast and then carry it across. server/tests/spellblade-motion-sidecar.test.mjs holds the two together.
const RIPOSTE_BRACE_PACE=Object.freeze([[0,0],[.05,.06],[.066,.09],[.083,.098],[.1,.126],[.133,.182],[.166,.236],[.2,.292],[.22,.32]]);
export function riposteBraceClipTime(age){
  const pace=RIPOSTE_BRACE_PACE;
  if(age<=0)return 0;
  for(let i=1;i<pace.length;i+=1)if(age<=pace[i][0]){
    const [t0,u0]=pace[i-1],[t1,u1]=pace[i];
    return u0+(u1-u0)*(age-t0)/(t1-t0);
  }
  return pace[pace.length-1][1];
}
// A technique begun as the Guard comes down (within this long of the knight last being seen guarding): the sword is
// still on its way down from overhead, the furthest it can be from where a technique wants it.
const TECHNIQUE_OUT_OF_GUARD_SEC=.3;
export function swordTechniqueAnimationPlan(action, serverNow, firstPerson=false, grounded=true, guardSeenAt=null) {
  if(!action)return null;
  const clipPrefix=firstPerson?'FP_':'';
  const age=Math.max(0,serverNow-(action.startedAt??serverNow));
  const key=action.initialStartedAt??action.startedAt;
  const began=action.initialStartedAt??action.startedAt??serverNow;
  const outOfGuard=Number.isFinite(guardSeenAt)&&began-guardSeenAt<=TECHNIQUE_OUT_OF_GUARD_SEC&&began-guardSeenAt>=-.05;
  const clip=(name,at,extra={})=>({
    // (how each clip is eased into is the animator's: spellbladeBlend.mjs knows what it is coming from)
    ...fixed(clipPrefix+name,at),actionKey:key,
    // out of a Guard only just lowered the technique's first clip is eased into a little longer (0.08 s threw the
    // point at some 90 m/s, faster than any cut); the clips after it meet end to end as ever
    ...(outOfGuard&&age<.06?{blend:.14}:{}),
    fallback:firstPerson?'Idle':'Guard',...extra,
  });
  if(action.id==='rigid_riposte'){
    if(action.phase==='interrupted')return clip(
      action.reason==='parried'?'Technique_RigidRiposte_Parried':'Technique_RigidRiposte_Recovery',age);
    if(action.aerial&&age<.48)return clip('Technique_RigidRiposte_Air',age);
    // The server's 0.22 s brace is the Enter and Interception clips together (0.32 s as authored), brought up in
    // that time: so they are played through at the server's pace, and the blade drawn is the blade that intercepts.
    // (Enter at its own pace and Interception joined part-way left the point up to 0.32 m from it.) The timing is
    // the server's, untouched: the brace still ends, and the thrust still begins, at 0.22 s.
    if(age<RIPOSTE_BRACE_SEC){
      const authored=riposteBraceClipTime(age);
      return authored<RIPOSTE_ENTER_CLIP_SEC?clip('Technique_RigidRiposte_Enter',authored)
        :clip('Technique_RigidRiposte_Interception',authored-RIPOSTE_ENTER_CLIP_SEC);
    }
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
    // The server's blade is going round from the first instant (the first revolution begins at once), so the
    // revolution is what is played, at the server's phase, and the knight is eased into it from wherever the
    // sword was. (The authored Enter clip winds up for 0.20 s and ends where a revolution begins: played first, it
    // put the blade a third of a turn behind the one that cuts, then threw it there in a frame.)
    return clip(action.galeLift?'Technique_Whirl_GaleLift':'Technique_Whirl_Revolution',
      age,{loop:true});
  }
  return null;
}

export function resolveSpellbladeAnimationPlan({ state, player = {}, serverNow = 0, localTime = 0 }) {
  if(player.swordTechnique&&state!=='dead'){
    const technique=swordTechniqueAnimationPlan(player.swordTechnique,serverNow,false,player.grounded,player.guardSeenAt);
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
