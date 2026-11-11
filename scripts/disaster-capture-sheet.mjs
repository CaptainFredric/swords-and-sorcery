// A contact sheet from one disaster-capture-browser.mjs run: the stills nearest fixed moments around the room's commit
// (or, with no commit, around the first event of --anchor).
//   node scripts/disaster-capture-sheet.mjs <run dir> [--at -0.6,-0.3,0.03,0.12,0.3,0.7,1.5,3] [--crop right|left|none] [--anchor oneHitBacklash]
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const t = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
const anchorType = option('--anchor', null);
const anchor = anchorType ? t.events.find((e) => e.type === anchorType)?.at : t.commitAt;
if (!Number.isFinite(anchor)) throw new Error('no anchor moment in this run');
const offsets = option('--at', '-0.6,-0.3,0.03,0.12,0.3,0.7,1.5,3').split(',').map(Number);
const picked = offsets.map((o) => { let best = 0; t.stillTimes.forEach((at, i) => { if (Math.abs(at - anchor - o) < Math.abs(t.stillTimes[best] - anchor - o)) best = i; }); return best; });
const crop = option('--crop', t.device === 'phone' ? 'none' : 'right');
const files = picked.map((i) => join(dir, 'frames', `f${String(i).padStart(5, '0')}.jpg`));
const cropArgs = crop === 'none' ? [] : ['-gravity', crop === 'right' ? 'East' : 'West', '-crop', '50%x100%+0+0', '+repage'];
const out = join(dir, `${basename(dir)}-moments.jpg`);
const r = spawnSync('magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...files, ...cropArgs, '-tile', '4x', '-geometry', '480x+2+2', '-background', '#111', out], { stdio: 'inherit' });
console.log(r.status === 0 ? out : 'montage failed', 'shown at', picked.map((i) => (t.stillTimes[i] - anchor).toFixed(2)).join(' '));
