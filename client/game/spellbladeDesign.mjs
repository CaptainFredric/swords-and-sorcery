export const SPELLBLADE_PALETTE = Object.freeze({
  darkArmor: 0x252b35,
  armor: 0x535d6d,
  armorLight: 0x7b8797,
  cloth: 0x762d35,
  leather: 0x4a3529,
  trim: 0x9b7b4a,
  blade: 0xc9d2dc,
  bladeRidge: 0x8793a2,
  magic: 0x55d9ff,
});

export const SPELLBLADE_PROPORTIONS = Object.freeze({
  bodyHeight: 2.04,
  shoulderSpan: 1.18,
  chestTopWidth: 0.82,
  waistWidth: 0.55,
  helmetWidth: 0.50,
  visorWidth: 0.34,
  bootWidth: 0.36,
  shinWidth: 0.27,
});

export const SPELLBLADE_SWORD = Object.freeze({
  bladeLength: 1.30,
  bladeWidth: 0.24,
  bladeThickness: 0.085,
  guardWidth: 0.66,
  gripLength: 0.34,
  pommelRadius: 0.12,
});

export const REQUIRED_SPELLBLADE_RIG_KEYS = Object.freeze([
  'visual', 'pelvis', 'torso', 'head', 'visor', 'tabardFront', 'tabardBack',
  'leftUpperArm', 'leftForearm', 'rightUpperArm', 'rightForearm',
  'leftThigh', 'leftShin', 'rightThigh', 'rightShin', 'sword',
  'magicAnchor', 'magic', 'magicHalo', 'accentMaterial',
]);
