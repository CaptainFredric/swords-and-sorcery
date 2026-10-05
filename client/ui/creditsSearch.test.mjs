import test from 'node:test';
import assert from 'node:assert/strict';
import { creditMatches, entryMatches, highlight, normalize, searchShelves, searchTerms } from './creditsSearch.mjs';
import { CREDITS, VOICE_LIBRARY, librarySections } from './voiceLibrary.mjs';

// The Credits' search: every word typed must be found, in any order, in any of a line's fields, regardless of case,
// accents or curly quotes; what it finds is marked, and nothing it finds is ever unescaped.

const late = VOICE_LIBRARY.find((entry) => entry.line === 'lateLine');

test('a query is its words, compared without case, accents or curly quotes', () => {
  assert.deepEqual(searchTerms('  Fair   AND  square '), ['fair', 'and', 'square']);
  assert.deepEqual(searchTerms(''), []);
  assert.equal(normalize('Spellblade’s Café “voice”'), 'spellblade\'s cafe "voice"');
});

test('every word must be found, in any of a line\'s fields and in any order', () => {
  assert.ok(entryMatches(late, searchTerms('late')), 'its title and words');
  assert.ok(entryMatches(late, searchTerms('commitments prior')), 'its note, words out of order');
  assert.ok(entryMatches(late, searchTerms('small damage')), 'when he says it');
  assert.ok(entryMatches(late, searchTerms('defeat')), 'its section');
  assert.ok(entryMatches(late, searchTerms('no recording'), 'NO RECORDING'), 'its status as printed');
  assert.ok(!entryMatches(late, searchTerms('late chivalry')), 'every word, not any');
  assert.ok(entryMatches(late, []), 'no query finds everything');
});

test('the credits themselves are searched too', () => {
  assert.ok(CREDITS.lines.some((line) => creditMatches(line, searchTerms('captainfredric'))));
  assert.ok(CREDITS.lines.some((line) => creditMatches(line, searchTerms('performed'))));
  assert.ok(!CREDITS.lines.some((line) => creditMatches(line, searchTerms('fireball'))));
});

test('searching narrows the shelves to what it finds and drops the empty ones, keeping each shelf\'s whole count', () => {
  const shelves = librarySections(() => true);
  assert.equal(searchShelves(shelves, []), shelves, 'nothing searched: as it was');
  const found = searchShelves(shelves, searchTerms('late'));
  assert.ok(found.length >= 1 && found.length < shelves.length);
  for (const shelf of found) {
    assert.ok(shelf.entries.length >= 1 && shelf.entries.length <= shelf.total);
    assert.ok(shelf.entries.every((entry) => entryMatches(entry, searchTerms('late'))));
  }
  assert.ok(found.some((shelf) => shelf.entries.includes(late)));
  assert.deepEqual(searchShelves(shelves, searchTerms('zzzz no such line')), []);
});

test('what it finds is marked, and the text around it stays escaped', () => {
  assert.equal(highlight('NOOoo! I am going to be late!', searchTerms('late')), 'NOOoo! I am going to be <mark>late</mark>!');
  assert.equal(highlight('Fair and square', searchTerms('SQUARE fair')), '<mark>Fair</mark> and <mark>square</mark>');
  // a straight quote typed finds the curly one in the text
  assert.equal(highlight('The Spellblade’s Voice', searchTerms("spellblade's")), 'The <mark>Spellblade’s</mark> Voice');
  // nothing slips through unescaped, found or not, and a query is never read as a pattern
  assert.equal(highlight('<b>a & b</b>', searchTerms('&')), '&lt;b&gt;a <mark>&amp;</mark> b&lt;/b&gt;');
  assert.equal(highlight('one (two) three', searchTerms('(two')), 'one <mark>(two</mark>) three');
  assert.equal(highlight('<i>', []), '&lt;i&gt;');
});
