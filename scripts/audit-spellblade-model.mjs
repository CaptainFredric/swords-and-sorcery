#!/usr/bin/env node
// Audit the shipped Spellblade (or any candidate GLB) for torn plates and see-through holes in its key clips:
//   node scripts/audit-spellblade-model.mjs [file.glb] [--json] [--record]
//     --record: write the shipped model's results as the limits the tests hold it to (after a change that improves it)
// scripts/lib/spellbladeAudit.mjs says what is looked for; client/game/spellbladeModelAudit.test.mjs holds the
// shipped model to its recorded limits, so a model change that tears a plate or opens a hole fails the tests.
import { writeFileSync } from 'node:fs';
import { auditSpellblade, auditBaseline, AUDIT_BASELINE } from './lib/spellbladeAudit.mjs';

const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'client/assets/characters/spellblade/spellblade.glb';
const started = Date.now();
const { tears, holes } = auditSpellblade(file);
if (process.argv.includes('--record')) { writeFileSync(AUDIT_BASELINE, JSON.stringify(auditBaseline({ tears, holes }), null, 2) + '\n'); console.log('recorded', AUDIT_BASELINE); }
if (process.argv.includes('--json')) { console.log(JSON.stringify({ tears, holes }, null, 2)); process.exit(0); }
console.log(`${file}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
console.log('\nTorn plates (an edge grown 6 cm or more):');
const rows = Object.entries(tears).sort((a, b) => b[1].worstCm - a[1].worstCm);
if (!rows.length) console.log('  none');
for (const [key, r] of rows) console.log(`  ${key.padEnd(46)} ${String(r.edges).padStart(5)} edges  worst ${String(r.worstCm).padStart(5)} cm  (${r.clip} ${r.time}s)`);
console.log('\nSee-through holes in the trunk:');
if (!holes.length) console.log('  none');
for (const h of holes.sort((a, b) => b.through - a.through).slice(0, 12)) console.log(`  ${h.clip.padEnd(20)} ${String(h.time).padStart(5)}s  ${h.through}/${h.rays} lines of sight pass through`);
