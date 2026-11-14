import * as THREE from 'three';
import { puffTexture } from '../../game/softTextures.mjs';

// Smoke from a hearth: a thin, slow column of pale puffs from each chimney, rising, swelling and thinning as the wind
// leans it over. A few sprites a chimney, cycled forever (no allocation per frame); never solid, never in the fight.
const PUFFS = 5;

/** Chimney smoke over `group` from the chimney mouths [[x, y, z]]; returns { update(timeSec), dispose() }. */
export function chimneySmoke(group, mouths, { wind = [0.75, -0.66], color = 0xd9d3c8, opacity = 0.22, rise = 2.6 } = {}) {
  const texture = puffTexture();
  const lean = new THREE.Vector2(...wind).normalize();
  const puffs = [];
  mouths.forEach(([x, y, z], c) => {
    for (let i = 0; i < PUFFS; i += 1) {
      const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'chimney-smoke';
      sprite.renderOrder = 2;
      group.add(sprite);
      puffs.push({ sprite, x, y, z, offset: i / PUFFS, seed: c * 1.618 });
    }
  });
  return {
    update(timeSec) {
      for (const p of puffs) {
        // each puff a fifth of the way up the column behind the next; a column takes ~7 s to climb
        const age = (timeSec / 7 + p.offset + p.seed) % 1;
        const drift = age * age * 1.4;
        const wobble = Math.sin(timeSec * 0.8 + p.seed * 5 + age * 6) * 0.12 * age;
        p.sprite.position.set(p.x + lean.x * drift + wobble, p.y + 0.15 + age * rise, p.z + lean.y * drift - wobble * 0.5);
        p.sprite.scale.setScalar(0.35 + age * 1.3);
        // in from nothing at the mouth, out to nothing at the top
        p.sprite.material.opacity = opacity * Math.min(1, age * 6) * (1 - age) ** 1.4;
      }
    },
    dispose() {
      for (const p of puffs) { p.sprite.removeFromParent(); p.sprite.material.dispose(); }
    },
  };
}
