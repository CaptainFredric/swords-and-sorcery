import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDITS, LIBRARY_STATUS, VOICE_LIBRARY } from './voiceLibrary.mjs';
import { VOICE_LINES } from '../game/sound/voiceRules.mjs';

// The credits' voice library is held to the game: every line the game can speak, or has a recording for, is listed,
// and what it says of each line's recording is true.

const manifest = JSON.parse(readFileSync(new URL('../assets/voice/manifest.json', import.meta.url), 'utf8'));
const recorded = new Set(Object.keys(manifest.lines ?? {}));
const listed = new Map(VOICE_LIBRARY.map((entry) => [entry.line, entry]));

test('every line the game can say, and every recording, has its place in the library', () => {
  for (const line of Object.keys(VOICE_LINES)) assert.ok(listed.has(line), `${line} is listed`);
  for (const line of recorded) assert.ok(listed.has(line), `${line} (recorded) is listed`);
  assert.equal(listed.size, VOICE_LIBRARY.length, 'each line once');
});

test('what the library says of each recording is true', () => {
  for (const entry of VOICE_LIBRARY) {
    assert.ok(LIBRARY_STATUS[entry.status], `${entry.line}: a known status`);
    assert.ok(entry.title && entry.words && entry.when && entry.note, `${entry.line}: said, when, and why`);
    if (entry.status === 'unrecorded') assert.ok(!recorded.has(entry.line), `${entry.line} is in fact recorded`);
    else assert.ok(recorded.has(entry.line), `${entry.line} has no recording`);
    // a line said in the game has its rule; one still waiting has none
    if (entry.status === 'live') assert.ok(VOICE_LINES[entry.line], `${entry.line} is live but never said`);
    if (entry.status === 'coming') assert.ok(!VOICE_LINES[entry.line], `${entry.line} is said before its ultimate exists`);
  }
});

test('the credits name their maker', () => {
  assert.ok(CREDITS.lines.every((line) => line.name === 'CaptainFredric'));
});

test('a subtitle is a line\'s words, and nothing for a line without words', async () => {
  const { subtitleFor } = await import('./voiceLibrary.mjs');
  assert.equal(subtitleFor('defeat'), 'What!? But I am a knight!');
  assert.equal(subtitleFor('jump'), null, 'a grunt has no words to write');
  assert.equal(subtitleFor('effort'), null);
  assert.equal(subtitleFor('no-such-line'), null);
  for (const entry of VOICE_LIBRARY) {
    if (!entry.words.startsWith('(')) assert.equal(subtitleFor(entry.line), entry.words, entry.line);
  }
});
