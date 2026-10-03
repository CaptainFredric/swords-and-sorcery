import test from 'node:test';
import assert from 'node:assert/strict';
import { ChallengesController, challengeRewardView } from './ChallengesController.mjs';
import { CHALLENGES } from '../../shared/src/challenges.mjs';

function element() {
  return { children: [], textContent: '', className: '', attrs: {}, hidden: false, replacements: 0,
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.replacements += 1; this.children = children; this.textContent = ''; },
    setAttribute(key, value) { this.attrs[key] = value; },
  };
}
function textTree(node) { return [node.textContent, ...node.children.map(textTree)].join(' '); }
function fixture(profile = null) {
  const handlers = new Map();
  const link = { playingLocally: false, on(type, fn) { handlers.set(type, fn); } };
  const root = element();
  const rewardRoot = element();
  const doc = { createElement: element };
  const controller = new ChallengesController({ root, rewardRoot, link, getProfile: () => profile, document: doc });
  return { controller, root, rewardRoot, link, handlers };
}

const completed = { challenges: { progress: { wind_correction: 1 }, completed: { wind_correction: 123 } },
  lastReward: { matchId: 'match', challenges: ['wind_correction'], challengeAmount: 20 } };
const finished = { roomState: 'FINISHED', rewardMatchId: 'match' };

test('Armory renders the three populated families while hinted entries expose only authored hints', () => {
  const { root } = fixture({ challenges: { progress: { wind_correction: 1, both_hands_full: 1 } } });
  const families = root.children.filter((node) => node.className === 'mastery-family');
  assert.deepEqual(families.map((node) => node.attrs['aria-label']), ['SWORDSMANSHIP', 'SORCERY', 'CHIVALRY']);
  const hidden = families.flatMap((node) => node.children).filter((node) => node.className?.includes('hinted'));
  assert.equal(hidden.length, 4);
  for (const card of hidden) {
    const words = textTree(card);
    assert.match(words, /HIDDEN CHALLENGE/);
    assert.equal(card.children.length, 2);
    assert.doesNotMatch(words, /\d|RENOWN|REWARD/);
    for (const definition of Object.values(CHALLENGES).filter((item) => item.visibility === 'hinted')) {
      assert.ok(!words.includes(definition.title));
      assert.ok(!words.includes(definition.condition));
    }
  }
  assert.match(textTree(root), /Practice is for training/);
  assert.doesNotMatch(textTree(root), /ODDITIES/);
});

test('server completion reveals exact title, condition, reward and authored flavor', () => {
  const { root, controller } = fixture();
  controller.updateProfile(completed);
  const words = textTree(root);
  assert.match(words, /WIND CORRECTION/);
  assert.ok(words.includes(CHALLENGES.wind_correction.condition));
  assert.ok(words.includes(CHALLENGES.wind_correction.flavor));
  assert.match(words, /EARNED · 20 RENOWN/);
  assert.match(words, /1 \/ 9 MASTERED/);
});

test('visible chain progress uses authoritative progress and remains stable across wallet updates', () => {
  const profile = { balance: 20, challenges: { progress: { three_part_argument: 2 } } };
  const { root, controller } = fixture(profile);
  assert.match(textTree(root), /2 \/ 3/);
  const previous = root.replacements;
  controller.updateProfile({ ...profile, balance: 70 });
  assert.equal(root.replacements, previous);
  assert.match(textTree(root), /2 \/ 3/);
});

test('match end cue waits for matching server receipt and repeated updates do not reannounce it', () => {
  const { controller, rewardRoot, handlers } = fixture();
  handlers.get('snapshot')(finished);
  assert.equal(rewardRoot.hidden, true);
  handlers.get('profile')({ profile: completed });
  assert.equal(rewardRoot.hidden, false);
  assert.match(textTree(rewardRoot), /MASTERY EARNED.*WIND CORRECTION.*20 RENOWN/);
  const first = rewardRoot.replacements;
  handlers.get('profile')({ profile: JSON.parse(JSON.stringify(completed)) });
  handlers.get('snapshot')({ ...finished });
  handlers.get('status')();
  assert.equal(rewardRoot.replacements, first);
  controller.updateSnapshot({ roomState: 'PLAYING', rewardMatchId: 'next' });
  assert.equal(rewardRoot.hidden, true);
  assert.equal(textTree(rewardRoot).trim(), '');
});

test('stale receipts, local training and unknown or incomplete feats produce no completion cue', () => {
  assert.equal(challengeRewardView(completed, { ...finished, rewardMatchId: 'other' }), null);
  assert.equal(challengeRewardView(completed, { ...finished, roomState: 'PLAYING' }), null);
  assert.equal(challengeRewardView(completed, finished, true), null);
  assert.equal(challengeRewardView({ ...completed, challenges: {} }, finished), null);
  assert.equal(challengeRewardView({ ...completed, lastReward: { ...completed.lastReward, challenges: ['future_id'] } }, finished), null);
  assert.equal(challengeRewardView({ ...completed, lastReward: { ...completed.lastReward, challenges: [] } }, finished), null);
});

test('duplicate server feat IDs are displayed once and only the server settled Renown amount is shown', () => {
  const view = challengeRewardView({ ...completed, lastReward: { ...completed.lastReward, challenges: ['wind_correction', 'wind_correction', 'future'], challengeAmount: 7 } }, finished);
  assert.deepEqual(view.ids, ['wind_correction']);
  assert.equal(view.amount, 7);
  assert.match(view.text, /\+7 RENOWN/);
});
