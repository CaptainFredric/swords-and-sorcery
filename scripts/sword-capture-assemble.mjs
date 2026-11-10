// Build the GIF, the contact sheet and the contacts-as-shown montage for a sword capture's frames (ImageMagick), apart
// from the capture itself (a long phone recording's GIF is better built afterwards, at a lower rate).
//   node scripts/sword-capture-assemble.mjs <capture dir> [--step 2] [--width 640]
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = process.argv[2];
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const step = Number(arg('--step', '2'));
const width = Number(arg('--width', '640'));
const label = basename(dir);
const timeline = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
const frame = (i) => join(dir, 'frames', `f${String(i).padStart(5, '0')}.jpg`);
const all = timeline.stills.map((_, i) => i);
const font = ['-font', '/System/Library/Fonts/Helvetica.ttc'];
spawnSync('magick', ['-delay', String(5 * step), '-loop', '0', ...all.filter((i) => i % step === 0).map(frame), '-resize', `${width}x`, '-layers', 'Optimize', '-fuzz', '3%', join(dir, `${label}.gif`)], { stdio: 'inherit' });
spawnSync('magick', ['montage', ...font, ...all.filter((i) => i % 2 === 0).slice(0, 24).map(frame), '-tile', '4x', '-geometry', `${Math.round(width / 2)}x+2+2`, join(dir, `${label}-sheet.jpg`)], { stdio: 'inherit' });
const contacts = all.filter((i) => timeline.stills[i].contact).slice(0, 6).map(frame);
if (contacts.length) spawnSync('magick', ['montage', ...font, ...contacts, '-tile', '3x', '-geometry', `${Math.round(width / 1.6)}x+2+2`, join(dir, `${label}-contacts.jpg`)], { stdio: 'inherit' });
console.log('[ASSEMBLED]', label, { frames: all.length, contacts: contacts.length });
