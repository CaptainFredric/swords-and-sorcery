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
    title: 'The front door steps aside',
    text: Object.freeze([
      'WATCH THE YARD, at the foot of the screen on the right, draws the banner aside and gives the Spellblade’s round the whole screen. SHOW MENU, or Escape, brings it back.',
      'Left alone on the front door for a minute and a half, the banner yields to the yard by itself. Any movement brings it straight back.',
    ]),
  }),
  changes: Object.freeze([
    Object.freeze({ date: '2026-10-08', text: 'Sixteen new lines for the Spellblade, two of them said over several returns. The defeat screen now writes out what he says.' }),
    Object.freeze({ date: '2026-10-07', text: 'Two new encounters on the Spellblade’s round behind the front door.' }),
    Object.freeze({ date: '2026-10-07', text: 'Twenty-five new lines. Where a pause carries the joke, the subtitle waits for it.' }),
    Object.freeze({ date: '2026-10-06', text: 'Sheathed in Steel, a Dash now rams whoever it meets.' }),
    Object.freeze({ date: '2026-10-05', text: 'The Credits can be searched.' }),
    Object.freeze({ date: '2026-10-05', text: 'The Armory performs its ultimates: Sunder’s slam, the Vortex’s spin, Spells & Chivalry.' }),
    Object.freeze({ date: '2026-10-05', text: 'Return to Menu goes back in place: no reload, no loading screen.' }),
    Object.freeze({ date: '2026-10-05', text: 'Bot Duel has four difficulties, Squire to The Spellblade, and opens with three seconds of peace.' }),
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
