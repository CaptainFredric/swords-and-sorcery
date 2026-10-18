import test from 'node:test';
import assert from 'node:assert/strict';
import * as feedback from './combatFeedback.mjs';
import * as hudModule from '../ui/HUD.mjs';

function reticle() {
  const classes = new Set();
  const hud = Object.create(hudModule.HUD.prototype);
  hud.crosshair = { classList: {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
  } };
  return { hud, classes };
}

test('a second contact keeps its marker for its own full lifetime', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hud, classes } = reticle();
  hud.hit('hit');
  t.mock.timers.tick(100);
  hud.hit('hit');
  t.mock.timers.tick(80);
  assert.ok(classes.has('hit'), 'the first hit must not clear the second hit');
  t.mock.timers.tick(300);
  assert.equal(classes.size, 0);
});

test('a lethal blow keeps its kill marker through subsequent contact events', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hud, classes } = reticle();
  hud.hit('kill');
  hud.hit('hit');
  hud.hit('glance');
  assert.deepEqual([...classes], ['kill']);
  t.mock.timers.tick(500);
  assert.equal(classes.size, 0);
});

test('a parry replaces a block and clears without leaving mixed contact colours', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hud, classes } = reticle();
  hud.hit('block');
  hud.hit('parry');
  assert.deepEqual([...classes], ['parry']);
  t.mock.timers.tick(500);
  assert.equal(classes.size, 0);
});

test('damage confirmation excludes self damage, burn ticks and the sword contact duplicate', () => {
  assert.equal(typeof feedback.damageHitMarker, 'function');
  const event = { type: 'damage', attackerId: 'me', victimId: 'rival', amount: 16, source: 'fireball' };
  assert.equal(feedback.damageHitMarker(event, 'me'), 'hit');
  for (const change of [{ source: 'burn' }, { source: 'sword' }, { amount: 0 }, { amount: -1 },
    { attackerId: 'other' }, { victimId: 'me' }]) {
    assert.equal(feedback.damageHitMarker({ ...event, ...change }, 'me'), null);
  }
});

test('duel score follows authoritative kills and survives rival death or disconnect', () => {
  assert.equal(typeof hudModule.duelScoreView, 'function');
  const local = { id: 'me', kills: 2 };
  const snapshot = { mode: 'BOT_DUEL', players: [local, { id: 'rival', name: 'Rival', kills: 3, alive: false, connected: false }] };
  assert.deepEqual(hudModule.duelScoreView(local, snapshot), { mine: 2, theirs: 3, rival: 'Rival' });
  snapshot.players[1].kills = 4;
  assert.equal(hudModule.duelScoreView(local, snapshot).theirs, 4);
});

test('duel score stays out of tutorial, practice, team battles and rooms with extra opponents', () => {
  assert.equal(typeof hudModule.duelScoreView, 'function');
  const local = { id: 'me', kills: 0 };
  const snapshot = { mode: 'DUEL', players: [local, { id: 'rival', kills: 0 }] };
  assert.equal(hudModule.duelScoreView(local, snapshot).mine, 0);
  for (const change of [{ mode: 'PRACTICE' }, { mode: 'FFA' }, { mode: 'BREAKTHROUGH' }, { tutorial: true },
    { players: [local] }, { players: [...snapshot.players, { id: 'third' }] }]) {
    assert.equal(hudModule.duelScoreView(local, { ...snapshot, ...change }), null);
  }
});
