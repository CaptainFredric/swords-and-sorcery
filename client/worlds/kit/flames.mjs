import * as THREE from 'three';
import { KIT_PALETTE as P } from './facetKit.mjs';

// Fire and glow for a world's furnishings: a faceted flame that flickers over each lantern and brazier with a soft
// additive glow round it, and a faint cyan glow over each patch of fungus. No lights (a camp of braziers would be a
// dozen lights, dear on phones: the glow carries the warmth), and all of a world's flames are one instanced mesh, their
// glows another, the fungus's a third: three draw calls however many there are.
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _rotation = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function instanced(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = count;
  mesh.name = name;
  mesh.frustumCulled = false;
  return mesh;
}

export class FlameSet {
  constructor(parent, { flames = [], glows = [] } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'furnishing-fire';
    parent.add(this.group);
    this.flameGeometry = new THREE.OctahedronGeometry(0.13, 0);
    this.glowGeometry = new THREE.SphereGeometry(0.4, 10, 6);
    this.flameMaterial = new THREE.MeshBasicMaterial({ color: P.flame, transparent: true, opacity: 0.92 });
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
    this.runeGlowMaterial = new THREE.MeshBasicMaterial({ color: P.rune, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flames = flames.map(({ position, scale = 1 }, index) => ({ position: new THREE.Vector3(...position), scale, phase: index * 1.27 }));
    this.flameMesh = instanced(this.flameGeometry, this.flameMaterial, this.flames.length, 'furnishing-flames');
    this.glowMesh = instanced(this.glowGeometry, this.glowMaterial, this.flames.length, 'furnishing-flame-glows');
    this.flames.forEach(({ position, scale }, i) => {
      this.glowMesh.setMatrixAt(i, _matrix.compose(position, _rotation.identity(), _scale.setScalar(scale * 1.4)));
    });
    this.fungusMesh = instanced(this.glowGeometry, this.runeGlowMaterial, glows.length, 'furnishing-fungus-glows');
    glows.forEach((position, i) => {
      this.fungusMesh.setMatrixAt(i, _matrix.compose(_position.set(...position), _rotation.identity(), _scale.set(1.6, 0.7, 1.4)));
    });
    for (const mesh of [this.flameMesh, this.glowMesh, this.fungusMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count) this.group.add(mesh);
    }
    this.update(0);
  }

  update(timeSec) {
    if (!this.flames.length) return;
    this.flames.forEach(({ position, scale, phase }, i) => {
      const flicker = 1 + Math.sin(timeSec * 9.3 + phase) * 0.12 + Math.sin(timeSec * 17.1 + phase * 2) * 0.06;
      _position.copy(position);
      _position.y += 0.02 * Math.sin(timeSec * 7 + phase);
      _rotation.setFromAxisAngle(_up, timeSec * 1.7 + phase);
      _scale.set(scale * flicker * 0.9, scale * (1.25 + 0.2 * Math.sin(timeSec * 11 + phase)), scale * flicker * 0.9);
      this.flameMesh.setMatrixAt(i, _matrix.compose(_position, _rotation, _scale));
    });
    this.flameMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    for (const mesh of [this.flameMesh, this.glowMesh, this.fungusMesh]) mesh.dispose();
    this.flameGeometry.dispose();
    this.glowGeometry.dispose();
    this.flameMaterial.dispose();
    this.glowMaterial.dispose();
    this.runeGlowMaterial.dispose();
  }
}
