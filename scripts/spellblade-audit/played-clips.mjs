// Which of a model's clips the game can play: every clip whose name the client's code (game, menu, tutorial) names as a
// string. Clips no code names are archive (or played only by a sidecar under another name).
//   node scripts/spellblade-audit/played-clips.mjs [model.glb]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadGlb } from '../lib/glbPose.mjs';

export function playedClips(model, root = new URL('../../client/', import.meta.url).pathname) {
  let text = '';
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'assets' || name === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.mjs$/.test(name) && !/\.test\.mjs$/.test(name)) text += readFileSync(p, 'utf8');
    }
  };
  walk(root);
  const played = [], archive = [];
  for (const clip of model.clips.keys()) (new RegExp(`['"\`]${clip}['"\`]`).test(text) ? played : archive).push(clip);
  return { played, archive };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? new URL('../../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
  const { played, archive } = playedClips(loadGlb(path));
  console.log(`played (${played.length}): ${played.join(' ')}\n\narchive (${archive.length}): ${archive.join(' ')}`);
}
