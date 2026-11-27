import { DRAG_OON_TUNING } from '../../../shared/src/dragOonConfig.mjs';
import { BiByeSound } from './BiByeSound.mjs';

function dragOonRecipe(kind) {
  const noise = (freq, decay, gain, at = 0, filter = 'bandpass', q = 1) =>
    ({ type: 'noise', filter, freq, q, attack: 0.003, decay, gain, at });
  const tone = (freq, decay, gain, at = 0, slideTo = freq * 0.5) =>
    ({ type: 'tone', wave: 'sawtooth', freq, slideTo: Math.max(25, slideTo), attack: 0.004, decay, gain, at });

  if (kind === 'aerosolGag') {
    // Rare comic household rattle-shake followed by a brief aerosol spritz
    return {
      tag: 'dragoon-aerosol',
      layers: [
        noise(4200, 0.03, 0.28, 0, 'bandpass', 6),
        noise(4400, 0.03, 0.25, 0.055, 'bandpass', 6),
        noise(4100, 0.03, 0.22, 0.11, 'bandpass', 6),
        noise(5400, 0.24, 0.34, 0.16, 'highpass', 1.4),
      ],
      reverb: 0.08,
    };
  }
  if (kind === 'sprayStart') {
    return { tag: 'dragoon-spray', layers: [noise(920, 0.22, 0.35), tone(145, 0.18, 0.28, 0, 210)], reverb: 0.18 };
  }
  if (kind === 'leapPrep') {
    return { tag: 'dragoon-leap-prep', layers: [noise(1600, 0.16, 0.26), tone(110, 0.18, 0.22, 0, 185)], reverb: 0.12 };
  }
  if (kind === 'leapLaunch') {
    return { tag: 'dragoon-launch', layers: [noise(420, 0.45, 0.72), tone(95, 0.42, 0.75, 0, 38), noise(2400, 0.25, 0.28, 0.02, 'highpass')], reverb: 0.28 };
  }
  if (kind === 'leapLand') {
    return { tag: 'dragoon-land', layers: [noise(280, 0.48, 0.8), tone(62, 0.52, 0.85, 0, 28), noise(1800, 0.12, 0.3)], reverb: 0.35 };
  }
  if (kind === 'steam') {
    return { tag: 'dragoon-steam', layers: [noise(3400, 0.65, 0.58, 0, 'bandpass', 1.1), noise(5200, 0.42, 0.38, 0.04, 'highpass'), tone(135, 0.28, 0.35, 0, 55)], reverb: 0.25 };
  }
  if (kind === 'raze') {
    return { tag: 'dragoon-raze', layers: [noise(560, 0.55, 0.6), tone(84, 0.4, 0.55, 0, 42)], reverb: 0.3 };
  }
  if (kind === 'seal') {
    return { tag: 'dragoon-seal', layers: [noise(1800, 0.09, 0.36), tone(165, 0.14, 0.38, 0, 75), noise(640, 0.18, 0.24, 0.05)], reverb: 0.16 };
  }
  if (kind === 'abort') {
    return { tag: 'dragoon-abort', layers: [noise(320, 0.85, 0.92), tone(54, 0.95, 0.96, 0, 22), noise(2600, 0.45, 0.55, 0.03, 'highpass')], reverb: 0.45 };
  }
  return { tag: 'dragoon-hit', layers: [noise(1500, 0.08, 0.32), tone(140, 0.14, 0.35, 0, 70)], reverb: 0.14 };
}

export class DragOonSound {
  constructor(engine) {
    this.sound = new BiByeSound(engine);
    this.id = null;
    this.seen = new Set();
    this.nextWarningAt = 0;
  }

  #playCustom(kind, m, gain = 1) {
    if (!this.sound.active || !this.sound.engine?.running) return;
    const listener = this.sound.options?.listener;
    const yaw = this.sound.options?.yaw ?? 0;
    const pos = m?.position ?? (m ? { x: m.x, y: m.y, z: m.z } : null);
    let pan = 0, distGain = 1;
    if (listener && pos) {
      const dx = pos.x - listener.x, dy = pos.y - listener.y, dz = pos.z - listener.z;
      const dist = Math.hypot(dx, dy, dz);
      distGain = Math.max(0.05, Math.min(1, 1 - Math.max(0, dist - 5) / 48));
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(6, dist)));
    }
    this.sound.engine.play(dragOonRecipe(kind), { bus: 'sfx', pan, gain: distGain * gain });
  }

  update(m, options) {
    if (this.id !== m?.id) {
      this.id = m?.id ?? null;
      this.sound.stop();
    }
    if (!m || m.retired || m.mode === 'DESTROYED') {
      this.sound.update(null, options);
      return;
    }
    const pose = {
      ...m,
      yaw: m.heading,
      upperYaw: m.heading + (m.cannonYaw ?? 0),
      state: 'LOADED',
    };
    this.sound.update(pose, options);
    const active = this.sound.active;
    const spraying = active && Boolean(m.sprayHeld || m.flightLikeHell?.active || m.brimming?.active);
    this.sound.loop('pressure', spraying, pose, m.flightLikeHell?.active ? 0.34 : 0.22, m.brimming?.active ? 1.35 : 1.08);
    if (active && (m.heat ?? 0) >= DRAG_OON_TUNING.crew.dangerHeatThreshold && (options.now ?? 0) >= this.nextWarningAt) {
      this.nextWarningAt = (options.now ?? 0) + 1.8;
      this.#playCustom('steam', pose, 0.32);
    }
  }

  event(event, m, now = 0) {
    if (!event?.type?.startsWith('dragOon')) return;
    if (!m || (event.machineId && event.machineId !== m.id)) return;
    const key = [event.type, event.machineId, event.at, event.phase].join(':');
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 120) this.seen.delete(this.seen.values().next().value);

    const atPos = event.point ? { ...m, position: event.point } : m;
    if (event.type === 'dragOonSprayStarted') {
      this.#playCustom(event.aerosolGag ? 'aerosolGag' : 'sprayStart', atPos, 0.72);
    } else if (event.type === 'dragOonLeapPhase') {
      if (event.phase === 'shutters_opening') this.#playCustom('leapPrep', atPos, 0.65);
      else if (event.phase === 'launch') this.#playCustom('leapLaunch', atPos, 0.9);
      else if (event.phase === 'landing') this.#playCustom('leapLand', atPos, 0.95);
    } else if (event.type === 'dragOonSteam' || event.type === 'dragOonExtinguished') {
      this.#playCustom('steam', atPos, 0.85);
    } else if (event.type === 'dragOonRazeIgnited') {
      this.#playCustom('raze', atPos, 0.8);
    } else if (event.type === 'dragOonCampFire' || event.type === 'dragOonSkillStarted') {
      this.#playCustom('seal', atPos, 0.68);
    } else if (event.type === 'dragOonDamaged') {
      this.#playCustom('hit', atPos, 0.65);
    } else if (event.type === 'dragOonDestroyed') {
      this.sound.stop();
      this.sound.active = Boolean(this.sound.options?.active);
      this.#playCustom('abort', atPos, 1.0);
    }
  }

  stop() { this.sound.stop(); }
  dispose() { this.seen.clear(); this.sound.dispose(); }
}
