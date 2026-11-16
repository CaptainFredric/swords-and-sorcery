// Both gauntlets through every frame of every clip, and through the crossfades the game makes between clips:
// plate stretch and fold, how far any two neighbouring pieces come apart beyond their bind distance (a plate coming
// away, a new opening at the wrist), and plate vertices inside the sword's blade.
//   node scripts/spellblade-audit/gauntlet-integrity.mjs <model.glb> [--all] [--json out.json]
// (by default the clips the game plays, with the motion sidecar's techniques composed in as the client composes them)
import { writeFileSync, readFileSync } from 'node:fs';
import { loadGlb, composeMotion } from '../lib/glbPose.mjs';
import { playedClips } from './played-clips.mjs';
import { gauntletIntegrity } from '../lib/gauntletIntegrity.mjs';

// The crossfades the third-person animator makes (swordChainPresentation.mjs STRIKE_CLIPS/BRIDGES, the stance and
// locomotion states): [from, its time as the fade begins, to, its time as the fade begins]. Each is sampled across
// the fade, both clips running on, at weights 0.1 to 0.9.
export const TRANSITIONS = [
  ['Idle', 0.9, 'Slash_1', 0], ['Slash_1', 0.467, 'Slash_1_to_2', 0], ['Slash_1_to_2', 0.25, 'Slash_2', 0.167],
  ['Slash_2', 0.467, 'Slash_2_to_3', 0], ['Slash_2_to_3', 0.27, 'Slash_3', 0.167], ['Slash_2', 0.467, 'Slash_2_to_1', 0],
  ['Slash_2_to_1', 0.25, 'Slash_1', 0.167], ['Slash_1', 0.467, 'Slash_1_to_3', 0], ['Slash_1_to_3', 0.29, 'Slash_3', 0.167],
  ['Slash_3', 0.6, 'Slash_2', 0], ['Slash_3', 0.55, 'Idle', 0], ['Slash_1', 0.6, 'Idle', 0], ['Slash_2', 0.6, 'Idle', 0],
  ['Idle', 0.5, 'Guard', 0], ['Guard', 1.0, 'Idle', 0], ['Guard', 1.0, 'Slash_1', 0], ['Slash_1', 0.5, 'Guard_From_Cut', 0],
  ['Guard_From_Cut', 0.25, 'Guard', 0.3], ['Guard', 0.8, 'Block_Impact', 0], ['Block_Impact', 0.3, 'Guard', 0.5],
  ['Run', 0.3, 'Slash_1', 0], ['Sprint', 0.3, 'Slash_1', 0], ['Idle', 0.5, 'Run', 0], ['Run', 0.3, 'Idle', 0],
  ['Run', 0.3, 'Sprint', 0], ['Sprint', 0.3, 'Brake_Stop', 0], ['Idle', 0.5, 'Technique_RigidRiposte_Enter', 0], ['Idle', 0.5, 'Technique_Whirl_Revolution', 0], ['Guard', 1.0, 'Technique_RigidRiposte_Enter', 0], ['Idle', 0.5, 'Cast', 0], ['Cast', 0.8, 'Idle', 0],
  ['Idle', 0.5, 'Dash', 0], ['Dash', 0.3, 'Idle', 0], ['Stagger', 0.5, 'Idle', 0], ['Idle', 0.5, 'Sunder_Strike', 0],
];

export function auditGauntlets(model, { sides = ['R', 'L'], step = 1 / 30, clips = null } = {}) {
  const out = {};
  for (const side of sides) {
    const g = gauntletIntegrity(model, side);
    const r = { pieces: g.pieces, plateEdges: g.plateEdges, neighbours: g.neighbours, plate: [Infinity, -Infinity], worstStretch: null, worstFold: null,
      gaps: {}, inBlade: 0, worstBlade: null, frames: 0 };
    const take = (label, layers) => {
      const m = g.measure(layers);
      r.frames += 1;
      if (m.plate[1] > r.plate[1]) { r.plate[1] = m.plate[1]; r.worstStretch = label; }
      if (m.plate[0] < r.plate[0]) { r.plate[0] = m.plate[0]; r.worstFold = label; }
      for (const [k, gap] of Object.entries(m.gaps)) if (!(k in r.gaps) || gap > r.gaps[k].gap) r.gaps[k] = { gap, at: label };
      if (m.inBlade > r.inBlade) { r.inBlade = m.inBlade; r.worstBlade = label; }
    };
    for (const [clip, c] of model.clips) if (!clips || clips.includes(clip)) for (let t = 0; t <= c.duration + 1e-9; t += step) take(`${clip}@${t.toFixed(3)}`, [{ clip, time: Math.min(c.duration, t), weight: 1 }]);
    for (const [a, ta, b, tb] of TRANSITIONS) {
      if (!model.clips.has(a) || !model.clips.has(b) || (clips && !(clips.includes(a) && clips.includes(b)))) continue;
      for (let w = 0.1; w < 0.95; w += 0.1) {
        const dt = w * 0.12; // a fade of about 0.12 s, both clips running on
        take(`${a}->${b} ${w.toFixed(1)}`, [{ clip: a, time: Math.min(model.clips.get(a).duration, ta + dt), weight: 1 - w }, { clip: b, time: Math.min(model.clips.get(b).duration, tb + dt), weight: w }]);
      }
    }
    const gaps = Object.entries(r.gaps).sort((x, y) => y[1].gap - x[1].gap);
    r.worstGaps = gaps.slice(0, 6).map(([k, v]) => ({ pieces: g.describe(k), gapCm: +(v.gap * 100).toFixed(2), at: v.at }));
    r.gapsOver = { '1cm': gaps.filter(([, v]) => v.gap > 0.01).length, '2cm': gaps.filter(([, v]) => v.gap > 0.02).length };
    r.gapByPair = Object.fromEntries(gaps.map(([k, v]) => [k, +(v.gap * 100).toFixed(2)]));
    r.blade = g.blade;
    delete r.gaps;
    out[side] = r;
  }
  return out;
}

/**
 * The model as the game plays it: the motion sidecar laid over it as the client lays it (the manifest's
 * motionOverrides), and the clips the game plays: those the client names, the sidecar's techniques, and the
 * crossfades among them. With `all`, every clip, archive included.
 */
export function gameModel(path, { all = false } = {}) {
  const dir = new URL('../../client/assets/characters/spellblade/', import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));
  const model = loadGlb(path);
  const own = new Set(model.clips.keys());
  composeMotion(model, `${dir}spellblade-motion.glb`, { overrides: manifest.thirdPerson.motionOverrides ?? ['Slash_1'] });
  const sidecar = [...model.clips.keys()].filter((c) => !own.has(c));
  if (all) return [model, {}];
  const { played } = playedClips(model);
  return [model, { clips: [...new Set([...played, ...sidecar])] }];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const path = args.find((a) => a.endsWith('.glb'));
  const report = auditGauntlets(...gameModel(path, { all: args.includes('--all') }));
  for (const [side, r] of Object.entries(report)) {
    console.log(`Gauntlet.${side}: ${r.frames} poses; plates ${r.plate[0].toFixed(3)}..${r.plate[1].toFixed(3)} (fold ${r.worstFold}, stretch ${r.worstStretch}); `
      + `plate vertices in the blade ${r.inBlade} (${r.worstBlade ?? '-'}); neighbours ${r.neighbours}, opened >1 cm ${r.gapsOver['1cm']}, >2 cm ${r.gapsOver['2cm']}`);
    for (const x of r.worstGaps) console.log(`   ${x.pieces.padEnd(28)} ${x.gapCm} cm at ${x.at}`);
  }
  const at = args.indexOf('--json');
  if (at >= 0) writeFileSync(args[at + 1], JSON.stringify(report, null, 1));
}
