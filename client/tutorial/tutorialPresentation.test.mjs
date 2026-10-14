import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TutorialView } from './TutorialView.mjs';
import { tutorialTranscript } from './tutorialTranscript.mjs';
import { TUTORIAL_BEATS, TUTORIAL_CHAPTERS } from './tutorialScript.mjs';

const speak = d => d.completeDialogue(d.cue);

test('Back goes to the line before in a conversation, and Continue goes on from it again', () => {
  // (the introductions: a conversation of lines that wait on Continue)
  const lines = TUTORIAL_BEATS.filter(b => b.segment === 'introductions');
  assert.ok(lines.length >= 4 && lines.every(b => b.kind === 'dialogue' && b.presentation !== 'reactive'));
  const d = new TutorialDirector(); d.start(); d.resumeAt(lines[0].id);
  assert.equal(d.previousLine(), null, 'the first line of its conversation has none before it');
  speak(d);
  assert.equal(d.current.id, lines[1].id);
  assert.equal(d.back(), true);
  assert.equal(d.current.id, lines[0].id);
  assert.equal(d.audioCue, null);
  speak(d); assert.equal(d.current.id, lines[1].id);
  speak(d); speak(d); assert.equal(d.current.id, lines[3].id);
  d.back(); d.back(); assert.equal(d.current.id, lines[1].id);
});

test('Back never crosses something that happened: a prompt, a stage, another scene; and never in a moving line', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('negotiations');
  speak(d); assert.equal(d.current.id, 'placate');
  assert.equal(d.previousLine(), TUTORIAL_BEATS.findIndex(b => b.id === 'negotiations'));
  // after the Attack prompt: the line before it is behind something the player did
  d.resumeAt('teach-you');
  assert.equal(d.current.presentation === 'reactive' || d.previousLine() === null, true);
  // a reactive (moving) line: no Back
  d.resumeAt('hardly-wellbeing');
  assert.equal(d.current.presentation, 'reactive');
  assert.equal(d.previousLine(), null);
  assert.equal(d.back(), false);
});

test('the transcript lists every spoken line by chapter, what has been had, what is being had, and the asides heard', () => {
  const d = new TutorialDirector(); d.start(); d.resumeAt('placate');
  const chapters = tutorialTranscript(d, {}, new Set(['frolic-fields']));
  assert.deepEqual(chapters.map(c => c.id), TUTORIAL_CHAPTERS.map(c => c.id));
  const all = chapters.flatMap(c => c.lines);
  const spoken = TUTORIAL_BEATS.filter(b => b.kind === 'dialogue');
  assert.equal(all.filter(l => !l.aside).length, spoken.length, 'every main line');
  assert.equal(all.find(l => l.id === 'negotiations').heard, true);
  assert.equal(all.find(l => l.id === 'placate').current, true);
  assert.equal(all.find(l => l.id === 'stand-down').heard, false);
  assert.equal(all.find(l => l.id === 'placate').recordingKey, 'tutorial.placate');
  // an aside heard is listed (in its chapter), one not heard is not
  assert.ok(chapters.find(c => c.id === 'approach').lines.some(l => l.id === 'frolic-fields' && l.aside));
  assert.equal(all.some(l => l.id === 'remembering-move'), false);
  assert.equal(chapters.find(c => c.id === 'negotiations').reached, true);
  assert.equal(chapters.find(c => c.id === 'pursuit').reached, false);
});

test('a chapter begun from the transcript is staged as a retry from it would be', () => {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host); session.start();
  const restored = [];
  session.onRestore = player => restored.push({ ...player.position });
  for (const chapter of ['duel', 'pursuit', 'bridge', 'final-guard']) {
    assert.equal(session.beginChapter(chapter), true, chapter);
    const first = session.route.find(s => s.chapter === chapter);
    assert.equal(session.director.current.id, first.beats[0].id, chapter);
    assert.equal(session.checkpoint, first.id);
    assert.equal(session.director.facts.size, 0);
  }
  assert.equal(restored.length, 4);
  assert.equal(session.beginChapter('no-such-chapter'), false);
  host.close();
});

test('the host paused (the transcript open) stops time, and it goes on from where it stopped', () => {
  let wall = 100;
  const host = new LocalHost({ now: () => wall, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const before = host.now();
  assert.equal(host.setPaused(true), true);
  wall += 30;
  assert.equal(host.now(), before, 'stopped');
  host.tick(); assert.equal(host.now(), before);
  host.setPaused(false);
  wall += 1;
  assert.ok(Math.abs(host.now() - (before + 1)) < 1e-9, 'on from where it stopped');
  host.close();
});

// --- the view: a tap anywhere on a touch screen goes on, as Continue does ---------------------------------------
function view(touch) {
  globalThis.document = new EventTarget();
  const elements = new Map();
  const root = { hidden: true, classList: { toggle() {} }, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, Object.assign(new EventTarget(), { hidden: false, textContent: '', open: false, classList: { toggle() {} } }));
    return elements.get(selector);
  } };
  const calls = { continued: 0 };
  const display = new TutorialView(root, { context: () => ({ touch }), onContinue: () => calls.continued++ });
  display.show({ state: 'running', current: { kind: 'dialogue', presentation: 'blocking', speaker: 'narrator', line: 'Greetings.' } });
  return { display, calls };
}
function press(down, up = down, target = { closest: () => null }) {
  for (const [type, at] of [['pointerdown', down], ['pointerup', up]]) {
    const event = new Event(type);
    Object.defineProperties(event, { pointerId: { value: 1 }, clientX: { value: at[0] }, clientY: { value: at[1] }, target: { value: target } });
    document.dispatchEvent(event);
  }
}

test('on a touch screen a conversation goes on with a tap anywhere, but not on a control, not a drag, not on a desktop', () => {
  const touch = view(true);
  press([300, 200]); assert.equal(touch.calls.continued, 1, 'a tap on the arena');
  press([300, 200], [380, 200]); assert.equal(touch.calls.continued, 1, 'a drag (a look) is not a tap');
  press([300, 200], [300, 200], { closest: selector => selector.includes('button') ? {} : null });
  assert.equal(touch.calls.continued, 1, 'a control is not "anywhere"');
  const desktop = view(false);
  press([300, 200]); assert.equal(desktop.calls.continued, 0, 'a desktop click on the arena enters it; Continue is Enter or the button');
});
