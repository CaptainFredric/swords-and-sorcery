// The Spellblade's longsword's colours, as data (swordFinish.mjs applies them as each model loads): the armour kit's
// colour for each of its parts (linear rgb) and what each becomes.

// the kit's colours for the sword's parts (linear), and what each becomes (linear)
export const SWORD_FINISH = Object.freeze([
  { part: 'blade', from: [0.40, 0.37, 0.64], to: [0.34, 0.355, 0.38] },
  { part: 'ridge', from: [0.32, 0.30, 0.52], to: [0.23, 0.245, 0.27] },
  { part: 'binding', from: [0.08, 0.07, 0.13], to: [0.05, 0.052, 0.062] },
  { part: 'guard', from: [1.00, 0.66, 0.59], to: [0.4, 0.27, 0.09] },
  { part: 'guard shade', from: [0.85, 0.54, 0.48], to: [0.23, 0.145, 0.05] },
]);

/** The finished colour for a sword vertex of this kit colour (linear rgb), or the colour itself if it is none of them. */
export function finishedSwordColour(rgb) {
  let best = null;
  let bestDistance = Infinity;
  for (const entry of SWORD_FINISH) {
    const d = Math.hypot(rgb[0] - entry.from[0], rgb[1] - entry.from[1], rgb[2] - entry.from[2]);
    if (d < bestDistance) { best = entry; bestDistance = d; }
  }
  return bestDistance < 0.06 ? best.to : rgb;
}
