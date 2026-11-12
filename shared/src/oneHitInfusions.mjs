// One Hit of Wonders: server-owned, spell-use-based elemental progression.
// This module has no visual dependencies; demos and Practice presets cannot award combat stages.
import { oneHitDecisiveDamage, oneHitAttackForm, oneHitTeleportReach } from './oneHitOfWondersRules.mjs';

export const ONE_HIT_ELEMENTS = Object.freeze(['fire', 'frost', 'gale', 'lightning', 'steel']);
export const ONE_HIT_BASE_DAMAGE = 46;
export const ONE_HIT_GROUND_RADIUS = 3.4;
export const ONE_HIT_AERIAL_DURATION = 0.85;
export const ONE_HIT_SHAKEN_SECONDS = 3;
// Shocking Conduct, Blustered and every ground field run down over the same four seconds.
export const ONE_HIT_STATUS_SECONDS = 4;

export const emptyInfusions = () => ({ fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 });
export const normalizeInfusions = (stages = {}) => Object.fromEntries(
  ONE_HIT_ELEMENTS.map(element => [element, Math.max(0, Math.min(2, Math.trunc(Number(stages?.[element]) || 0)))]));
export const elementForSpell = spell => ({
  fireball: 'fire', coreflagration: 'fire', vortexFire: 'fire', vortexBlaze: 'fire',
  frostfire: 'frost', gale: 'gale', line_of_conduct: 'lightning',
})[spell] ?? null;

// Each victim and caster can earn at most one stage from a given actual spell use.
// The key is assigned by the authoritative projectile/gust/line, NEVER by the client.
export function creditOneHitEncounter(player, element, spellUseKey) {
  if (!player || !ONE_HIT_ELEMENTS.includes(element) || !spellUseKey) return false;
  player.oneHitInfusions = normalizeInfusions(player.oneHitInfusions);
  if (player.oneHitInfusions[element] >= 2) return false;
  player.oneHitSeenUses ??= {};
  const seen = player.oneHitSeenUses[element] ??= [];
  if (seen.includes(String(spellUseKey))) return false;
  seen.push(String(spellUseKey));
  // Only the last two distinct uses are relevant to a two-stage track.
  if (seen.length > 2) seen.shift();
  player.oneHitInfusions[element] += 1;
  return true;
}

export function oneHitCommit(player) {
  // Manual tiers affect at least the next cast, even when their "retain between
  // casts" switch is OFF. That switch only governs what happens after commit.
  const stages = normalizeInfusions(player.practiceOneHit?.stages ?? player.oneHitInfusions);
  if (!player.practiceOneHit?.enabled) {
    player.oneHitInfusions = emptyInfusions();
    player.oneHitSeenUses = {};
    player.practiceOneHit = null;
  }
  return stages;
}

export function oneHitForm(grounded, stages) {
  return oneHitAttackForm({ grounded: Boolean(grounded), galeTier: stages.gale });
}

export function oneHitDamage(stages, base = ONE_HIT_BASE_DAMAGE) {
  return oneHitDecisiveDamage(base, stages);
}

export function shakenSprintFactor(shaken, nowSec) {
  if (!shaken) return 1;
  const duration = ONE_HIT_SHAKEN_SECONDS;
  const progress = Math.max(0, Math.min(1, (nowSec - shaken.at) / duration));
  const severity = Math.max(0, Math.min(1, shaken.severity ?? 1));
  return Math.min(1, 1 - severity * (1 - progress));
}

export function applyOneHitShaken(target, nowSec, quality = 1) {
  const severity = Math.max(0.45, Math.min(1, quality));
  if (!target.shaken || shakenSprintFactor(target.shaken, nowSec) >= 1 || severity >= (target.shaken.severity ?? 0)) {
    target.shaken = { at: nowSec, severity };
  }
}

export function oneHitBacklashRemaining(status, nowSec) {
  if (!status) return 0;
  const fraction = Math.max(0, Math.min(1, 1 - (nowSec - status.at) / ONE_HIT_STATUS_SECONDS));
  return Math.max(0, status.initial * fraction);
}

export function oneHitTeleportDistance(holdSec) {
  return oneHitTeleportReach(Math.max(0, holdSec));
}

/** Half/Full Lightning's genuinely steerable charging interval.
 * The cast still owns the hands, not the feet or the camera. The server and
 * local prediction share this decision so charging cannot rubber-band.
 */
export function oneHitChargingLightning(player,nowSec){
  const state=player?.ultimateState;
  if(state?.id!=='one_hit_of_wonders'||state.phase!=='startup')return false;
  if((state.preparedTiers?.lightning??0)<1)return false;
  if(Number.isFinite(state.teleportHoldAt))return !state.teleportReleased;
  return Number.isFinite(state.partialLightningHoldAt)&&
    !state.partialLightningReleased&&nowSec<(state.commitAt??-Infinity);
}

/** Held Lightning owns the caster's stance but never their view. This
 * intent is shared by authoritative movement and prediction. Digital movement
 * remains possible, just at deliberate aiming pace; no Sprint, Dash or Jump. */
export function oneHitChargeIntent(input = {}) {
  const forward=Math.max(-1,Math.min(1,Number(input.forward)||0));
  const right=Math.max(-1,Math.min(1,Number(input.right)||0));
  // Normalize BEFORE imposing the charging pace. Otherwise WASD diagonals
  // reach ~1.41 times the straight speed despite both being held Lightning.
  const normal=Math.max(1,Math.hypot(forward,right));
  return { ...input,
    forward:forward/normal*.56,
    right:right/normal*.56,
    sprint:false, jump:false, dash:false, crouch:false };
}

/** A bounded Gale suspension, shared by server movement and prediction.
 * Ordinary aerial preparation and the brief post-teleport aim hold altitude;
 * held Lightning charge always descends under controlled gravity. */
export function oneHitGlide(player,speed=7.5){
  const state=player?.ultimateState;
  if(player?.grounded||state?.id!=='one_hit_of_wonders')return null;
  const tiers=state.preparedTiers??state.oneHit?.tiers??player.oneHitInfusions;
  if(tiers?.gale!==2)return null;
  if(state.phase==='startup') {
    // A held Lightning aim never acts as a hovering sanctuary. Keep a
    // steerable, controlled descent even for the indefinitely held Full tier.
    if(Number.isFinite(state.teleportHoldAt))
      return {speed:speed*.62,fallGravity:.65,maxFall:4.2};
    if(Number.isFinite(state.partialLightningHoldAt))
      return {speed:speed*.62,fallGravity:.65,maxFall:4.2};
    // Ordinary (non-Lightning) aerial windup is a finite 0.85 s pause.
    return {speed,fallGravity:0,maxFall:0};
  }
  if(state.phase==='active'&&state.oneHit?.form==='aerial'&&!state.oneHit.waveLaunched)
    return {speed,fallGravity:0,maxFall:0};
  return null;
}

/** Full Steel's temporary 1-HP floor. Never store prevented lethal damage.
 * Held Full-Lightning teleport aim offers NO protection; the finite windup,
 * committed strike and unfinished Gale wave do. The protection is over at
 * wave resolution or ordinary Ultimate expiry, but the player remains alive
 * at the HP they actually retained.
 * This pure check drives BOTH authoritative damage and the health-bar sliver.
 */
export function oneHitSteelFloorActive(player, nowSec) {
  if(!player?.alive)return false;
  const state=player.ultimateState;
  if(state?.id!=='one_hit_of_wonders')return false;
  const tiers=state.oneHit?.tiers??state.preparedTiers;
  if((tiers?.steel??0)<2)return false;
  if(state.phase==='startup')
    return !Number.isFinite(state.teleportHoldAt)&&Number.isFinite(state.commitAt)&&
      nowSec<state.commitAt+1e-9 &&
      // A held Half-Lightning delay is never extra immortality:
      // Full Steel's bracing protection ends at the normal finite windup.
      (!Number.isFinite(state.partialLightningHoldAt)||
        nowSec<state.startedAt+0.92);
  if(state.phase==='active')
    return Number.isFinite(state.until)&&nowSec<state.until &&
      !(state.oneHit?.awaitingWave&&state.oneHit.waveResolved);
  return false;
}

export const ONE_HIT_PRESETS = Object.freeze({
  simple: emptyInfusions(),
  partial: Object.freeze({ fire: 1, frost: 1, gale: 1, lightning: 1, steel: 1 }),
  full: Object.freeze({ fire: 2, frost: 2, gale: 2, lightning: 2, steel: 2 }),
  gale: Object.freeze({ fire: 0, frost: 0, gale: 2, lightning: 0, steel: 0 }),
  'gale-lightning': Object.freeze({ fire: 0, frost: 0, gale: 2, lightning: 2, steel: 0 }),
  steel: Object.freeze({ fire: 0, frost: 0, gale: 0, lightning: 0, steel: 2 }),
});
