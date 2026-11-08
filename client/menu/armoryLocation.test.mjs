import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultArmoryLocation,
  normalizeArmoryLocation,
  loadArmoryLocation,
  saveArmoryLocation,
  STORAGE_KEY_LOCATION,
} from './armoryLocation.mjs';

test('defaultArmoryLocation returns kit and sorcery with inspector closed', () => {
  const loc = defaultArmoryLocation();
  assert.equal(loc.region, 'kit');
  assert.equal(loc.category, 'sorcery');
  assert.equal(loc.inspectorOpen, false);
  assert.equal(loc.siegeMachine, 'soFist');
  assert.equal(loc.siegeStoryExpanded, false);
});

test('normalizeArmoryLocation handles invalid and partial states safely', () => {
  assert.deepEqual(normalizeArmoryLocation(null), defaultArmoryLocation());
  assert.deepEqual(normalizeArmoryLocation({ region: 'invalid', category: 'unknown' }), defaultArmoryLocation());

  const valid = normalizeArmoryLocation({
    region: 'siege',
    category: 'masterstroke',
    inspectorOpen: true,
    highlightedItem: 'sunder',
    siegeMachine: 'fightFlight',
    siegeStoryExpanded: true,
  });
  assert.equal(valid.region, 'siege');
  assert.equal(valid.category, 'masterstroke');
  assert.equal(valid.inspectorOpen, true);
  assert.equal(valid.highlightedItem, 'sunder');
  assert.equal(valid.siegeMachine, 'fightFlight');
  assert.equal(valid.siegeStoryExpanded, true);
});

test('loadArmoryLocation and saveArmoryLocation roundtrip state via storage', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
  };

  assert.deepEqual(loadArmoryLocation(storage), defaultArmoryLocation());

  saveArmoryLocation(storage, {
    region: 'heraldry',
    category: 'sorcery',
    highlightedItem: 'cobalt',
  });

  const restored = loadArmoryLocation(storage);
  assert.equal(restored.region, 'heraldry');
  assert.equal(restored.highlightedItem, 'cobalt');
  assert.equal(restored.inspectorOpen, false);
});
