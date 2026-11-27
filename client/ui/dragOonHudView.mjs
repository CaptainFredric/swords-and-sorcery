import { siegeSkillLabel } from './siegeSkillView.mjs';
import { keyLabel, registry } from '../settings/settingsRegistry.mjs';
import { DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';

export function dragOonHudView(local, snapshot, now, { bindings = registry.defaultBindings(), touch = false } = {}) {
  const fleet = Array.isArray(snapshot?.machines) ? snapshot.machines : [];
  const occupiedId = local?.operatingDragOonId || local?.aboardDragOonId;
  const d = (occupiedId ? fleet.find(m => m?.id === occupiedId) : null)
    || fleet.find(m => m?.kind === 'dragoon' && m.health > 0 && !m.retired)
    || snapshot?.dragOon;
  if (!local?.alive || !d || d.retired || d.health <= 0 || local.operatingBallistaId || local.operatingRamId || local.operatingFightFlightId) return null;
  if (d.team && local.team && local.team !== d.team) return null;

  const key = action => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : 'UNBOUND';

  // Approaching unmounted DRAG-OON: show board prompt (Operator or Passenger aperture)
  if (!local.operatingDragOonId && !local.aboardDragOonId) {
    if (local.dragOonTransition) {
      const rem = Math.max(0, (local.dragOonTransition.endsAt ?? now) - now).toFixed(1);
      return {
        title: 'DRAG-OON · BOARDING',
        status: `CLIMBING INTO ${local.dragOonTransition.role === 'operator' ? 'PILOT CABIN' : 'APERTURE STATION'} (${rem}s)…`,
        controls: '',
      };
    }
    const dist = Math.hypot((d.x ?? 0) - local.position.x, (d.z ?? 0) - local.position.z);
    if (dist > DRAG_OON_TUNING.crew.boardReachRadius + 0.5) return null;
    if (d.campFire?.sealed) {
      return { title: 'DRAG-OON', status: 'HATCHES SEALED · CAMP FIRE ACTIVE', controls: '' };
    }
    const roleHint = !d.operatorId ? 'Operate DRAG-OON' : 'Board Crew Aperture';
    return {
      title: 'DRAG-OON',
      status: touch ? `Tap MOUNT to ${roleHint}` : `[${key('interact')}] ${roleHint}`,
      controls: '',
    };
  }

  const paxCount = Array.isArray(d.passengers) ? d.passengers.filter(Boolean).length : 0;
  const cap = d.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity;
  const fuelCap = Math.round(d.effectiveFuelMax ?? d.fuelMax ?? 100);
  const heat = Math.round(d.heat ?? 0);
  const leapCd = Math.max(0, (d.leapReadyAt ?? 0) - now);
  const steamCd = Math.max(0, (d.steamReadyAt ?? 0) - now);
  const tiers = d.infusions?.tiers ?? {};
  const infList = Object.entries(tiers).filter(([, t]) => t > 0).map(([k, t]) => `${k.toUpperCase()} ${t === 2 ? 'II' : 'I'}`);

  const transitionTxt = local.dragOonTransition
    ? `EVACUATING (${Math.max(0, (local.dragOonTransition.endsAt ?? now) - now).toFixed(1)}s)` : null;

  // Passenger HUD
  if (local.aboardDragOonId) {
    return {
      title: `DRAG-OON · CREW STATION #${(local.dragOonStation ?? 0) + 1}`,
      pressure: d.heat ?? 0,
      pressureLabel: 'HEAT',
      status: [
        transitionTxt,
        `HULL ${Math.ceil(d.health)}/${d.maxHealth}`,
        `FUEL ${Math.round(d.fuel ?? 0)}/${fuelCap}`,
        heat > DRAG_OON_TUNING.crew.dangerHeatThreshold ? `HEAT DANGER (${heat})` : `HEAT ${heat}`,
        d.campFire?.sealed ? 'HATCHES SEALED · EXTERNAL CASTS LOCKED' : 'APERTURE OPEN',
        infList.length ? infList.join(' + ') : `CREW ${paxCount}/${cap}`,
      ].filter(Boolean).join(' · '),
      controls: touch
        ? 'SPELL: Fire from aperture · LEAVE: Evacuate'
        : `[${key('spell')}] Cast from Aperture · [${key('interact')}] Timed Evacuation`,
    };
  }

  // Operator HUD
  return {
    title: `DRAG-OON · ${Math.ceil(d.health)}/${d.maxHealth}`,
    pressure: d.heat ?? 0,
    pressureLabel: 'HEAT',
    status: [
      transitionTxt,
      `FUEL ${Math.round(d.fuel ?? 0)}/${fuelCap}`,
      heat > DRAG_OON_TUNING.crew.dangerHeatThreshold ? `OVERPRESSURE DANGER (${heat})` : `HEAT ${heat}`,
      siegeSkillLabel(d, now),
      leapCd > 0.05 ? `LEAP ${leapCd.toFixed(1)}s` : 'LEAP READY',
      steamCd > 0.05 ? `STEAM ${steamCd.toFixed(1)}s` : 'STEAM READY',
      infList.length ? `INFUSED: ${infList.join(' · ')}` : `CREW ${paxCount}/${cap}`,
    ].filter(Boolean).join(' · '),
    controls: touch
      ? 'Stick: Pivot & Drive · ATTACK: Spray · JUMP: Leap · GUARD: Steam · SKILL: Raze/Flight/Camp/Brim · LEAVE: Evacuate'
      : `A/D Pivot · [${key('attack')}] Spray · [${key('jump')}] Fuel’s the Limit · RMB Steam · [${key('siegeSkill')}] Skill · [${key('siegeView')}] Camera · [${key('interact')}] Evacuate`,
  };
}
