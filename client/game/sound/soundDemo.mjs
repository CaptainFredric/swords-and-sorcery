// Offline renders of the soundscape, for listening outside the game and checking the mix. Loaded only with ?debug
// (as globalThis.__ssSoundDemo): render(name) gives an AudioBuffer, wav(buffer) a 16-bit WAV file.

import { Ambience } from './Ambience.mjs';
import { bellTollRecipe, gateRecipe, uiClankRecipe, warDrumRecipe } from './atmosphereRecipes.mjs';
import { MusicPlayer } from './music/MusicPlayer.mjs';
import { SoundEngine } from './SoundEngine.mjs';
import { VOICE_HEARING } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

export const DEMOS = {
  // the menu at dusk: wind, banners, the bell; a few button presses; a duel found (drum count, gate)
  atmosphere: {
    seconds: 42,
    script(engine) {
      const ambience = new Ambience(engine);
      ambience.setScene('menu');
      for (let t = 0; t < 42; t += 0.25) ambience.update(t);
      for (const [at, variant] of [[3, 'press'], [4.2, 'press'], [5.1, 'confirm'], [8, 'back'], [9.3, 'confirm']]) {
        engine.play(uiClankRecipe(Math.random, { variant }), { bus: 'ui', at });
      }
      engine.play(bellTollRecipe(Math.random, { strikes: 2 }), { bus: 'ambience', pan: 0.35, gain: 0.2, at: 12 });
      [24, 25, 26].forEach((at, i) => engine.play(warDrumRecipe(Math.random, { weight: 0.6 + i * 0.2 }), { at }));
      engine.play(warDrumRecipe(Math.random, { weight: 1.3 }), { at: 27 });
      engine.play(gateRecipe(), { at: 27 });
    },
  },
  hall: {
    seconds: 150,
    script(engine, { levels } = {}) {
      const music = new MusicPlayer(engine, { levels });
      music.play('hall');
      music.scheduleUntil(146);
    },
  },
  battle: {
    seconds: 72,
    script(engine, { levels } = {}) {
      const music = new MusicPlayer(engine, { levels });
      // calm, blades out, then the fight: the call of the B strain and the horn melody
      music.setIntensity(0);
      music.play('battle');
      music.scheduleUntil(11);
      music.setIntensity(1);
      music.scheduleUntil(22.5);
      music.setIntensity(2);
      music.scheduleUntil(70);
    },
  },
  march: {
    seconds: 72,
    script(engine, { levels } = {}) {
      const music = new MusicPlayer(engine, { levels });
      // the lute alone, then the drums and the flute's tune, then the horn below it and the choir
      music.setIntensity(0);
      music.play('march');
      music.scheduleUntil(8.5);
      music.setIntensity(1);
      music.scheduleUntil(26);
      music.setIntensity(2);
      music.scheduleUntil(70);
    },
  },
  // the Spellblade's recorded lines as my own knight says them (close, from inside the helm), over a little wind
  voice: {
    seconds: 22,
    async script(engine) {
      const ambience = new Ambience(engine);
      ambience.setScene('arena');
      for (let t = 0; t < 22; t += 0.25) ambience.update(t);
      const lines = [['sorcery-1', 0.4], ['magic-defeat-1', 2.6], ['defeat-2', 5.4], ['kill-taunt-1', 8.6], ['break-taunt-1', 12.2], ['victory-1', 15.8], ['kill-taunt-2', 19]];
      for (const [file, at] of lines) {
        const data = await (await fetch(appUrl(`/client/assets/voice/${file}.m4a`))).arrayBuffer();
        const buffer = await engine.ctx.decodeAudioData(data);
        engine.playBuffer(buffer, { bus: 'voice', at, gain: 0.95, reverb: VOICE_HEARING.own });
      }
    },
  },
  stingers: {
    seconds: 20,
    script(engine) {
      const music = new MusicPlayer(engine);
      music.stinger('challenge', { at: 0.3 });
      music.stinger('victory', { at: 7 });
      music.stinger('defeat', { at: 13.5 });
    },
  },
};

/** Render a demo; `levels` replaces the instrument levels (render one instrument alone to measure it). */
export async function render(name, { sampleRate = 44100, seconds = null, levels = undefined } = {}) {
  const demo = DEMOS[name];
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds ?? demo.seconds) * sampleRate), sampleRate);
  const engine = new SoundEngine({ listen: false }).useContext(ctx);
  await demo.script(engine, { levels });
  return ctx.startRendering();
}

export function wav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * channels * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  const data = [...Array(channels)].map((_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      view.setInt16(offset, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
      offset += 2;
    }
  }
  return bytes;
}
