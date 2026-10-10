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
  assert.match(rewardText({}, {}, true), /Solo training/);
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
  assert.equal(shader.uniforms.ssDyeAmount.value, 1);
  dye.set('crimson');
  assert.equal(shader.uniforms.ssDyeAmount.value, 0);
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
  controller.selectSection('challenges');
  assert.equal(doc.querySelector('#armory-kit').classList.contains('hidden'), true);
  assert.equal(doc.querySelector('#armory-heraldry').classList.contains('hidden'), true);
  assert.equal(doc.querySelector('#armory-challenges').classList.contains('hidden'), false);
  assert.equal(doc.querySelector('#armory-challenges-tab').attrs['aria-pressed'], 'true');
  controller.selectSection('heraldry');
  assert.equal(doc.querySelector('#armory-challenges').classList.contains('hidden'), true);
  controller.cards.children[1].handlers.click();
  assert.equal(visibleCloth, 'azure');
  controller.action.handlers.click();
  controller.action.handlers.click();
  assert.equal(sent.length, 1);
  assert.equal(controller.profile.balance, 40);
  handlers.profile({ profile: { balance: 0, owned: ['crimson', 'azure'], equipped: 'crimson' } });
  assert.equal(controller.action.textContent, 'EQUIP STANDARD');
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

import { CLOTH } from '../../shared/src/cosmetics.mjs';
test('expanded dye catalog provides six distinct shades and useful unlock progress', () => {
  assert.equal(Object.keys(CLOTH).length, 6);
  assert.equal(new Set(Object.values(CLOTH).map((item) => item.color)).size, 6);
  const view = renownView({ balance: 20, owned: ['crimson'], equipped: 'crimson' }, 'forest', true);
  assert.equal(view.remaining, 20);
  assert.equal(view.progress, 0.5);
  assert.equal(view.collection, '1 / 6');
  assert.match(view.hint, /20 more/);
  assert.equal(renownView({ balance: 80, owned: ['crimson'], equipped: 'crimson' }, 'charcoal', true).disabled, false);
});
test('each dye updates an independent shader uniform and invalid choices restore original cloth', () => {
  const mesh = () => ({ name: 'TabardBack', isMesh: true, material: { clone() { return { dispose() {} }; } } });
  const a = mesh(), b = mesh();
  const first = createClothDye({ traverse(fn) { fn(a); } });
  const second = createClothDye({ traverse(fn) { fn(b); } });
  const sa = { uniforms: {}, fragmentShader: '#include <color_fragment>' };
  const sb = { uniforms: {}, fragmentShader: '#include <color_fragment>' };
  a.material.onBeforeCompile(sa); b.material.onBeforeCompile(sb);
  first.set('forest'); second.set('ivory');
  assert.deepEqual(sa.uniforms.ssClothTint.value, CLOTH.forest.tint);
  assert.deepEqual(sb.uniforms.ssClothTint.value, CLOTH.ivory.tint);
  first.set('invalid');
  assert.equal(sa.uniforms.ssDyeAmount.value, 0);
  assert.equal(sb.uniforms.ssDyeAmount.value, 1);
});

test('zero rewards explain the recorded reason and old receipts remain readable', () => {
  const snapshot = { rewardMatchId: 'm' };
  assert.match(rewardText({ lastReward: { matchId: 'm', amount: 0, reason: 'forfeit' } }, snapshot, false), /forfeit/);
  assert.match(rewardText({ lastReward: { matchId: 'm', amount: 0, reason: 'short' } }, snapshot, false), /under 30/);
  assert.match(rewardText({ balance: 50, lastReward: { matchId: 'm', amount: 30 } }, snapshot, false), /20 completion \+ 10 victory/);
});

test('mastery reward totals distinguish a short feat from ordinary completion', () => {
  const snapshot = { rewardMatchId: 'm' };
  assert.equal(rewardText({ balance: 20, lastReward: { matchId: 'm', amount: 20, completion: 0, victory: 0, challengeAmount: 20 } }, snapshot, false), '+20 RENOWN · 20 mastery · Balance 20');
  assert.match(rewardText({ balance: 55, lastReward: { matchId: 'm', amount: 55, completion: 20, victory: 10, challengeAmount: 25 } }, snapshot, false), /20 completion \+ 10 victory \+ 25 mastery/);
});

test('changing Armory sections starts their shared scroll at the top while the current section keeps its place', () => {
  const nodes = new Map();
  const doc = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element };
  const socket = { status: 'online', remote: { profileReady: true }, on() {} };
  const controller = new RenownController({ socket, document: doc, storage: { getItem() { return null; } }, scene: () => null });
  const scroll = doc.querySelector('#armory-menu .armory-scroll');
  scroll.scrollTop = 320;
  controller.selectSection('kit');
  assert.equal(scroll.scrollTop, 320, 'clicking the current tab preserves its position');
  controller.selectSection('challenges');
  assert.equal(scroll.scrollTop, 0, 'Challenges starts at its introduction');
  scroll.scrollTop = 180;
  controller.selectSection('challenges');
  assert.equal(scroll.scrollTop, 180);
  controller.selectSection('heraldry');
  assert.equal(scroll.scrollTop, 0);
  scroll.scrollTop = 90;
  controller.selectSection('kit');
  assert.equal(scroll.scrollTop, 0);
  scroll.scrollTop = 40;
  controller.selectSection('unknown');
  assert.equal(scroll.scrollTop, 40, 'an invalid section changes neither selection nor scroll');
  assert.equal(controller.section, 'kit');
});
