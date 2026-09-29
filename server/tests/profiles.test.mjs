import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore, matchReward } from '../src/ProfileStore.mjs';

test('wallet persists, never double pays or double charges, and enforces ownership', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let store = new ProfileStore(dir);
  const { token, profile } = store.open();
  assert.equal(profile.balance, 0);
  assert.throws(() => store.purchase(token, 'azure'), /Renown/);
  assert.throws(() => store.equip(token, 'azure'), /owned/);
  store.reward(token, 'match1', 30);
  store.reward(token, 'match1', 30);
  store.reward(token, 'match2', 20);
  assert.equal(store.purchase(token, 'azure').balance, 10);
  assert.equal(store.purchase(token, 'azure').balance, 10);
  store.equip(token, 'azure');
  store = new ProfileStore(dir);
  assert.equal(store.open(token).profile.equipped, 'azure');
  assert.equal(store.open(token).profile.balance, 10);
  assert.throws(() => store.open('forged'), /profile/i);
  assert.throws(() => store.purchase(token, 'unknown'), /cloth/i);
});

test('rewards require a completed scored fight and participation', () => {
  const player = { id: 'a', actorKind: 'human', connected: true, kills: 1, deaths: 0, parries: 0 };
  const room = { state: 'FINISHED', mode: 'BOT_DUEL', matchStartedAt: 0, winnerId: 'a', finishReason: 'score' };
  assert.equal(matchReward(room, player, 60), 30);
  assert.equal(matchReward({ ...room, winnerId: 'b' }, player, 60), 20);
  assert.equal(matchReward(room, player, 12), 0);
  assert.equal(matchReward({ ...room, mode: 'PRACTICE' }, player, 60), 0);
  assert.equal(matchReward({ ...room, finishReason: 'forfeit' }, player, 60), 0);
  assert.equal(matchReward(room, { ...player, kills: 0 }, 60), 0);
  assert.equal(matchReward(room, { ...player, connected: false }, 60), 0);
});

test('failed persistence leaves wallet unchanged; corrupt profiles are never silently replaced', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-errors-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ProfileStore(path.join(dir, 'profiles'));
  const { token } = store.open();
  store.reward(token, 'match', 30);
  const good = store.directory;
  store.directory = path.join(dir, 'blocked');
  fs.writeFileSync(store.directory, 'not a directory');
  assert.throws(() => store.reward(token, 'retry', 30));
  assert.equal(store.open(token).profile.balance, 30);
  store.directory = good;
  assert.equal(store.reward(token, 'retry', 30).balance, 60);
  const file = path.join(good, `${store.key(token)}.json`);
  fs.writeFileSync(file, '{corrupt');
  assert.throws(() => new ProfileStore(good).open(token), /profile unavailable/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{corrupt');
});
