// The Castleward Herald's notices: what has changed in the game, newest first. Plain data, kept here (not in the page),
// so a notice is one entry. Every dated entry is a change that has shipped, dated as it shipped (the day it reached the
// main line); nothing announced ahead of its time, no version numbers that do not exist, no counts of anyone. The
// encounters on the Spellblade's round are not named or described: finding them is the point.
//
//   latest: the notice at the head of the sheet ({ title, text: [paragraphs] })
//   changes: [{ date: 'YYYY-MM-DD', text }], newest first: the recent, verified changes
//   note: an optional short word from the game's maker (only ever in their own words: absent until they write one)

export const HERALD_NOTICES = Object.freeze({
  latest: Object.freeze({
    title: 'THE GATES OF CASTLEWARD ARE OPEN',
    text: Object.freeze([
      'Welcome to Castleward. Swords & Sorcery is a free fantasy arena game where swordplay meets sorcery.',
      'The game is still in its early stages. Thank you for playing, sharing feedback, and following its development. Castleward will keep growing through that work.',
      'The Spellblade is ready. His understanding of honor remains flexible.',
    ]),
  }),
  changes: Object.freeze([
    Object.freeze({ date: '2026-10-08', text: 'Added sixteen Spellblade lines, including two with replies across several encounters. Defeat dialogue now has subtitles.' }),
    Object.freeze({ date: '2026-10-07', text: 'Added two encounters to the Spellblade’s menu tour.' }),
    Object.freeze({ date: '2026-10-07', text: 'Added twenty-five voice lines and improved subtitle timing for dialogue with pauses.' }),
    Object.freeze({ date: '2026-10-06', text: 'Dashing while Sheathed in Steel now rams enemies you hit.' }),
    Object.freeze({ date: '2026-10-05', text: 'Added search to the Credits voice archive.' }),
    Object.freeze({ date: '2026-10-05', text: 'Added character previews for all three ultimates in the Armory.' }),
    Object.freeze({ date: '2026-10-05', text: 'Returning to the menu now keeps the game loaded.' }),
    Object.freeze({ date: '2026-10-05', text: 'Bot Duel now offers four difficulties and a three second opening countdown.' }),
    Object.freeze({ date: '2026-10-05', text: 'Phones and tablets start on Balanced quality.' }),
  ]),
  note: null,
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A notice's date as the Herald writes it: '2026-10-08' → '8 October' (the year only when it is not this one). */
export function heraldDate(iso, { year = null } = {}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) return '';
  const [, y, m, d] = match;
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${year !== null && Number(y) !== year ? ` ${y}` : ''}`;
}
