// A short, cancellable identity cue on the existing UI bus. It owns no music or voice state.
export const ARMORY_CUES = Object.freeze({
  fireball: { noise: [170, 1500], tone: [120, 65], duration: .52 },
  frostfire: { noise: [6200, 2300], tone: [1400, 720], duration: .48 },
  gale: { noise: [350, 1700], duration: .62 },
  steel: { tones: [[1900, 0], [2650, .075]], duration: .55 },
  sunder: { noise: [1500, 100], tone: [100, 43], ring: 580, duration: .7 },
  vortex: { noise: [170, 2300], tone: [150, 95], duration: .65, rotation: true },
});

export function playArmorySound(sound, id) {
  const cue = ARMORY_CUES[id];
  if (!cue || !sound.running || sound.levels.muted || sound.levels.effects === 0 || sound.levels.master === 0) return null;
  const ctx = sound.ctx;
  const at = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.value = id === 'gale' ? 2 : 1; // UI already applies effects; wind gets a modest presence boost.
  output.connect(sound.buses.ui);
  const nodes = [];
  const track = (node) => { nodes.push(node); return node; };
  function envelope(start, seconds, peak) {
    const gain = track(ctx.createGain());
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + .008);
    gain.gain.exponentialRampToValueAtTime(peak * .55, start + Math.min(.12, seconds * .3));
    gain.gain.exponentialRampToValueAtTime(.0001, start + seconds);
    gain.connect(output);
    return gain;
  }
  function tone(from, to, delay = 0, peak = .26) {
    const osc = track(ctx.createOscillator());
    osc.frequency.setValueAtTime(from, at + delay);
    osc.frequency.exponentialRampToValueAtTime(to, at + delay + Math.max(.01, cue.duration - delay) * .75);
    osc.connect(envelope(at + delay, cue.duration - delay, peak));
    osc.start(at + delay);
    osc.stop(at + cue.duration);
  }
  if (cue.noise && sound.noise) {
    const noise = track(ctx.createBufferSource());
    noise.buffer = sound.noise;
    const filter = track(ctx.createBiquadFilter());
    filter.type = 'bandpass';
    filter.Q.value = .7;
    filter.frequency.setValueAtTime(cue.noise[0], at);
    filter.frequency.exponentialRampToValueAtTime(cue.noise[1], at + cue.duration * .7);
    noise.connect(filter);
    const gain = envelope(at, cue.duration, .32);
    if (cue.rotation) {
      gain.gain.setValueAtTime(.06, at + .11);
      gain.gain.linearRampToValueAtTime(.2, at + .2);
      gain.gain.linearRampToValueAtTime(.05, at + .3);
      gain.gain.linearRampToValueAtTime(.12, at + .37);
      gain.gain.exponentialRampToValueAtTime(.0001, at + cue.duration);
    }
    filter.connect(gain);
    noise.start(at);
    noise.stop(at + cue.duration);
  }
  if (cue.tone) tone(...cue.tone, id === 'sunder' ? .12 : 0, id === 'sunder' ? .3 : .26);
  for (const [hz, delay] of cue.tones ?? []) tone(hz, hz * .96, delay, .28);
  if (cue.ring) tone(cue.ring, cue.ring * .97, .36, .08);
  let stopped = false;
  const cleanup = () => { for (const node of nodes) node.disconnect(); output.disconnect(); };
  const timer = setTimeout(cleanup, cue.duration * 1000 + 30);
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    output.gain.cancelScheduledValues(ctx.currentTime);
    output.gain.setTargetAtTime(0, ctx.currentTime, .004);
    for (const node of nodes) if (node.stop) { try { node.stop(ctx.currentTime + .02); } catch {} }
    setTimeout(cleanup, 30);
  };
}
