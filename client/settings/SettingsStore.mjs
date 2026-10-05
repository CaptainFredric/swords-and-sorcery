// The player's settings: loaded from the browser, checked against the registry, saved on every change, and handed to
// whoever listens. Values for settings this build does not know are kept as they were (a newer or older version of
// the game may know them), so switching versions never loses a setting.

import { isBindableCode } from './settingsRegistry.mjs';

export const STORAGE_KEY = 'ss-settings';
export const SETTINGS_VERSION = 1;

// settings kept by earlier versions under their own keys, folded in once
const LEGACY = {
  // the sound switches: { muted, volume 0..1, music: on, musicVolume 0..1 }
  'ss-sound': (old) => ({
    ...(typeof old.muted === 'boolean' ? { 'audio.muted': old.muted } : {}),
    ...(Number.isFinite(old.volume) ? { 'audio.master': Math.round(old.volume * 100) } : {}),
    ...(typeof old.music === 'boolean' ? { 'audio.musicMuted': !old.music } : {}),
    ...(Number.isFinite(old.musicVolume) ? { 'audio.music': Math.round(old.musicVolume * 100) } : {}),
  }),
};

// actions that were renamed: a key bound under the old name keeps working under the new one
const RENAMED_ACTIONS = { fireball: 'spell' };

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}

export class SettingsStore {
  /** device: 'touch' on a phone or tablet (settings with a touch default start there), else 'desktop'. */
  constructor({ registry, storage = globalThis.localStorage, device = 'desktop' } = {}) {
    this.registry = registry;
    this.storage = storage;
    this.device = device;
    this.values = {};
    this.bindings = {};
    this.listeners = new Set();
    this.#load();
  }

  /** The current value (the default until the player changes it). */
  get(id) {
    return id in this.values ? this.registry.validate(id, this.values[id], this.device) : this.registry.defaultValue(id, this.device);
  }

  /** Set a value (made valid first). Returns the value kept. */
  set(id, value) {
    const valid = this.registry.validate(id, value, this.device);
    const current = this.get(id);
    if (id in this.values && (current === valid || (Array.isArray(current) && Array.isArray(valid) && JSON.stringify(current) === JSON.stringify(valid)))) return valid;
    this.values[id] = Array.isArray(valid) ? [...valid] : valid;
    this.#save();
    this.#emit({ type: 'setting', id, value: valid });
    return valid;
  }

  toggle(id) {
    return this.set(id, !this.get(id));
  }

  /** The keys bound to an action (its defaults until the player rebinds it). */
  keysFor(action) {
    return this.bindings[action] ?? [...(this.registry.actions.get(action)?.keys ?? [])];
  }

  /** Every action's keys. */
  allBindings() {
    return Object.fromEntries(this.registry.actionList().map((action) => [action.id, this.keysFor(action.id)]));
  }

  /** The action a key fires, if any. */
  actionFor(code) {
    for (const action of this.registry.actionList()) if (this.keysFor(action.id).includes(code)) return action.id;
    return null;
  }

  /**
   * Put `code` in one of an action's two slots (null clears the slot). A key belongs to one action only: if another
   * action had it, it loses it. Returns the action that lost the key, if any.
   */
  bind(action, slot, code) {
    if (!this.registry.actions.has(action) || (slot !== 0 && slot !== 1)) return null;
    if (code !== null && !isBindableCode(code)) return null;
    let displaced = null;
    if (code !== null) {
      for (const other of this.registry.actionList()) {
        if (other.id === action || !this.keysFor(other.id).includes(code)) continue;
        this.bindings[other.id] = this.keysFor(other.id).filter((key) => key !== code);
        displaced = other.id;
      }
    }
    const keys = [...this.keysFor(action)];
    while (keys.length < 2) keys.push(null);
    keys[slot] = code;
    // the same key twice in one action is pointless
    if (keys[0] && keys[0] === keys[1]) keys[1 - slot] = null;
    this.bindings[action] = keys.filter(Boolean);
    this.#save();
    this.#emit({ type: 'binding', id: action, value: this.bindings[action], displaced });
    return displaced;
  }

  /** Back to the defaults: one section, the key bindings ('bindings'), or everything (no argument). */
  reset(section = null) {
    if (!section || section === 'bindings') this.bindings = {};
    if (section !== 'bindings') {
      for (const id of Object.keys(this.values)) {
        const setting = this.registry.settings.get(id);
        if (setting && (!section || setting.section === section)) delete this.values[id];
      }
    }
    this.#save();
    this.#emit({ type: 'reset', id: section });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit(change) {
    for (const fn of this.listeners) fn(change, this);
  }

  #load() {
    const saved = readJson(this.storage, STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      this.values = saved.values && typeof saved.values === 'object' ? { ...saved.values } : {};
      if (saved.bindings && typeof saved.bindings === 'object') {
        for (const [action, keys] of Object.entries(saved.bindings)) {
          if (Array.isArray(keys)) this.bindings[RENAMED_ACTIONS[action] ?? action] = keys.filter(isBindableCode).slice(0, 2);
        }
      }
      return;
    }
    // first run of this version: fold in what earlier versions kept on their own
    let migrated = false;
    for (const [key, convert] of Object.entries(LEGACY)) {
      const old = readJson(this.storage, key);
      if (!old || typeof old !== 'object') continue;
      Object.assign(this.values, convert(old));
      migrated = true;
    }
    if (migrated) this.#save();
  }

  #save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, values: this.values, bindings: this.bindings }));
    } catch { /* private browsing: the settings last for this visit */ }
  }
}
