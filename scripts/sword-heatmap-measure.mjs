// The sword's 19-30 damage heatmap, measured through the real sim (shared/sim/combat.mjs): a standing knight placed at
// every distance and every angle off the attacker's aim the blade can reach, struck once by each cut (the forehand and
// backhand in both chain forms, the chop), and what the server made of each contact recorded: damage, where along the
// blade (hilt, the cutting stretch, the tip), how early or late in the swing, and its event point. Then the same
// contacts at other server tick rates (the judgement must not depend on them).
//
//   node scripts/sword-heatmap-measure.mjs [--json out.json]

import { writeFileSync } from 'node:fs';
import { Room } from '../shared/sim/Room.mjs';
import { beginAttack, setGuard, stepRoom } from '../shared/sim/combat.mjs';
import { SWORD_STRIKE_TIMES, swordDamageFor, strikeKind } from '../shared/src/combat.mjs';

const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [], solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -2, yaw: Math.PI }],
  abyssY: -9,
};
const CUTS = ['forehand', 'backhand', 'chop'];
const DEG = Math.PI / 180;

/**
 * One strike at a knight `distance` metres away, `angleDeg` to the attacker's left of his aim (negative: right), the
 * aim pitched `pitchDeg`; form: the chain form; strike: which strike of it (0..2). guard: the target guards (raised
 * `guardAge` s before the contact). dt: the server's tick.
 */
export function strikeAt({ distance, angleDeg = 0, pitchDeg = 0, form = 0, strike = 0, dt = 1 / 30, guard = false, guardAge = 1 }) {
  const room = new Room('HEAT');
  room.world = world;
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a'), b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  a.yaw = 0; a.input.yaw = 0; a.pitch = pitchDeg * DEG; a.input.pitch = a.pitch;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  // (parked out of reach, on the floor, until its strike comes round)
  const away = { x: 18, y: 0, z: 18 };
  const place = { x: -Math.sin(angleDeg * DEG) * distance, y: 0, z: -Math.cos(angleDeg * DEG) * distance };
  Object.assign(b.position, strike === 0 ? place : away);
  b.yaw = Math.atan2(-(0 - place.x), -(0 - place.z)); b.input.yaw = b.yaw;
  const t0 = 10;
  // the chain's form: the falling chain is the first of a run; the rising one follows straight on from one run through
  if (form === 1) a.attackRun = { variant: 0, restartAt: t0 };
  beginAttack(room, 'a', t0);
  room.events.length = 0;
  const contact = t0 + SWORD_STRIKE_TIMES[strike];
  let placed = strike === 0;
  for (let now = t0 + dt; now < contact + 0.3; now += dt) {
    if (!placed && now >= contact - 0.2) { Object.assign(b.position, place); placed = true; }
    if (guard && !b.guarding && now >= contact - guardAge) setGuard(room, 'b', true, now);
    stepRoom(room, dt, now, world);
    const met = room.events.find((e) => ['swordHit', 'block', 'parry', 'guardBreak'].includes(e.type) && (e.playerId === 'a' || e.attackerId === 'a'));
    if (met) {
      const quality = met.type === 'swordHit' ? met.judged ?? met.quality : met.quality ?? null;
      return { outcome: met.type, kind: met.kind, strikeIndex: met.strikeIndex, quality, damage: met.type === 'swordHit' ? swordDamageFor(quality) : 0,
        heat: met.heat ?? null, point: met.point ?? null, health: b.health };
    }
  }
  return { outcome: 'miss', kind: strikeKind(form, strike) };
}

const band = (d) => (d <= 21 ? '19-21' : d <= 24 ? '22-24' : d <= 27 ? '25-27' : '28-30');
const region = (r) => (r < 0.45 ? 'hilt' : r > 0.88 ? 'tip' : 'cutting');
const phase = (dt) => (dt < -0.03 ? 'early' : dt > 0.03 ? 'late' : 'peak');

export function measure() {
  const cases = [
    { form: 0, strike: 0, label: 'falling 1 forehand' },
    { form: 0, strike: 1, label: 'falling 2 backhand' },
    { form: 1, strike: 0, label: 'rising 1 backhand' },
    { form: 1, strike: 1, label: 'rising 2 forehand' },
    { form: 0, strike: 2, label: 'chop (both forms)' },
  ];
  const distances = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75];
  const angles = [-60, -45, -30, -20, -12, -6, 0, 6, 12, 20, 30, 45, 60];
  const report = {};
  for (const c of cases) {
    const rows = [];
    for (const distance of distances) for (const angleDeg of angles) {
      const r = strikeAt({ distance, angleDeg, form: c.form, strike: c.strike });
      if (r.outcome !== 'swordHit') continue;
      rows.push({ distance, angleDeg, damage: r.damage, quality: +r.quality.toFixed(3), region: region(r.heat.reach), phase: phase(r.heat.dt), reach: r.heat.reach, dt: r.heat.dt });
    }
    const bands = Object.fromEntries(['19-21', '22-24', '25-27', '28-30'].map((b) => [b, rows.filter((r) => band(r.damage) === b).length]));
    const centred = rows.filter((r) => Math.abs(r.angleDeg) <= 6 && r.distance >= 1.5 && r.distance <= 2.25);
    report[c.label] = {
      hits: rows.length, mean: +(rows.reduce((s, r) => s + r.damage, 0) / rows.length).toFixed(1), bands,
      centredMean: +(centred.reduce((s, r) => s + r.damage, 0) / centred.length).toFixed(1), best: Math.max(...rows.map((r) => r.damage)),
      bestAt: rows.filter((r) => r.damage === Math.max(...rows.map((x) => x.damage))).map((r) => `${r.distance}m ${r.angleDeg}°`).slice(0, 6),
      byRegion: Object.fromEntries(['hilt', 'cutting', 'tip'].map((g) => { const g2 = rows.filter((r) => r.region === g); return [g, g2.length ? `${Math.min(...g2.map((r) => r.damage))}-${Math.max(...g2.map((r) => r.damage))} (n ${g2.length})` : '-']; })),
      byPhase: Object.fromEntries(['early', 'peak', 'late'].map((g) => { const g2 = rows.filter((r) => r.phase === g); return [g, g2.length ? `${Math.min(...g2.map((r) => r.damage))}-${Math.max(...g2.map((r) => r.damage))} (n ${g2.length})` : '-']; })),
      grid: rows,
    };
  }
  // the same blows at other server tick rates: the contact is judged at its own moment, not the tick's
  const tickCases = [];
  for (const c of cases) for (const [distance, angleDeg] of [[1.8, 0], [1.5, 12], [2.2, -20], [1.0, 6]]) {
    const at = [1 / 20, 1 / 30, 1 / 60, 1 / 120].map((dt) => strikeAt({ distance, angleDeg, form: c.form, strike: c.strike, dt }));
    tickCases.push({ label: c.label, distance, angleDeg, damage: at.map((r) => r.damage ?? r.outcome), quality: at.map((r) => (r.quality ?? 0).toFixed(3)) });
  }
  // a guarded and a parried blow: their contact on the guard is where the blade met the body
  const guarded = strikeAt({ distance: 1.8, angleDeg: 0, guard: true, guardAge: 1 });
  const parried = strikeAt({ distance: 1.8, angleDeg: 0, guard: true, guardAge: 0.05 });
  return { cases: report, tickRates: tickCases, guarded, parried };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = measure();
  for (const [label, r] of Object.entries(result.cases)) {
    console.log(`${label.padEnd(20)} hits ${String(r.hits).padStart(3)}  mean ${r.mean}  centred(±6°, 1.5-2.25 m) ${r.centredMean}  best ${r.best} at ${r.bestAt.join(', ')}`);
    console.log(`${''.padEnd(20)} bands ${JSON.stringify(r.bands)}  region ${JSON.stringify(r.byRegion)}  phase ${JSON.stringify(r.byPhase)}`);
  }
  const varying = result.tickRates.filter((t) => new Set(t.damage).size > 1);
  console.log(`tick rates 20/30/60/120 Hz: ${result.tickRates.length - varying.length}/${result.tickRates.length} placements identical`);
  for (const v of varying) console.log('   differs:', JSON.stringify(v));
  console.log('guarded:', JSON.stringify({ outcome: result.guarded.outcome, point: result.guarded.point, heat: result.guarded.heat }));
  console.log('parried:', JSON.stringify({ outcome: result.parried.outcome, point: result.parried.point, heat: result.parried.heat }));
  const out = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
  if (out) writeFileSync(out, JSON.stringify(result, null, 1));
}
