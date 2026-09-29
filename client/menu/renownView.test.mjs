import test from 'node:test';
import assert from 'node:assert/strict';
import { renownView, rewardText } from './renownView.mjs';
import { createClothDye } from '../game/clothDye.mjs';

test('preview leaves ownership and equipped state alone; actions follow balance and connection', () => {
  const profile = { balance: 40, equipped: 'crimson', owned: ['crimson'] };
  const view = renownView(profile, 'azure', true);
  assert.equal(view.action, 'purchase');
  assert.equal(view.disabled, false);
  assert.equal(profile.equipped, 'crimson');
  assert.equal(renownView({ ...profile, balance: 0 }, 'azure', true).disabled, true);
  assert.equal(renownView(profile, 'azure', false).disabled, true);
  assert.equal(renownView({ ...profile, owned: ['crimson', 'azure'] }, 'azure', true).action, 'equip');
  assert.equal(rewardText({ lastReward: { matchId: 'old', amount: 30 } }, { rewardMatchId: 'new' }, false), 'Confirming your match reward…');
  assert.match(rewardText({}, {}, true), /Offline/);
});

test('dye isolates cloth, keeps shared armor untouched, and releases only its own materials', () => {
  const original = { name: 'KitBanner', clone() { return { ...this, dispose() { this.disposed = true; } }; } };
  const cloth = { isMesh: true, name: 'TabardFront', material: original };
  const armor = { isMesh: true, name: 'Chest', material: original };
  const root = { traverse(fn) { [cloth, armor].forEach(fn); } };
  const dye = createClothDye(root);
  dye.set('azure');
  assert.notEqual(cloth.material, original);
  assert.equal(armor.material, original);
  const shader = { uniforms: {}, fragmentShader: '#include <color_fragment>' };
  cloth.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.ssAzure.value, 1);
  dye.set('crimson');
  assert.equal(shader.uniforms.ssAzure.value, 0);
  dye.dispose();
  assert.equal(cloth.material.disposed, true);
  assert.equal(original.disposed, undefined);
});

import { RenownController } from './RenownController.mjs';
function element() {
  const classes = new Set();
  return { children: [], dataset: {}, attrs: {}, handlers: {}, style: { setProperty() {} },
    classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.handlers[k] = fn; },
    appendChild(child) { this.children.push(child); } };
}
test('armory defaults to combat, separates previews from equipped cloth, and waits for server confirmation', () => {
  const nodes = new Map();
  const doc = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element };
  const handlers = {};
  const sent = [];
  const socket = { status: 'online', playingLocally: false, remote: { profileReady: true, send(m) { sent.push(m); } }, on(type, fn) { handlers[type] = fn; } };
  let visibleCloth;
  const controller = new RenownController({ socket, document: doc, storage: { getItem() { return null; }, setItem() {} }, scene: () => ({ setCloth(id) { visibleCloth = id; } }) });
  handlers.profile({ profile: { balance: 40, owned: ['crimson'], equipped: 'crimson' } });
  controller.route('ARMORY');
  assert.equal(controller.section, 'kit');
  assert.equal(doc.querySelector('#armory-heraldry').classList.contains('hidden'), true);
  controller.selectSection('heraldry');
  controller.cards.children[1].handlers.click();
  assert.equal(visibleCloth, 'azure');
  controller.action.handlers.click();
  controller.action.handlers.click();
  assert.equal(sent.length, 1);
  assert.equal(controller.profile.balance, 40);
  handlers.profile({ profile: { balance: 0, owned: ['crimson', 'azure'], equipped: 'crimson' } });
  assert.equal(controller.action.textContent, 'EQUIP');
  controller.action.handlers.click();
  handlers.profile({ profile: { balance: 0, owned: ['crimson', 'azure'], equipped: 'azure' } });
  assert.equal(controller.action.disabled, true);
  controller.cards.children[0].handlers.click();
  controller.selectSection('kit');
  assert.equal(visibleCloth, 'azure');
  controller.route('MAIN_MENU');
  controller.route('ARMORY');
  assert.equal(controller.section, 'kit');
});
