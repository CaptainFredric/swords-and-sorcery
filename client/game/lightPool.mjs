// The fight's brief lights (a spell breaking, a projectile's glow, a palm gathering, a slam's flare) come from a fixed
// few point lights, made once, always in the scene, lit and let die in place. In three.js the number of lights is part
// of every lit material's shader: a light added or taken away rebuilds them all (a hitch of a tenth of a second on a
// desktop, much worse on a phone). A Blazing Vortex, a light to each ember it throws, did that a few times a second.
// With the count fixed, nothing is rebuilt mid-fight. A light is only ever cosmetic, so when every one is busy, the
// faintest gives way (or a held one simply goes unlit).
//
// A slot is { light, held, flash }: `held` while something keeps it (a projectile, a gathering palm: it positions and
// brightens it each frame, and releases it); `flash` while it dies away of itself. Pure but for the lights it is given,
// so it is tested.

export const LIGHT_POOL_SIZE = 4;

export class LightPool {
  /** count: how many lights; make(): a new light (already in the scene, intensity 0). */
  constructor(count, make) {
    this.slots = Array.from({ length: count }, () => {
      const light = make();
      light.intensity = 0;
      return { light, held: false, flash: null };
    });
  }

  // the slot to use: an idle one, else the faintest flash (never one that is held)
  #free() {
    let best = null;
    for (const slot of this.slots) {
      if (slot.held) continue;
      if (!slot.flash) return slot;
      if (!best || slot.light.intensity < best.light.intensity) best = slot;
    }
    return best;
  }

  /** A flash at `point`: `intensity`, dying away over `life` seconds (as the square of what is left). */
  flash(point, color, intensity, life, distance) {
    const slot = this.#free();
    if (!slot) return null;
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.position.set(point.x, point.y, point.z);
    slot.light.intensity = intensity;
    slot.flash = { intensity, life, age: 0 };
    return slot;
  }

  /** A light kept by something until it lets go (release): null when none can be spared (it goes unlit). */
  hold(color, distance) {
    const slot = this.#free();
    if (!slot) return null;
    slot.held = true;
    slot.flash = null;
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.intensity = 0;
    return slot;
  }

  /** A held light let go: dark again, free for the next. */
  release(slot) {
    if (!slot) return;
    slot.held = false;
    slot.flash = null;
    slot.light.intensity = 0;
  }

  /** The flashes dying away. */
  update(dt) {
    for (const slot of this.slots) {
      if (!slot.flash) continue;
      slot.flash.age += dt;
      const t = slot.flash.age / slot.flash.life;
      if (t >= 1) {
        slot.flash = null;
        slot.light.intensity = 0;
      } else {
        slot.light.intensity = slot.flash.intensity * (1 - t) * (1 - t);
      }
    }
  }
}
