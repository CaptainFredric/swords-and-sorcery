import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SWORD_TECHNIQUES, armoryView } from './armoryView.mjs';
import { MenuController } from './MenuController.mjs';
import { GameLink } from '../network/GameLink.mjs';
import { registry } from '../settings/settingsRegistry.mjs';
import { SettingsStore } from '../settings/SettingsStore.mjs';

test('Task 1: Armory equips Rigid Riposte by default and reflects technique selection', () => {
  const store = new Map();
  const fakeStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const settings = new SettingsStore({ registry, storage: fakeStorage, device: 'desktop' });

  // 1. Check default loadout technique in settings
  const defaultTech = settings.get('loadout.technique');
  assert.equal(defaultTech, 'rigid_riposte');

  // 2. Check technique definitions in SWORD_TECHNIQUES
  const rigidRiposte = SWORD_TECHNIQUES.find((t) => t.id === 'rigid_riposte');
  assert.ok(rigidRiposte);
  assert.equal(rigidRiposte.name, 'Rigid Riposte');
  assert.equal(rigidRiposte.mark, '⇏');

  const whirlWind = SWORD_TECHNIQUES.find((t) => t.id === 'whirl_wind');
  assert.ok(whirlWind);
  assert.equal(whirlWind.name, 'Whirl Like the Wind');
  assert.equal(whirlWind.mark, '↻');

  // 3. Check armoryView reflects equipped technique
  const defaultView = armoryView('fireball', 'sunder', 'rigid_riposte');
  const equippedDefault = defaultView.techniques.find((t) => t.equipped);
  assert.equal(equippedDefault.id, 'rigid_riposte');
  assert.equal(equippedDefault.name, 'RIGID RIPOSTE');

  const whirlView = armoryView('fireball', 'sunder', 'whirl_wind');
  const equippedWhirl = whirlView.techniques.find((t) => t.equipped);
  assert.equal(equippedWhirl.id, 'whirl_wind');
  assert.equal(equippedWhirl.name, 'WHIRL LIKE THE WIND');

  // 4. Check setting technique updates store and persists across reload
  settings.set('loadout.technique', 'whirl_wind');
  assert.equal(settings.get('loadout.technique'), 'whirl_wind');

  const reloadedSettings = new SettingsStore({ registry, storage: fakeStorage, device: 'desktop' });
  assert.equal(reloadedSettings.get('loadout.technique'), 'whirl_wind');

  // 5. Check client/index.html plaque defaults
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<strong class="plaque-name" id="plaque-name-technique">Rigid Riposte<\/strong>/);
  assert.match(html, /<span class="plaque-icon" id="plaque-icon-technique" aria-hidden="true">⇏<\/span>/);
});

test('Task 2: Breakthrough is exposed in Play Alone selection with full configuration options', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const mainMjs = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');

  // 1. Play Alone menu button exists in HTML
  assert.match(html, /id="breakthrough-mode"/);
  assert.match(html, /BREAKTHROUGH/);

  // 2. soloChoices registry includes breakthrough-mode
  assert.match(mainMjs, /'breakthrough-mode':\s*\[\s*'BREAKTHROUGH'/);

  // 3. Companion panel includes Breakthrough setup controls
  assert.match(html, /id="solo-breakthrough-wrap"/);
  assert.match(html, /id="solo-breakthrough-size"/);
  assert.match(html, /id="solo-breakthrough-arena"/);
  assert.match(html, /id="solo-breakthrough-team"/);
  assert.match(html, /id="solo-breakthrough-rival"/);

  // 4. MenuController supports all 4 Breakthrough parameters
  const calls = [];
  const socket = {
    startSolo: (...args) => calls.push(args),
  };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const controller = new MenuController(socket, storage);

  controller.chooseBreakthroughArena('blackbell-foundry');
  controller.chooseBreakthroughTeam('ATTACKERS');
  controller.chooseBreakthroughSize(2);
  controller.chooseBreakthroughSkill('spellblade');

  controller.breakthrough('KnightTest');
  assert.deepEqual(calls[0], [
    'BREAKTHROUGH',
    'KnightTest',
    'blackbell-foundry',
    'spellblade',
    'ATTACKERS',
    2,
  ]);
});

test('Task 3: Rampage to Renown allows guest offline rehearsal while communicating profile requirements', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // 1. Notice communicating that permanent rewards require a connected profile
  assert.match(html, /id="solo-renown-note"/);
  assert.match(html, /Permanent Renown rewards require a connected profile/);

  // 2. Explicit Rehearse button for offline/guest play
  assert.match(html, /id="solo-renown-rehearse"/);
  assert.match(html, /REHEARSE ON THIS DEVICE/);

  // 3. GameLink starts rehearsal locally with zero server connections
  const remoteCalls = [];
  const localCalls = [];
  const fakeRemote = {
    connect: () => Promise.resolve(),
    startSolo: (...args) => remoteCalls.push(args),
    leaveRoom: () => {},
    on: () => {},
  };
  const fakeLocal = {
    startSolo: (...args) => localCalls.push(args),
    leaveRoom: () => {},
    on: () => {},
  };
  const link = new GameLink({ remote: fakeRemote, local: fakeLocal, timers: globalThis });

  link.startRenownRehearsal('GuestPlayer', 'court-of-merit');
  assert.equal(link.playingLocally, true);
  assert.equal(remoteCalls.length, 0, 'No remote calls for guest rehearsal');
  assert.deepEqual(localCalls.at(-1).slice(0, 3), ['RENOWN_TRIALS', 'GuestPlayer', 'court-of-merit']);
});
