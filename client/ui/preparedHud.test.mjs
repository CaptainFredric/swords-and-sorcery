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
  assert.equal(view.preparedSlots.get('gale').classList.contains('current'),true);
  assert.equal(view.preparedTimer.textContent,'9.0s');
  assert.equal(view.preparedSlots.size,3);
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

test('spell selection preserves card identity through cooldown ticks and equipped changes',()=>{
  const view=hud();view.update(local,{},10);
  assert.equal(view.preparedSlots.size,3);
  assert.deepEqual(view.preparedOrder,['fireball','gale','frostfire']);
  const first=view.preparedSlots.get('fireball');
  view.update({...local,spell:'fireball'}, {},10.1);
  assert.equal(view.preparedSlots.get('fireball'),first);
  assert.equal(first.classList.contains('current'),true);
  assert.deepEqual(view.preparedOrder,['frostfire','fireball','gale'],'mouse left and right choices agree with the visible card order');
  view.setPreparedSelector({highlight:'frostfire'});
  assert.equal(view.preparedSlots.get('frostfire').classList.contains('highlighted'),true);
  assert.ok(view.preparedHint.textContent.includes('SELECT'),'a cooling choice selects without claiming to cast');
});
