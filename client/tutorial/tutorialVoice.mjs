import { appUrl } from '../appUrl.mjs';
import { playTutorialCue, tutorialCueForDevice } from './tutorialRecordings.mjs';

// Tutorial 1's recorded voices in play. The director says which line is current; this decodes its take (the touch
// take where the line has one) and hands it to playTutorialCue, which registers it with the director: the take's own
// end completes the line, and the director keeps the pause after it (its pauseAfterSec, or its conversational
// default). Captions, pacing and gates belong to the director and the view; nothing here changes them.
//
// The takes are tools/audio/tutorial_voice.py's game-ready files (client/assets/tutorial-voice/manifest.json:
// recording key -> { file, speaker, seconds, onset }). Without one (not recorded, not decoded yet, the sound muted or
// not unlocked) a line is not heard, and the director paces it as it always has.

export const TUTORIAL_VOICE_BASE = '/client/assets/tutorial-voice/';

// If a take's end is never heard (its context suspended mid-line), it is let go this long after it should have
// ended, and the director's own pacing takes the line from there.
const STALLED_SEC = 1.5;

export class TutorialVoice {
  constructor({ engine, context = () => ({}), base = TUTORIAL_VOICE_BASE, fetch: load = (...a) => globalThis.fetch(...a),
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), now = () => performance.now() } = {}) {
    this.engine = engine;
    this.context = context;
    this.base = base;
    this.fetch = load;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.quietUntil = -Infinity;
    this.takes = {};
    this.loaded = false;
    this.buffers = new Map();
    this.playing = null;     // { cue, key, handle, timers, ended }
    this.listing = null;
  }

  /** The manifest (once): which keys have takes, how long each is. */
  load() {
    this.listing ??= (async () => {
      try {
        const response = await this.fetch(appUrl(`${this.base}manifest.json`), { cache: 'no-cache' });
        this.takes = response.ok ? (await response.json()).takes ?? {} : {};
      } catch { this.takes = {}; }
      this.loaded = true;
      return this.takes;
    })();
    return this.listing;
  }

  /** The recording key a cue is heard as on this device. */
  keyFor(cue) {
    return tutorialCueForDevice(cue, this.context())?.recordingKey ?? null;
  }

  /** A cue's recorded length (seconds), or null. */
  seconds(cue) {
    return this.takes[this.keyFor(cue)]?.seconds ?? null;
  }

  /** A take decoded (AAC first, the MP3 for a browser that cannot decode it), or null; each is fetched once. */
  buffer(key) {
    const take = this.takes[key];
    if (!take || !this.engine?.ctx) return Promise.resolve(null);
    if (!this.buffers.has(key)) {
      this.buffers.set(key, (async () => {
        for (const extension of ['m4a', 'mp3']) {
          try {
            const response = await this.fetch(appUrl(`${this.base}${take.file}.${extension}`));
            if (!response.ok) continue;
            return await this.engine.ctx.decodeAudioData(await response.arrayBuffer());
          } catch { /* the next */ }
        }
        return null;
      })());
    }
    return this.buffers.get(key);
  }

  /** Decode the takes of these beats ahead of time, a few at once, in order. */
  async preload(beats) {
    await this.load();
    const queue = [...new Set(beats.filter(beat => beat.recordingKey).map(beat => this.keyFor(beat)))].filter(key => this.takes[key]);
    const worker = async () => { while (queue.length) await this.buffer(queue.shift()); };
    await Promise.all([worker(), worker(), worker()]);
  }

  /** No take begins for this long (seconds from now): the arena gate's title and drum have the floor. */
  quietFor(seconds) {
    this.quietUntil = Math.max(this.quietUntil, this.now() + seconds * 1000);
  }

  /** Whatever the director has current, voiced: called on every change of the director. */
  sync(director) {
    // (a line shown before the list of takes has arrived is voiced as soon as it does, if it is still the line)
    if (!this.loaded) {
      this.load().then(() => this.sync(director));
      return;
    }
    const cue = director?.state === 'running' ? director.optionalCue ?? director.cue : null;
    const now = this.playing;
    if (now && cue && now.cue.id === cue.id && now.cue.runId === cue.runId) return;
    // (a take that has ended is the director's to finish: its pause, then the next line)
    if (now?.ended && !cue) return;
    this.stop();
    if (!cue) return;
    const key = this.keyFor(cue);
    if (!this.takes[key] || !this.engine?.running || this.engine.muted) return;
    const playing = { cue, key, handle: null, timers: [], ended: false };
    this.playing = playing;
    const quiet = new Promise(resolve => {
      const wait = this.quietUntil - this.now();
      if (wait > 0) playing.timers.push(this.setTimer(resolve, wait));
      else resolve();
    });
    Promise.all([this.buffer(key), quiet]).then(([buffer]) => {
      if (this.playing !== playing || !buffer) return;
      playing.handle = playTutorialCue({ cue: { ...cue, recordingKey: key }, buffer, engine: this.engine, director,
        onComplete: () => { playing.ended = true; playing.timers.forEach(this.clearTimer); } });
      if (!playing.handle) { this.playing = null; return; }
      playing.timers.push(this.setTimer(() => { if (!playing.ended) this.stop(); }, (buffer.duration + STALLED_SEC) * 1000));
    });
  }

  /** Silence: the take playing now (a short fade); the director is told it stopped, so its own pacing resumes. */
  stop() {
    const playing = this.playing;
    if (!playing) return;
    this.playing = null;
    playing.timers.forEach(this.clearTimer);
    if (!playing.ended) playing.handle?.stop();
  }
}
