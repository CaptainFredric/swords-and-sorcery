import * as THREE from 'three';

export class WeaponView {
  constructor(camera) {
    this.group = new THREE.Group();
    camera.add(this.group);
    this.group.position.set(0.48, -0.42, -0.74);

    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x2d3440, roughness: 0.75, metalness: 0.2 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x4b382f, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc5ccd2, roughness: 0.24, metalness: 0.92 });
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x657789, roughness: 0.42, metalness: 0.72 });

    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.7), sleeveMat);
    this.arm.position.set(0, -0.02, 0.3); this.arm.rotation.x = Math.PI / 2.25; this.group.add(this.arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.23), gloveMat); hand.position.set(0, 0.02, -0.05); this.group.add(hand);
    this.sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 1.45), metal); blade.position.z = -0.72; this.sword.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 4), metal); tip.rotation.x = -Math.PI / 2; tip.position.z = -1.52; this.sword.add(tip);
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.1), guardMat); crossguard.position.z = -0.04; this.sword.add(crossguard);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.38), gloveMat); grip.position.z = 0.21; this.sword.add(grip);
    this.sword.position.set(0, 0.03, -0.08); this.group.add(this.sword);

    this.attackHeld = false;
    this.attackStartedAt = 0;
    this.guard = false;
    this.recoilUntil = 0;
    this.parryUntil = 0;
    this.castUntil = 0;
    this.dashUntil = 0;
  }

  setAttack(held) {
    this.attackHeld = held;
    if (held) this.attackStartedAt = performance.now() / 1000;
  }
  setGuard(guard) { this.guard = guard; }
  cast() { this.castUntil = performance.now() / 1000 + 0.3; }
  dash() { this.dashUntil = performance.now() / 1000 + 0.18; }
  wallImpact() { this.recoilUntil = performance.now() / 1000 + 0.23; this.attackHeld = false; }
  parry() { this.parryUntil = performance.now() / 1000 + 0.3; }

  update(timeSec, movingAmount = 0) {
    const idle = Math.sin(timeSec * 2.2) * 0.012;
    const bob = Math.sin(timeSec * 9.2) * 0.012 * movingAmount;
    let x = 0.48 + idle;
    let y = -0.42 + bob;
    let z = -0.74;
    let rx = -0.08;
    let ry = -0.08;
    let rz = -0.12;

    if (this.guard) {
      x = 0.12; y = -0.18; z = -0.62;
      rx = -0.28; ry = -0.85; rz = 0.58;
    } else if (this.attackHeld) {
      const elapsed = (timeSec - this.attackStartedAt) % 2.08;
      const strike = elapsed < 0.72 ? 0 : elapsed < 1.44 ? 1 : 2;
      const local = strike === 0 ? elapsed / 0.72 : strike === 1 ? (elapsed - 0.72) / 0.72 : (elapsed - 1.44) / 0.64;
      const swing = Math.sin(Math.min(1, local) * Math.PI);
      if (strike === 0) { x -= swing * 0.5; y += swing * 0.12; rz -= swing * 1.15; ry += swing * 0.35; }
      if (strike === 1) { x += swing * 0.32; y += swing * 0.04; rz += swing * 1.1; ry -= swing * 0.25; }
      if (strike === 2) { y += swing * 0.42; x -= swing * 0.1; rx -= swing * 1.18; rz -= swing * 0.3; }
    }

    if (timeSec < this.recoilUntil) {
      const t = (this.recoilUntil - timeSec) / 0.23;
      z += 0.28 * t; x += 0.12 * t; rz += 0.9 * t;
    }
    if (timeSec < this.parryUntil) {
      const t = (this.parryUntil - timeSec) / 0.3;
      z += 0.18 * t; ry -= 0.7 * t;
    }
    if (timeSec < this.castUntil) this.group.scale.setScalar(0.96 + Math.sin(timeSec * 40) * 0.015);
    else this.group.scale.setScalar(1);

    this.group.position.x += (x - this.group.position.x) * 0.26;
    this.group.position.y += (y - this.group.position.y) * 0.26;
    this.group.position.z += (z - this.group.position.z) * 0.26;
    this.group.rotation.x += (rx - this.group.rotation.x) * 0.22;
    this.group.rotation.y += (ry - this.group.rotation.y) * 0.22;
    this.group.rotation.z += (rz - this.group.rotation.z) * 0.22;
  }
}
