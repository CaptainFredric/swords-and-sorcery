import test from 'node:test';
import assert from 'node:assert/strict';
import * as archive from './creditsSearch.mjs';

const entries = [{ line: 'old', title: 'Zebra' }, { line: 'new', title: 'Apple' }, { line: 'unknown', title: 'Unknown' }];
const dates = new Map([['old', '2026-09-29'], ['new', '2026-10-16']]);

test('newest and oldest archive sorting use first addition dates and leave undated lines last', () => {
  assert.deepEqual(archive.sortArchiveEntries(entries, 'newest', dates).map(e => e.line), ['new', 'old', 'unknown']);
  assert.deepEqual(archive.sortArchiveEntries(entries, 'oldest', dates).map(e => e.line), ['old', 'new', 'unknown']);
  assert.deepEqual(entries.map(e => e.line), ['old', 'new', 'unknown']);
});

test('alphabetical sorting is stable across matching dates and search result subsets', () => {
  assert.deepEqual(archive.sortArchiveEntries(entries, 'title', dates).map(e => e.line), ['new', 'unknown', 'old']);
  assert.deepEqual(archive.sortArchiveEntries(entries.slice(0, 2), 'newest', new Map()).map(e => e.line), ['new', 'old']);
});
