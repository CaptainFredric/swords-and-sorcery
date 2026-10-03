import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from './HUD.mjs';

function node() {
  const classes = new Set();
  const children = new Map();
  return { dataset: {}, style: { setProperty() {} }, classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: (name) => classes.has(name),
  }, querySelector: (selector) => { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
  querySelectorAll: () => [], append() {}, setAttribute() {}, textContent: '', innerHTML: '' };
}
function hud() {
  const elements = new Map();
  globalThis.document = { createElement: () => node(), querySelector: (selector) => {
    if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector);
  } };
  return new HUD();
}
const local = { alive: true, health: 100, guardStamina: 100, ultimate: 'chivalry', spell: 'gale', preparedSpells: ['fireball', 'frostfire', 'gale'],
  spellReadyAt: 16, spellReadyById: { gale: 16 }, chivalryProjectileReadyAt: 10.72, dashReadyAt: 0,
  ultimateState: { id: 'chivalry', phase: 'active', until: 19 } };

test('Chivalry HUD keeps a cooling spell face and exposes three identities with time remaining', () => {
  const view = hud();
  view.update(local, {}, 10);
  assert.equal(view.spell.dataset.spell, 'gale');
  assert.equal(view.spell.classList.contains('fist'), false);
  assert.equal(view.spell.querySelector('strong').textContent, '6.0');
  assert.equal(view.preparedPanel.hidden, false);
  assert.ok(view.preparedPanel.innerHTML.includes('★ Gale'));
  assert.ok(view.preparedPanel.innerHTML.includes('9.0'));
  assert.equal((view.preparedPanel.innerHTML.match(/data-spell=/g) ?? []).length, 3);
  view.setPreparedSelector({ highlight: 'frostfire' });
  assert.equal(view.preparedPanel.classList.contains('selecting'), true);
  view.setPreparedSelector({ highlight: null });
  assert.equal(view.preparedPanel.classList.contains('cancelled'), true);
});

test('repertoire collapses at expiry while the authoritative current spell remains on the ordinary tile', () => {
  const view = hud();
  view.update(local, {}, 10);
  view.update(local, {}, 19);
  assert.equal(view.preparedPanel.hidden, true);
  assert.equal(view.spell.dataset.spell, 'gale');
  assert.equal(view.spell.querySelector('em').textContent, 'GALE');
});
