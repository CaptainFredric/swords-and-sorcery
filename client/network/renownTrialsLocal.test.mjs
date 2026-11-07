import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from './LocalHost.mjs';

test('browser-only Solo route starts an actual Renown Trials wave and replicates snapshots', () => {
  let time = 100;
  const callbacks = [];
  const host = new LocalHost({
    now: () => time, every: () => 1, cancel: () => {},
    later: (fn) => { callbacks.push(fn); },
  });
  const heard = [];
  host.on('*', ({ type, payload }) => heard.push({ type, payload }));
  host.startSolo('RENOWN_TRIALS', 'Spellblade', 'castleward');
  for (const cb of callbacks.splice(0)) cb();
  assert.equal(host.room?.mode, 'RENOWN_TRIALS');
  time = 103.2;
  host.tick();
  assert.equal(host.room.state, 'PLAYING');
  time = 104.8;
  host.tick();
  assert.equal(host.latestSnapshot.mode, 'RENOWN_TRIALS');
  assert.equal(host.latestSnapshot.renownTrial.phase, 'WAVE_ACTIVE');
  assert.equal(host.latestSnapshot.renownTrial.totalEnemies, 1);
  assert.ok(host.latestSnapshot.players.some(p => p.actorKind === 'bot'));
  assert.equal(host.latestSnapshot.renownTrial.verdict, null);
  host.leaveRoom();
});
