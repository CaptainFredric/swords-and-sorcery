// Everything a player can set, declared in one place. The Settings screen, saving, loading and validation all follow
// from these declarations, so a new feature only has to declare what it needs:
//
//   registry.defineSection({ id: 'loadout', label: 'LOADOUT', order: 40 })
//   registry.defineSetting({ id: 'loadout.relic', section: 'loadout', label: 'Relic', type: 'choice',
//                            options: [{ value: 'none', label: 'None' }], default: 'none' })
//   registry.defineAction({ id: 'ability.frostNova', label: 'Frost Nova', group: 'Abilities', keys: ['KeyF'] })
//
// and the new tab, row or key binding appears on the Settings screen, with its value saved and validated. Setting
// types: 'range' { min, max, step, unit }, 'toggle', 'choice' { options: [{ value, label }] }. `devices: 'touch'` or
// 'desktop' shows a row only on that kind of device; `group` puts rows under a heading within their section.
// Actions are key (or mouse button) bindings, shown on the Controls tab; InputController fires them by id.

const SETTING_TYPES = new Set(['range', 'toggle', 'choice']);

export class SettingsRegistry {
  constructor() {
    this.sections = new Map();
    this.settings = new Map();
    this.actions = new Map();
  }

  defineSection({ id, label, order = 100 }) {
    if (!id || !label) throw new Error('A section needs an id and a label');
    this.sections.set(id, { id, label, order });
    return this;
  }

  defineSetting(definition) {
    const { id, section, label, type } = definition;
    if (!id || !label || !SETTING_TYPES.has(type)) throw new Error(`Setting ${id}: needs an id, a label and a type`);
    if (!this.sections.has(section)) throw new Error(`Setting ${id}: unknown section ${section}`);
    if (this.settings.has(id)) throw new Error(`Setting ${id} is already defined`);
    if (type === 'range' && !(definition.max > definition.min)) throw new Error(`Setting ${id}: range needs min < max`);
    if (type === 'choice' && !definition.options?.some((option) => option.value === definition.default)) {
      throw new Error(`Setting ${id}: its default must be one of its options`);
    }
    this.settings.set(id, { order: this.settings.size, ...definition });
    return this;
  }

  defineAction({ id, label, group = 'Actions', keys = [], order = null }) {
    if (!id || !label) throw new Error('An action needs an id and a label');
    if (this.actions.has(id)) throw new Error(`Action ${id} is already defined`);
    this.actions.set(id, { id, label, group, keys: keys.slice(0, 2), order: order ?? this.actions.size });
    return this;
  }

  /** The sections that have something to show on this device, in order. */
  sectionList(device = 'desktop') {
    return [...this.sections.values()]
      .filter((section) => this.settingsIn(section.id, device).length || (section.id === 'controls' && device === 'desktop' && this.actions.size))
      .sort((a, b) => a.order - b.order);
  }

  settingsIn(sectionId, device = 'desktop') {
    return [...this.settings.values()]
      .filter((setting) => setting.section === sectionId && (!setting.devices || setting.devices === device))
      .sort((a, b) => a.order - b.order);
  }

  actionList() {
    return [...this.actions.values()].sort((a, b) => a.order - b.order);
  }

  defaultValue(id) {
    return this.settings.get(id)?.default;
  }

  defaultBindings() {
    return Object.fromEntries(this.actionList().map((action) => [action.id, [...action.keys]]));
  }

  /** A stored value made safe to use: clamped, stepped and checked against the options, or the default. */
  validate(id, value) {
    const setting = this.settings.get(id);
    if (!setting) return value;
    if (setting.type === 'toggle') return typeof value === 'boolean' ? value : setting.default;
    if (setting.type === 'choice') return setting.options.some((option) => option.value === value) ? value : setting.default;
    const number = Number(value);
    if (!Number.isFinite(number)) return setting.default;
    const step = setting.step ?? 1;
    const stepped = Math.round((number - setting.min) / step) * step + setting.min;
    return Number(Math.min(setting.max, Math.max(setting.min, stepped)).toFixed(4));
  }
}

// --- key names ----------------------------------------------------------------------------------------------------

const KEY_LABELS = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', Backspace: 'BKSP', CapsLock: 'CAPS',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/',
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'MB4', Mouse4: 'MB5',
};

/** How a key code reads on a key chip: KeyQ -> Q, Digit1 -> 1, Mouse0 -> LMB. */
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `NUM ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.replace(/(Left|Right)$/, '').toUpperCase().slice(0, 8);
}

// keys the game keeps for itself: Escape opens the menu, F3 the debug overlay
export const RESERVED_KEYS = Object.freeze(['Escape', 'F3']);

export function isBindableCode(code) {
  return typeof code === 'string' && code.length > 0 && code.length <= 24 && !RESERVED_KEYS.includes(code)
    && /^(Key[A-Z]|Digit\d|Numpad\w+|F\d{1,2}|Mouse[0-4]|Arrow(Up|Down|Left|Right)|Space|Tab|Enter|Backspace|CapsLock|(Shift|Control|Alt|Meta)(Left|Right)|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Insert|Delete|Home|End|Page(Up|Down))$/.test(code);
}

// --- the game's own settings --------------------------------------------------------------------------------------

export const registry = new SettingsRegistry();

registry
  .defineSection({ id: 'audio', label: 'SOUND', order: 10 })
  .defineSection({ id: 'controls', label: 'CONTROLS', order: 20 })
  .defineSection({ id: 'display', label: 'DISPLAY', order: 30 });

registry
  .defineSetting({ id: 'audio.muted', section: 'audio', label: 'Sound', type: 'toggle', default: false, invert: true, hint: 'M turns it on and off' })
  .defineSetting({ id: 'audio.master', section: 'audio', label: 'Master volume', type: 'range', min: 0, max: 100, step: 5, unit: '%', default: 80 })
  .defineSetting({ id: 'audio.effects', section: 'audio', label: 'Blows and spells', type: 'range', min: 0, max: 100, step: 5, unit: '%', default: 100 })
  .defineSetting({ id: 'audio.voice', section: 'audio', label: 'Spellblade voices', type: 'range', min: 0, max: 100, step: 5, unit: '%', default: 100 })
  .defineSetting({ id: 'audio.ambience', section: 'audio', label: 'Wind and bells', type: 'range', min: 0, max: 100, step: 5, unit: '%', default: 100 })
  .defineSetting({ id: 'audio.musicMuted', section: 'audio', group: 'Music', label: 'Music', type: 'toggle', default: false, invert: true, hint: 'N turns it on and off' })
  .defineSetting({ id: 'audio.music', section: 'audio', group: 'Music', label: 'Music volume', type: 'range', min: 0, max: 100, step: 5, unit: '%', default: 55 });

registry
  .defineSetting({ id: 'controls.mouseSensitivity', section: 'controls', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, unit: '×', default: 1, devices: 'desktop' })
  .defineSetting({ id: 'controls.touchSensitivity', section: 'controls', label: 'Look sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.05, unit: '×', default: 1, devices: 'touch' })
  .defineSetting({ id: 'controls.invertY', section: 'controls', label: 'Invert look up and down', type: 'toggle', default: false })
  .defineSetting({ id: 'controls.touchScale', section: 'controls', label: 'Button size', type: 'range', min: 80, max: 130, step: 5, unit: '%', default: 100, devices: 'touch' });

registry
  .defineSetting({ id: 'display.fov', section: 'display', label: 'Field of view', type: 'range', min: 65, max: 100, step: 1, unit: '°', default: 78 })
  .defineSetting({
    id: 'display.quality', section: 'display', label: 'Render quality', type: 'choice', default: 'high',
    hint: 'Lower is smoother on older phones and laptops',
    options: [{ value: 'low', label: 'Smooth' }, { value: 'medium', label: 'Balanced' }, { value: 'high', label: 'Sharp' }],
  })
  .defineSetting({ id: 'display.damageNumbers', section: 'display', label: 'Damage numbers', type: 'toggle', default: true })
  .defineSetting({
    id: 'display.orientation', section: 'display', group: 'Screen', label: 'Orientation', type: 'choice', default: 'auto', devices: 'touch',
    hint: 'Sideways is for apps that keep the screen upright',
    options: [{ value: 'auto', label: 'Follow the app' }, { value: 'sideways', label: 'Lie sideways' }],
  })
  .defineSetting({
    id: 'display.turnSide', section: 'display', group: 'Screen', label: 'Sideways, phone top to the', type: 'choice', default: 'left', devices: 'touch',
    hint: 'Follows the phone by itself when motion access is allowed',
    options: [{ value: 'left', label: '⟲ Left' }, { value: 'right', label: 'Right ⟳' }],
  })
  .defineSetting({ id: 'display.cameraShake', section: 'display', group: 'Comfort', label: 'Camera motion', type: 'range', min: 0, max: 100, step: 10, unit: '%', default: 100, hint: 'Sway, bob and the kick of blows' })
  .defineSetting({ id: 'display.damageFlash', section: 'display', group: 'Comfort', label: 'Red flash when hit', type: 'toggle', default: true });

registry
  .defineAction({ id: 'forward', label: 'Move forward', group: 'Movement', keys: ['KeyW', 'ArrowUp'] })
  .defineAction({ id: 'back', label: 'Move back', group: 'Movement', keys: ['KeyS', 'ArrowDown'] })
  .defineAction({ id: 'left', label: 'Move left', group: 'Movement', keys: ['KeyA', 'ArrowLeft'] })
  .defineAction({ id: 'right', label: 'Move right', group: 'Movement', keys: ['KeyD', 'ArrowRight'] })
  .defineAction({ id: 'jump', label: 'Jump', group: 'Movement', keys: ['Space'] })
  .defineAction({ id: 'sprint', label: 'Sprint (hold)', group: 'Movement', keys: ['ShiftLeft', 'ShiftRight'] })
  .defineAction({ id: 'attack', label: 'Sword combo (hold)', group: 'Combat', keys: ['Mouse0'] })
  .defineAction({ id: 'guard', label: 'Guard (hold)', group: 'Combat', keys: ['Mouse2'] })
  .defineAction({ id: 'fireball', label: 'Fireball', group: 'Abilities', keys: ['KeyQ'] })
  .defineAction({ id: 'dash', label: 'Dash', group: 'Abilities', keys: ['KeyE'] })
  .defineAction({ id: 'scoreboard', label: 'Scoreboard (hold)', group: 'Interface', keys: ['Tab'] })
  .defineAction({ id: 'toggleSound', label: 'Sound on / off', group: 'Interface', keys: ['KeyM'] })
  .defineAction({ id: 'toggleMusic', label: 'Music on / off', group: 'Interface', keys: ['KeyN'] });
