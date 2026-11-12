// Pure presentation limits for All-Natural Disaster's Frost contact bloom.
// Frost tier 1 already extends the decisive contact by 0.3 s in shared combat.
// The suspended fragments outlive that contact visually, but never add hits.
export function frostSuspensionProfile(tier, radius, density = 1) {
  if (!Number.isFinite(radius) || radius <= 0 || tier < 1) return null;
  const full = tier >= 2;
  const budget = Math.max(.45, Math.min(1, Number(density) || .45));
  return Object.freeze({
    full,
    radius,
    height: Math.min(2.45, radius * .64),
    shards: Math.max(1, Math.round((full ? 52 : 34) * budget)),
    mist: Math.max(1, Math.round((full ? 28 : 21) * budget)),
    contactSeconds: .3,
  });
}
