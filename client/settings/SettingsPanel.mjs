// The Settings screen: a tab per section of the registry, a row per setting, and (on a keyboard and mouse) the key
// bindings. Rows are drawn from the declarations, so a setting added to the registry shows up here by itself.

import { keyLabel } from './settingsRegistry.mjs';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatValue(setting, value) {
  if (setting.unit === '%') return `${Math.round(value)}%`;
  if (setting.unit === '×') return `${Number(value).toFixed(2)}×`;
  if (setting.unit === '°') return `${Math.round(value)}°`;
  return String(value);
}

function groupRows(items, render) {
  let html = '';
  let group = null;
  for (const item of items) {
    if ((item.group ?? null) !== group) {
      group = item.group ?? null;
      if (group) html += `<h3 class="setting-group">${escape(group)}</h3>`;
    }
    html += render(item);
  }
  return html;
}

export class SettingsPanel {
  constructor({ root, store, registry, device = () => 'desktop', onClose = () => {} }) {
    this.root = root;
    this.store = store;
    this.registry = registry;
    this.device = device;
    this.onClose = onClose;
    this.section = null;
    this.capturing = null;
    this.sliding = null;
    this.tabs = root.querySelector('[data-settings-tabs]');
    this.body = root.querySelector('[data-settings-body]');
    this.resetButton = root.querySelector('[data-settings-reset]');
    root.querySelector('[data-settings-done]')?.addEventListener('click', () => this.close());
    this.resetButton?.addEventListener('click', () => this.store.reset(this.section));
    this.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-section]');
      if (tab) this.show(tab.dataset.section);
    });
    this.body.addEventListener('input', (event) => this.#slide(event));
    this.body.addEventListener('change', () => { this.sliding = null; });
    this.body.addEventListener('click', (event) => this.#click(event));
    store.onChange((change) => {
      if (!this.isOpen || (change.type === 'setting' && change.id === this.sliding)) return;
      this.#renderBody(change.type === 'binding' ? change.displaced : null);
    });
    // while a key chip is listening it takes the next key or mouse button, before the game or the menus see it
    addEventListener('keydown', this.#captureKey, true);
    addEventListener('mousedown', this.#captureMouse, true);
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(section = this.section) {
    if (!this.isOpen) this.opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    this.root.classList.remove('hidden');
    this.show(section);
    this.root.querySelector('[data-settings-done]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.capturing = null;
    this.root.classList.add('hidden');
    this.onClose();
    // (the focus back where it was before the Settings opened)
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected && opener.offsetParent !== null && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  }

  show(section) {
    const sections = this.registry.sectionList(this.device());
    this.section = sections.some((s) => s.id === section) ? section : sections[0]?.id ?? null;
    this.tabs.innerHTML = sections.map((s) => `<button type="button" role="tab" data-section="${s.id}" aria-selected="${s.id === this.section}">${escape(s.label)}</button>`).join('');
    const label = sections.find((s) => s.id === this.section)?.label ?? '';
    if (this.resetButton) this.resetButton.textContent = `RESET ${label}`;
    this.#renderBody();
  }

  #renderBody(flashAction = null) {
    const device = this.device();
    const settings = this.registry.settingsIn(this.section, device);
    let html = groupRows(settings, (setting) => this.#row(setting));
    if (this.section === 'controls' && device === 'desktop') html += this.#bindings(flashAction);
    this.body.innerHTML = html || '<p class="setting-empty">Nothing to set here on this device.</p>';
  }

  #row(setting) {
    const value = this.store.get(setting.id);
    const text = `<div class="setting-text"><b>${escape(setting.label)}</b>${setting.hint ? `<small>${escape(setting.hint)}</small>` : ''}</div>`;
    let control = '';
    if (setting.type === 'range') {
      control = `<div class="setting-control"><input type="range" data-id="${setting.id}" min="${setting.min}" max="${setting.max}" step="${setting.step ?? 1}" value="${value}" aria-label="${escape(setting.label)}"><output>${formatValue(setting, value)}</output></div>`;
    } else if (setting.type === 'toggle') {
      const on = setting.invert ? !value : Boolean(value);
      control = `<button type="button" class="setting-switch" role="switch" data-id="${setting.id}" aria-checked="${on}" aria-label="${escape(setting.label)}">${on ? 'ON' : 'OFF'}</button>`;
    } else if (setting.type === 'choice') {
      control = `<div class="setting-choices" role="radiogroup" aria-label="${escape(setting.label)}">${setting.options.map((option) => `<button type="button" role="radio" data-id="${setting.id}" data-value="${escape(option.value)}" aria-checked="${option.value === value}">${escape(option.label)}</button>`).join('')}</div>`;
    }
    return `<div class="setting-row setting-${setting.type}">${text}${control}</div>`;
  }

  #bindings(flashAction) {
    const actions = this.registry.actionList();
    const rows = groupRows(actions, (action) => {
      const keys = this.store.keysFor(action.id);
      const chips = [0, 1].map((slot) => {
        const listening = this.capturing?.action === action.id && this.capturing.slot === slot;
        return `<button type="button" class="key-chip${listening ? ' listening' : ''}${keys[slot] ? '' : ' empty'}" data-action="${action.id}" data-slot="${slot}" aria-label="${escape(action.label)}, ${slot ? 'second' : 'first'} key">${listening ? 'PRESS A KEY' : escape(keyLabel(keys[slot]))}</button>`;
      }).join('');
      const flash = action.id === flashAction ? ' flash' : '';
      return `<div class="setting-row binding-row${flash}"><div class="setting-text"><b>${escape(action.label)}</b>${keys.length ? '' : '<small>Unbound</small>'}</div><div class="key-slots">${chips}</div></div>`;
    });
    return `<h3 class="setting-group">Keys and buttons</h3><p class="setting-note">Click a key, then press the new one (Esc cancels, Backspace clears).</p>${rows}<button type="button" class="setting-reset-keys" data-reset-keys>RESET KEYS</button>`;
  }

  #slide(event) {
    const input = event.target.closest('input[type="range"][data-id]');
    if (!input) return;
    this.sliding = input.dataset.id;
    const setting = this.registry.settings.get(input.dataset.id);
    const value = this.store.set(input.dataset.id, Number(input.value));
    const output = input.parentElement.querySelector('output');
    if (output) output.textContent = formatValue(setting, value);
  }

  #click(event) {
    const toggle = event.target.closest('.setting-switch[data-id]');
    if (toggle) {
      this.store.toggle(toggle.dataset.id);
      return;
    }
    const choice = event.target.closest('[role="radio"][data-id]');
    if (choice) {
      this.store.set(choice.dataset.id, choice.dataset.value);
      return;
    }
    if (event.target.closest('[data-reset-keys]')) {
      this.store.reset('bindings');
      return;
    }
    const chip = event.target.closest('.key-chip[data-action]');
    if (chip) {
      this.capturing = { action: chip.dataset.action, slot: Number(chip.dataset.slot), startedAt: performance.now() };
      this.#renderBody();
    }
  }

  #finishCapture(code) {
    const { action, slot } = this.capturing;
    this.capturing = null;
    if (code === undefined) this.#renderBody();
    else this.store.bind(action, slot, code);
  }

  #captureKey = (event) => {
    if (!this.capturing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') this.#finishCapture(undefined);
    else if (event.code === 'Backspace' || event.code === 'Delete') this.#finishCapture(null);
    else if (event.code !== 'F3') this.#finishCapture(event.code);
  };

  #captureMouse = (event) => {
    // the click that started listening has already happened; this is the next press
    if (!this.capturing || performance.now() - this.capturing.startedAt < 80) return;
    event.preventDefault();
    event.stopPropagation();
    this.#finishCapture(`Mouse${event.button}`);
  };
}
