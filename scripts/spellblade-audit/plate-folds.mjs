// Which clips fold or stretch the right gauntlet's plates past a limit, and where.
import { loadGlb } from '../lib/glbPose.mjs';
import { gauntletPlates } from '../lib/gauntletPlates.mjs';

const m = loadGlb(process.argv[2]);
const lo = Number(process.argv[3] ?? 0.7), hi = Number(process.argv[4] ?? 1.25);
const measure = gauntletPlates(m, 'R');
const rows = [];
for (const [clip, c] of m.clips) {
  let min = Infinity, max = -Infinity, at = 0, bad = 0, n = 0;
  for (let f = 0; f <= Math.round(c.duration * 30); f += 1) {
    const [a, b] = measure([{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]);
    n += 1; if (a < lo || b > hi) bad += 1;
    if (a < min) { min = a; at = f; }
    max = Math.max(max, b);
  }
  if (min < lo || max > hi) rows.push(`${clip.padEnd(40)} min ${min.toFixed(2)} @f${at}  max ${max.toFixed(2)}  frames out of range ${bad}/${n}`);
}
console.log(rows.length ? rows.join('\n') : `every clip within [${lo}, ${hi}]`);
