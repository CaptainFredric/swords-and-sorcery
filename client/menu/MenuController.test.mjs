import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuController, shouldRouteSocketError } from './MenuController.mjs';

function harness() {
  const calls = [];
  const socket = {
    startInspectionPractice: (name, world) => calls.push(['inspection', name, world]),
    quickPlay: (name) => calls.push(['quickPlay', name]),
    createRoom: (name) => calls.push(['createRoom', name]),
    joinRoom: (code, name) => calls.push(['joinRoom', code, name]),
    startSolo: (mode, name, worldId, botSkill, team, teamSize) => calls.push(['startSolo', mode, name, ...(botSkill ? [botSkill] : []), ...(worldId && mode === 'RENOWN_TRIALS' ? [worldId] : []), ...(mode === 'BREAKTHROUGH' ? [worldId, team, teamSize] : [])]),
    startRenownRehearsal: (name, worldId) => calls.push(['startRenownRehearsal', name, worldId]),
  };
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  return { calls, store, controller: new MenuController(socket, storage) };
}

test('Quick Play, Bot Duel and Practice are distinct authoritative actions', () => {
  const { controller, calls } = harness();

  assert.equal(controller.quickPlay('Aden').ok, true);
  assert.equal(controller.botDuel('Aden').ok, true);
  assert.equal(controller.practice('Aden').ok, true);

  assert.deepEqual(calls, [
    ['quickPlay', 'Aden'],
    ['startSolo', 'BOT_DUEL', 'Aden', 'knight'],
    ['startSolo', 'PRACTICE', 'Aden'],
  ]);
});

test('the Bot Duel\'s rival is chosen and remembered: the Knight until another is', () => {
  const { controller, calls, store } = harness();
  assert.equal(controller.botSkill(), 'knight');
  assert.equal(controller.chooseBotSkill('spellblade'), 'spellblade');
  assert.equal(store.get('ss-bot-skill'), 'spellblade');
  controller.botDuel('Aden');
  assert.deepEqual(calls.at(-1), ['startSolo', 'BOT_DUEL', 'Aden', 'spellblade']);
  assert.equal(controller.chooseBotSkill('grandmaster'), 'knight', 'nothing made up');
});

test('menu actions normalize names once and persist the accepted identity', () => {
  const { controller, calls, store } = harness();

  const result = controller.createPrivate('   The Long Spellblade Name That Will Be Cut   ');

  assert.equal(result.ok, true);
  assert.equal(result.name.length, 18);
  assert.equal(result.name, 'The Long Spellblad');
  assert.deepEqual(calls, [['createRoom', 'The Long Spellblad']]);
  assert.equal(store.get('ss-player-name'), 'The Long Spellblad');
});

test('blank names and malformed room codes fail without touching the socket', () => {
  const { controller, calls } = harness();

  assert.deepEqual(controller.quickPlay('   '), { ok: false, error: 'Enter a Spellblade name.' });
  assert.deepEqual(controller.joinPrivate('abc', 'Aden'), { ok: false, error: 'Enter the five-character room code.' });
  assert.deepEqual(calls, []);
});

test('private join normalizes room codes before dispatch', () => {
  const { controller, calls } = harness();

  const result = controller.joinPrivate(' abcd2 ', 'Aden');

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['joinRoom', 'ABCD2', 'Aden']]);
});

test('socket errors during active play stay in the arena instead of routing to a stale menu', () => {
  assert.equal(shouldRouteSocketError('ABCDE', { roomState: 'PLAYING', mode: 'PRACTICE' }), false);
  assert.equal(shouldRouteSocketError('ABCDE', { roomState: 'PLAYING', mode: 'FFA' }), false);
  assert.equal(shouldRouteSocketError(null, null), true);
  assert.equal(shouldRouteSocketError(null, { roomState: 'WAITING' }), true);
});


test('inspection keeps name validation and the chosen solo arena', () => {
  const { controller, calls } = harness();
  assert.equal(controller.inspectionPractice('  ').ok, false);
  assert.deepEqual(calls, []);
  controller.chooseSoloArena('ruined-keep');
  assert.equal(controller.inspectionPractice(' Inspector ').ok, true);
  assert.deepEqual(calls, [['inspection', 'Inspector', 'ruined-keep']]);
});

test('Renown Trials arena is chosen and remembered: court-of-merit by default or castleward fallback', () => {
  const { controller, calls, store } = harness();
  assert.equal(controller.renownArena(), 'court-of-merit');
  assert.equal(controller.chooseRenownArena('castleward'), 'castleward');
  assert.equal(store.get('ss-renown-arena'), 'castleward');
  assert.equal(controller.renownArena(), 'castleward');

  // Launching Renown Trials respects the explicit or remembered choice
  controller.renownTrials('MeritSeeker');
  assert.deepEqual(calls.at(-1), ['startSolo', 'RENOWN_TRIALS', 'MeritSeeker', 'castleward']);

  // Reset to Court of Merit
  assert.equal(controller.chooseRenownArena('court-of-merit'), 'court-of-merit');
  controller.renownTrials('MeritSeeker');
  assert.deepEqual(calls.at(-1), ['startSolo', 'RENOWN_TRIALS', 'MeritSeeker', 'court-of-merit']);

  // Rejects invalid arena names and falls back to court-of-merit
  assert.equal(controller.chooseRenownArena('outerworks'), 'court-of-merit');
});

test('Breakthrough preserves battle size, arena, allegiance, and bot skill', () => {
  const { controller, calls, store } = harness();
  assert.equal(controller.breakthroughSize(), 3);
  assert.equal(controller.chooseBreakthroughSize(2), 2);
  assert.equal(store.get('ss-breakthrough-size'), '2');

  assert.equal(controller.breakthroughArena(), 'bastion-breach');
  assert.equal(controller.chooseBreakthroughArena('outerworks'), 'outerworks');
  assert.equal(store.get('ss-breakthrough-arena'), 'outerworks');

  assert.equal(controller.breakthroughTeam(), 'AUTO');
  assert.equal(controller.chooseBreakthroughTeam('DEFENDERS'), 'DEFENDERS');
  assert.equal(store.get('ss-breakthrough-team'), 'DEFENDERS');

  assert.equal(controller.breakthroughSkill(), 'knight');
  assert.equal(controller.chooseBreakthroughSkill('champion'), 'champion');
  assert.equal(store.get('ss-breakthrough-skill'), 'champion');

  controller.breakthrough('SiegeKnight');
  const lastCall = calls.at(-1);
  assert.equal(lastCall[0], 'startSolo');
  assert.equal(lastCall[1], 'BREAKTHROUGH');
  assert.equal(lastCall[2], 'SiegeKnight');
  assert.equal(lastCall[3], 'champion'); // botSkill
  assert.equal(lastCall[4], 'outerworks'); // worldId
  assert.equal(lastCall[5], 'DEFENDERS'); // team
  assert.equal(lastCall[6], 2); // teamSize
});

test('Renown rehearsal launches locally without profile dependency, while rewarded trial routes to startSolo', () => {
  const { controller, calls } = harness();
  controller.renownTrials('GuestKnight', { worldId: 'castleward', rehearsal: true });
  assert.deepEqual(calls.at(-1), ['startRenownRehearsal', 'GuestKnight', 'castleward']);

  controller.renownTrials('ConnectedKnight', { worldId: 'court-of-merit', rehearsal: false });
  assert.deepEqual(calls.at(-1), ['startSolo', 'RENOWN_TRIALS', 'ConnectedKnight', 'court-of-merit']);
});
