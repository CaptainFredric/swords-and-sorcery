import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { CHALLENGES } from '../../shared/src/challenges.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new ProfileStore(directory);
  const { token } = store.open();
  const file = path.join(directory, `${store.key(token)}.json`);
  return { store, token, file, directory };
}

// Changes that remove migration, maxima, receipt checks, authored membership, or atomic write ordering break these behaviors.
test('v1 profiles migrate on opening while wallet ownership equipment and receipts remain intact', (t) => {
  const { store, token, file, directory } = fixture(t);
  const legacy = { version: 1, balance: 71, owned: ['crimson', 'azure'], equipped: 'azure', receipts: ['paid'],
    lastReward: { matchId: 'paid', amount: 30, reason: 'earned', completion: 20, victory: 10 } };
  fs.writeFileSync(file, JSON.stringify(legacy));
  const restored = new ProfileStore(directory);
  const profile = restored.open(token).profile;
  assert.equal(profile.balance, 71);
  assert.deepEqual(profile.owned, legacy.owned);
  assert.equal(profile.equipped, 'azure');
  assert.deepEqual(profile.lastReward, legacy.lastReward);
  assert.deepEqual(profile.challenges, { progress: {}, completed: {} });
  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.receipts, ['paid']);
  assert.deepEqual(migrated.challenges, { version: 1, progress: {}, completed: {}, rewarded: [] });
  assert.equal(restored.settleMatch(token, 'paid', 30, { turnabout: 1 }).balance, 71);
  assert.deepEqual(restored.read(token).challenges.completed, {});
  assert.equal(store.key(token), restored.key(token));
});

test('new profiles start at v2 with the permanent challenge schema', (t) => {
  const { store, token } = fixture(t);
  const raw = store.read(token);
  assert.equal(raw.version, 2);
  assert.deepEqual(raw.challenges, { version: 1, progress: {}, completed: {}, rewarded: [] });
  assert.deepEqual(store.open(token).profile.challenges, { progress: {}, completed: {} });
});

test('progress keeps the largest authoritative result rather than accumulating unrelated attempts', (t) => {
  const { store, token, directory } = fixture(t);
  assert.equal(store.settleMatch(token, 'one', 0, { three_part_argument: 2 }).balance, 0);
  store.settleMatch(token, 'two', 0, { three_part_argument: 1 });
  assert.equal(store.open(token).profile.challenges.progress.three_part_argument, 2);
  assert.equal(new ProfileStore(directory).open(token).profile.challenges.progress.three_part_argument, 2);
  const finished = store.settleMatch(token, 'three', 20, { three_part_argument: 100 });
  assert.equal(finished.balance, 35);
  assert.equal(finished.challenges.progress.three_part_argument, 3);
  assert.equal(typeof finished.challenges.completed.three_part_argument, 'number');
  assert.deepEqual(finished.lastReward, {
    matchId: 'three', amount: 35, reason: 'earned', completion: 20, victory: 0, challengeAmount: 15, challenges: ['three_part_argument'],
  });
  assert.deepEqual(store.read(token).challenges.rewarded, ['three_part_argument']);
});

test('each authored completion rewards once across duplicate settlement and later matches', (t) => {
  const { store, token, directory } = fixture(t);
  const progress = Object.fromEntries(Object.values(CHALLENGES).map((challenge) => [challenge.id, challenge.goal]));
  const first = store.settleMatch(token, 'all', 30, progress);
  const renown = Object.values(CHALLENGES).reduce((total, challenge) => total + challenge.reward.renown, 0);
  assert.equal(first.balance, 30 + renown);
  assert.equal(first.lastReward.amount, 30 + renown);
  assert.equal(first.lastReward.challengeAmount, renown);
  assert.deepEqual(new Set(first.lastReward.challenges), new Set(Object.keys(CHALLENGES)));
  assert.deepEqual(store.settleMatch(token, 'all', 30, progress), first);
  const restarted = new ProfileStore(directory);
  const completedAt = restarted.read(token).challenges.completed.turnabout;
  const later = restarted.settleMatch(token, 'later', 20, progress);
  assert.equal(later.balance, 50 + renown);
  assert.equal(later.lastReward.challengeAmount, 0);
  assert.deepEqual(later.lastReward.challenges, []);
  assert.equal(later.challenges.completed.turnabout, completedAt);
});

test('hinted progress stays private until completion and obsolete saved identities remain on disk', (t) => {
  const { store, token, directory } = fixture(t);
  store.write(token, { ...store.read(token), challenges: { version: 1,
    progress: { wind_correction: 0.5, future: 7 }, completed: { obsolete: 42 }, rewarded: ['obsolete'] } });
  const publicBefore = new ProfileStore(directory).open(token).profile;
  assert.deepEqual(publicBefore.challenges, { progress: {}, completed: {} });
  const finished = store.settleMatch(token, 'reveal', 0, { wind_correction: 1, future: 999, fake: 1 });
  assert.equal(finished.balance, 20);
  assert.equal(finished.challenges.progress.wind_correction, 1);
  assert.ok(finished.challenges.completed.wind_correction);
  assert.equal(finished.challenges.progress.future, undefined);
  assert.equal(finished.challenges.completed.obsolete, undefined);
  const raw = new ProfileStore(directory).read(token).challenges;
  assert.equal(raw.progress.future, 7);
  assert.equal(raw.progress.fake, undefined);
  assert.equal(raw.completed.obsolete, 42);
  assert.ok(raw.rewarded.includes('obsolete'));
});

test('a meaningful feat settles with zero base reward while preserving the base ineligibility explanation', (t) => {
  const { store, token } = fixture(t);
  const settled = store.settleMatch(token, 'short-but-earned', 0, { turnabout: 1 }, { reason: 'short' });
  assert.equal(settled.balance, CHALLENGES.turnabout.reward.renown);
  assert.equal(settled.lastReward.completion, 0);
  assert.equal(settled.lastReward.victory, 0);
  assert.equal(settled.lastReward.reason, 'short');
  assert.equal(settled.lastReward.challengeAmount, 20);
  assert.deepEqual(settled.lastReward.challenges, ['turnabout']);
});

test('failed settlement leaves disk and cached wallet progress completions and receipts unchanged for retry', (t) => {
  const { store, token, file, directory } = fixture(t);
  store.settleMatch(token, 'partial', 0, { three_part_argument: 2 });
  const before = structuredClone(store.read(token));
  const diskBefore = fs.readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error('storage unavailable'); };
    assert.throws(() => store.settleMatch(token, 'retry', 30, { three_part_argument: 3, turnabout: 1 }), /storage unavailable/);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(store.read(token), before);
  assert.equal(fs.readFileSync(file, 'utf8'), diskBefore);
  assert.equal(fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0);
  const retry = store.settleMatch(token, 'retry', 30, { three_part_argument: 3, turnabout: 1 });
  assert.equal(retry.balance, 65);
  assert.deepEqual(store.settleMatch(token, 'retry', 30, { three_part_argument: 3, turnabout: 1 }), retry);
});

test('legacy reward calls retain their wallet behavior and challenge progress survives cosmetic transactions', (t) => {
  const { store, token, directory } = fixture(t);
  store.settleMatch(token, 'feat', 30, { turnabout: 1 });
  store.reward(token, 'base', 20);
  assert.equal(store.purchase(token, 'azure').balance, 30);
  store.equip(token, 'azure');
  const reopened = new ProfileStore(directory).open(token).profile;
  assert.equal(reopened.balance, 30);
  assert.equal(reopened.equipped, 'azure');
  assert.ok(reopened.challenges.completed.turnabout);
  assert.equal(reopened.lastReward.amount, 20);
  assert.equal(reopened.lastReward.challengeAmount, 0);
});

test('invalid progress and unknown incoming identities create no completion or reward', (t) => {
  const { store, token } = fixture(t);
  const invalid = { three_part_argument: '3', turnabout: NaN, mind_the_gap: Infinity, not_yet: -1, forged: 1 };
  const settled = store.settleMatch(token, 'invalid', 0, invalid);
  assert.equal(settled.balance, 0);
  assert.deepEqual(settled.challenges, { progress: {}, completed: {} });
  assert.deepEqual(settled.lastReward.challenges, []);
  assert.throws(() => store.settleMatch(token, 'bad-base', 31, { turnabout: 1 }), /Invalid reward/);
  assert.equal(store.read(token).receipts.includes('bad-base'), false);
});

test('migration failure retains the original v1 file and allows a later successful migration', (t) => {
  const { store, token, file, directory } = fixture(t);
  const legacy = { version: 1, balance: 37, owned: ['crimson'], equipped: 'crimson', receipts: ['old-match'] };
  const contents = JSON.stringify(legacy);
  fs.writeFileSync(file, contents);
  const restored = new ProfileStore(directory);
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error('storage unavailable'); };
    assert.throws(() => restored.open(token), /profile unavailable/);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(file, 'utf8'), contents);
  assert.equal(restored.profiles.has(store.key(token)), false);
  assert.equal(restored.open(token).profile.balance, 37);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 2);
});

test('the reward ledger independently prevents payment when a completion marker is restored', (t) => {
  const { store, token } = fixture(t);
  store.write(token, { ...store.read(token), challenges: { version: 1, progress: {}, completed: {}, rewarded: ['turnabout'] } });
  const settled = store.settleMatch(token, 'already-paid', 20, { turnabout: 1 });
  assert.equal(settled.balance, 20);
  assert.equal(settled.lastReward.challengeAmount, 0);
  assert.ok(settled.challenges.completed.turnabout);
  assert.deepEqual(store.read(token).challenges.rewarded, ['turnabout']);
});

test('obsolete completion IDs in a saved reward receipt stay on disk and leave the public receipt', (t) => {
  const { store, token, file } = fixture(t);
  const previous = { matchId: 'prior-build', amount: 20, challengeAmount: 20, challenges: ['obsolete', 'turnabout'] };
  store.write(token, { ...store.read(token), lastReward: previous });
  assert.deepEqual(store.open(token).profile.lastReward.challenges, ['turnabout']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).lastReward.challenges, ['obsolete', 'turnabout']);
});
