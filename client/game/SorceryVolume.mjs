import * as THREE from 'three';

export const SORCERY_RESTING = Object.freeze({ scale: 0.42, emissive: 0.75, opacity: 0.62 });
export const SORCERY_FLARE = Object.freeze({ scale: 1.3, emissive: 2.8, opacity: 0.92 });

// Palm-local shards are presentation only. They never enter the character GLB.
export function createSorceryVolume(socket) {
  if (!socket) return { update() {}, level: () => 0, dispose() {} };
  const root = new THREE.Group();
  root.name = 'SpellbladePalmSorcery';
  // Socket Y follows the hand's attachment direction after glTF conversion.
  root.position.set(0, 0.15, 0.035);
  socket.add(root);
  const material = new THREE.MeshStandardMaterial({
    color: 0x36c9f5, emissive: 0x16b5ef, emissiveIntensity: SORCERY_RESTING.emissive,
    roughness: 0.35, metalness: 0.05, transparent: true, opacity: SORCERY_RESTING.opacity,
  });
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const moteGeometry = new THREE.BoxGeometry(1, 1, 1);
  const specs = [
    [0, 0, 0, 0.057, 0.085, 0.047],
    [-0.035, 0.071, 0.025, 0.016, 0.025, 0.019],
    [0.052, 0.029, -0.011, 0.028, 0.038, 0.024],
    [-0.068, 0.113, 0.061, 0.010, 0.014, 0.012],
    [0.017, 0.137, -0.034, 0.009, 0.012, 0.010],
    [0.077, -0.013, 0.053, 0.012, 0.019, 0.011],
  ];
  const shards = specs.map((s, i) => {
    const mesh = new THREE.Mesh(i > 1 ? moteGeometry : geometry, material);
    mesh.name = `PalmSorceryShard${i}`;
    mesh.position.set(s[0], s[1], s[2]);
    mesh.scale.set(s[3], s[4], s[5]);
    root.add(mesh);
    return mesh;
  });
  let level = 0;
  let lastAt = null;
  return {
    /** @param {number} time clock for the idle drift  @param {number} target 0..1 from sorceryLevel */
    update(time = 0, target = 0) {
      const t = Number.isFinite(time) ? time : 0;
      const goal = Math.max(0, Math.min(1, Number(target) || 0));
      // rise with the charge at once; fall back smoothly
      const now = performance.now() / 1000;
      const dt = lastAt === null ? 1 : Math.min(0.1, Math.max(0, now - lastAt));
      lastAt = now;
      level = goal >= level ? goal : level + (goal - level) * Math.min(1, dt * 6);
      const mix = (a, b) => a + (b - a) * level;
      root.scale.setScalar(mix(SORCERY_RESTING.scale, SORCERY_FLARE.scale) * (1 + Math.sin(t * 3.7) * 0.05));
      material.emissiveIntensity = mix(SORCERY_RESTING.emissive, SORCERY_FLARE.emissive);
      material.opacity = mix(SORCERY_RESTING.opacity, SORCERY_FLARE.opacity);
      // the outer motes only drift free while the spell is gathered
      shards.forEach((shard, i) => {
        shard.rotation.set(t * (0.6 + i * 0.11), t * (0.8 - i * 0.07), i * 0.7);
        shard.position.z = specs[i][2] + Math.sin(t * 2.9 + i) * 0.012 * (0.3 + level);
        shard.visible = i < 2 || level > 0.25;
      });
    },
    level: () => level,
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      moteGeometry.dispose();
      material.dispose();
    },
  };
}
