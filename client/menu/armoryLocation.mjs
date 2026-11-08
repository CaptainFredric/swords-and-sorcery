// Persistence and restoration of the player's browsing location in the Armory.
// Distinguishes browsing context (region, category, highlighted item) from actual equipped gameplay loadout.

export const ARMORY_REGIONS = Object.freeze(['kit', 'siege', 'heraldry', 'challenges']);
export const ARMORY_CATEGORIES = Object.freeze(['technique', 'sorcery', 'masterstroke']);
export const SIEGE_MACHINE_IDS = Object.freeze(['soFist', 'biBye', 'fightFlight']);

export const STORAGE_KEY_LOCATION = 'ss-armory-location';

export function defaultArmoryLocation() {
  return {
    region: 'kit',
    category: 'sorcery',
    inspectorOpen: false,
    highlightedItem: null,
    siegeMachine: 'soFist',
    siegeStoryExpanded: false,
  };
}

export function normalizeArmoryLocation(raw) {
  if (!raw || typeof raw !== 'object') return defaultArmoryLocation();
  const region = ARMORY_REGIONS.includes(raw.region) ? raw.region : 'kit';
  const category = ARMORY_CATEGORIES.includes(raw.category) ? raw.category : 'sorcery';
  const inspectorOpen = Boolean(raw.inspectorOpen);
  const highlightedItem = typeof raw.highlightedItem === 'string' && raw.highlightedItem.length > 0 ? raw.highlightedItem : null;
  const siegeMachine = SIEGE_MACHINE_IDS.includes(raw.siegeMachine) ? raw.siegeMachine : 'soFist';
  const siegeStoryExpanded = Boolean(raw.siegeStoryExpanded);

  return {
    region,
    category,
    inspectorOpen,
    highlightedItem,
    siegeMachine,
    siegeStoryExpanded,
  };
}

export function loadArmoryLocation(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY_LOCATION);
    if (!raw) return defaultArmoryLocation();
    return normalizeArmoryLocation(JSON.parse(raw));
  } catch {
    return defaultArmoryLocation();
  }
}

export function saveArmoryLocation(storage = globalThis.localStorage, state = {}) {
  try {
    const normalized = normalizeArmoryLocation(state);
    storage?.setItem?.(STORAGE_KEY_LOCATION, JSON.stringify(normalized));
    return normalized;
  } catch {
    return defaultArmoryLocation();
  }
}
