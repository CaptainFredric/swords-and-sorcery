// Visual-only flight sampling for the one authoritative All-Natural Disaster
// Windblade. Stay aligned with the shared simulation's 28 / 48 m/s speeds.
// Rendering does not change damage, range, or projectile collision.
export function windbladeSpeed(tiers={}) {
  return Number(tiers?.lightning??0)>0?48:28;
}

export function windbladeTrailSpan(dt,tiers={}) {
  const seconds=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
  // Do not paint an entire stale network interval as an infinite trail.
  return Math.min(2.5,windbladeSpeed(tiers)*seconds);
}

/**
 * Advance the single authoritative Windblade between packet arrivals. A
 * fixed 1/30 s ceiling left a visible stop/start step at ordinary network
 * rates, especially with 48 m/s Lightning. This bounded prediction follows
 * the SAME 3D direction and speed as collision; it cannot create hits.
 */
export function windbladePosition(wave,snapshotAt,now) {
  const point=wave?.position??{x:0,y:0,z:0};
  const dir=wave?.direction??{x:0,y:0,z:0};
  const elapsed=Number.isFinite(snapshotAt)&&Number.isFinite(now)
    ?Math.max(0,Math.min(.10,now-snapshotAt)):0;
  const distance=windbladeSpeed(wave?.tiers)*elapsed;
  return {
    x:point.x+(Number(dir.x)||0)*distance,
    y:point.y+(Number(dir.y)||0)*distance,
    z:point.z+(Number(dir.z)||0)*distance,
  };
}
