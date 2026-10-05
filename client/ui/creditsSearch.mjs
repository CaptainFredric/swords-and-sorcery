// Searching the Credits (CreditsPanel.mjs): what a query finds among the credits and the voice library. Every word
// typed must appear somewhere in a line's title, its words, when he says it, its note, its section or its recording
// status, in any order, ignoring case, accents and curly quotes. Pure, so it is tested.

/** Text as it is compared: lower case, accents and curly quotes undone, runs of space made one. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The words of a query (none: nothing is being searched for). */
export function searchTerms(query) {
  return normalize(query).split(' ').filter(Boolean);
}

const haystack = (...fields) => normalize(fields.filter((field) => field !== null && field !== undefined).join(' • '));

/** Whether every term is found in a voice library entry (with its section and its status as the Credits print it). */
export function entryMatches(entry, terms, status = '') {
  if (!terms.length) return true;
  const text = haystack(entry.title, entry.words, entry.when, entry.note, entry.section, status);
  return terms.every((term) => text.includes(term));
}

/** Whether every term is found in a line of the credits themselves ({ role, name }). */
export function creditMatches(line, terms) {
  if (!terms.length) return true;
  const text = haystack(line.role, line.name);
  return terms.every((term) => text.includes(term));
}

/**
 * The library's shelves ({ group, section, entries }) narrowed to what the terms find; shelves left empty are dropped.
 * statusOf(entry): its status as printed (searched with it).
 */
export function searchShelves(shelves, terms, statusOf = () => '') {
  if (!terms.length) return shelves;
  return shelves
    .map((shelf) => ({ ...shelf, total: shelf.entries.length, entries: shelf.entries.filter((entry) => entryMatches(entry, terms, statusOf(entry))) }))
    .filter((shelf) => shelf.entries.length);
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` as HTML (escaped), with what the terms found in it marked (<mark>). A straight quote typed finds a curly one
 * in the text too.
 */
export function highlight(text, terms) {
  const raw = String(text ?? '');
  if (!terms.length || !raw) return escapeHtml(raw);
  const pattern = terms
    .map((term) => escapeRegExp(term).replace(/'/g, "['‘’ʼ]").replace(/"/g, '["“”]').replace(/-/g, '[-–—]'))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const found = new RegExp(pattern, 'gi');
  let html = '';
  let at = 0;
  for (const match of raw.matchAll(found)) {
    if (!match[0]) continue;
    html += `${escapeHtml(raw.slice(at, match.index))}<mark>${escapeHtml(match[0])}</mark>`;
    at = match.index + match[0].length;
  }
  return html + escapeHtml(raw.slice(at));
}
