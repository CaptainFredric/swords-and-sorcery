// One Hit of Wonders: server-owned, spell-use-based elemental progression.
// This module has no visual dependencies; demos and Practice presets cannot award combat stages.
import { oneHitDecisiveDamage, oneHitAttackForm, oneHitTeleportReach } from './oneHitOfWondersRules.mjs';

export const ONE_HIT_ELEMENTS = Object.freeze(['fire', 'frost', 'gale', 'lightning']);
export const ONE_HIT_BASE_DAMAGE = 48;
export const ONE_HIT_GROUND_RADIUS = 3.4;
export const ONE_HIT_AERIAL_DURATION = 0.85;
export const ONE_HIT_SHAKEN_SECONDS = 3;

export const emptyInfusions = () => ({ fire: 0, frost: 0, gale: 0, lightning: 0 });
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
  const fraction = Math.max(0, Math.min(1, 1 - (nowSec - status.at) / 4));
  return Math.max(0, status.initial * fraction);
}

export function oneHitTeleportDistance(holdSec) {
  return oneHitTeleportReach(Math.max(0, holdSec));
}

/** Slow but never upward-propelled descent during a committed Full-Gale aerial
 * windup, vortex, or Full-Gale/Lightning held teleport charge. Both host and
 * prediction use the same movement modifier. */
export function oneHitGlide(player, speed=7.5) {
  const state=player?.ultimateState;
  if(player?.grounded || state?.id!=='one_hit_of_wonders')return null;
  const tiers=state.preparedTiers??state.oneHit?.tiers??player.oneHitInfusions;
  if(tiers?.gale!==2)return null;
  if(state.phase==='startup' ||
     (state.phase==='active' && state.oneHit?.form==='aerial' && !state.oneHit.hit))
    return {speed,fallGravity:.16,maxFall:1.8};
  return null;
}

export const ONE_HIT_PRESETS = Object.freeze({
  simple: emptyInfusions(),
  partial: Object.freeze({ fire: 1, frost: 1, gale: 1, lightning: 1 }),
  full: Object.freeze({ fire: 2, frost: 2, gale: 2, lightning: 2 }),
  gale: Object.freeze({ fire: 0, frost: 0, gale: 2, lightning: 0 }),
  'gale-lightning': Object.freeze({ fire: 0, frost: 0, gale: 2, lightning: 2 }),
});
