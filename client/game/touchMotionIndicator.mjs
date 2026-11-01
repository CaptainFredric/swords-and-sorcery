// Pure UI interpretation: motion is confirmed by the authoritative game state,
// not by a thumb merely touching Sprint/Charge or by a queued input packet.
export function touchMotionIndicator(local, snapshot = null, { active = true, inspectionFlight = false } = {}) {
  if (!active || inspectionFlight || !local?.alive) return 'idle';
  if (local.operatingRamId) {
    const ram = snapshot?.soFistication;
    return ram?.id === local.operatingRamId && ram.operatorId === local.id &&
      ram.health > 0 && !ram.retired && ram.charging ? 'charging' : 'idle';
  }
  // No unrelated machine may paint the infantry Sprint indicator, even if a
  // stale local sprint flag survives for one network frame at a mount boundary.
  if (local.operatingBallistaId || local.operatingFightFlightId) return 'idle';
  return local.sprinting ? 'sprinting' : 'idle';
}

export const TOUCH_MOTION_LABELS = Object.freeze({
  idle: '',
  sprinting: 'SPRINTING',
  charging: 'CHARGING',
});
