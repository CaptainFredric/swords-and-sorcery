// The tell of a cut: a glint run along the attacker's blade a quarter of a second before it lands, so the moment to
// raise a guard (a Parry within 0.18 s of contact, a Perfect Parry within 0.07) is learned from what is seen, never
// guessed. Read from the swing anyone watching could see (when the chain began and which of its cuts are committed),
// never from a button. Every knight in the world shows it; the swing's sound is its other half.

import * as THREE from 'three';
export { CUT_TELL, cutTellStrength } from './cutTellTiming.mjs';

let texture = null;
function glintTexture() {
  if (texture) return texture;
  const size = 64;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, 'rgba(255,246,220,1)');
  r.addColorStop(0.22, 'rgba(255,224,150,0.65)');
  r.addColorStop(1, 'rgba(255,210,120,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  // and a thin cross: a star on the steel, not a ball of light
  g.fillStyle = 'rgba(255,250,235,0.85)';
  g.fillRect(size / 2 - 0.75, 6, 1.5, size - 12);
  g.fillRect(6, size / 2 - 0.75, size - 12, 1.5);
  texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// along the blade from the grip socket (the third-person blade's own direction in the socket: swordArmIK.mjs)
const ALONG = new THREE.Vector3(0.345, 0.039, -0.938).multiplyScalar(0.62);

/** The glint on a knight's sword: `set(strength)` each frame. */
export function createCutTell(socket) {
  if (!socket) return null;
  const map = glintTexture();
  const material = new THREE.SpriteMaterial({ map, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(ALONG);
  sprite.visible = false;
  sprite.renderOrder = 5;
  socket.add(sprite);
  return {
    set(strength) {
      const s = Math.max(0, Math.min(1, strength));
      sprite.visible = s > 0.01;
      material.opacity = s;
      sprite.scale.setScalar(0.18 + 0.32 * s);
    },
    dispose() { sprite.removeFromParent(); material.dispose(); },
  };
}
