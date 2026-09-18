import * as THREE from 'three';

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.projectiles = new Map();
    this.transients = [];
    this.audio = null;
  }

  ensureAudio() {
    if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audio.state === 'suspended') this.audio.resume();
    return this.audio;
  }

  tone(freq, duration = 0.1, gain = 0.05, type = 'sine', slideTo = null) {
    const ctx = this.ensureAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + duration);
  }

  swordSwing(strike = 0) { this.tone(160 + strike * 25, 0.08, 0.035, 'sawtooth', 95); }
  swordHit(strike = 0) { this.tone(680 - strike * 80, 0.12 + strike * 0.03, 0.055, 'triangle', 180); }
  block() { this.tone(980, 0.13, 0.06, 'square', 280); }
  parry() { this.tone(1550, 0.22, 0.075, 'square', 420); }
  fireball() { this.tone(180, 0.25, 0.06, 'sawtooth', 70); }
  dash() { this.tone(420, 0.12, 0.045, 'sine', 880); }

  wallClang(point) {
    this.tone(1320, 0.24, 0.09, 'square', 240);
    this.tone(470, 0.31, 0.055, 'triangle', 110);
    this.sparks(point, 0xffd48a, 14);
  }

  sparks(point, color = 0xffbd6b, count = 10) {
    const material = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.1), material);
      mesh.position.set(point.x, point.y, point.z);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      this.scene.add(mesh);
      this.transients.push({ mesh, velocity: dir.multiplyScalar(3 + Math.random() * 3), life: 0.24 + Math.random() * 0.18 });
    }
  }

  impact(point) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff812d, transparent: true, opacity: 0.85 }),
    );
    mesh.position.set(point.x, point.y, point.z);
    this.scene.add(mesh);
    this.transients.push({ mesh, velocity: new THREE.Vector3(), life: 0.24, expand: 4.2 });
    this.sparks(point, 0xff6d2b, 18);
    this.tone(95, 0.28, 0.085, 'sawtooth', 45);
  }

  syncProjectiles(projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p.id);
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        const material = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff5a16, emissiveIntensity: 3.2, roughness: 0.25 });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), material);
        const light = new THREE.PointLight(0xff6b24, 8, 5, 2); mesh.add(light);
        this.projectiles.set(p.id, mesh); this.scene.add(mesh);
      }
      mesh.position.set(p.position.x, p.position.y, p.position.z);
    }
    for (const [id, mesh] of this.projectiles) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.projectiles.delete(id); }
    }
  }

  update(dt) {
    for (let i = this.transients.length - 1; i >= 0; i -= 1) {
      const t = this.transients[i];
      t.life -= dt;
      t.mesh.position.addScaledVector(t.velocity, dt);
      t.velocity.y -= 8 * dt;
      if (t.expand) t.mesh.scale.multiplyScalar(1 + t.expand * dt);
      if (t.mesh.material?.opacity !== undefined) t.mesh.material.opacity = Math.max(0, t.life * 3);
      if (t.life <= 0) { this.scene.remove(t.mesh); this.transients.splice(i, 1); }
    }
  }
}
