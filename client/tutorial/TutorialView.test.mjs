import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialView } from './TutorialView.mjs';

function view(context = {}) {
  globalThis.document = new EventTarget();
  const elements = new Map();
  const classes = new Map();
  const root = { hidden: true, classList: { toggle(name, value) { classes.set(name, value); } }, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, Object.assign(new EventTarget(), { hidden: false, textContent: '', open: false }));
    return elements.get(selector);
  } };
  const calls = { continued: 0, optional: 0, restart: 0, skip: 0, practice: 0, leave: 0 };
  const display = new TutorialView(root, { context: () => context, onContinue: () => calls.continued++, onOptionalContinue: () => calls.optional++,
    onRestart: () => calls.restart++, onSkip: () => calls.skip++, onPractice: () => calls.practice++, onLeave: () => calls.leave++ });
  return { display, root, elements, classes, calls, get: selector => elements.get(`[data-tutorial-${selector}]`) };
}

function enter({ repeat = false } = {}) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, { code: { value: 'Enter' }, repeat: { value: repeat } });
  document.dispatchEvent(event);
  return event;
}

test('stationary authored dialogue preserves YOU, permits deliberate Continue and ignores held Enter', () => {
  const { display, get, classes, calls } = view();
  display.show({ state: 'running', current: { kind: 'dialogue', presentation: 'blocking', speaker: 'spellblade', line: 'Of course. I have a name.' } });
  assert.equal(get('speaker').textContent, 'YOU');
  assert.equal(get('line').textContent, 'Of course. I have a name.');
  assert.equal(classes.get('tutorial-blocking'), true);
  assert.equal(get('continue').hidden, false);
  assert.equal(get('continue').textContent, 'CONTINUE · ENTER');
  assert.equal(calls.continued, 0);
  assert.equal(enter().defaultPrevented, true);
  enter({ repeat: true });
  assert.equal(calls.continued, 1);
  display.hide();
  enter();
  assert.equal(calls.continued, 1);
});

test('reactive combat and pursuit lines remain captions and never intercept Enter or offer Continue', () => {
  const { display, get, classes, calls } = view({ touch: true });
  display.show({ state: 'running', prompt: 'Cast Fireball: F', current: { kind: 'dialogue', presentation: 'reactive', speaker: 'rival', line: 'I am almost there!' } });
  assert.equal(get('speaker').textContent, 'RIVAL');
  assert.equal(get('line').textContent, 'I am almost there!');
  assert.equal(classes.get('tutorial-reactive'), true);
  assert.equal(classes.get('tutorial-touch'), true);
  assert.equal(get('continue').hidden, true);
  assert.equal(get('prompt').textContent, 'Cast Fireball: F');
  assert.equal(enter().defaultPrevented, false);
  assert.equal(calls.continued, 0);
});

test('touch blocking captions use Continue and a reactive aside preserves the active mechanic prompt', () => {
  const { display, get } = view({ touch: true });
  display.show({ state: 'running', current: { kind: 'dialogue', speaker: 'narrator', line: 'You did.' } });
  assert.equal(get('continue').textContent, 'CONTINUE');
  display.show({ state: 'running', prompt: 'Watch Guard stamina.', current: { kind: 'prompt', speaker: 'instruction', line: 'SPRINT' },
    optional: { speaker: 'narrator', line: 'The Spellblade decides to frolic' } });
  assert.equal(get('optional-line').textContent, 'NARRATOR: The Spellblade decides to frolic');
  assert.equal(get('optional-continue').hidden, true);
  assert.equal(get('prompt').textContent, 'Watch Guard stamina.');
  assert.equal(get('line').textContent, 'SPRINT');
  assert.equal(get('continue').hidden, true);
});

test('title beats show the existing brand while completion has the proper final notice', () => {
  const { display, get, classes } = view();
  for (const beat of [{ kind: 'title', advanceOn: 'continue' }, { kind: 'stage', mechanic: 'title', advanceOn: 'continue' }]) {
    display.show({ state: 'running', current: beat });
    assert.equal(get('title').hidden, false);
    assert.equal(get('line').hidden, true);
    assert.equal(classes.get('tutorial-title'), true);
    assert.equal(get('continue').hidden, true);
  }
  display.show({ state: 'complete' });
  assert.equal(get('chapter').textContent, 'TUTORIAL 1 COMPLETE');
  assert.match(get('line').textContent, /Greener Pastures complete/);
  assert.equal(get('continue').hidden, true);
  assert.equal(get('practice').hidden, true);
  assert.equal(get('skip').hidden, true);
  assert.equal(get('options').open, true);
  assert.doesNotMatch(get('line').textContent, /preview|prepared|partial/i);
});

test('skip, interruption and action feedback retain restart and leave routes', () => {
  const { display, get, calls } = view();
  display.show({ state: 'skipped' });
  assert.equal(get('practice').hidden, false);
  assert.equal(get('skip').hidden, true);
  get('restart').dispatchEvent(new Event('click'));
  get('leave').dispatchEvent(new Event('click'));
  assert.equal(calls.restart, 1);
  assert.equal(calls.leave, 1);
  display.show({ state: 'skipped' }, true);
  assert.match(get('line').textContent, /interrupted/);
  assert.equal(get('practice').hidden, true);
  display.denied('jump');
  assert.equal(get('blocked').textContent, 'Jump is deferred during this lesson.');
  assert.equal(get('blocked').hidden, false);
  display.show({ state: 'running', current: { kind: 'prompt', mechanic: 'move' } });
  assert.equal(get('blocked').hidden, true);
  assert.equal(get('options').open, false);
});

test('destroy removes the keyboard listener and closes tutorial options', () => {
  const { display, root, get, calls } = view();
  display.show({ state: 'running', current: { kind: 'dialogue', speaker: 'narrator', line: 'You did.' } });
  get('options').open = true;
  display.destroy();
  root.hidden = false;
  enter();
  assert.equal(calls.continued, 0);
  assert.equal(get('options').open, false);
});
