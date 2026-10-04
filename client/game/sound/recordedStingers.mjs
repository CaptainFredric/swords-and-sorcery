// Stingers that were performed and recorded rather than written into the score (music/score.mjs STINGERS): one take
// each, in client/assets/music, played over whatever music is on, on the music bus (so the music level and its mute
// apply), with a little of the hall. Like the score's stingers, they play over everything and wait for nothing.

import { appUrl } from '../../appUrl.mjs';

export const RECORDED_STINGERS = Object.freeze({
  // Spells & Chivalry taken up: mastery receives accompaniment
  spellsChivalry: Object.freeze({ file: 'spells-chivalry', gain: 0.85, hall: 0.25, title: 'Spells & Chivalry' }),
});

export const STINGER_BASE = 'client/assets/music/';

export class RecordedStingers {
  constructor(engine, { fetchAudio = defaultFetch } = {}) {
    this.engine = engine;
    this.fetchAudio = fetchAudio;
    this.buffers = new Map();
    this.loading = null;
  }

  /** Decode every stinger (once; when the engine has a context). */
  load() {
    if (this.loading) return this.loading;
    const ctx = this.engine?.ctx;
    if (!ctx) return null;
    this.loading = Promise.all(Object.entries(RECORDED_STINGERS).map(async ([name, stinger]) => {
      for (const extension of ['m4a', 'wav']) {
        try {
          const data = await this.fetchAudio(appUrl(`${STINGER_BASE}${stinger.file}.${extension}`));
          if (!data) continue;
          this.buffers.set(name, await ctx.decodeAudioData(data));
          return;
        } catch {
          // (this browser cannot decode that one: the next)
        }
      }
    }));
    return this.loading;
  }

  /** Play `name` now (it is decoded the first time it is asked for, and played if that is quick). Returns the handle. */
  play(name, { preview = false } = {}) {
    const stinger = RECORDED_STINGERS[name];
    const engine = this.engine;
    if (!stinger || !engine?.running || (!preview && !engine.musicOn)) return null;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      const asked = engine.ctx?.currentTime ?? 0;
      this.load()?.then(() => { if ((engine.ctx?.currentTime ?? 0) - asked < 0.4) this.play(name, { preview }); });
      return null;
    }
    return engine.playBuffer(buffer, { bus: preview ? 'voice' : 'music', gain: stinger.gain, hall: stinger.hall });
  }
}

async function defaultFetch(url) {
  const response = await fetch(url);
  return response.ok ? response.arrayBuffer() : null;
}
