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
