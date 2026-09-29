export const CLOTH = Object.freeze({
  crimson: Object.freeze({ id: 'crimson', name: 'Castleward Crimson', price: 0, color: '#79313b' }),
  azure: Object.freeze({ id: 'azure', name: 'Azure Standard', price: 40, color: '#315e96' }),
});
export function clothChoice(id) { return Object.hasOwn(CLOTH, id) ? CLOTH[id] : CLOTH.crimson; }
