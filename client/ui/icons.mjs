// The game's icons: one line-drawn set (24-unit square, stroked in the current colour, round ends) shared by the
// desktop HUD's tiles and the touch buttons, so a spell or an action looks the same wherever it shows. Pure strings,
// so they can be tested and dropped into any markup.

// Shared projectile and carriage motifs, composed rather than redrawn for BOTH
// and the Skill emblem. Each stays distinguishable in a 24-unit SVG.
const BOLT_I='<path d="M12 1 8.6 7.4h2v11h2.8v-11h2z" fill="#83ddff" stroke="#baf3ff" stroke-width=".9"/><path d="m10.6 18.4-2.4 3.4 3.8-1.3 3.8 1.3-2.4-3.4" fill="#64bbec" stroke="#baf3ff" stroke-width=".8"/>';
const BOLT_II='<path d="M12 1 5.4 9.5 10 8.4v10.3h4V8.4l4.6 1.1z" fill="#e1d8c4" stroke="#faf0d7" stroke-width=".8"/><path d="M10 17.5 5 22l7-1.8 7 1.8-5-4.5" fill="#aab3bb" stroke="#f1e6cb" stroke-width=".9"/><path d="M11 9h2v9h-2z" fill="#7b858e" stroke="none"/>';
const CARRIAGE_WHEEL='<circle cx="12" cy="12" r="9" fill="none" stroke="#dfc89c" stroke-width="2.2"/><circle cx="12" cy="12" r="2.6" fill="#7d8890" stroke="#eee2c8" stroke-width="1.1"/><path d="M12 3v6.3M12 14.6V21M3 12h6.3M14.7 12H21M5.6 5.6l4.4 4.4M14 14l4.4 4.4M18.4 5.6 14 10M10 14l-4.4 4.4" fill="none" stroke="#c4ad84" stroke-width="1.2"/>';

// Four raised knuckle plates, a folded thumb and a flared metal cuff keep
// the ram's armored fist legible at touch-button size.
const RAM_GAUNTLET='<g stroke-linejoin="round" stroke-width="1"><path d="M6 15h13l2 7H4z" fill="#aa9064" stroke="currentColor"/><path d="M7 18h11M8 20h9" stroke="#4a4134" fill="none"/><path d="M5 7V4l2-1h2l1 1V3l2-1h2l1 2 1-1h2l1 2h2l1 2v6l-4 5H8l-4-5V9z" fill="#606d76" stroke="currentColor"/><path d="M6 5h3v6H6zM10 4h4v7h-4zM15 5h3v6h-3zM19 7h2v5h-2z" fill="#c5cbd0" stroke="#30393f"/><path d="M9 12h11l-3 4h-6z" fill="#929fa8" stroke="#30393f"/><path d="m4 9 3-1 6 4-2 4-4-1-3-3z" fill="#b5bfc5" stroke="#30393f"/><path d="m7 10 3 2" fill="none" stroke="#5c6870"/></g>';

export const ICONS = Object.freeze({
  attack: '<path d="m19 2 2 2-10 12-3-3z" fill="currentColor" stroke="none"/><path d="m6 12 6 6M8 16l-4 5-2-2 5-4"/>',
  guard: '<path d="m12 2 8 3-1 9-7 8-7-8-1-9z"/><path d="M12 5v12M7 7l1 6 4 4"/>',
  fireball: '<path d="M12 2.8c.9 3.7 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-4 2.6-5.3.3 1.7 1 2.7 2.1 3.2-.5-3 .1-5.5.3-7.9z"/>',
  // A heavy fissured stone with flames breaking its upper edge.
  coreflagration: '<path d="M7 8 11 5l5 2 3 5-2 7-7 1-5-5z"/><path d="m11 5 1-3 2 3M8 11l4 3 4-2M12 14l-1 5"/>',
  frostfire: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  // three lines of wind, curling at their ends
  gale: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  // Sheathe in Steel: a riveted plate, banded across (armour, not the Guard's plain shield)
  steel: '<path d="m7 3 5 2 5-2 4 6-3 11H6L3 9z"/><path d="m7 3 2 8h6l2-8M9 11l-1 6h8l-1-6M6 8h.01M18 8h.01"/>',
  // the gauntlet: a closed armoured fist driving forward, a line of speed behind it
  gauntlet: '<path d="M8.5 6.5h8a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H11a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M12.5 6.5v4M16.5 6.5v4M8.5 13h5"/><path d="M8.5 8.5h-3v7h3"/><path d="M1.5 9.5h2M1 14.5h2.5"/>',
  dash: '<path d="M4 8h6M3 12h8M4 16h6M13 6l6 6-6 6"/>',
  // Sunder All That Rusts: a sword driven point down into the ground, the ground split either side of it
  sunder: '<path d="M10 4h4v11l-2 3-2-3z" fill="currentColor" stroke="none"/><path d="M12 1v3M7 6h10M2 19l4-2 3 3 3-2 3 2 3-3 4 2M6 12l-3 2M18 12l3 2"/>',
  // Blazing Vortex: a turning spiral, and the spark it starts from
  vortex: '<path d="M6 7C1 11 5 20 13 20c6 0 9-5 7-10M5 7l1-4 3 3M19 10l3-1-1-3"/><path d="m16 4 3 3-9 9-3-3z" fill="currentColor" stroke="none"/><path d="m5 12 6 6M3 19l4-4M12 3l-2 3 1 2"/>',
  chivalry: '<path d="m7 3 2 2-3 10-3-1zM14 10l4-4 4 5-4 4z" fill="currentColor" stroke="none"/><path d="m2 13 7 2M5 16l-1 5M18 2v3M13 6l2 2M23 6l-2 2M12 20l2-4 4 3 3-2"/>',
  jump: '<path d="M12 18V6M6.5 11.5 12 6l5.5 5.5M6 21h12"/>',
  sprint: '<path d="M6 12.5 12 7l6 5.5M6 18.5 12 13l6 5.5"/>',
  // a chevron pressed down to a line
  crouch: '<path d="M6 7.5 12 13l6-5.5M6 18.5h12"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  scores: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  // Target signifies the Practice Yard; distinct from Pause and Scores.
  practiceTools: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/>',
  interact: '<path d="M12 4v12M8 8l4-4 4 4M4 20h16"/>',
  rise: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  lower: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  fireAway: '<path d="M3 5h10M10 2l4 3-4 3M6 12h14M17 9l4 3-4 3M2 19h11M10 16l4 3-4 3"/>',
  // Three trajectories converge on one exposed target. The right-side arrow
  // is deliberately counter-directed to make the three approaches distinct.
  narrowToOne: '<circle cx="17.5" cy="12.5" r="3.2"/><circle cx="17.5" cy="12.5" r=".7" fill="currentColor" stroke="none"/><path d="M2 21 13.9 14.3m-4.4-.1 4.4.1-2.3 3.5M21 2l-3 7.2m-1.3-4.2 1.3 4.2 3-2.7M23 12.5h-2.1m1.8-2-1.8 2 1.8 2"/>',
  // A saintly halo encircles the crossed sword-propeller, with swept arcs
  // suggesting rotation rather than a static heraldic pair.
  doNotStopMyAscension: '<ellipse cx="12" cy="12" rx="10" ry="9"/><path d="M3.4 7.3A9.6 8.6 0 0 1 18 4.8m2.6 12A9.6 8.6 0 0 1 6 19.2M18 2.9l.1 3-2.8-.8M6 21.1l-.1-3 2.8.8"/><path d="m6.2 6.1 9.7 9.7m-2.1 1.9 3.9-3.9m-2.2 2.2 2.7 2.7-1.4 1.4-2.7-2.7M17.8 6.1 8.1 15.8m2.1 1.9-3.9-3.9m2.2 2.2-2.7 2.7 1.4 1.4 2.7-2.7"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  repeater: '<path d="M4 12h15M15 8l6 4-6 4M2 8l4 4-4 4"/>',
  flightDash: '<path d="M12 3 6 12l4-1v10h4V11l4 1z" fill="currentColor" stroke="none"/><path d="M3 8v5M21 8v5M6 17v4M18 17v4"/>',
  eject: '<path d="M12 15V2m-4 4 4-4 4 4M5 13v7h14v-7M3 17h4M17 17h4"/>',
  boltI: BOLT_I,
  boltII: BOLT_II,
  boltBoth: '<g transform="translate(0 3) scale(.5 .82)">' + BOLT_I + '</g><g transform="translate(12 0) scale(.5 1)">' + BOLT_II + '</g>',
  ballistaWheel: CARRIAGE_WHEEL,
  boltToTheOccasion: '<g opacity=".78">' + CARRIAGE_WHEEL + '</g><g>' + BOLT_II + '</g>',
  heavyBolt: BOLT_II,
  frostBolt: '<path d="M12 2v20M9 5l3-3 3 3M5 8l14 8M5 16l14-8M6 6l1 3-3 1M18 6l-1 3 3 1M6 18l1-3-3-1M18 18l-1-3 3-1"/>',
  ram: RAM_GAUNTLET,
  // A pale clock face and dark hands remain visible above the fist; the
  // lower rim breaks around its raised knuckles.
  // Detachable armored fist accelerating away from its exposed steel piston.
  longArmToTheJaw: '<path d="M2 12h6M3 8h5M4 16h4" stroke="currentColor" fill="none" stroke-width="1.8"/><path d="m7 8 2 4-2 4" fill="none" stroke="currentColor" stroke-width="1.1"/><g transform="translate(8 2) scale(.66)">' + RAM_GAUNTLET + '</g>',
  beatToThePunch: '<g stroke-width="1.15" stroke-linejoin="round"><path d="M7 13a8 8 0 1 1 13 1l-2 .5-1-2-2 3-2-1-2 1z" fill="#e8d7ac" stroke="currentColor"/><path d="M14 2v2M21 9h-2M7 9h2M14 5v4l3-2M18.5 3.5l-1 1M9.5 3.5l1 1" fill="none" stroke="#343b3d" stroke-linecap="square"/><circle cx="14" cy="9" r=".7" fill="#343b3d" stroke="none"/><path d="m20 16 2-1 .5 2-2 1z" fill="#e8d7ac" stroke="none"/></g><g transform="translate(0 8) scale(.68)"><g transform="rotate(25 12 12)">' + RAM_GAUNTLET + '</g></g>',
  siegeBoth: '<g transform="translate(0 3) scale(.5 .82)">' + BOLT_I + '</g><g transform="translate(12 0) scale(.5 1)">' + BOLT_II + '</g>',
  siegeSkill: '<path d="M12 2v20M9 5l3-3 3 3M2 11l4-3h12l4 3-10 5zM9 20h6"/>',
  siegeWeapon: '<path d="M4 8h16l-4-4M20 16H4l4 4"/>',
  siegeView: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  deploy: '<path d="M4 12h16M12 4v16M7 7l10 10M17 7l-10 10"/>',
});

/** An icon as inline SVG markup (a missing name falls back to `fallback`). */
export function iconSvg(name, fallback = 'fireball') {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS[fallback]}</svg>`;
}
