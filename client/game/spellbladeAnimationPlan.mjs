import { castClipPhase, concurrentPresentation } from './spellbladePose.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';
import { GAME, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { disasterHolding, disasterWindupSec } from './oneHitCamera.mjs';
import { ONE_HIT_AERIAL_DURATION } from '../../shared/src/oneHitInfusions.mjs';
import { ONE_HIT_RULES } from '../../shared/src/oneHitOfWondersRules.mjs';
import { chainPresentation } from './swordChainPresentation.mjs';
import { RIPOSTE_BRACE_SEC, RIPOSTE_RECENT_GUARD_SEC, riposteBraceBlade } from './riposteBracePresentation.mjs';

const SLASH_DURATIONS = Object.freeze([0.72, 0.72, 0.64]);
const ATTACK_CYCLE = SLASH_DURATIONS.reduce((sum, value) => sum + value, 0);
const RESPAWN_SEC = 3;
const WALK_REFERENCE_SPEED = 1.9;
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

function castPlan(player, now) {
  const start = finite(player.castPoseStartAt, now);
  const release = finite(player.castPoseReleaseAt, start + 0.3);
  return { ...fixed('Cast', castClipPhase(now, start, release)), normalized: true, actionKey: start };
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

function attackPlan(player, serverNow, { guarded = false, localTime = serverNow } = {}) {
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
    // (a let-go strike is handed back to the stance: the Idle on the clock the stance itself is shown on, so nothing
    // jumps as the chain's presentation ends; a bridge names the next strike's frame for a model without it)
    if (shown?.idle) return { ...fixed('Idle', idleTime(localTime), true), blend: shown.blend };
    if (shown) return { ...fixed(shown.clip, shown.time), ...(shown.blend ? { blend: shown.blend } : {}), ...(shown.blendFrom ? { blendFrom: shown.blendFrom } : {}),
      ...(shown.fallback ? { fallback: shown.fallback, fallbackTime: shown.fallbackTime } : {}), carry: true };
  }
  if (cycle < SLASH_DURATIONS[0]) return fixed('Slash_1', cycle);
  if (cycle < SLASH_DURATIONS[0] + SLASH_DURATIONS[1]) {
    return fixed('Slash_2', cycle - SLASH_DURATIONS[0]);
  }
  return fixed('Slash_3', cycle - SLASH_DURATIONS[0] - SLASH_DURATIONS[1]);
}

// All-Natural Disaster's authored clips (spellblade.glb), and where in each the blow lands: the slam's low point, the
// moment the authored blade comes down nearest the floor, measured from the shipped GLB (the test measures it again).
// Argon's de8c8655 no longer drives the blade into the floor (the 89 went 0.6 m under): the dual-spin slams come down
// to 20-21 cm of it at 0.983 s (ground) and 0.6 s (fast). The Lightning arrival is Gemini's v15 kneeling two-handed
// slam (shins down, blade flat ahead, 27 cm up at the tip), trimmed to start just above the floor and eased up
// through Guard to Idle so the blade never dips under (scripts/transplant-spellblade-clips.mjs):
//   ground:  two turns of the whole body with the sword low, a rise overhead, and the slam: the blade comes down
//            0.983 s in (the ordinary wind-up is 0.92 s: the clip is joined a few frames in);
//   fast:    one turn and the slam, blade down 0.6 s in, for Half Lightning's 0.36 s wind-up (joined part-way in);
//   arrival: the slam alone, for the instant strike out of a Full Lightning teleport: joined where its blade lands;
//   aerial:  Gemini's v12 rebuild: a 720-degree spin, a forward aim-lock, then the cut that throws the wave:
//            the blade sweeps through the front 1.1 s into its AUTHORED clip;
//            the complete wind-up is time-mapped across the server's preparation
//            and vortex phases, without a separate floating-idle pose;
//   the two charges: ONLY the genuinely held Lightning aim, on ground or in air;
//   arrivalGag / arrivalGagBack: Gemini's faceplant and flat-on-his-back kip-up, cosmetic stand-ins for the arrival
//            slam now and then (below), one or the other evenly.
// Nothing here moves a bone: the debris goes where the blade really is.
export const DISASTER_CLIPS = Object.freeze({
  ground: Object.freeze({ clip: 'AllNatural_Ground_DualSpin_Slam', contact: 0.983, duration: 1.44 }),
  fast: Object.freeze({ clip: 'AllNatural_FastLightning_DualSpin_Slam', contact: 0.6, duration: 0.92 }),
  arrival: Object.freeze({ clip: 'AllNatural_Lightning_Arrival_Slam', contact: 0.19, duration: 0.85 }),
  aerial: Object.freeze({ clip: 'AllNatural_Aerial_Vortex_Wave', contact: 1.1, duration: 1.25 }),
  chargeGround: Object.freeze({ clip: 'AllNatural_Lightning_Charge_Ground', duration: 0.8 }),
  chargeAir: Object.freeze({ clip: 'AllNatural_Lightning_Charge_Air', duration: 0.8 }),
  arrivalGag: Object.freeze({ clip: 'AllNatural_Lightning_Faceplant_PopUp', duration: 1.35 }),
  arrivalGagBack: Object.freeze({ clip: 'AllNatural_Lightning_FlatDrop_PopUp', duration: 1.35 }),
});
const DISASTER_CLIP_NAMES = new Set(Object.values(DISASTER_CLIPS).map((entry) => entry.clip));

// How often a Full Lightning ground arrival lands on its face instead of the slam. Purely cosmetic: the server's
// strike, its timing and its debris are the same either way. The odds follow the aim the player held: a near-instant
// release (a panicked blink) faceplants half the time; otherwise a short aim rarely does and a long, greedy charge
// does more and more often. (The rates are first guesses, for playtesting.)
export const ARRIVAL_GAG_ODDS = Object.freeze({ tapSec: 0.2, tap: 0.5, base: 0.08, longSec: 3, long: 0.5 });
let arrivalGagOverride = null;
/** For previews and captures: 0 never, 1 always; null returns to the held-aim odds. */
export function setLightningArrivalGagChance(chance) {
  arrivalGagOverride = chance === null || chance === undefined ? null : Math.max(0, Math.min(1, Number(chance) || 0));
}
/** The faceplant's odds for an arrival whose aim was held this long (seconds). */
export function lightningArrivalGagOdds(heldSec) {
  const held = Math.max(0, Number(heldSec) || 0), o = ARRIVAL_GAG_ODDS;
  if (held < o.tapSec) return o.tap;
  const t = Math.min(1, (held - o.tapSec) / (o.longSec - o.tapSec));
  return o.base + (o.long - o.base) * t * t * (3 - 2 * t);
}
/**
 * Whether this arrival is the faceplant. Never with Full Gale (its infusion owns the landing). Decided from the
 * player, the commit time and the held aim alone, so every client draws the same knight on his face.
 */
export function lightningArrivalGag(player, action) {
  if (((action?.oneHit?.tiers ?? action?.preparedTiers ?? {}).gale ?? 0) >= 2) return false;
  const commitAt = finite(action?.commitAt, 0);
  const chance = arrivalGagOverride ?? lightningArrivalGagOdds(commitAt - finite(action?.teleportHoldAt, commitAt));
  if (!(chance > 0)) return false;
  const seed = `${player?.id ?? ''}:${Math.round(commitAt * 1000)}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const draw = (h >>> 0) / 4294967296;
  if (!(draw < chance)) return false;
  // which way he lands: on his face or flat on his back, evenly (the hash's low bit, independent of the odds)
  return (h & 1) ? 'back' : 'face';
}

// The white-flag defeat (cosmetic): decided as he falls, the knight throws his sword down at once and stays on his
// feet, stubbornly en garde with a white flag until he respawns, already on the killfeed. He is the player's no
// longer: he faces and "fights" whichever enemy is next to him (RemotePlayers finds it: player.flagFoe), parrying
// its swings and swishing back. The flag deals nothing and blocks nothing; the server has no body for him at all.
// The odds are a first guess, for playtesting.
export const WHITE_FLAG = Object.freeze({
  chance: 0.2,
  // the authored draw (sword down at 0.55 s, flag up by 1.6 s) played at double speed: the sword hits the ground
  // about a quarter of a second after the blow, the flag is up well inside the usual three-second respawn
  draw: Object.freeze({ clip: 'Death_WhiteFlag_Combat', duration: 1.6, rate: 2 }),
  idle: Object.freeze({ clip: 'Death_WhiteFlag_Idle_Loop', duration: 1.2 }),
  parry: Object.freeze({ clip: 'Death_WhiteFlag_Guard_Parry', duration: 1.0 }),
  swish: Object.freeze({ clip: 'Death_WhiteFlag_Slash_Gag', duration: 1.1 }),
  // with a foe beside him: a swish, then a beat of en garde, over and over
  swishEvery: 2.2,
});
let whiteFlagOverride = null;
/** For previews and captures: 0 never, 1 always; null returns to WHITE_FLAG.chance. */
export function setWhiteFlagDefeatChance(chance) {
  whiteFlagOverride = chance === null || chance === undefined ? null : Math.max(0, Math.min(1, Number(chance) || 0));
}
/** Whether this defeat is the white flag: from the knight and the moment he fell, so every client agrees. */
export function whiteFlagDefeat(player, deathAt) {
  const chance = whiteFlagOverride ?? WHITE_FLAG.chance;
  if (!(chance > 0) || player?.restlessAsleep) return false;
  const seed = `flag:${player?.id ?? ''}:${Math.round(finite(deathAt, 0) * 1000)}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967296) < chance;
}
// the white-flag defeat's foe: the knight who felled him (player.defeatedBy) while still standing and in sight,
// else the nearest living enemy within reach (any other knight in a free-for-all; never his own team). He faces it
// either way; he only swishes and parries one within reach. Cosmetic only.
const WHITE_FLAG_REACH = 4, WHITE_FLAG_SIGHT = 12;
export function whiteFlagFoe(knight, players, serverNow) {
  const at = knight?.position;
  if (!at || !Array.isArray(players)) return null;
  const sized = (p) => {
    const dx = p.position.x - at.x, dz = p.position.z - at.z, distance = Math.hypot(dx, dz);
    const swingAt = p.attackActive && Number.isFinite(p.attackStartedAt) ? p.attackStartedAt
      : Number.isFinite(p.swordTechnique?.startedAt) ? p.swordTechnique.startedAt : null;
    // facing it: the knight's forward is (-sin yaw, -cos yaw)
    return { id: p.id, distance, near: distance <= WHITE_FLAG_REACH, yaw: Math.atan2(-dx, -dz),
      attackAge: swingAt === null ? null : serverNow - swingAt };
  };
  const live = (p) => p && p.id !== knight.id && p.alive && p.position;
  const victor = knight.defeatedBy ? players.find((p) => live(p) && p.id === knight.defeatedBy) : null;
  if (victor) { const f = sized(victor); if (f.distance <= WHITE_FLAG_SIGHT) return { ...f, victor: true }; }
  let best = null;
  for (const p of players) {
    if (!live(p) || (knight.team && p.team && p.team === knight.team)) continue;
    const f = sized(p);
    if (f.near && (!best || f.distance < best.distance)) best = f;
  }
  return best;
}
function whiteFlagPlan(player, age) {
  const fallback = { fallback: 'Death', fallbackTime: Math.max(0, age) };
  const { draw, idle, parry, swish } = WHITE_FLAG;
  const drawn = draw.duration / draw.rate;
  if (age < drawn) return { ...fixed(draw.clip, Math.max(0, age) * draw.rate), ...fallback, whiteFlag: 'draw' };
  const since = age - drawn, foe = player?.flagFoe;
  // a foe's swing under way within reach: the flag comes up to meet it
  const engaged = foe && foe.near !== false;
  if (engaged && Number.isFinite(foe.attackAge) && foe.attackAge >= 0 && foe.attackAge < parry.duration)
    return { ...fixed(parry.clip, foe.attackAge), ...fallback, whiteFlag: 'parry' };
  if (engaged) {
    const beat = since % WHITE_FLAG.swishEvery;
    if (beat < swish.duration) return { ...fixed(swish.clip, beat), ...fallback, whiteFlag: 'swish' };
  }
  return { ...fixed(idle.clip, since % idle.duration, true), ...fallback, whiteFlag: 'idle' };
}

/**
 * The same authored aerial cut runs from the first Gale wind-up frame to
 * the server-authoritative wave launch. The player never transitions from
 * a static airborne charge to a SECOND wind-up on commit.
 *
 * Ordinary Gale retains its existing interruptible startup and vortex time;
 * the authored cut (to its 1.1 s contact) is stretched across both as ONE continuous
 * motion. A Full-Lightning teleport instead enters the FINAL wind-up frames
 * immediately on arrival, ending exactly when its short aiming window ends.
 * The winding must never reach the actual cut before the server launches.
 */
const TELEPORT_AERIAL_LEAD = 0.35;
export function disasterAerialWindupTime(action, nowSec, { teleported = false } = {}) {
  const contact = DISASTER_CLIPS.aerial.contact;
  const commitAt = finite(action?.commitAt, nowSec);
  const launchAt = Math.max(commitAt + 1 / 60,
    finite(action?.oneHit?.waveAt, commitAt + (teleported ? ONE_HIT_RULES.postTeleportAimSec : ONE_HIT_AERIAL_DURATION)));
  let frame;
  if (teleported) {
    const window = launchAt - commitAt;
    // Use the LAST portion of the cut (its final .35 s: the end of the spin into the aim-lock), eased across the
    // whole aiming window, not two full rotations: however long the window, the arrival starts there.
    const authoredLead = Math.min(window, contact, TELEPORT_AERIAL_LEAD);
    const elapsed = Math.max(0, Math.min(window, nowSec - commitAt));
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
  if (teleported) {
    // (the gag plays from its own first frame: the fall IS its landing; the slam is joined where its blade lands)
    const gag = lightningArrivalGag(player, action);
    if (gag) return { ...authored(gag === 'back' ? DISASTER_CLIPS.arrivalGagBack : DISASTER_CLIPS.arrivalGag, elapsed, { blend: .04 }), ...follow };
    return { ...authored(DISASTER_CLIPS.arrival, DISASTER_CLIPS.arrival.contact + elapsed, { blend: .04 }), ...follow };
  }
  const entry = tiers.lightning >= 1 ? DISASTER_CLIPS.fast : DISASTER_CLIPS.ground;
  return { ...authored(entry, entry.contact + elapsed), ...follow };
}

// Animation clips share the action's authoritative clock. Enter is blended
// into the EXISTING 0.22 s Rigid interception and first 0.6 s Whirl, never
// inserted as extra startup. The supplied GLBs must be shipped separately.
const RIPOSTE_ENTER_CLIP_SEC=.1, RIPOSTE_GUARD_REJOIN_SEC=.133;
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

export function swordTechniqueAnimationPlan(action, serverNow, firstPerson=false, grounded=true, guardSeenAt=null) {
  if(!action)return null;
  const clipPrefix=firstPerson?'FP_':'';
  const age=Math.max(0,serverNow-(action.startedAt??serverNow));
  const key=action.initialStartedAt??action.startedAt;
  const began=action.initialStartedAt??action.startedAt??serverNow;
  const outOfGuard=Number.isFinite(guardSeenAt)&&began-guardSeenAt<=RIPOSTE_RECENT_GUARD_SEC&&began-guardSeenAt>=-.05;
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
      // The sword is already raised out of Guard. Blend into a held brace pose past the forearm roll,
      // then rejoin the contact-aligned clip clock before the late interception.
      if(outOfGuard&&!firstPerson){
        const time=riposteBraceClipTime(Math.max(age,RIPOSTE_GUARD_REJOIN_SEC))-RIPOSTE_ENTER_CLIP_SEC;
        return clip('Technique_RigidRiposte_Interception',time,{
          entrySec:Math.max(.10,RIPOSTE_GUARD_REJOIN_SEC-age),
          braceBlade:riposteBraceBlade(age),
        });
      }
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
  // Restless Day is an authoritative mode event. Only animation changes here:
  // world position, facing, ladder transport and movement speed remain server-owned.
  if (state === 'restless-sleep' && player.restlessAsleep) {
    const age = Math.max(0, serverNow - finite(player.restlessSleepAt, serverNow));
    const seated = player.restlessVariant === 1;
    const falling = seated ? 'Restless_Fall_Asleep_Seated_Nod' : 'Restless_Fall_Asleep_Standing_Slump';
    const fallDuration = seated ? 2.4 : 2.2;
    return age < fallDuration
      ? { ...fixed(falling, age), fallback: 'Idle' }
      : { ...fixed('Restless_Sleep_Breathing_Loop', age - fallDuration, true), fallback: 'Idle' };
  }
  if (player.restlessCarrying && !['dead', 'stagger'].includes(state)) {
    const velocity = player.velocity ?? {};
    const moving = Math.hypot(finite(velocity.x), finite(velocity.z)) > 0.12;
    return { ...fixed(moving ? 'Restless_Ladder_Carry_March' : 'Restless_Ladder_Carry_Idle', localTime, true), fallback: 'Idle' };
  }
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
    const cast = castPlan(player, serverNow);
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
    const attack = attackPlan(player, serverNow, { localTime });
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
    return onTheMove(player, castPlan(player, serverNow), serverNow, localTime);
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
    if (whiteFlagDefeat(player, deathAt)) return whiteFlagPlan(player, serverNow - deathAt);
    return fixed('Death', serverNow - deathAt);
  }

  // The guard stays raised but breathes: loop the hold section on the local clock.
  if (state === 'guard') return onTheMove(player, fixed('Guard', guardHoldTime(localTime)), serverNow, localTime);
  // the air pose follows the jump: take-off at the start of the clip, falling toward its end
  if (state === 'air') return { ...fixed('Air', airPhase(player.velocity?.y)), normalized: true };
  if (state === 'sprint') return { ...fixed('Sprint', localTime, true), fallback: 'Run', rate: strideRate(player, SPRINT.speed) };
  if (state === 'run') {
    const speed = Math.hypot(finite(player.velocity?.x), finite(player.velocity?.z));
    if (player.grounded !== false && !player.crouched && speed > 0.8 && speed <= WALK_REFERENCE_SPEED * 1.2) {
      return { ...fixed('Walk', localTime, true), fallback: 'Run', rate: strideRate(player, WALK_REFERENCE_SPEED) };
    }
    return { ...fixed('Run', localTime, true), rate: strideRate(player, MOVEMENT.runSpeed) };
  }
  return fixed('Idle', idleTime(localTime), true);
}

// A Guard or a cast on the move: the legs keep their gait (or the air's pose) under it, as a moving strike's do. The
// whole-body clip has its feet planted, and a guarding knight moves at the full running pace: played whole, those
// planted feet skated along under him. Standing, the clip keeps the whole body.
function onTheMove(player, upper, serverNow, localTime) {
  const moving = locomotionState(player);
  if (moving === 'idle') return upper;
  const locomotion = resolveSpellbladeAnimationPlan({ state: moving, player, serverNow, localTime });
  return { ...locomotion, layers: { locomotion, posture: upper, sword: upper, sorcery: upper }, moving: true };
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
  const carried = view?.combatPlayer?.restlessCarrying;
  if (carried) {
    const velocity = view.combatPlayer.velocity ?? {};
    const moving = Math.hypot(finite(velocity.x), finite(velocity.z)) > 0.12;
    return { ...fixed(moving ? 'FP_Ladder_Carry_March' : 'FP_Ladder_Carry_Idle', timeSec, true), fallback: 'Idle' };
  }
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
  if (pose.state === 'attack') return attackPlan(view, timeSec, { localTime: timeSec });
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
