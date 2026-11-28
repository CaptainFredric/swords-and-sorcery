import { siegeSkillLabel } from './siegeSkillView.mjs';
import { keyLabel, registry } from '../settings/settingsRegistry.mjs';
import { DRAG_OON_ELEMENTS, DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';
import { elementForSpell } from '../../shared/src/oneHitInfusions.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SEAT_IDS = Object.freeze(['L1', 'R1', 'L2', 'R2']);

function playerElement(player) {
  if (!player?.spell) return null;
  if (player.spell === 'steel') return 'steel';
  return elementForSpell(player.spell) ?? null;
}

/**
 * Compact, authoritative view-model for DRAG-OON's consolidated mounted HUD deck:
 * - Hull integrity
 * - Fuel gauge with filled, empty-available, and hatched overheat-penalty segments
 * - Furnace heat split clearly between readable 0..100 operation and 100..220 overpressure + 110 crew danger mark
 * - 5-position spatial crew diagram (Operator center + L1/R1/L2/R2) doubling cleanly for Rite commitments
 * - Active elemental infusions (half/full tiers) and ability/Skill/Rite icons
 */
export function dragOonDeckView(local, snapshot, now = 0, { bindings = registry.defaultBindings(), touch = false } = {}) {
  const fleet = Array.isArray(snapshot?.machines) ? snapshot.machines : [];
  const occupiedId = local?.operatingDragOonId || local?.aboardDragOonId;
  const d = (occupiedId ? fleet.find(m => m?.id === occupiedId) : null)
    || fleet.find(m => m?.kind === 'dragoon' && m.health > 0 && !m.retired)
    || snapshot?.dragOon;
  if (!local?.alive || !d || d.retired || d.health <= 0 || d.mode === 'DESTROYED') return null;
  if (local.operatingBallistaId || local.operatingRamId || local.operatingFightFlightId) return null;
  if (d.team && local.team && local.team !== d.team) return null;

  const isOp = local.operatingDragOonId === d.id;
  const isPax = local.aboardDragOonId === d.id;
  if (!isOp && !isPax) return null;

  const key = (action) => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : 'UNBOUND';
  const playersById = new Map((snapshot?.players ?? []).map(p => [p.id, p]));

  // 1. Hull
  const hullMax = Math.max(1, d.maxHealth ?? DRAG_OON_TUNING.maxHealth);
  const hullHp = clamp(d.health ?? 0, 0, hullMax);

  // 2. Fuel (explicit filled vs available-empty vs hatched-disabled-penalty)
  const fuelMax = Math.max(1, d.fuelMax ?? DRAG_OON_TUNING.fuelMax);
  const effectiveCap = clamp(d.effectiveFuelMax ?? fuelMax, 0, fuelMax);
  const fuelVal = clamp(d.fuel ?? 0, 0, effectiveCap);
  const fuelFillPct = (fuelVal / fuelMax) * 100;
  const fuelDisabledPct = Math.max(0, ((fuelMax - effectiveCap) / fuelMax) * 100);
  const fuelEmptyAvailPct = Math.max(0, 100 - fuelFillPct - fuelDisabledPct);

  // 3. Furnace Heat: give 0..100 normal operation 64% of bar width so combat heat stays readable;
  // allocate right 36% distinctly to 100..220 Brimming overpressure with crew-danger tick at 110.
  const heatVal = clamp(d.heat ?? 0, 0, DRAG_OON_TUNING.overpressureHeatMax);
  const normalSpan = DRAG_OON_TUNING.heatMax; // 100
  const overSpan = DRAG_OON_TUNING.overpressureHeatMax - normalSpan; // 120
  const normalShare = 64;
  const overShare = 36;
  const normalFillPct = (Math.min(heatVal, normalSpan) / normalSpan) * normalShare;
  const overFillPct = heatVal > normalSpan ? ((heatVal - normalSpan) / overSpan) * overShare : 0;
  const crewDangerTickPct = normalShare + ((DRAG_OON_TUNING.crew.dangerHeatThreshold - normalSpan) / overSpan) * overShare;
  const overheated = heatVal > normalSpan || (d.overheatPenalty ?? 0) > 0.5;
  const heatDanger = heatVal > DRAG_OON_TUNING.crew.dangerHeatThreshold;

  // 4. 5-Position Spatial Crew + Rite Reuse
  const tiers = d.infusions?.tiers ?? {};
  const counts = d.infusions?.counts ?? {};
  const rs = d.riteStatus;
  const rite = d.rite;
  const riteRelevant = Boolean(rite?.active || (d.skill?.id === 'flightLikeHell' && ((tiers.gale ?? 0) >= 2 || (rs?.committedCount ?? 0) > 0)));
  const heatBurnActive = Boolean(heatDanger);

  const buildSeat = (slotId, seatIdx, playerId) => {
    const p = playerId ? playersById.get(playerId) : null;
    const chivalryReady = Boolean(p && p.ultimate === 'chivalry' && ((p.prowess ?? 0) >= 100 || snapshot?.mode === 'PRACTICE'));
    const committed = Boolean(p && d.riteCommitments?.[p.id]);
    return {
      slotId,
      seatIdx,
      occupied: Boolean(p),
      playerId: p?.id ?? null,
      name: p?.name ?? (slotId === 'OP' ? 'PILOT' : slotId),
      element: slotId === 'OP' ? null : playerElement(p),
      isSelf: p?.id === local.id,
      chivalryReady,
      committed,
      heatPulse: Boolean(p && heatBurnActive),
      takingTrauma: Boolean(p && (p.burn || heatBurnActive)),
    };
  };

  const cap = clamp(d.passengerCapacity ?? 4, 1, 4);
  const seats = {
    OP: buildSeat('OP', -1, d.operatorId),
    L1: cap >= 1 ? buildSeat('L1', 0, d.passengers?.[0] ?? null) : null,
    R1: cap >= 2 ? buildSeat('R1', 1, d.passengers?.[1] ?? null) : null,
    L2: cap >= 3 ? buildSeat('L2', 2, d.passengers?.[2] ?? null) : null,
    R2: cap >= 4 ? buildSeat('R2', 3, d.passengers?.[3] ?? null) : null,
  };

  const infusions = DRAG_OON_ELEMENTS.map((el) => ({
    element: el,
    tier: tiers[el] ?? 0,
    count: counts[el] ?? 0,
  })).filter(e => e.tier > 0);

  // 5. Abilities & Skills (uses bespoke icons + compact timers)
  const leapRem = Math.max(0, (d.leapReadyAt ?? 0) - now);
  const steamRem = Math.max(0, (d.steamReadyAt ?? 0) - now);
  const skillId = d.skill?.id ?? 'razeThePasture';
  const skillRem = Math.max(0, (d.skill?.readyAt ?? 0) - now);
  const skillActive = Boolean(
    d.skill?.phase === 'active' || d.raze?.phase || d.flightLikeHell?.active || d.campFire?.active || d.brimming?.active
  );
  const selfCommit = Boolean(d.riteCommitments?.[local.id]);

  const leaveKey = touch ? 'LEAVE' : key('interact');
  const castKey = touch ? 'CAST' : key('spell');
  const riteKey = touch ? 'ULT' : key('ultimate');
  const skillKey = touch ? 'SKILL' : key('siegeSkill');
  const jumpKey = touch ? 'LEAP' : key('jump');

  const transition = local.dragOonTransition
    ? {
      kind: local.dragOonTransition.kind,
      remaining: Math.max(0, (local.dragOonTransition.endsAt ?? now) - now),
    } : null;

  return {
    id: d.id,
    role: isOp ? 'operator' : 'passenger',
    stationIndex: isPax ? (local.dragOonStation ?? 0) : null,
    stationLabel: isPax ? (SEAT_IDS[local.dragOonStation ?? 0] ?? 'L1') : 'PILOT',
    sealed: Boolean(d.campFire?.sealed),
    hull: { value: hullHp, max: hullMax, pct: (hullHp / hullMax) * 100 },
    fuel: {
      value: fuelVal,
      effectiveMax: effectiveCap,
      max: fuelMax,
      fillPct: fuelFillPct,
      emptyAvailPct: fuelEmptyAvailPct,
      disabledPct: fuelDisabledPct,
      overheated: effectiveCap < fuelMax - 0.5,
    },
    heat: {
      value: heatVal,
      normalMax: normalSpan,
      overMax: DRAG_OON_TUNING.overpressureHeatMax,
      normalShare,
      overShare,
      normalFillPct,
      overFillPct,
      crewDangerTickPct,
      overheated,
      brimming: Boolean(d.brimming?.active || heatVal > normalSpan),
      danger: heatDanger,
    },
    seats,
    infusions,
    riteRelevant,
    rite: {
      active: Boolean(rite?.active),
      eligible: Boolean(rs?.eligible),
      committed: selfCommit,
      committedCount: rs?.committedCount ?? 0,
      participantCount: rs?.participantCount ?? 1,
      remaining: rite?.active ? Math.max(0, (rite.maxEndAt ?? now) - now) : 0,
      reason: rs?.reason ?? null,
      key: riteKey,
    },
    abilities: {
      spray: { icon: 'desolationSpray', key: touch ? 'FIRE' : 'LMB', active: Boolean(d.sprayHeld) },
      leap: { icon: 'fuelsTheLimit', key: jumpKey, remaining: leapRem, total: DRAG_OON_TUNING.leap.cooldownSec, active: d.leap?.phase === 'airborne' },
      steam: { icon: 'steamTheTeam', key: touch ? 'STEAM' : 'RMB', remaining: steamRem, total: DRAG_OON_TUNING.steam.cooldownSec },
      skill: {
        id: skillId,
        icon: skillId,
        label: siegeSkillLabel(d, now),
        key: skillKey,
        remaining: skillActive ? 0 : skillRem,
        total: skillId === 'flightLikeHell' ? 28 : skillId === 'brimmingWithPotential' ? 26 : skillId === 'campFire' ? 24 : 22,
        active: skillActive,
      },
    },
    passenger: isPax ? {
      stationLabel: SEAT_IDS[local.dragOonStation ?? 0] ?? 'L1',
      apertureOpen: !d.campFire?.sealed && !rite?.active,
      castKey,
      leaveKey,
    } : null,
    leaveKey,
    transition,
  };
}

export function dragOonHudView(local, snapshot, now, { bindings = registry.defaultBindings(), touch = false } = {}) {
  const fleet = Array.isArray(snapshot?.machines) ? snapshot.machines : [];
  const occupiedId = local?.operatingDragOonId || local?.aboardDragOonId;
  const d = (occupiedId ? fleet.find(m => m?.id === occupiedId) : null)
    || fleet.find(m => m?.kind === 'dragoon' && m.health > 0 && !m.retired)
    || snapshot?.dragOon;
  if (!local?.alive || !d || d.retired || d.health <= 0 || local.operatingBallistaId || local.operatingRamId || local.operatingFightFlightId) return null;
  if (d.team && local.team && local.team !== d.team) return null;

  const key = action => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : 'UNBOUND';

  // Approaching unmounted DRAG-OON: show compact board prompt (Operator or Passenger aperture)
  if (!local.operatingDragOonId && !local.aboardDragOonId) {
    if (local.dragOonTransition) {
      const rem = Math.max(0, (local.dragOonTransition.endsAt ?? now) - now).toFixed(1);
      return {
        title: 'DRAG-OON · BOARDING',
        status: `CLIMBING INTO ${local.dragOonTransition.role === 'operator' ? 'PILOT CABIN' : 'APERTURE'} (${rem}s)`,
        controls: '',
      };
    }
    const dist = Math.hypot((d.x ?? 0) - local.position.x, (d.z ?? 0) - local.position.z);
    if (dist > DRAG_OON_TUNING.crew.boardReachRadius + 0.5) return null;
    if (d.campFire?.sealed) {
      return { title: 'DRAG-OON', status: 'HATCHES SEALED · CAMP FIRE', controls: '' };
    }
    const roleHint = !d.operatorId ? 'Operate DRAG-OON' : 'Board Crew Aperture';
    return {
      title: 'DRAG-OON',
      status: touch ? `Tap MOUNT to ${roleHint}` : `[${key('interact')}] ${roleHint}`,
      controls: '',
    };
  }

  if (local.aboardDragOonId === d.id) {
    const stationNum = (local.dragOonStation ?? 0) + 1;
    const statusParts = [];
    if (local.dragOonTransition) {
      statusParts.push(`EVACUATING ${Math.max(0, (local.dragOonTransition.endsAt ?? now) - now).toFixed(1)}s`);
    } else if (d.campFire?.sealed) {
      statusParts.push('HATCHES SEALED · EXTERNAL CASTS LOCKED');
    } else {
      statusParts.push(`FUEL ${Math.round(d.fuel ?? 0)}/${Math.round(d.effectiveFuelMax ?? DRAG_OON_TUNING.fuelMax)}`);
      if ((d.heat ?? 0) > DRAG_OON_TUNING.crew.dangerHeatThreshold) statusParts.push('OVERPRESSURE DANGER');
    }
    if (d.rite?.active) {
      statusParts.push('RITE ASCENDING');
    } else if (d.riteStatus?.eligible) {
      statusParts.push(`RITE READY (${d.riteStatus.committedCount}/${d.riteStatus.participantCount})`);
    }
    return {
      title: `DRAG-OON · CREW STATION #${stationNum}`,
      pressure: d.heat ?? 0,
      pressureLabel: 'HEAT',
      status: statusParts.join(' · '),
      controls: touch ? '[CAST] Cast from Aperture · [LEAVE] Evacuate' : `[${key('spell')}] Cast from Aperture · [${key('interact')}] Evacuate`,
    };
  }

  const fuelCap = Math.round(d.effectiveFuelMax ?? DRAG_OON_TUNING.fuelMax);
  const heatVal = Math.round(d.heat ?? 0);
  const tierParts = DRAG_OON_ELEMENTS
    .map((el) => {
      const t = d.infusions?.tiers?.[el] ?? 0;
      return t > 0 ? `${el.toUpperCase()} ${t >= 2 ? 'II' : 'I'}` : null;
    })
    .filter(Boolean);
  const statusParts = [`FUEL ${Math.round(d.fuel ?? 0)}/${fuelCap}`];
  if (heatVal > DRAG_OON_TUNING.crew.dangerHeatThreshold) statusParts.push('OVERPRESSURE DANGER');
  else statusParts.push(`HEAT ${heatVal}`);
  if (tierParts.length > 0) statusParts.push(`INFUSED: ${tierParts.join(' · ')}`);
  if (d.rite?.active) {
    statusParts.push(`RITE ACTIVE (${Math.max(0, (d.rite.maxEndAt ?? now) - now).toFixed(1)}s)`);
  } else if (d.riteStatus?.eligible) {
    statusParts.push(`RITE READY (${d.riteStatus.committedCount}/${d.riteStatus.participantCount})`);
  } else if ((d.riteStatus?.committedCount ?? 0) > 0) {
    statusParts.push(`RITE ${d.riteStatus.committedCount}/${d.riteStatus.participantCount}`);
  }
  const skillTxt = siegeSkillLabel(d, now);
  if (skillTxt) statusParts.push(skillTxt);

  return {
    title: `DRAG-OON · ${Math.ceil(d.health)}/${d.maxHealth}`,
    pressure: d.heat ?? 0,
    pressureLabel: 'HEAT',
    status: local.dragOonTransition
      ? `EVACUATING ${Math.max(0, (local.dragOonTransition.endsAt ?? now) - now).toFixed(1)}s`
      : statusParts.join(' · '),
    controls: '',
  };
}
