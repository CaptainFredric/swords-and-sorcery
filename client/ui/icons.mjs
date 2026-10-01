// The game's icons: one line-drawn set (24-unit square, stroked in the current colour, round ends) shared by the
// desktop HUD's tiles and the touch buttons, so a spell or an action looks the same wherever it shows. Pure strings,
// so they can be tested and dropped into any markup.

export const ICONS = Object.freeze({
  attack: '<path d="M20 4 9 15M6 12l6 6M7.5 16.5 4 20"/>',
  guard: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
  fireball: '<path d="M12 2.8c.9 3.7 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-4 2.6-5.3.3 1.7 1 2.7 2.1 3.2-.5-3 .1-5.5.3-7.9z"/>',
  frostfire: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  // three lines of wind, curling at their ends
  gale: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  // Sheathe in Steel: a riveted plate, banded across (armour, not the Guard's plain shield)
  steel: '<path d="M5 6.5 12 4l7 2.5V12c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5z"/><path d="M5.2 11h13.6M12 11v8.8"/><path d="M8.5 8.2h.01M15.5 8.2h.01"/>',
  // the gauntlet: a closed armoured fist driving forward, a line of speed behind it
  gauntlet: '<path d="M8.5 6.5h8a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H11a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M12.5 6.5v4M16.5 6.5v4M8.5 13h5"/><path d="M8.5 8.5h-3v7h3"/><path d="M1.5 9.5h2M1 14.5h2.5"/>',
  dash: '<path d="M4 8h6M3 12h8M4 16h6M13 6l6 6-6 6"/>',
  // Sunder All That Rusts: a sword driven point down into the ground, the ground split either side of it
  sunder: '<path d="M12 2.5v11.5M9 5.5h6M12 14l-1.6 2.6M12 14l1.6 2.6"/><path d="M2.5 20.5 6 18.5l2.5 1.7L11 18.2M13 18.2l2.5 2 2.5-1.7 3.5 2"/>',
  // Blazing Vortex: a turning spiral, and the spark it starts from
  vortex: '<path d="M12 12a2 2 0 0 1 2-2 4 4 0 0 1 4 4 6 6 0 0 1-6 6 8 8 0 0 1-8-8 8.5 8.5 0 0 1 7-8.4"/><path d="M18.5 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  jump: '<path d="M12 18V6M6.5 11.5 12 6l5.5 5.5M6 21h12"/>',
  sprint: '<path d="M6 12.5 12 7l6 5.5M6 18.5 12 13l6 5.5"/>',
  // a chevron pressed down to a line
  crouch: '<path d="M6 7.5 12 13l6-5.5M6 18.5h12"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  scores: '<path d="M5 7h14M5 12h14M5 17h14"/>',
});

/** An icon as inline SVG markup (a missing name falls back to `fallback`). */
export function iconSvg(name, fallback = 'fireball') {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS[fallback]}</svg>`;
}
