// The credits, and the Spellblade's voice library: every line he has (or will have), what he says, when he says it,
// and a word on why. Shown from the settings' footer (a quiet button, not a menu item). Pure data, drawn from the
// lines' own declarations, so nothing here can fall out of step with the game.

import { VOICE_LINE_LIST } from '../game/sound/voiceLines.mjs';

export const CREDITS = Object.freeze({
  title: 'SWORDS & SORCERY',
  lines: Object.freeze([
    Object.freeze({ role: 'Created and designed by', name: 'CaptainFredric' }),
    Object.freeze({ role: 'The Spellblade voiced by', name: 'CaptainFredric' }),
  ]),
});

// Every line as the Credits show it, from its declaration (client/game/sound/voiceLines.mjs: one entry there is the
// whole of a line, this page included). `when` is the Credits' description of when he says it, `note` the dry word on
// it (both as the voice's author wrote them); coming: what a line recorded or declared ahead of its time waits for.
export const VOICE_LIBRARY = Object.freeze(VOICE_LINE_LIST.map((line) => Object.freeze({
  line: line.id,
  title: line.credits.title,
  words: line.text,
  when: line.credits.description,
  note: line.credits.note,
  kind: line.kind,
  coming: line.coming,
})));

const BY_LINE = new Map(VOICE_LIBRARY.map((entry) => [entry.line, entry]));

/**
 * What the library says of a line: 'live' (recorded, in the game now), 'coming' (recorded, waiting on what it belongs
 * to), 'unrecorded' (a place kept: declared, silent until its take is dropped in). recorded: whether it has a take.
 */
export function libraryStatus(entry, recorded) {
  if (!recorded) return 'unrecorded';
  return entry.coming ? 'coming' : 'live';
}

/** The status as the Credits print it: nothing for a line in the game (its play button says so). */
export function statusLabel(entry, recorded) {
  const status = libraryStatus(entry, recorded);
  if (status === 'live') return '';
  if (status === 'coming') return `WITH ${String(entry.coming).toUpperCase()}`;
  return entry.coming ? `${String(entry.coming).replace(/^the /i, '').toUpperCase()} · NO RECORDING` : 'NO RECORDING';
}

const SHELF = Object.freeze({ live: 0, coming: 1, unrecorded: 2 });

/**
 * The library in the order the Credits show it: what is in the game, then what waits, then the places kept; on each
 * shelf the spoken lines before the grunts and breaths.
 */
export function libraryInOrder(isRecorded) {
  return VOICE_LIBRARY
    .map((entry, index) => ({ entry, index, shelf: SHELF[libraryStatus(entry, isRecorded(entry.line))], grunt: entry.kind === 'exertion' ? 1 : 0 }))
    .sort((a, b) => a.shelf - b.shelf || a.grunt - b.grunt || a.index - b.index)
    .map(({ entry }) => entry);
}

/** A line's words as its subtitle shows them: null for anything without words (a grunt, a breath). */
export function subtitleFor(line) {
  const entry = BY_LINE.get(line);
  return entry && entry.kind === 'sentence' && !entry.words.startsWith('(') ? entry.words : null;
}
