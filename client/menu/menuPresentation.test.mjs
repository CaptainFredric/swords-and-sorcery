import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, MenuPresentation, PRESENTATION } from './menuPresentation.mjs';

const { COMMAND, OBSERVE_MANUAL, OBSERVE_IDLE } = PRESENTATION;
const made = (options = {}) => {
  const changes = [];
  const presentation = new MenuPresentation({ onChange: (state, previous, cause) => changes.push([state, cause]), ...options });
  return { presentation, changes };
};

test('WATCH THE YARD stays until SHOW MENU: the pointer moving about, the wheel, time passing do nothing to it', () => {
  const { presentation, changes } = made();
  assert.equal(presentation.state, COMMAND);
  presentation.observe();
  assert.equal(presentation.state, OBSERVE_MANUAL);
  for (let t = 1; t < 400; t += 7) {
    assert.deepEqual(presentation.activity(t, { kind: 'pointer', moved: 300 }), { woke: false, swallow: false });
    presentation.activity(t, { kind: 'wheel' });
    presentation.activity(t, { kind: 'press' });
    presentation.tick(t, true);
  }
  assert.equal(presentation.state, OBSERVE_MANUAL, 'deliberately chosen: only an explicit return ends it');
  presentation.showMenu(500);
  assert.equal(presentation.state, COMMAND);
  assert.deepEqual(changes, [[OBSERVE_MANUAL, 'manual'], [COMMAND, 'manual']]);
});

test('left alone on an eligible front door, the banner yields to the yard after the threshold, and only then', () => {
  const { presentation, changes } = made();
  assert.equal(IDLE.afterSec, 90);
  presentation.tick(89.9, true);
  assert.equal(presentation.state, COMMAND);
  presentation.tick(90, true);
  assert.equal(presentation.state, OBSERVE_IDLE);
  assert.deepEqual(changes.at(-1), [OBSERVE_IDLE, 'idle']);
  // an activity resets the stillness
  const again = made().presentation;
  again.tick(50, true);
  again.activity(60, { kind: 'pointer', moved: 40 });
  again.tick(140, true);
  assert.equal(again.state, COMMAND, 'counted from the last thing done');
  again.tick(150, true);
  assert.equal(again.state, OBSERVE_IDLE);
});

test('while it may not yield (a panel open, typing, a phone, the page unseen), the stillness is not counted at all', () => {
  const { presentation } = made();
  for (let t = 0; t <= 600; t += 1) presentation.tick(t, false);
  assert.equal(presentation.state, COMMAND);
  // eligible again: counted from then, not from ten minutes ago
  presentation.tick(601, true);
  assert.equal(presentation.state, COMMAND, 'the panel just closed: no vanishing banner');
  presentation.tick(689.5, true);
  assert.equal(presentation.state, COMMAND);
  presentation.tick(690, true);
  assert.equal(presentation.state, OBSERVE_IDLE);
  // the page seen again after minutes in the background: counted afresh
  const background = made().presentation;
  background.tick(0, true);
  background.activity(300, { kind: 'visible' });
  background.tick(301, true);
  assert.equal(background.state, COMMAND);
});

test('the player back: a real movement wakes it (jitter does not); a press or a key wakes it and goes no further', () => {
  const idle = () => {
    const { presentation, changes } = made();
    presentation.tick(90, true);
    assert.equal(presentation.state, OBSERVE_IDLE);
    return { presentation, changes };
  };
  const jitter = idle().presentation;
  assert.deepEqual(jitter.activity(91, { kind: 'pointer', moved: 2 }), { woke: false, swallow: false });
  assert.deepEqual(jitter.activity(92, { kind: 'pointer', moved: 2 }), { woke: false, swallow: false });
  assert.equal(jitter.state, OBSERVE_IDLE, 'incidental jitter');
  assert.deepEqual(jitter.activity(93, { kind: 'pointer', moved: 3 }), { woke: true, swallow: false }, 'small moves add up to a real one');
  assert.equal(jitter.state, COMMAND);
  for (const kind of ['press', 'key', 'touch']) {
    const { presentation, changes } = idle();
    assert.deepEqual(presentation.activity(95, { kind }), { woke: true, swallow: true }, kind);
    assert.deepEqual(changes.at(-1), [COMMAND, 'wake']);
  }
  const wheel = idle().presentation;
  assert.deepEqual(wheel.activity(95, { kind: 'wheel' }), { woke: true, swallow: false });
  // and once awake, the stillness counts from the waking: no flicker back
  const woke = idle().presentation;
  woke.activity(100, { kind: 'key' });
  woke.tick(150, true);
  assert.equal(woke.state, COMMAND);
});

test('WATCH THE YARD from an idle yield makes it deliberate; leaving the front door is back to the banner at once', () => {
  const { presentation, changes } = made();
  presentation.tick(90, true);
  presentation.observe();
  assert.equal(presentation.state, OBSERVE_MANUAL);
  assert.deepEqual(presentation.activity(91, { kind: 'pointer', moved: 50 }), { woke: false, swallow: false });
  presentation.reset(100);
  assert.equal(presentation.state, COMMAND);
  assert.deepEqual(changes.at(-1), [COMMAND, 'reset']);
  // (nothing to change: nothing said)
  const count = changes.length;
  presentation.reset(101);
  assert.equal(changes.length, count);
});
