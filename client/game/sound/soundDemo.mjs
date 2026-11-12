// Offline renders of the soundscape, for listening outside the game and checking the mix. Loaded only with ?debug
// (as globalThis.__ssSoundDemo): render(name) gives an AudioBuffer, wav(buffer) a 16-bit WAV file.

import { Ambience } from './Ambience.mjs';
import { bellTollRecipe, gateRecipe, uiClankRecipe, warDrumRecipe } from './atmosphereRecipes.mjs';
import { MusicPlayer } from './music/MusicPlayer.mjs';
import { SoundEngine } from './SoundEngine.mjs';
import {galeReleaseRecipe} from './soundRecipes.mjs';
import {
  DISASTER_AUDIO_ELEMENTS,coreMagmaArmRecipe,coreMagmaFuseRecipe,
  coreMagmaDetonationRecipe,conductChargeRecipe,conductDischargeRecipe,
  conductWireTailRecipe,galeStreamRecipe,disasterEarthImpactRecipe,
  disasterInfusionChargeRecipe,disasterInfusionImpactRecipe,
  disasterInfusionFieldRecipe,disasterFieldPulseRecipe,disasterWaveRushRecipe,
} from './disasterSoundRecipes.mjs';
import { VOICE_HEARING } from './voiceRules.mjs';
import { appUrl } from '../../appUrl.mjs';

export const DEMOS = {
  // A/B each elemental identity and the all-five mix in real rendered audio.
  // All times here are for AUDITION ONLY; live sounds use real server events.
  'disaster-elements':{
    seconds:43,
    script(engine){
      const rand=()=>.43;
      const impact=(at,tiers)=>{
        const elements=DISASTER_AUDIO_ELEMENTS.filter(e=>(tiers[e]??0)>0);
        const balance=1/Math.sqrt(1+elements.length*.34);
        engine.play(disasterEarthImpactRecipe(rand),{at,gain:.93*balance});
        const offsets={fire:.035,frost:.095,gale:.135,lightning:.185,steel:.23};
        for(const e of elements){
          engine.play(disasterInfusionImpactRecipe(e,rand,{tier:tiers[e]}),
            {at:at+offsets[e],gain:.76*balance});
        }
        for(let t=at+.9;t<at+3.5;t+=1.05){
          const strength=Math.max(.02,1-(t-at)/4.3);
          engine.play(disasterFieldPulseRecipe(rand,{strength}),{at:t,gain:.4*strength*balance});
          elements.forEach((e,i)=>engine.play(disasterInfusionFieldRecipe(e,rand,{
            strength,tier:tiers[e]}),{at:t+.16+i*.23,gain:.26*strength*balance}));
        }
      };
      const none={fire:0,frost:0,gale:0,lightning:0,steel:0};
      impact(1,none);
      DISASTER_AUDIO_ELEMENTS.forEach((e,i)=>impact(6+i*5,{...none,[e]:2}));
      impact(33,{fire:2,frost:2,gale:2,lightning:2,steel:2});
      engine.play(disasterWaveRushRecipe(rand,{tier:2}),{at:35.8,gain:.38});
    },
  },
  // The little magma pockets MUST be heard BEFORE the deep second blast.
  // The line is a separate voltage climb and instantaneous cracking strike.
  'magma-and-lightning':{
    seconds:17,
    script(engine){
      const rand=()=>.42;
      engine.play(coreMagmaArmRecipe(rand),{at:1,gain:.55});
      engine.play(coreMagmaFuseRecipe(rand,{seconds:.6}),{at:1.035,gain:.72});
      engine.play(coreMagmaDetonationRecipe(rand),{at:1.6,gain:1});
      engine.play(conductChargeRecipe(rand,{seconds:.45}),{at:6,gain:.85});
      engine.play(conductDischargeRecipe(rand),{at:6.45,gain:.93});
      engine.play(conductWireTailRecipe(rand),{at:6.48,gain:.49,pan:.28});
      engine.play(galeReleaseRecipe(rand),{at:11,gain:.8});
      engine.play(galeStreamRecipe(rand,{seconds:.66,weight:1}),{at:11.16,gain:.37});
      engine.play(galeStreamRecipe(rand,{seconds:.5,weight:.65}),{at:11.65,gain:.23});
    },
  },
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
    seconds: 26,
    script(engine) {
      const music = new MusicPlayer(engine);
      music.stinger('challenge', { at: 0.3 });
      music.stinger('victory', { at: 7 });
      music.stinger('defeat', { at: 13.5 });
      music.stinger('chivalry', { at: 20.5 });
    },
  },
  // Spells & Chivalry taken up in the thick of a fight, as I hear it: the fight music, my cry, and the strings' swell
  // (the cry ducks the music as any line does; the piece steps back under the swell), then the fight again
  chivalry: {
    seconds: 16,
    async script(engine) {
      const music = new MusicPlayer(engine);
      music.setIntensity(2);
      music.play('battle');
      music.scheduleUntil(15.5);
      const at = 6;
      const data = await (await fetch(appUrl('/client/assets/voice/master-call-1.m4a'))).arrayBuffer();
      const cry = await engine.ctx.decodeAudioData(data);
      engine.playBuffer(cry, { bus: 'voice', at: at + 0.05, gain: 0.95, reverb: VOICE_HEARING.own });
      engine.duck(cry.duration, { delay: at + 0.05 - engine.now });
      music.stinger('chivalry', { at });
    },
  },
  // the swell alone, twice (as it is heard over silence)
  'chivalry-swell': {
    seconds: 9,
    script(engine) {
      const music = new MusicPlayer(engine);
      music.stinger('chivalry', { at: 0.3 });
      music.stinger('chivalry', { at: 4.8 });
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
