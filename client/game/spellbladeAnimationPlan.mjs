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

export function resolveSpellbladeAnimationPlan({ state, player = {}, serverNow = 0, localTime = 0 }) {
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

  // All-Natural Disaster: the authored body's sword winds up while the
  // camera reveals its turn, then Slash_3 crosses its actual contact pose
  // exactly at the authoritative commitment time (ground or in the air).
  // The indefinite Full Lightning hold retains the raised stance, not a
  // looping attack; release commits the strike as normal.
  if (state === 'one-hit') {
    const action=player.ultimateState ?? {};
    const windup=disasterWindupSec(action);
    if (action.phase==='startup') {
      if(disasterHolding(action)&&player.grounded===false){
        return {...fixed('AllNatural_Lightning_Charge_Air',serverNow-action.teleportHoldAt,true),
          requiredClip:true,fallback:'Slash_3',fallbackTime:SLAM_CONTACT*.18};
      }
      const remaining=finite(action.commitAt,serverNow)-serverNow;
      const share=Math.max(0,Math.min(1,1-remaining/windup));
      const beforeContact=action.groundRelease?SLAM_CONTACT-1/30:SLAM_CONTACT;
      return fixed('Slash_3',Math.min(beforeContact,SLAM_CONTACT*(.18+.82*share)));
    }
    const elapsed=Math.max(0,serverNow-finite(action.commitAt,serverNow));
    return fixed('Slash_3',Math.min(SLASH_DURATIONS[2]-.01,SLAM_CONTACT + elapsed * .75));
  }

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
