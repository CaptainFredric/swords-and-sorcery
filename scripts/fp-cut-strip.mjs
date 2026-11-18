// The first-person sword as the player sees it, frame by frame, without a browser: the real fpSlash paths through
// WeaponView's hand-over rules (scripts/fp-sword-audit.mjs runFirstPerson), the drawn blade projected through the
// first-person camera (FP_MOTION.baseFov, 16:9) and drawn as a strip of frames and one trail of every frame, coloured
// by time. Quick to iterate on a cut's shape; the real game's recordings confirm it.
//   node scripts/fp-cut-strip.mjs --scenario tap|chain|two [--from 0] [--to 1.2] [--every 2] [--out dir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runFirstPerson } from './fp-sword-audit.mjs';
import { comboPose } from '../client/game/fpSlash.mjs';
import { SWORD_STRIKE_TIMES } from '../shared/src/combat.mjs';
const args = process.argv.slice(2);
const option = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const scenario = option('--scenario', 'tap');
const out = option('--out', 'output/fp-cut-strip');
const from = Number(option('--from', '0')), to = Number(option('--to', scenario === 'chain' ? '2.6' : '1.2'));
const every = Number(option('--every', '2'));
const presses = { tap: [[0, true], [0.08, false]], chain: [[0, true], [2.2, false]], two: [[0, true], [0.5, false]] }[scenario];
const run = runFirstPerson(scenario, { seconds: to + 0.2, presses });
const W = 320, H = 180, F = (H / 2) / Math.tan((78 / 2) * Math.PI / 180);
const lean = (v, { pitch, roll, yaw }) => {
  const rx = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
  const ry = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  const rz = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
  return ry(rx(rz(v, roll), pitch), yaw);
};
const project = (p) => { const z = Math.max(0.05, -p[2]); return [W / 2 + F * p[0] / z, H / 2 - F * p[1] / z]; };
// the drawn sword from the pose: the wrist, the grip 8 cm up the blade, the point 1.05 m on (as the audit draws it)
function sword(pose) {
  const { wrist, blade } = pose.arm;
  const grip = wrist.map((v, i) => v + blade[i] * 0.08), tip = grip.map((v, i) => v + blade[i] * 1.05);
  return { wrist: project(lean(wrist, pose.look)), grip: project(lean(grip, pose.look)), tip: project(lean(tip, pose.look)) };
}
// each recorded frame's pose again (runFirstPerson keeps only wrist and blade: re-run with the same rules for the look)
const frames = run.frames.filter((f) => f.t >= from && f.t <= to);
const poses = run.poses ?? null;
mkdirSync(out, { recursive: true });
const panel = (f, i, pose) => {
  const s = sword(pose);
  const contact = SWORD_STRIKE_TIMES.some((c) => Math.abs(f.t - c) < 1 / 120);
  return `<g transform="translate(${(i % 8) * W},${Math.floor(i / 8) * H})"><rect width="${W}" height="${H}" fill="${contact ? 'rgb(43,58,43)' : 'rgb(32,36,43)'}" stroke="rgb(0,0,0)"/>
<line x1="${W / 2 - 6}" y1="${H / 2}" x2="${W / 2 + 6}" y2="${H / 2}" stroke="rgb(110,110,110)"/><line x1="${W / 2}" y1="${H / 2 - 6}" x2="${W / 2}" y2="${H / 2 + 6}" stroke="rgb(110,110,110)"/>
<line x1="${s.wrist[0]}" y1="${s.wrist[1]}" x2="${s.grip[0]}" y2="${s.grip[1]}" stroke="rgb(190,140,110)" stroke-width="7"/>
<line x1="${s.grip[0]}" y1="${s.grip[1]}" x2="${s.tip[0]}" y2="${s.tip[1]}" stroke="rgb(235,235,245)" stroke-width="3"/>
<text x="6" y="16" fill="rgb(210,210,210)" font-size="13" font-family="monospace">${f.t.toFixed(3)}s${contact ? ' contact' : ''}</text></g>`;
};
export function stripFor(pose) { return sword(pose); }
const shown = frames.filter((_, i) => i % every === 0);
const rows = Math.ceil(shown.length / 8);
const body = shown.map((f, i) => panel(f, i, f.pose)).join('\n');
writeFileSync(`${out}/${scenario}-strip.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${8 * W}" height="${rows * H}">${body}</svg>`);
const trail = frames.map((f, i) => { const s = sword(f.pose); const k = i / Math.max(1, frames.length - 1); const c = `rgb(${Math.round(60 + 195 * k)},${Math.round(140 - 60 * k)},${Math.round(255 - 205 * k)})`;
  return `<line x1="${s.grip[0] * 2}" y1="${s.grip[1] * 2}" x2="${s.tip[0] * 2}" y2="${s.tip[1] * 2}" stroke="${c}" stroke-width="1.5" opacity="0.8"/>`; }).join('\n');
writeFileSync(`${out}/${scenario}-trail.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * W}" height="${2 * H}"><rect width="100%" height="100%" fill="rgb(27,30,36)"/>${trail}<text x="8" y="20" fill="rgb(210,210,210)" font-size="14" font-family="monospace">${scenario} ${from}-${to}s blue→red</text></svg>`);
for (const n of ['strip', 'trail']) execFileSync('magick', ['-font', process.env.STRIP_FONT ?? '/System/Library/Fonts/SFCompact.ttf', `${out}/${scenario}-${n}.svg`, `${out}/${scenario}-${n}.png`]);
console.log(`${out}/${scenario}-strip.png ${out}/${scenario}-trail.png`, shown.length, 'panels');
