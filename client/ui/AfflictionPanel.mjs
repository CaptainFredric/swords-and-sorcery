// A compact status docket separate from the health bar. No simulated clocks:
// every bar follows the effectiveness of the authoritative snapshot.
import { afflictionView } from './afflictionView.mjs';
import { iconSvg } from './icons.mjs';

const strengthWord = entry => entry.steady ? 'Holding' :
  entry.strength >= 0.7 ? 'Strong' : entry.strength >= 0.35 ? 'Weakening' : 'Fading';

export class AfflictionPanel {
  constructor(hudRoot) {
    this.hudRoot = hudRoot;
    this.buttons = new Map();
    this.items = [];
    this.selectedId = null;
    this.visibleId = null;
    this.dock = document.createElement('aside');
    this.dock.className = 'affliction-dock';
    this.dock.setAttribute('aria-label', 'Status effects affecting your Spellblade');
    this.dock.hidden = true;
    this.dock.innerHTML =
      '<div class="affliction-heading"><span>AFFLICTIONS</span><small class="affliction-help">I · INSPECT</small></div>' +
      '<div class="affliction-icons" role="group" aria-label="Active status effects"></div>' +
      '<section class="affliction-detail" id="affliction-detail" aria-label="Selected status effect" hidden>' +
        '<header><strong class="affliction-name"></strong><button class="affliction-dismiss" type="button" aria-label="Close effect details">×</button></header>' +
        '<p class="affliction-description"></p>' +
        '<div class="affliction-scale"><span class="affliction-scale-label">EFFECT STRENGTH</span>' +
        '<span class="affliction-scale-word"></span></div>' +
        '<div class="affliction-big-track" aria-hidden="true"><span class="affliction-big-fill"></span></div>' +
      '</section>';
    this.icons = this.dock.querySelector('.affliction-icons');
    this.details = this.dock.querySelector('.affliction-detail');
    this.heading = this.dock.querySelector('.affliction-name');
    this.description = this.dock.querySelector('.affliction-description');
    this.strengthName = this.dock.querySelector('.affliction-scale-word');
    this.strengthFill = this.dock.querySelector('.affliction-big-fill');
    // HUD's legacy Node test fixtures intentionally expose only a tiny DOM.
    // The live browser has these APIs; no mock-only UI should be mounted.
    this.available = Boolean(this.dock.addEventListener && this.icons?.append && this.details);
    if (!this.available) return;
    this.dock.addEventListener('pointerdown', event => event.stopPropagation());
    this.dock.addEventListener('click', event => {
      // The status dock must never send a click through to the arena.
      event.stopPropagation();
      const button = event.target.closest('button[data-effect]');
      if (button) this.select(button.dataset.effect === this.selectedId ? null : button.dataset.effect);
      else if (event.target.closest('.affliction-dismiss')) this.select(null);
    });
    hudRoot.append(this.dock);
  }

  update(player, nowSec) {
    if (!this.available) return;
    const items = afflictionView(player, nowSec);
    this.items = items;
    this.dock.hidden = items.length === 0;
    this.hudRoot.classList.toggle('effects-available', items.length > 0);
    if (!items.length) {
      this.select(null);
      this.visibleId = null;
      for (const button of this.buttons.values()) button.remove();
      this.buttons.clear();
      return;
    }

    const active = new Set(items.map(item => item.id));
    for (const [id, button] of this.buttons) {
      if (!active.has(id)) {
        button.remove();
        this.buttons.delete(id);
      }
    }
    for (const item of items) {
      let button = this.buttons.get(item.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'affliction-icon';
        button.dataset.effect = item.id;
        button.setAttribute('aria-label', 'Inspect ' + item.name);
        button.setAttribute('aria-controls', 'affliction-detail');
        button.title = item.name;
        button.innerHTML = iconSvg(item.icon) +
          '<span class="affliction-small-track" aria-hidden="true"><i></i></span>';
        this.buttons.set(item.id, button);
      }
      // Appending an existing button moves it only if new statuses changed
      // ordering; keep focus and the active button alive between updates.
      if (button.parentElement !== this.icons ||
          button !== this.icons.children[items.indexOf(item)]) this.icons.append(button);
      button.classList.toggle('selected', this.selectedId === item.id);
      button.setAttribute('aria-pressed', String(this.selectedId === item.id));
      button.style.setProperty('--effect-strength', String(item.strength));
      button.querySelector('.affliction-small-track i').style.width =
        (item.strength * 100).toFixed(1) + '%';
    }
    if (this.selectedId && !active.has(this.selectedId)) this.select(null);
    this.renderDetail();
  }

  select(id) {
    this.selectedId = this.items.some(item => item.id === id) ? id : null;
    for (const [key, button] of this.buttons) {
      const selected = key === this.selectedId;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.renderDetail();
  }

  /** Desktop pointer lock hides the mouse. A rebindable Interface action
   * cycles one selected effect at a time without unlocking or cancelling combat. */
  cycle() {
    if (!this.available || !this.items.length) return;
    const index = this.items.findIndex(item => item.id === this.selectedId);
    this.select(index >= this.items.length - 1 ? null : this.items[index + 1].id);
  }

  renderDetail() {
    const item = this.items.find(entry => entry.id === this.selectedId);
    this.details.hidden = !item;
    if (!item) {
      this.visibleId = null;
      return;
    }
    if (this.visibleId !== item.id) {
      this.heading.textContent = item.name;
      this.description.textContent = item.description;
      this.visibleId = item.id;
    }
    this.strengthName.textContent = strengthWord(item);
    this.strengthFill.style.width = (item.strength * 100).toFixed(1) + '%';
  }

  clear() {
    this.update(null, 0);
  }
}
