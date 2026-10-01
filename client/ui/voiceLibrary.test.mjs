import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDITS, VOICE_LIBRARY, libraryInOrder, libraryStatus, statusLabel, subtitleFor } from './voiceLibrary.mjs';
import { VOICE_LINES } from '../game/sound/voiceRules.mjs';

// The credits' voice library is drawn from the lines' own declarations (voiceLines.mjs), and what it says of each
// line's recording comes from the takes that are really there: it cannot fall out of step with the game.

const manifest = JSON.parse(readFileSync(new URL('../assets/voice/manifest.json', import.meta.url), 'utf8'));
const recorded = new Set(Object.keys(manifest.lines ?? {}));
const listed = new Map(VOICE_LIBRARY.map((entry) => [entry.line, entry]));

test('every line the game can say, and every recording, has its place in the library', () => {
  for (const line of Object.keys(VOICE_LINES)) assert.ok(listed.has(line), `${line} is listed`);
  for (const line of recorded) assert.ok(listed.has(line), `${line} (recorded) is listed`);
  assert.equal(listed.size, VOICE_LIBRARY.length, 'each line once');
  for (const entry of VOICE_LIBRARY) assert.ok(entry.title && entry.words && entry.when && entry.note, `${entry.line}: said, when, and why`);
});

test('what the library says of each recording follows from what is recorded', () => {
  const sorcery = listed.get('sorcery');
  assert.equal(libraryStatus(sorcery, true), 'live');
  assert.equal(statusLabel(sorcery, true), '', 'its play button says it is in the game');
  assert.equal(libraryStatus(sorcery, false), 'unrecorded');
  assert.equal(statusLabel(sorcery, false), 'NO RECORDING');
  // a line recorded ahead of what it belongs to waits for it, and has no rule: it cannot be said yet
  const waiting = listed.get('misaddressed');
  assert.equal(libraryStatus(waiting, true), 'coming');
  // (the Blazing Vortex's lines are in the game now)
  assert.equal(libraryStatus(listed.get('vortexDefeat'), true), 'live');
  assert.equal(statusLabel(listed.get('misaddressed'), true), 'WITH THE RIPOSTE');
  assert.equal(statusLabel(listed.get('misaddressed'), false), 'RIPOSTE · NO RECORDING');
  assert.equal(VOICE_LINES.misaddressed, undefined);
  assert.ok(VOICE_LINES.vortexDefeat && VOICE_LINES.vortexUse);
  for (const entry of VOICE_LIBRARY) {
    const status = libraryStatus(entry, recorded.has(entry.line));
    if (status === 'live') assert.ok(VOICE_LINES[entry.line], `${entry.line} is live but never said`);
    if (entry.coming) assert.ok(!VOICE_LINES[entry.line], `${entry.line} is said before what it waits for exists`);
  }
});

test('the Credits show what is in the game first, then what waits, then the places kept', () => {
  const shelves = libraryInOrder((line) => recorded.has(line)).map((entry) => libraryStatus(entry, recorded.has(entry.line)));
  const order = { live: 0, coming: 1, unrecorded: 2 };
  for (let i = 1; i < shelves.length; i += 1) assert.ok(order[shelves[i]] >= order[shelves[i - 1]], `${shelves[i - 1]} then ${shelves[i]}`);
  assert.equal(shelves.length, VOICE_LIBRARY.length);
});

test('the credits name their maker', () => {
  assert.ok(CREDITS.lines.every((line) => line.name === 'CaptainFredric'));
});

test('a subtitle is a line\'s words, and nothing for a line without words', () => {
  assert.equal(subtitleFor('defeat'), 'What!? But I am a knight!');
  assert.equal(subtitleFor('jump'), null, 'a grunt has no words to write');
  assert.equal(subtitleFor('effort'), null);
  assert.equal(subtitleFor('fistEffort'), null, 'nor a shout of effort');
  assert.equal(subtitleFor('no-such-line'), null);
  for (const entry of VOICE_LIBRARY) {
    if (entry.kind === 'sentence' && !entry.words.startsWith('(')) assert.equal(subtitleFor(entry.line), entry.words, entry.line);
  }
});
