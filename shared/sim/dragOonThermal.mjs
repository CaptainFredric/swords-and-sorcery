// Shared Fuel, Heat, Overpressure, and Overheating thermal state machine for DRAG-OON.
// Represents current fuel, nominal fuel cap, overheat capacity penalty, accumulated heat,
// Frostfire thermal regulation, Steam partial venting, and Full Fire retained overpressure heat
// cleanly within one coherent model without redundant disconnected meters.
import { DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createDragOonThermal() {
  return {
    fuel: DRAG_OON_TUNING.fuelMax,
    fuelMax: DRAG_OON_TUNING.fuelMax,
    overheatPenalty: 0,
    heat: 0,
    lastFuelSpendAt: -Infinity,
    retainedFireHeatFactor: 1,
    retainedOverpressureHeat: false,
  };
}

export function effectiveFuelCapacity(m) {
  const baseMax = Number.isFinite(m?.fuelMax) ? m.fuelMax : DRAG_OON_TUNING.fuelMax;
  const penalty = Number.isFinite(m?.overheatPenalty) ? Math.max(0, m.overheatPenalty) : 0;
  return Math.max(DRAG_OON_TUNING.minEffectiveFuelCap, baseMax - penalty);
}

/** Ensures current fuel never exceeds effective capacity without creating free fuel. */
export function clampDragOonFuel(m) {
  if (!m) return 0;
  const cap = effectiveFuelCapacity(m);
  m.fuel = clamp(Number.isFinite(m.fuel) ? m.fuel : 0, 0, cap);
  return m.fuel;
}

export function spendDragOonFuel(m, amount) {
  if (!m || !(amount > 0)) return true;
  if ((m.fuel ?? 0) + 1e-8 < amount) return false;
  m.fuel = Math.max(0, m.fuel - amount);
  return true;
}

export function addDragOonHeat(m, rawDelta, frostTier = 0) {
  if (!m || !(rawDelta > 0)) return m?.heat ?? 0;
  const scale = DRAG_OON_TUNING.frostHeatGainScale[clamp(frostTier | 0, 0, 2)] ?? 1;
  m.heat = clamp((m.heat ?? 0) + rawDelta * scale, 0, DRAG_OON_TUNING.overpressureHeatMax);
  return m.heat;
}

export function addDragOonOverheatPenalty(m, rawDelta) {
  if (!m || !(rawDelta > 0)) return effectiveFuelCapacity(m);
  m.overheatPenalty = clamp(
    (m.overheatPenalty ?? 0) + rawDelta,
    0,
    DRAG_OON_TUNING.overheatPenaltyMax
  );
  // Reducing effective capacity immediately caps current fuel, never granting free fuel on recovery.
  return clampDragOonFuel(m);
}

/**
 * Partially vents heat and eases overheating restrictions during Steam the Team.
 * Respects finite ventilation capacity at extreme overpressure and never generates free fuel.
 */
export function ventDragOonHeat(m) {
  if (!m) return { ventedHeat: 0, remainingHeat: 0, heatFraction: 0 };
  const before = Math.max(0, m.heat ?? 0);
  const heatFraction = clamp(before / DRAG_OON_TUNING.heatMax, 0, DRAG_OON_TUNING.overpressureHeatMax / DRAG_OON_TUNING.heatMax);
  const vented = Math.min(before, DRAG_OON_TUNING.steam.ventHeatCapacity);
  m.heat = Math.max(0, before - vented);
  if (m.heat <= DRAG_OON_TUNING.heatMax) {
    m.retainedOverpressureHeat = false;
    m.retainedFireHeatFactor = 1;
  }
  const beforePenalty = Math.max(0, m.overheatPenalty ?? 0);
  const relief = Math.min(beforePenalty, DRAG_OON_TUNING.steam.partialOverheatRelief);
  m.overheatPenalty = Math.max(0, beforePenalty - relief);
  clampDragOonFuel(m);
  return {
    ventedHeat: vented,
    remainingHeat: m.heat,
    overheatRelief: relief,
    heatFraction,
  };
}

/**
 * Advances fuel regeneration, thermal dissipation, Full Fire overpressure retention,
 * and overheating fuel-capacity recovery cleanly each simulation tick.
 */
export function stepDragOonThermal(m, dt, now, {
  frostTier = 0,
  fireTier = 0,
  spendingFuel = false,
  brimmingActive = false,
  flightActive = false,
  sprayActive = false,
} = {}) {
  if (!m || !(dt > 0)) return;
  const t = DRAG_OON_TUNING;
  const fTier = clamp(frostTier | 0, 0, 2);

  // Mark retained slow-cooling property on accumulated overpressure heat when >=2 Fire is active.
  if (brimmingActive && (m.heat ?? 0) > t.heatMax && fireTier >= 2) {
    m.retainedOverpressureHeat = true;
    m.retainedFireHeatFactor = t.brimming.fullFireCooldownDecayMult;
  }

  // Fuel cap recovery from overheating recedes gradually; recovering max cap NEVER adds free fuel.
  if (!flightActive && (m.overheatPenalty ?? 0) > 0) {
    const recoveryScale = t.frostCoolingScale[fTier] ?? 1;
    m.overheatPenalty = Math.max(0, m.overheatPenalty - t.overheatPenaltyDecayPerSec * recoveryScale * dt);
  }

  const effectiveCap = effectiveFuelCapacity(m);

  // Fuel replenishment after delay when not actively expending fuel.
  if (spendingFuel) {
    m.lastFuelSpendAt = now;
  } else if (now - (m.lastFuelSpendAt ?? -Infinity) >= t.fuelRegenDelaySec) {
    m.fuel = Math.min(effectiveCap, (m.fuel ?? 0) + t.fuelRegenPerSec * dt);
  }
  clampDragOonFuel(m);

  // Passive heat dissipation when not accumulating heat.
  const generatingHeat = sprayActive || brimmingActive || flightActive;
  if (!generatingHeat && (m.heat ?? 0) > 0) {
    const coolScale = t.frostCoolingScale[fTier] ?? 1;
    const retainedMult = m.retainedOverpressureHeat && (m.heat ?? 0) > t.heatMax
      ? (m.retainedFireHeatFactor > 0 && m.retainedFireHeatFactor < 1
        ? m.retainedFireHeatFactor
        : t.brimming.fullFireCooldownDecayMult)
      : 1;
    m.heat = Math.max(0, m.heat - t.coolIdlePerSec * coolScale * retainedMult * dt);
    if (m.heat <= t.heatMax) {
      // Once retained overpressure heat dissipates back into ordinary operating limits, clear buff.
      m.retainedOverpressureHeat = false;
      m.retainedFireHeatFactor = 1;
    }
  }
}
