import test from 'node:test';
import assert from 'node:assert/strict';
import { linesFor } from './voiceLines.mjs';
import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';

// "I confront my foes head on!": a declaration of the approach, so it is said as the charge begins (never waiting on
// the ram to land, which may miss: he did attempt it), most of all as he dashes at someone in Steel (the sentence
// demonstrated); still now and then on an ordinary charge, or the first blow of a fresh fight.

const offer = (tags) => linesFor('me', tags).find((say) => say.line === 'headOn');

test('a Steel charge offers it first, about half the time, as the dash begins', () => {
  const [first] = linesFor('me', ['steelCharge', 'dash']);
  assert.equal(first.line, 'headOn', 'before the dash\'s own breath');
  assert.ok(Math.abs(VOICE_LINES.headOn.chance * first.chanceScale - 0.5) < 1e-9, 'about half');
  assert.ok(first.delay >= 0.05 && first.delay <= 0.1, 'begun with the dash, not after the contact');
});

test('an ordinary charge and a fresh fight still may: about one time in ten, and one in twenty', () => {
  assert.ok(Math.abs(VOICE_LINES.headOn.chance * offer(['charge']).chanceScale - 0.1) < 1e-9);
  assert.ok(Math.abs(VOICE_LINES.headOn.chance * offer(['engage']).chanceScale - 0.05) < 1e-9);
  assert.equal(offer(['dash']), undefined, 'an ordinary dash is no charge');
});

test('said on a Steel charge, it is the dash\'s only breath; kept quiet (its odds, its two-minute cooldown), the breath may come', () => {
  // (a moment's lines: the first that is said is the only one, as GameRuntime #sayMoments has it)
  const sayFirst = (director, now) => linesFor('me', ['steelCharge', 'dash']).find((say) => director.consider(say.line, 'me', now, { chanceScale: say.chanceScale }))?.line ?? null;
  const director = new VoiceDirector({ rand: () => 0 });
  assert.equal(sayFirst(director, 10), 'headOn');
  // a minute on, it waits on its cooldown: the breath is free to come
  assert.equal(sayFirst(director, 70), 'dash');
});
