// The shipped Spellblade held to its recorded audit (scripts/lib/spellbladeAudit.mjs): a model change that tears a
// plate further, tears a new seam, or opens a line of sight through the body fails here, before anyone plays it.
// After a change that makes the model better, record the new limits: node scripts/audit-spellblade-model.mjs --record
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditSpellblade, auditRegressions, AUDIT_BASELINE } from '../../scripts/lib/spellbladeAudit.mjs';

const MODEL = fileURLToPath(new URL('../assets/characters/spellblade/spellblade.glb', import.meta.url));

test('the shipped Spellblade tears no plate further and opens no new line of sight through the body', () => {
  const baseline = JSON.parse(readFileSync(AUDIT_BASELINE, 'utf8'));
  const worse = auditRegressions(auditSpellblade(MODEL), baseline);
  assert.deepEqual(worse, [], 'the model got worse:\n  ' + worse.join('\n  '));
});

test('the audit finds the faults the playtests found, on the model before they were fixed', () => {
  // (a stand-in for that model: the breastplate's armpit vertices bound to the upper arm, as they were, are a tear the
  // audit must see; here, its own regression check given a baseline without that seam)
  const now = { tears: { 'Breastplate chest~upper_arm.R': { edges: 1828, worstCm: 53.8 } }, holes: [{ through: 4 }] };
  const worse = auditRegressions(now, { tears: {}, throughTotal: 0 });
  assert.equal(worse.length, 2);
  assert.match(worse[0], /a new tear/);
  assert.match(worse[1], /lines of sight/);
});
