// The Armory's identity cues: one short rendered sound for each spell and ultimate, played on the UI bus when its
// card is pressed. They are made offline from layered material models (tools/audio/armory_cues.py, written to
// client/assets/armory/), all at one loudness. It owns no music or voice state.
import { appUrl } from '../appUrl.mjs';

export const ARMORY_CUE_BASE = 'client/assets/armory/';
export const ARMORY_CUE_IDS = Object.freeze(['fireball', 'frostfire', 'gale', 'steel', 'sunder', 'vortex', 'chivalry']);
// how loud they sit on the UI bus, beside the menu music (the files themselves are all at one loudness)
export const ARMORY_CUE_GAIN = 1.5;
// a press made before its cue was decoded (straight after the Armory opened) is still heard if it is ready this soon
export const ARMORY_CUE_LATE_SEC = 0.25;

/** The decoded cues for one sound engine: loaded once (from the Armory opening, or the first press). */
export function createArmoryCues({ fetchAudio = defaultFetch } = {}) {
  const buffers = new Map();
  let loading = null;
  return {
    get: (id) => buffers.get(id) ?? null,
    load(sound) {
      if (loading) return loading;
      const ctx = sound?.ctx;
      if (!ctx) return null;
      loading = Promise.all(ARMORY_CUE_IDS.map(async (id) => {
        for (const extension of ['m4a', 'wav']) {
          try {
            const data = await fetchAudio(appUrl(`${ARMORY_CUE_BASE}${id}.${extension}`));
            if (!data) continue;
            buffers.set(id, await ctx.decodeAudioData(data));
            return;
          } catch {
            // (this browser cannot decode that one: the next)
          }
        }
      }));
      return loading;
    },
  };
}

async function defaultFetch(url) {
  const response = await fetch(url);
  return response.ok ? response.arrayBuffer() : null;
}

const cuesFor = new WeakMap();
function sharedCues(sound) {
  if (!cuesFor.has(sound)) cuesFor.set(sound, createArmoryCues());
  return cuesFor.get(sound);
}

/** Begin decoding the cues (the Armory has been opened), so the first press is heard at once. */
export function loadArmoryCues(sound) {
  return sound?.ctx ? sharedCues(sound).load(sound) : null;
}

/**
 * Play `id`'s cue: returns a stop function (a press replaced by the next is cut short), or null when nothing will be
 * heard (muted, effects or master at zero, audio not running, no such cue).
 */
export function playArmorySound(sound, id, { cues = null, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
  if (!ARMORY_CUE_IDS.includes(id) || !sound?.running) return null;
  if (sound.levels.muted || sound.levels.effects === 0 || sound.levels.master === 0) return null;
  const bank = cues ?? sharedCues(sound);
  let handle = null;
  let stopped = false;
  const start = () => {
    const buffer = bank.get(id);
    if (buffer && !stopped) handle = sound.playBuffer(buffer, { bus: 'ui', gain: ARMORY_CUE_GAIN, reverb: 0.05 });
    return handle;
  };
  if (!start()) {
    // not decoded yet: heard the moment it is, if that is still close enough to the press to belong to it
    const asked = now();
    bank.load(sound)?.then(() => { if ((now() - asked) / 1000 <= ARMORY_CUE_LATE_SEC) start(); });
  }
  return () => {
    stopped = true;
    handle?.stop?.(0.04);
  };
}
