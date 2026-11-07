import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { linesFor, voiceLine, VOICE_TAGS } from './voiceLines.mjs';
import { VoiceDirector, VOICE_LINES, VOICE_PRIORITY } from './voiceRules.mjs';
import { ULTIMATES } from '../../../shared/src/ultimates.mjs';

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));
const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');
const combat = readFileSync(new URL('../../../shared/sim/combat.mjs', import.meta.url), 'utf8');

test('All-Natural Disaster voice lines: declared, ingested, in manifest.json, and present as m4a and wav', () => {
  const lineIds = ['allNaturalDisasterBaseShelter', 'allNaturalDisasterInfusedColorful'];

  for (const id of lineIds) {
    const decl = voiceLine(id);
    assert.ok(decl, `${id} is declared in voiceLines.mjs`);
    assert.equal(decl.priority, 'high', `${id} priority is high`);
    assert.equal(decl.rarity, 0.7, `${id} rarity is 0.7`);
    assert.equal(decl.cooldown, 120, `${id} cooldown is 120`);
    assert.equal(decl.section, 'Battle & Abilities', `${id} section is Battle & Abilities`);

    assert.ok(manifest.lines[id]?.length > 0, `${id} exists in manifest.json`);
    const entry = manifest.lines[id][0];
    assert.ok(entry.seconds > 0, `${id} duration is positive (${entry.seconds}s)`);

    const m4aPath = new URL(`${entry.file}.m4a`, voiceDir).pathname;
    const wavPath = new URL(`${entry.file}.wav`, voiceDir).pathname;
    assert.ok(existsSync(m4aPath), `${id} has .m4a file`);
    assert.ok(existsSync(wavPath), `${id} has .wav file`);
  }
});

test('Rule 8 & Credits: authentic dialogue transcriptions, titles, descriptions, and dry notes', () => {
  const base = voiceLine('allNaturalDisasterBaseShelter');
  assert.equal(base.text, 'Even shelter itself shall seek shelter from me!', 'transcription matches vocal performance');
  assert.equal(base.credits.title, 'Shelter Seeks Shelter');
  assert.equal(base.credits.description, 'Occasionally, when invoking All-Natural Disaster without any elemental infusion.');
  assert.equal(base.credits.note, 'Shelter has not confirmed this.');

  const infused = voiceLine('allNaturalDisasterInfusedColorful');
  assert.equal(infused.text, 'A most colorful catas-trophy!', 'transcription matches pun in audio');
  assert.equal(infused.credits.title, 'A Most Colorful Catastrophe');
  assert.equal(infused.credits.description, 'Occasionally, when invoking All-Natural Disaster with at least one partial or full elemental infusion.');
  assert.equal(infused.credits.note, 'No trophy has been awarded.');
});

test('Mutually exclusive candidate pools: zero infusions vs one or more infusions', () => {
  // Tags exist in VOICE_TAGS and do not force a cry
  assert.ok(VOICE_TAGS.allNaturalDisasterBase, 'allNaturalDisasterBase tag exists');
  assert.ok(VOICE_TAGS.allNaturalDisasterInfused, 'allNaturalDisasterInfused tag exists');
  assert.ok(!VOICE_TAGS.allNaturalDisasterBase.cry, 'allNaturalDisasterBase is not a forced cry');
  assert.ok(!VOICE_TAGS.allNaturalDisasterInfused.cry, 'allNaturalDisasterInfused is not a forced cry');

  // Pool 1: zero infusions
  const baseLines = linesFor('me', ['allNaturalDisasterBase']);
  assert.deepEqual(baseLines.map((l) => l.line), ['allNaturalDisasterBaseShelter']);

  // Pool 2: infused
  const infusedLines = linesFor('me', ['allNaturalDisasterInfused']);
  assert.deepEqual(infusedLines.map((l) => l.line), ['allNaturalDisasterInfusedColorful']);

  // Neither tag offers the other line
  assert.ok(!baseLines.some((l) => l.line === 'allNaturalDisasterInfusedColorful'));
  assert.ok(!infusedLines.some((l) => l.line === 'allNaturalDisasterBaseShelter'));
});

test('Selection chance: 70% provisional rarity and 120s cooldown in VoiceDirector', () => {
  const ruleBase = VOICE_LINES.allNaturalDisasterBaseShelter;
  assert.equal(ruleBase.chance, 0.7);
  assert.equal(ruleBase.cooldown, 120);

  const ruleInfused = VOICE_LINES.allNaturalDisasterInfusedColorful;
  assert.equal(ruleInfused.chance, 0.7);
  assert.equal(ruleInfused.cooldown, 120);

  // Lucky roll (< 0.7) plays the line
  const luckyDirector = new VoiceDirector({ rand: () => 0.65 });
  const luckySay = luckyDirector.consider('allNaturalDisasterBaseShelter', 'me', 100, { duration: 3.44 });
  assert.ok(luckySay, 'lucky roll allows line to speak');

  // Cooldown prevents immediate replay
  const cooldownSay = luckyDirector.consider('allNaturalDisasterBaseShelter', 'me', 150, { duration: 3.44 });
  assert.equal(cooldownSay, null, 'blocked by 120s cooldown');

  // After cooldown expires, can speak again
  const afterCooldown = luckyDirector.consider('allNaturalDisasterBaseShelter', 'me', 225, { duration: 3.44 });
  assert.ok(afterCooldown, 'speaks after cooldown expires');

  // Unlucky roll (>= 0.7) skips the line
  const unluckyDirector = new VoiceDirector({ rand: () => 0.75 });
  const unluckySay = unluckyDirector.consider('allNaturalDisasterBaseShelter', 'me', 100, { duration: 3.44 });
  assert.equal(unluckySay, null, 'unlucky roll does not speak');
});

test('Authoritative prepared infusion tier sum and wire event emission', () => {
  // Wire event in shared/sim/combat.mjs must carry preparedTiers
  assert.match(
    combat,
    /room\.events\.push\(\{ type: 'ultimateStart', playerId, ultimate: ultimate\.id, commitAt: player\.ultimateState\.commitAt, \.\.\.\(hop \? \{ hop \} : \{\}\), \.\.\.\(player\.ultimateState\.preparedTiers \? \{ preparedTiers: \{ \.\.\.player\.ultimateState\.preparedTiers \} \} : \{\}\), at: nowSec \}\);/,
    'combat.mjs includes authoritative preparedTiers on ultimateStart event'
  );

  // GameRuntime.mjs evaluates preparedTiers for one_hit_of_wonders
  assert.match(
    runtime,
    /const tiers = event\.preparedTiers \?\? \(me \? this\.localAuth\?\.ultimateState\?\.preparedTiers : this\.latestSnapshot\?\.players\.find\(\(p\) => p\.id === event\.playerId\)\?\.ultimateState\?\.preparedTiers\) \?\? \{\};/,
    'GameRuntime inspects authoritative preparedTiers'
  );
  assert.match(
    runtime,
    /const total = \(tiers\.fire \?\? 0\) \+ \(tiers\.frost \?\? 0\) \+ \(tiers\.gale \?\? 0\) \+ \(tiers\.lightning \?\? 0\);/,
    'GameRuntime computes sum of infusion tiers'
  );
  assert.match(
    runtime,
    /this\.#sayMoment\(event\.playerId, \[total > 0 \? 'allNaturalDisasterInfused' : 'allNaturalDisasterBase'\]\);/,
    'GameRuntime triggers mutually exclusive moment based on tier sum'
  );
});

test('Rule 5: High priority respects state-level interruptions and does not speak over death cries', () => {
  const director = new VoiceDirector({ rand: () => 0 });

  // A lower-priority situational line (rank 2) is playing
  director.consider('battleBegins', 'me', 10.0, { duration: 3.0 });
  // The high-priority ultimate line (rank 3) can cut the lower-priority line
  const cut = director.consider('allNaturalDisasterBaseShelter', 'me', 10.5, { duration: 3.44 });
  assert.ok(cut, 'high-priority line cuts lower-priority situational line');

  // A high-priority death line (rank 3) is playing
  const director2 = new VoiceDirector({ rand: () => 0 });
  director2.consider('iNeedAMoment', 'me', 50.0, { duration: 2.0 });
  // The ultimate line cannot cut another active rank 3 line
  const blocked = director2.consider('allNaturalDisasterBaseShelter', 'me', 50.5, { duration: 3.44 });
  assert.equal(blocked, null, 'does not talk over another active state-priority line');
});

test('Rule 9: Attack startup timing is preserved without delaying combat for audio alignment', () => {
  // All-Natural Disaster base startup remains 0.92s
  assert.equal(ULTIMATES.one_hit_of_wonders.startupSec, 0.92, 'base startup is 0.92s');

  // Combat startup logic remains intact in combat.mjs
  assert.match(combat, /commitAt: nowSec \+ \(\(ultimate\.id==='one_hit_of_wonders' && plannedTiers\.lightning===2\)\?3600000:/);
  assert.match(combat, /\(ultimate\.id==='one_hit_of_wonders' && plannedTiers\.lightning >= 1 \? 0\.36 : ultimate\.startupSec\)\)/);

  // Audio files have natural lengths; punchline continues into aftermath as documented
  const colorful = manifest.lines.allNaturalDisasterInfusedColorful[0];
  assert.ok(colorful.seconds > 0.92, 'audio length exceeds startup without altering combat frames');
});
