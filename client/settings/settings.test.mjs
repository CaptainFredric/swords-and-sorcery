import assert from 'node:assert/strict';
import test from 'node:test';
import { inputOptions, PARTICLE_DENSITY, RENDER_QUALITY, soundLevels, turnOptions, viewOptions } from './applySettings.mjs';
import { formatValue } from './SettingsPanel.mjs';
import { isBindableCode, keyLabel, registry, SettingsRegistry } from './settingsRegistry.mjs';
import { SettingsStore, STORAGE_KEY } from './SettingsStore.mjs';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

test('values are made safe: ranges clamp and step, toggles stay booleans, choices stay among their options', () => {
  assert.equal(registry.validate('audio.master', 140), 100);
  assert.equal(registry.validate('audio.master', -3), 0);
  assert.equal(registry.validate('audio.master', 62), 60, 'steps of 5');
  assert.equal(registry.validate('controls.mouseSensitivity', 1.234), 1.25);
  assert.equal(registry.validate('audio.master', 'loud'), 80, 'nonsense falls back to the default');
  assert.equal(registry.validate('display.damageNumbers', 'yes'), true);
  assert.equal(registry.validate('display.quality', 'ultra'), 'high');
  assert.equal(registry.validate('display.quality', 'low'), 'low');
});

test('declarations are checked, so a mistake in a new setting fails loudly', () => {
  const r = new SettingsRegistry().defineSection({ id: 'a', label: 'A' });
  assert.throws(() => r.defineSetting({ id: 'a.x', section: 'nope', label: 'X', type: 'toggle', default: false }), /unknown section/);
  assert.throws(() => r.defineSetting({ id: 'a.x', section: 'a', label: 'X', type: 'slider', default: 1 }), /type/);
  assert.throws(() => r.defineSetting({ id: 'a.x', section: 'a', label: 'X', type: 'choice', options: [{ value: 'b' }], default: 'c' }), /default/);
  r.defineSetting({ id: 'a.x', section: 'a', label: 'X', type: 'toggle', default: false });
  assert.throws(() => r.defineSetting({ id: 'a.x', section: 'a', label: 'X', type: 'toggle', default: false }), /already/);
  r.defineAction({ id: 'shout', label: 'Shout', keys: ['KeyG', 'KeyH', 'KeyJ'] });
  assert.deepEqual(r.actions.get('shout').keys, ['KeyG', 'KeyH'], 'two keys at most');
});

test('each device sees its own rows: key bindings and mouse on a desktop, touch look and button size on a phone', () => {
  const desktop = registry.settingsIn('controls', 'desktop').map((s) => s.id);
  const touch = registry.settingsIn('controls', 'touch').map((s) => s.id);
  assert.ok(desktop.includes('controls.mouseSensitivity') && !desktop.includes('controls.touchScale'));
  assert.ok(touch.includes('controls.touchScale') && !touch.includes('controls.mouseSensitivity'));
  assert.ok(registry.settingsIn('display', 'touch').some((s) => s.id === 'display.orientation'));
  assert.ok(!registry.settingsIn('display', 'desktop').some((s) => s.id === 'display.orientation'));
  assert.deepEqual(registry.sectionList('desktop').map((s) => s.id), ['audio', 'controls', 'display']);
});

test('a future feature adds its own tab, setting and key, and they are saved and validated like the rest', () => {
  const r = new SettingsRegistry()
    .defineSection({ id: 'loadout', label: 'LOADOUT', order: 40 })
    .defineSetting({ id: 'loadout.relic', section: 'loadout', label: 'Relic', type: 'choice', default: 'none', options: [{ value: 'none', label: 'None' }, { value: 'ember', label: 'Ember' }] })
    .defineAction({ id: 'ability.frostNova', label: 'Frost Nova', group: 'Abilities', keys: ['KeyF'] });
  const storage = memoryStorage();
  const store = new SettingsStore({ registry: r, storage });
  assert.equal(store.get('loadout.relic'), 'none');
  store.set('loadout.relic', 'ember');
  assert.equal(new SettingsStore({ registry: r, storage }).get('loadout.relic'), 'ember');
  assert.equal(store.actionFor('KeyF'), 'ability.frostNova');
  assert.deepEqual(r.sectionList('desktop').map((s) => s.id), ['loadout']);
});

test('settings survive a reload, and values this build does not know are kept for the build that does', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, values: { 'audio.master': 40, 'loadout.relic': 'ember' }, bindings: {} }) });
  const store = new SettingsStore({ registry, storage });
  assert.equal(store.get('audio.master'), 40);
  store.set('display.fov', 90);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.values['loadout.relic'], 'ember');
  assert.equal(saved.values['display.fov'], 90);
  assert.equal(new SettingsStore({ registry, storage }).get('display.fov'), 90);
});

test('the old sound switches carry over the first time', () => {
  const storage = memoryStorage({ 'ss-sound': JSON.stringify({ muted: false, volume: 0.6, music: false, musicVolume: 0.3 }) });
  const store = new SettingsStore({ registry, storage });
  assert.equal(store.get('audio.master'), 60);
  assert.equal(store.get('audio.musicMuted'), true);
  assert.equal(store.get('audio.music'), 30);
  assert.ok(storage.getItem(STORAGE_KEY), 'saved in the new place');
});

test('a key belongs to one action: rebinding takes it from the other, and a slot can be cleared', () => {
  const store = new SettingsStore({ registry, storage: memoryStorage() });
  assert.deepEqual(store.keysFor('spell'), ['KeyQ']);
  const changes = [];
  store.onChange((change) => changes.push(change));
  assert.equal(store.bind('spell', 0, 'KeyE'), 'dash', 'dash loses E');
  assert.deepEqual(store.keysFor('spell'), ['KeyE']);
  assert.deepEqual(store.keysFor('dash'), []);
  assert.equal(store.actionFor('KeyE'), 'spell');
  assert.equal(changes.at(-1).displaced, 'dash');
  store.bind('dash', 1, 'Mouse4');
  assert.deepEqual(store.keysFor('dash'), ['Mouse4']);
  store.bind('forward', 0, null);
  assert.deepEqual(store.keysFor('forward'), ['ArrowUp'], 'the alternate key remains');
  assert.equal(store.bind('jump', 0, 'Escape'), null);
  assert.deepEqual(store.keysFor('jump'), ['Space'], 'Escape stays the menu key');
  store.reset('bindings');
  assert.deepEqual(store.keysFor('spell'), ['KeyQ']);
  assert.deepEqual(store.keysFor('dash'), ['KeyE']);
});

test('reset puts one section back without touching the others', () => {
  const store = new SettingsStore({ registry, storage: memoryStorage() });
  store.set('audio.master', 20);
  store.set('display.fov', 95);
  store.reset('audio');
  assert.equal(store.get('audio.master'), 80);
  assert.equal(store.get('display.fov'), 95);
  store.reset();
  assert.equal(store.get('display.fov'), 78);
});

test('keys read like they do on the keycap', () => {
  assert.equal(keyLabel('KeyQ'), 'Q');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('ShiftLeft'), 'L-SHIFT');
  assert.equal(keyLabel('Mouse0'), 'LMB');
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel(undefined), '—');
  assert.ok(isBindableCode('KeyZ') && isBindableCode('Mouse3') && !isBindableCode('Escape') && !isBindableCode('F3') && !isBindableCode('Bogus'));
  assert.equal(formatValue({ unit: '%' }, 55), '55%');
  assert.equal(formatValue({ unit: '×' }, 1.2), '1.20×');
  assert.equal(formatValue({ unit: '°' }, 78), '78°');
});

test('each part of the game gets what it needs from the settings', () => {
  const store = new SettingsStore({ registry, storage: memoryStorage() });
  store.set('audio.master', 50);
  store.set('display.quality', 'low');
  store.set('display.cameraShake', 30);
  store.set('controls.touchScale', 120);
  store.set('display.orientation', 'sideways');
  assert.equal(soundLevels(store).master, 0.5);
  assert.equal(soundLevels(store).music, 0.55);
  assert.equal(viewOptions(store).pixelRatioCap, RENDER_QUALITY.low);
  // (Smooth also makes fewer of a burst's cosmetic particles: each is a draw of its own on an older phone)
  assert.equal(viewOptions(store).particles, PARTICLE_DENSITY.low);
  assert.ok(PARTICLE_DENSITY.low < PARTICLE_DENSITY.medium && PARTICLE_DENSITY.high === 1);
  assert.equal(viewOptions(store).cameraMotion, 0.3);
  assert.equal(viewOptions(store).fov, 78);
  assert.equal(inputOptions(store).touchScale, 1.2);
  assert.deepEqual(inputOptions(store).bindings.attack, ['Mouse0']);
  assert.deepEqual(turnOptions(store), { mode: 'sideways', side: 'left' });
});

test('the Armory keeps its choice here without becoming a Settings tab, and old key bindings follow a renamed action', () => {
  assert.ok(!registry.sectionList('desktop').some((section) => section.id === 'loadout'));
  assert.ok(!registry.sectionList('touch').some((section) => section.id === 'loadout'));
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, values: { 'loadout.spell': 'frostfire' }, bindings: { fireball: ['KeyR'] } }) });
  const store = new SettingsStore({ registry, storage });
  assert.equal(store.get('loadout.spell'), 'frostfire');
  assert.deepEqual(store.keysFor('spell'), ['KeyR'], 'bound as "fireball" before the rename');
  assert.equal(store.actionFor('KeyR'), 'spell');
  store.set('loadout.spell', 'lightning');
  assert.equal(store.get('loadout.spell'), 'fireball', 'an unknown spell falls back to the default');
});

test('prepared spells validate as three legal unique identities and are stored as independent arrays', () => {
  assert.deepEqual(registry.defaultBindings().guard, ['Mouse2', 'KeyG']);
  assert.equal(registry.validate('loadout.ultimate', 'chivalry'), 'chivalry');
  const storage = memoryStorage();
  const store = new SettingsStore({ registry, storage });
  assert.deepEqual(store.get('loadout.preparedSpells'), ['fireball', 'frostfire', 'gale']);
  store.set('loadout.preparedSpells', ['steel', 'gale', 'frostfire']);
  const returned = store.get('loadout.preparedSpells');
  returned[0] = 'fireball';
  assert.deepEqual(store.get('loadout.preparedSpells'), ['steel', 'gale', 'frostfire']);
  assert.deepEqual(new SettingsStore({ registry, storage }).get('loadout.preparedSpells'), ['steel', 'gale', 'frostfire']);
  store.set('loadout.preparedSpells', ['steel', 'steel', 'bogus']);
  const normalized = store.get('loadout.preparedSpells');
  assert.equal(normalized.length, 3);
  assert.equal(new Set(normalized).size, 3);
  assert.equal(normalized[0], 'steel');
});

test('prepared validator keeps all valid identities when corrupt entries precede them', () => {
  assert.deepEqual(registry.validate('loadout.preparedSpells', ['corrupt', 'steel', 'gale', 'frostfire']), ['steel', 'gale', 'frostfire']);
});
