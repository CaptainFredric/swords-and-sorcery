// Each slam's blade low point against the knight's own floor (his feet's level), its time and how far ahead of his
// feet it lands (the forward offset decides how far a slope can lift or drop the ground under it).
import { loadGlb, localPose, worldMatrices, apply } from '../lib/glbPose.mjs';
import { skinnedMeshes, skinnedHeights } from '../lib/glbSkin.mjs';
import { swordPoint } from '../lib/glbSkin.mjs';

const m = loadGlb(process.argv[2]);
const clips = ['Sunder_Strike', 'AllNatural_Ground_DualSpin_Slam', 'AllNatural_FastLightning_DualSpin_Slam', 'AllNatural_Lightning_Arrival_Slam',
  'AllNatural_Steel_Infusion_Slam', 'AllNatural_Full_Steel_Eruption_Slam'];
const meshes = skinnedMeshes(m);
const sp = swordPoint(m);
const floorAt = (w) => Math.min(...['foot.L', 'foot.R'].map((b) => apply(w[m.byName.get(b)], [0, 0, 0])[1]));
const idleFloor = Math.min(...Object.values(skinnedHeights(m, meshes, localPose(m, [{ clip: 'Idle', time: 0, weight: 1 }]), ['Boot.L', 'Boot.R'])).map(([lo]) => lo));
console.log('floor (Idle soles) y =', idleFloor.toFixed(3));
for (const clip of clips) {
  const c = m.clips.get(clip); if (!c) continue;
  let best = { y: Infinity };
  for (let f = 3; f <= Math.round(c.duration * 30) - 6; f += 1) {
    const layers = [{ clip, time: f / 30, weight: 1 }];
    const [lo] = skinnedHeights(m, meshes, localPose(m, layers), ['HeroSword']).HeroSword;
    if (lo < best.y) {
      const w = worldMatrices(m, localPose(m, layers));
      const tip = apply(w[sp.joint], sp.tip);
      best = { y: lo, f, t: f / 30, tip };
    }
  }
  console.log(`${clip.padEnd(40)} low ${((best.y - idleFloor) * 100).toFixed(1)} cm above the floor at f${best.f} (${best.t.toFixed(3)} s), tip ${Math.hypot(best.tip[0], best.tip[2]).toFixed(2)} m from his root`);
}
