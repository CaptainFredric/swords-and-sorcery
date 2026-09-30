import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNIGHT_FALLEN_OVERKILL, VOICE_LINES, VOICE_PRIORITY, VoiceDirector, deathLines, galeTauntScale, isOverkill, worldImpactLines,
} from './voiceRules.mjs';
import { VoiceBank } from './VoiceBank.mjs';

// The voice's ranks and the new lines' rules: exertions never cut anything, one sentence is heard at a time, a line of
// state cuts through, and every line is presentation only.

test('a line that matters more cuts a lesser one; an exertion never cuts anything; one sentence at a time', () => {
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.consider('galeTaunt', 'a', 10, { duration: 3 }), 'a taunt');
  assert.equal(director.consider('jump', 'a', 11), null, 'no grunt over his own sentence');
  assert.equal(director.consider('killTaunt', 'b', 11, { duration: 2 }), null, 'another knight\'s taunt waits: one sentence at a time');
  const death = director.consider('knightFallen', 'b', 11.5, { duration: 4 });
  assert.deepEqual(death?.stop, ['a'], 'a fall cuts the taunt it overrides');
  assert.ok(director.consider('jump', 'a', 12), 'his mouth is free again');
  assert.equal(director.consider('breakTaunt', 'a', 13, { duration: 2 }), null, 'but no sentence over the fallen\'s line');
  // (and his own sentences keep their gap: SENTENCE_GAP after the first)
  assert.ok(director.consider('breakTaunt', 'a', 23, { duration: 2 }), 'once it has ended, and his gap too');
});

test('a jump is grunted only now and then, never twice close together, and the takes turn about', () => {
  const rule = VOICE_LINES.jump;
  assert.equal(rule.kind, 'exertion');
  assert.equal(rule.priority, VOICE_PRIORITY.exertion);
  assert.ok(rule.chance < 0.5 && rule.cooldown > 1, 'not every jump');
  // its cooldown is its own: a sentence does not hold it up, nor it a sentence
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.allow('jump', 'a', 5));
  assert.ok(!director.allow('jump', 'a', 5 + rule.cooldown / 2));
  // through the bank: the three takes, never the same one twice running
  const played = [];
  const engine = { onReady() {}, running: true, now: 0, playBuffer: (buffer) => { played.push(buffer.id); return { stop() {} }; } };
  const bank = new VoiceBank(engine, { director: new VoiceDirector({ rand: () => 0 }) });
  bank.takes.set('jump', [1, 2, 3].map((id) => ({ id, duration: 0.4 })));
  for (let i = 0; i < 40; i += 1) {
    engine.now = i * (rule.cooldown + 0.1);
    bank.say('jump', { speaker: 'a' });
  }
  assert.equal(played.length, 40);
  for (let i = 1; i < played.length; i += 1) assert.notEqual(played[i], played[i - 1], 'never the same take twice running');
  assert.equal(new Set(played).size, 3, 'all three heard');
});

test('the gale\'s jibe follows only a gust that really moved someone', () => {
  assert.equal(galeTauntScale([]), 0, 'nobody caught');
  assert.equal(galeTauntScale([{ pressure: 0.35, guarded: false }]), 0, 'only brushed');
  assert.equal(galeTauntScale([{ pressure: 0.9, guarded: true }]), 0, 'held behind a guard');
  const thrown = galeTauntScale([{ pressure: 0.95, guarded: false }]);
  assert.ok(thrown >= 1, 'thrown hard: the jibe is in play');
  assert.ok(galeTauntScale([{ pressure: 0.6, guarded: false }]) < thrown, 'likelier the harder the throw');
  assert.ok(VOICE_LINES.galeTaunt.chance * thrown < 1, 'still only now and then');
});

test('"The knight has fallen!" is rare, likelier after an overkill, and never soon again', () => {
  const rule = VOICE_LINES.knightFallen;
  assert.ok(rule.chance <= 0.1 && rule.cooldown >= 120);
  assert.ok(rule.chance * KNIGHT_FALLEN_OVERKILL > rule.chance && rule.chance * KNIGHT_FALLEN_OVERKILL < 0.5, 'still rare after an overkill');
  assert.ok(isOverkill({ amount: 30, healthBefore: 8 }), 'a full blow on a knight all but gone');
  assert.ok(isOverkill({ amount: 34, healthBefore: 60, level: 'elevated' }), 'a Sundering blow');
  assert.ok(!isOverkill({ amount: 30, healthBefore: 25 }), 'an ordinary finishing blow');
  const lines = deathLines({ victimId: 'v', killerId: 'k', source: 'sword', overkill: true });
  assert.equal(lines.fallen.find((say) => say.line === 'knightFallen').chanceScale, KNIGHT_FALLEN_OVERKILL);
  assert.equal(deathLines({ victimId: 'v', killerId: 'k', source: 'sword' }).fallen.find((say) => say.line === 'knightFallen').chanceScale, 1);
  const director = new VoiceDirector({ rand: () => 0.1 });
  assert.ok(!director.allow('knightFallen', 'v', 10), 'an ordinary fall: the dice say no');
  assert.ok(director.allow('knightFallen', 'v', 10, { chanceScale: KNIGHT_FALLEN_OVERKILL }), 'an overkill: they may say yes');
  assert.ok(!director.allow('knightFallen', 'v', 60, { chanceScale: KNIGHT_FALLEN_OVERKILL }), 'not again soon');
});

test('the blade-caught line answers only a true snag, never a wall or a miss', () => {
  assert.deepEqual(worldImpactLines({ type: 'swordWorldImpact', playerId: 'a', material: 'limestone' }), []);
  assert.deepEqual(worldImpactLines({ type: 'swordMiss', playerId: 'a' }), []);
  assert.deepEqual(worldImpactLines({ type: 'swordWorldImpact', playerId: 'a', material: 'timber', snag: true }).map((say) => say.line), ['bladeCaught']);
  assert.ok(VOICE_LINES.bladeCaught.chance <= 0.15 && VOICE_LINES.bladeCaught.cooldown >= 600, 'and almost never even then');
});

test('voice is presentation only: the host never hears it, so no line can hold up anything in the game', () => {
  const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith('.mjs') ? [join(dir, entry.name)] : []));
  const root = new URL('../../../shared/', import.meta.url).pathname;
  for (const file of sources(root)) {
    assert.ok(!/sound\/|VoiceBank|voiceRules/.test(readFileSync(file, 'utf8')), `${file} knows nothing of the voice`);
  }
  // and the director decides at once, whatever the line's length
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.consider('sunderCall', 'a', 0, { duration: 60 }), 'a minute-long cry is fine: it gates nothing');
});
