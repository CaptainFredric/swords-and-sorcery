import * as THREE from 'three';

// Palm-local shards are presentation only. They never enter the character GLB.
export function createSorceryVolume(socket) {
  if (!socket) return { update() {}, dispose() {} };
  const root = new THREE.Group();
  root.name = 'SpellbladePalmSorcery';
  // Socket Y follows the hand's attachment direction after glTF conversion.
  root.position.set(0, 0.15, 0.035);
  socket.add(root);
  const material = new THREE.MeshStandardMaterial({
    color: 0x36c9f5, emissive: 0x16b5ef, emissiveIntensity: 1.8,
    roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.88,
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
  return {
    update(time = 0, casting = false) {
      const t = Number.isFinite(time) ? time : 0;
      root.scale.setScalar((casting ? 1.35 : 1) * (1 + Math.sin(t * 3.7) * 0.055));
      material.emissiveIntensity = casting ? 2.6 : 1.8;
      shards.forEach((shard, i) => {
        shard.rotation.set(t * (0.6 + i * 0.11), t * (0.8 - i * 0.07), i * 0.7);
        shard.position.z = specs[i][2] + Math.sin(t * 2.9 + i) * 0.012;
      });
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      moteGeometry.dispose();
      material.dispose();
    },
  };
}
