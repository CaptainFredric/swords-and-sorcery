import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine, UNLOCK_GESTURES } from './SoundEngine.mjs';
import { MusicPlayer } from './music/MusicPlayer.mjs';

// When the sound starts: as early as the browser allows. Asked for with the page; begun at once where a browser lets
// a page play unasked; otherwise on the first gesture anywhere, whatever it was on. And the menu's music starts once.

// an audio node, a parameter, anything the engine builds: takes whatever is done to it
function anything() {
  const self = new Proxy(function () {}, {
    get: (target, key) => (key === 'then' ? undefined : key in target ? target[key] : anything()),
    set: (target, key, value) => { target[key] = value; return true; },
    apply: () => anything(),
    construct: () => anything(),
  });
  return self;
}

// a browser: its window (gestures are sent to it), its document, and an AudioContext class that starts `running` only
// if the browser allows a page to sound unasked, and otherwise once resume() is called from a gesture
function browser({ autoplay = false } = {}) {
  const listeners = new Map();
  const state = { gesture: false, contexts: [] };
  const target = {
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    gesture(type) {
      state.gesture = true;
      for (const fn of listeners.get(type) ?? []) fn({ type });
      state.gesture = false;
    },
    listeners,
  };
  const doc = { hidden: false, addEventListener: () => {} };
  class Context {
    constructor() {
      this.state = autoplay ? 'running' : 'suspended';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.changed = [];
      this.resumes = 0;
      state.contexts.push(this);
      return new Proxy(this, { get: (ctx, key) => (key in ctx ? ctx[key] : anything()) });
    }
    addEventListener(type, fn) { if (type === 'statechange') this.changed.push(fn); }
    resume() {
      this.resumes += 1;
      // (held back until a gesture: asked without one, nothing happens)
      if (!state.gesture && !autoplay) return new Promise(() => {});
      this.state = 'running';
      for (const fn of this.changed) fn();
      return Promise.resolve();
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  return { target, doc, Context, state };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('where the browser lets a page sound unasked, the menu music begins with the page: no gesture needed', async () => {
  const { target, doc, Context, state } = browser({ autoplay: true });
  const engine = new SoundEngine({ target, doc, Context });
  const music = new MusicPlayer(engine);
  music.play('hall');
  await settle();
  assert.equal(state.contexts.length, 1, 'asked for with the page');
  assert.equal(engine.running, true);
  assert.equal(music.cue?.name, 'hall', 'the hall theme is playing');
  clearInterval(music.timer);
});

test('where sound is held back for a gesture, the first gesture anywhere starts it: any kind, on anything, not a menu button', async () => {
  for (const type of UNLOCK_GESTURES) {
    const { target, doc, Context, state } = browser();
    const engine = new SoundEngine({ target, doc, Context });
    const music = new MusicPlayer(engine);
    music.play('hall');
    await settle();
    assert.equal(engine.running, false, 'held back: nothing is forced');
    assert.equal(music.cue ?? null, null);
    assert.equal(state.contexts.length, 1, 'the context is already there, waiting');
    assert.ok(target.listeners.has(type), `${type} is listened for on the whole page`);
    target.gesture(type);
    await settle();
    assert.equal(engine.running, true, `${type} starts it`);
    assert.equal(music.cue?.name, 'hall');
    clearInterval(music.timer);
  }
  // a press and its release, a mouse and a finger and a key: all of them are there
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) assert.ok(UNLOCK_GESTURES.includes(type));
});

test('the music starts once: asked for again and again while it waits, and through more gestures after, it is one piece', async () => {
  const { target, doc, Context, state } = browser();
  const engine = new SoundEngine({ target, doc, Context });
  const music = new MusicPlayer(engine);
  // (the menu asks for its theme twice a second, for as long as it is on the menu)
  for (let i = 0; i < 40; i += 1) music.play('hall');
  assert.equal(engine.readyCallbacks.length, 1, 'one wait, however often it is asked');
  target.gesture('pointerdown');
  await settle();
  const cue = music.cue;
  assert.equal(cue?.name, 'hall');
  // more gestures, more asking, moving about the menus: the same piece goes on, never begun again or doubled
  target.gesture('click');
  target.gesture('keydown');
  for (let i = 0; i < 10; i += 1) music.play('hall');
  await settle();
  assert.equal(music.cue, cue, 'the same cue: not restarted');
  assert.equal(state.contexts.length, 1, 'one context for the page');
  // into a match and back: the fight's piece, then the hall again (each a single cue)
  music.play('battle');
  assert.equal(music.cue.name, 'battle');
  const battle = music.cue;
  music.play('battle');
  assert.equal(music.cue, battle);
  music.play('hall');
  assert.equal(music.cue.name, 'hall');
  assert.notEqual(music.cue, cue, 'begun afresh on coming back');
  music.play(null);
  assert.equal(music.cue, null);
  clearInterval(music.timer);
});

test('what was wanted when the sound starts is what plays: the wait holds no stale piece', async () => {
  const { target, doc, Context } = browser();
  const engine = new SoundEngine({ target, doc, Context });
  const music = new MusicPlayer(engine);
  music.play('hall');
  music.play('battle');
  target.gesture('keydown');
  await settle();
  assert.equal(music.cue?.name, 'battle');
  clearInterval(music.timer);
  // and a hidden page is not started behind the player's back
  const hidden = browser();
  hidden.doc.hidden = true;
  const quiet = new SoundEngine({ target: hidden.target, doc: hidden.doc, Context: hidden.Context });
  hidden.target.gesture('click');
  await settle();
  assert.equal(quiet.running, false);
  assert.equal(hidden.state.contexts[0].resumes, 0);
});
