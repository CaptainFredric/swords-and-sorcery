import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialProgress, tutorialEntryBypassesOffer, TUTORIAL_1_VERSION, TUTORIAL_PROGRESS_KEY } from './TutorialProgress.mjs';

function storage(initial = null) {
  const items = new Map(initial === null ? [] : [[TUTORIAL_PROGRESS_KEY, initial]]);
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), items };
}

test('an unseen browser offers the lesson and saves a versioned skip across launches', () => {
  const saved = storage();
  const progress = new TutorialProgress({ storage: saved });
  assert.deepEqual(progress.snapshot, { version: TUTORIAL_1_VERSION, status: 'unseen' });
  assert.equal(progress.shouldOfferFirstRun(), true);
  assert.deepEqual(progress.recordSkipped(), { version: 1, status: 'skipped' });
  assert.equal(new TutorialProgress({ storage: saved }).shouldOfferFirstRun(), false);
});

test('completion replaces skip and survives a later replay skip, including across tabs', () => {
  const saved = storage();
  const progress = new TutorialProgress({ storage: saved });
  const otherTab = new TutorialProgress({ storage: saved });
  progress.recordSkipped();
  progress.recordCompleted();
  assert.equal(progress.recordSkipped().status, 'completed');
  assert.equal(otherTab.recordSkipped().status, 'completed');
  assert.equal(new TutorialProgress({ storage: saved }).status, 'completed');
});

test('invites, deep links, automated and debug destinations preserve unseen for a later normal landing', () => {
  const saved = storage();
  const progress = new TutorialProgress({ storage: saved });
  const entries = [
    { roomId: 'ABCDE' }, { invite: true }, { deepLink: true }, { autoTest: true }, { debug: true }, { manualSolo: true },
    ...['room=ABCDE', 'invite=ABCDE', 'solo=PRACTICE', 'tutorial=1', 'mode=DUEL', 'debug=', 'autotest=1', 'inspect=1', 'testHud=1'].map(query => ({ params: new URLSearchParams(query) })),
  ];
  for (const entry of entries) {
    assert.equal(tutorialEntryBypassesOffer(entry), true);
    assert.equal(progress.shouldOfferFirstRun(entry), false);
    assert.equal(progress.status, 'unseen');
  }
  assert.equal(saved.items.size, 0);
  assert.equal(progress.shouldOfferFirstRun({ params: new URLSearchParams('utm_source=friend') }), true);
});

test('invalid or deliberately changed versions are unseen and storage failure preserves playable in memory choices', () => {
  for (const raw of ['{', 'null', '[]', JSON.stringify({ version: 99, status: 'completed' }), JSON.stringify({ version: 1, status: 'playing' })]) {
    assert.equal(new TutorialProgress({ storage: storage(raw) }).status, 'unseen');
  }
  const denied = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const progress = new TutorialProgress({ storage: denied });
  assert.equal(progress.shouldOfferFirstRun(), true);
  assert.doesNotThrow(() => progress.recordSkipped());
  assert.equal(progress.shouldOfferFirstRun(), false);
  assert.doesNotThrow(() => progress.recordCompleted());
  assert.equal(progress.status, 'completed');
  assert.equal(new TutorialProgress({ storage: null }).recordCompleted().status, 'completed');
});

test('a throwing browser storage getter fails open before construction', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try { assert.equal(new TutorialProgress().recordSkipped().status, 'skipped'); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
