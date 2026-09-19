function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function sampleTrailSegment(from, to, options = {}) {
  const spacing = Math.max(0.001, finite(options.spacing, 0.2));
  const maxSamples = Math.max(0, Math.floor(finite(options.maxSamples, 8)));
  const rawCarry = finite(options.carry, 0);
  const carry = ((rawCarry % spacing) + spacing) % spacing;

  const dx = finite(to?.x) - finite(from?.x);
  const dy = finite(to?.y) - finite(from?.y);
  const dz = finite(to?.z) - finite(from?.z);
  const distance = Math.hypot(dx, dy, dz);

  if (distance <= 1e-9) return { points: [], carry };

  const total = carry + distance;
  const possibleSamples = Math.floor((total + 1e-9) / spacing);
  const sampleCount = Math.min(possibleSamples, maxSamples);
  const firstDistance = spacing - carry;
  const invDistance = 1 / distance;
  const points = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const travel = firstDistance + i * spacing;
    const t = Math.max(0, Math.min(1, travel * invDistance));
    points.push({
      x: finite(from?.x) + dx * t,
      y: finite(from?.y) + dy * t,
      z: finite(from?.z) + dz * t,
    });
  }

  let nextCarry = total - Math.floor((total + 1e-9) / spacing) * spacing;
  if (Math.abs(nextCarry) < 1e-9 || Math.abs(nextCarry - spacing) < 1e-9) nextCarry = 0;

  return { points, carry: nextCarry };
}

export function transientScale(age, maxLife, expand = 0, shrink = false) {
  const lifetime = Math.max(0.001, finite(maxLife, 0.2));
  const elapsed = Math.max(0, Math.min(lifetime, finite(age, 0)));
  const growth = 1 + Math.max(0, finite(expand, 0)) * elapsed;
  const remaining = 1 - elapsed / lifetime;
  return growth * (shrink ? Math.max(0.05, remaining) : 1);
}
