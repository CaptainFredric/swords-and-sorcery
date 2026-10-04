// The credits, and the Spellblade's voice library: every line he has (or will have), what he says, when he says it,
// and a word on why. Shown from the settings' footer (a quiet button, not a menu item). Pure data, drawn from the
// lines' own declarations, so nothing here can fall out of step with the game.

import { VOICE_LINE_LIST, VOICE_SECTIONS, partText, voiceLine } from '../game/sound/voiceLines.mjs';
import { RECORDED_STINGERS } from '../game/sound/recordedStingers.mjs';

export const CREDITS = Object.freeze({
  title: 'SWORDS & SORCERY',
  lines: Object.freeze([
    Object.freeze({ role: 'Created and designed by', name: 'CaptainFredric' }),
    Object.freeze({ role: 'The Spellblade — performed by', name: 'CaptainFredric' }),
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
  // (a line said in parts: how many; its recordings are those parts, heard in the Credits as one)
  parts: line.parts?.length ?? 0,
  // where it stands in the library: authored on the line (voiceLines.mjs `section`), never worked out from its triggers
  section: line.section,
})));

// The library's groups, in the order the Credits show them: his voice, the sounds of the fight, then the music that
// was performed for him. Each group's sections fold away.
export const LIBRARY_GROUPS = Object.freeze([
  Object.freeze({ id: 'voice', title: 'The Spellblade’s Voice', sections: VOICE_SECTIONS.voice }),
  Object.freeze({ id: 'sounds', title: 'Combat Sounds', sections: VOICE_SECTIONS.sounds }),
  Object.freeze({ id: 'music', title: 'Music & Stingers', sections: Object.freeze([]) }),
]);

// the music performed for him (client/game/sound/recordedStingers.mjs), as the Credits show it
export const MUSIC_LIBRARY = Object.freeze([
  Object.freeze({
    stinger: 'spellsChivalry', title: RECORDED_STINGERS.spellsChivalry.title, source: 'The Spells & Chivalry ultimate’s stinger',
    when: 'Associated with the ultimate’s activation and presentation.', note: 'Mastery receives accompaniment.',
  }),
]);

/** The library by section (in its group's order), each section's lines in the order the Credits show them. */
export function librarySections(isRecorded) {
  const ordered = libraryInOrder(isRecorded);
  return LIBRARY_GROUPS.filter((group) => group.sections.length).flatMap((group) => group.sections.map((section) => ({
    group: group.id, section, entries: ordered.filter((entry) => entry.section === section),
  }))).filter((shelf) => shelf.entries.length);
}

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

/**
 * A line's words as its subtitle shows them: null for anything without words (a grunt, a breath). part: which part of
 * a line said in parts is being said (its own words, not the whole line's).
 */
export function subtitleFor(line, part = null) {
  const entry = BY_LINE.get(line);
  if (!entry || entry.kind !== 'sentence' || entry.words.startsWith('(')) return null;
  if (!entry.parts || part === null) return entry.words;
  // (two parts: each its own words; a sentence said a word at a time: the sentence so far)
  return entry.parts > 2 ? voiceLine(line).parts.slice(0, part + 1).join(' ') : partText(line, part);
}
