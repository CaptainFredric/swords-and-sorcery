const dye = (id, name, price, color, tint, description) => Object.freeze({ id, name, price, color, tint: Object.freeze(tint), description });
// Prices are cosmetic only. Tint ratios are applied to the cloth's authored red channel, preserving its folds.
export const CLOTH = Object.freeze({
  crimson: dye('crimson', 'Castleward Crimson', 0, '#79313b', [1, 1, 1], 'The original standard of Castleward.'),
  azure: dye('azure', 'Azure Standard', 40, '#396ba8', [0.20, 0.52, 1.25], 'Deep blue cloth for a steady sword hand.'),
  forest: dye('forest', 'Verdant Oath', 40, '#437b53', [0.20, 0.68, 0.37], 'Woodland green, sworn to the watch.'),
  ivory: dye('ivory', 'Ivory Watch', 60, '#d9caa7', [1.6, 1.42, 1.05], 'Warm ivory beneath the castle banners.'),
  violet: dye('violet', 'Royal Amethyst', 60, '#8053a4', [0.70, 0.28, 1.10], 'A violet standard with a regal bearing.'),
  charcoal: dye('charcoal', 'Ashen Guard', 80, '#515359', [0.24, 0.26, 0.30], 'Charcoal cloth for the last watch.'),
});
export function clothChoice(id) { return Object.hasOwn(CLOTH, id) ? CLOTH[id] : CLOTH.crimson; }
