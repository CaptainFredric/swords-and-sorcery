// Castleward's real ground under a slam's blade: from every standable point on a 1.5 m grid and 16 headings, the ground
// height at the tip's reach (1.39 m: de8c8655's slams; 1.76 m: 8916d5bd's) minus the ground under the feet. The clip puts
// the blade at a fixed height over the feet's floor, so this difference is how far the blade floats (+) or is buried (-).
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';

const world = CASTLEWARD;
const reaches = [1.39, 1.76];
const out = Object.fromEntries(reaches.map((r) => [r, []]));
let points = 0;
for (let x = -120; x <= 120; x += 1.5) for (let z = -120; z <= 120; z += 1.5) {
  const y0 = surfaceHeightAt(x, z, 50, world);
  if (y0 === null || y0 === undefined || !Number.isFinite(y0)) continue;
  // standable open ground only: the feet's floor flat to 5 cm across a 0.6 m stance
  const near = [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].map(([dx, dz]) => surfaceHeightAt(x + dx, z + dz, y0 + 0.5, world));
  if (near.some((h) => h === null || Math.abs(h - y0) > 0.05)) continue;
  points += 1;
  for (let k = 0; k < 16; k += 1) {
    const yaw = k * Math.PI / 8, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const r of reaches) {
      const h = surfaceHeightAt(x + fx * r, z + fz * r, y0 + 1, world);
      if (h === null || !Number.isFinite(h)) continue;
      out[r].push(h - y0);
    }
  }
}
console.log(`standable points ${points}`);
for (const r of reaches) {
  const d = out[r].sort((a, b) => a - b), n = d.length;
  const q = (p) => (d[Math.min(n - 1, Math.floor(p * n))] * 100).toFixed(1);
  const over = (cm) => (100 * d.filter((v) => Math.abs(v) > cm / 100).length / n).toFixed(1);
  console.log(`reach ${r} m: ${n} samples; ground under the tip minus under the feet (cm): p01 ${q(0.01)} p05 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} p99 ${q(0.99)}; |diff| > 2 cm ${over(2)}%, > 5 cm ${over(5)}%, > 15 cm ${over(15)}%`);
}
