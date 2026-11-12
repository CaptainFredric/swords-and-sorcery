import assert from 'node:assert/strict';
import test from 'node:test';
import { AfflictionPanel } from './AfflictionPanel.mjs';

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    const classes = new Set();
    this.classList = {
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
      contains: name => classes.has(name),
    };
    this.nodes = {};
    if (tag === 'aside') {
      for (const selector of ['.affliction-icons', '.affliction-detail', '.affliction-name',
        '.affliction-description', '.affliction-scale-word', '.affliction-big-fill']) {
        this.nodes[selector] = new Element();
      }
    }
    if (tag === 'button') this.nodes['.affliction-small-track i'] = new Element('i');
  }
  set innerHTML(value) { this.html = value; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key]; }
  querySelector(selector) { return this.nodes[selector] ?? null; }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  append(child) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      const index = siblings.indexOf(this);
      if (index !== -1) siblings.splice(index, 1);
    }
    this.parentElement = null;
  }
  closest(selector) {
    if (selector === 'button[data-effect]') return this.tag === 'button' && this.dataset.effect ? this : null;
    if (selector === '.affliction-dismiss') return this.dismiss ? this : null;
    return null;
  }
}

const create = () => {
  const hud = new Element('main');
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  const panel = new AfflictionPanel(hud);
  return { hud, panel, restore: () => { globalThis.document = previous; } };
};

const subject = () => ({
  id: 'me', alive: true, burningUntil: 100,
  shaken: { at: 20, severity: 1 },
  electricalBacklash: { at: 20, initial: 12 },
});
const click = (panel, target) => {
  let stopped = false;
  panel.dock.listeners.click({
    target,
    stopPropagation: () => { stopped = true; },
  });
  assert.equal(stopped, true, 'status clicks must not leak into the arena');
};

test('clicking a different small status icon replaces the single detail view', () => {
  const { panel, hud, restore } = create();
  try {
    panel.update(subject(), 20.1);
    assert.equal(panel.items.length, 3);
    assert.equal(panel.dock.hidden, false);
    assert.equal(hud.classList.contains('effects-available'), true);
    const first = panel.buttons.get('conduct');
    const second = panel.buttons.get('shaken');
    click(panel, first);
    assert.equal(panel.selectedId, 'conduct');
    assert.equal(panel.details.hidden, false);
    assert.equal(panel.heading.textContent, 'Shocking Conduct');
    assert.equal(first.getAttribute('aria-pressed'), 'true');
    click(panel, second);
    assert.equal(panel.selectedId, 'shaken');
    assert.equal(panel.heading.textContent, 'Shaken');
    assert.equal(first.getAttribute('aria-pressed'), 'false');
    assert.equal(second.getAttribute('aria-pressed'), 'true');
    click(panel, second);
    assert.equal(panel.selectedId, null);
    assert.equal(panel.details.hidden, true);
  } finally { restore(); }
});

test('rebindable cycling visits each ailment and then closes, without losing focus across updates', () => {
  const { panel, restore } = create();
  try {
    panel.update(subject(), 20);
    const button = panel.buttons.get('conduct');
    panel.cycle();
    assert.equal(panel.selectedId, 'conduct');
    panel.update(subject(), 20.25);
    assert.equal(panel.buttons.get('conduct'), button, 'do not recreate buttons every frame');
    panel.cycle();
    assert.equal(panel.selectedId, 'shaken');
    panel.cycle();
    assert.equal(panel.selectedId, 'burning');
    panel.cycle();
    assert.equal(panel.selectedId, null);
    assert.equal(panel.details.hidden, true);
    panel.update({ id: 'me', alive: false, burningUntil: 300 }, 30);
    assert.equal(panel.dock.hidden, true);
    assert.equal(panel.buttons.size, 0);
  } finally { restore(); }
});

test('status expiry closes only the selected detail and shows no clock', () => {
  const { panel, restore } = create();
  try {
    panel.update(subject(), 20);
    click(panel, panel.buttons.get('shaken'));
    panel.update({ id: 'me', alive: true, burningUntil: 100 }, 30);
    assert.equal(panel.selectedId, null);
    assert.equal(panel.details.hidden, true);
    assert.equal(panel.buttons.size, 1);
    assert.equal(panel.strengthName.textContent, undefined, 'closed details need no visible countdown');
  } finally { restore(); }
});
