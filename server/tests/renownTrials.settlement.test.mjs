import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { pendingTrialAward, commitTrialAward } from '../src/renownTrialSettlement.mjs';
import { timelyWaveReward, trialWavePlan } from '../../shared/sim/renownTrials.mjs';

function preparedRoom(token, waveIndex = 1, award = 10) {
  const matchId = crypto.randomUUID();
  const runId = `test:${matchId}`;
  const row = { id: `${runId}:w${waveIndex}`, wave: waveIndex,
    reward: award, verdict: 'AWARD', status: 'UNSETTLED' };
  return {
    room: {
      mode: 'RENOWN_TRIALS', rewardMatchId: matchId,
      renownTrial: { runId, playerId: 'knight', waveIndex,
        wave: { reward: award, verdict: 'AWARD' }, ledger: [row] },
      players: new Map([['knight', { id:'knight', actorKind:'human', connected:true, profileToken:token }]]),
    },
    event: { type: 'renownTrialWaveCleared', runId, waveIndex, award },
    row,
  };
}
test('server trial settlement commits atomically, repeats do not duplicate, survives restart and later execution', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-atomic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let store = new ProfileStore(dir);
  const {token} = store.open();
  const first = preparedRoom(token, 1, 12);
  const award = pendingTrialAward(first.room, first.event);
  assert.equal(first.row.status, 'PENDING');
  assert.ok(award?.receiptId.startsWith('trial-wave:'));
  assert.equal(commitTrialAward(store, award).balance, 12);
  assert.equal(first.row.status, 'SETTLED');
  assert.equal(commitTrialAward(store, award).balance, 12);
  store = new ProfileStore(dir);
  assert.equal(store.open(token).profile.balance, 12);
  assert.equal(commitTrialAward(store, award).balance, 12);
  const second = preparedRoom(token, 2, 14);
  assert.equal(commitTrialAward(store, pendingTrialAward(second.room, second.event)).balance, 26);
  assert.equal(store.open(token).profile.balance, 26,
    'the execution/termination of a later wave cannot reverse settled prior waves');
  const file = path.join(dir, store.key(token) + '.json');
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(disk.receipts.filter(id => id === award.receiptId).length, 1);
  assert.equal(disk.receipts.length, 2);
});
test('storage failure cannot mark the ledger SETTLED, retry succeeds exactly once', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ProfileStore(path.join(dir, 'profiles'));
  const {token} = store.open();
  const { room, event, row } = preparedRoom(token, 1, 12);
  const pending = pendingTrialAward(room,event);
  const original = store.directory;
  store.directory = path.join(dir, 'blocked');
  fs.writeFileSync(store.directory, 'file');
  assert.throws(() => commitTrialAward(store,pending));
  assert.equal(row.status, 'PENDING');
  assert.equal(store.open(token).profile.balance, 0);
  store.directory = original;
  assert.equal(commitTrialAward(store,pending).balance, 12);
  assert.equal(commitTrialAward(store,pending).balance, 12);
});
test('untrusted, malformed or inflated award event is not accepted', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ProfileStore(dir);
  const {token} = store.open();
  const { room, event } = preparedRoom(token, 1, 12);
  assert.equal(pendingTrialAward(room, { ...event, runId:'other' }), null);
  assert.equal(pendingTrialAward(room, { ...event, waveIndex:2 }), null);
  assert.equal(pendingTrialAward({...room, mode:'PRACTICE'}, event), null);
  assert.equal(pendingTrialAward({...room, rewardMatchId:'forged'}, event), null);
  assert.equal(pendingTrialAward({...room, renownTrial: {...room.renownTrial, wave: {reward:16, verdict:'AWARD'}}}, event), null);
  const inflated = preparedRoom(token, 1, timelyWaveReward(trialWavePlan(1),0)+1);
  assert.equal(pendingTrialAward(inflated.room, inflated.event), null);
  assert.throws(() => store.settleTrialWave(token,'from-client',100), /receipt/);
  assert.throws(() => store.settleTrialWave(token,`trial-wave:${crypto.randomUUID()}:w1`, -1), /reward/);
  assert.equal(store.open(token).profile.balance,0);
});
test('zero-award verdict is distinct from pending settlement; a disconnected account is unavailable', () => {
  const none = preparedRoom('x', 1, 0);
  none.row.verdict = 'NONE'; none.room.renownTrial.wave.verdict = 'NONE';
  assert.equal(pendingTrialAward(none.room,none.event), null);
  assert.equal(none.row.status,'NOT_AWARDED');
  const left = preparedRoom('x', 1, 10);
  left.room.players.get('knight').connected = false;
  assert.equal(pendingTrialAward(left.room,left.event),null);
  assert.equal(left.row.status,'UNAVAILABLE');
});
