import * as THREE from 'three';
import { impactWorldPresentation, sampleTrailSegment, transientScale } from './effectTrail.mjs';

const MAX_TRANSIENTS = 180;

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.projectiles = new Map();
    this.transients = [];
    this.audio = null;
    this.basicMaterials = new Map();

    this.emberGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.11);
    this.emberMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xffb13b }),
      new THREE.MeshBasicMaterial({ color: 0xff6328 }),
    ];
    this.sparkGeometry = new THREE.BoxGeometry(0.025, 0.025, 0.11);
    this.flashGeometry = new THREE.OctahedronGeometry(0.055, 0);
    this.impactFlashGeometry = new THREE.OctahedronGeometry(0.22, 0);
    this.impactShellGeometry = new THREE.IcosahedronGeometry(0.38, 1);
    this.impactRingGeometry = new THREE.TorusGeometry(0.28, 0.025, 4, 16);
    this.projectileCoreGeometry = new THREE.OctahedronGeometry(0.15, 1);
    this.projectileShellGeometry = new THREE.IcosahedronGeometry(0.25, 1);
    this.dashGeometry = new THREE.PlaneGeometry(0.018, 0.18);

    this.dashMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9eaff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.impactRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a28,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.impactShellMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6725,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.projectileCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe0a3,
      emissive: 0xff641c,
      emissiveIntensity: 5.2,
      roughness: 0.18,
      metalness: 0.05,
    });
    this.projectileShellMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.31,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  #basicMaterial(color) {
    if (!this.basicMaterials.has(color)) this.basicMaterials.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.basicMaterials.get(color);
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

  #addTransient(mesh, {
    velocity = new THREE.Vector3(),
    life = 0.2,
    expand = 0,
    shrink = false,
    gravity = 0,
    spin = null,
    parent = this.scene,
  } = {}) {
    parent.add(mesh);
    this.transients.push({
      mesh,
      parent,
      velocity,
      life,
      maxLife: life,
      age: 0,
      expand,
      shrink,
      gravity,
      spin,
      baseScale: mesh.scale.clone(),
    });
    while (this.transients.length > MAX_TRANSIENTS) {
      const oldest = this.transients.shift();
      oldest?.parent?.remove(oldest.mesh);
    }
    return mesh;
  }

  #cameraFlash(color = 0xffd68a, life = 0.1, scale = 1) {
    const mesh = new THREE.Mesh(this.flashGeometry, this.#basicMaterial(color));
    mesh.scale.setScalar(scale);
    mesh.position.set(-0.22, -0.18, -0.52);
    this.#addTransient(mesh, {
      parent: this.camera,
      velocity: new THREE.Vector3(0, 0.16, -0.08),
      life,
      expand: 3.2,
      shrink: true,
      spin: new THREE.Vector3(5, 7, 3),
    });
  }

  #dashStreaks() {
    for (let i = 0; i < 7; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const mesh = new THREE.Mesh(this.dashGeometry, this.dashMaterial);
      mesh.position.set(side * (0.22 + Math.random() * 0.25), (Math.random() - 0.5) * 0.5, -0.52 - Math.random() * 0.08);
      mesh.rotation.z = side * (0.08 + Math.random() * 0.28);
      this.#addTransient(mesh, {
        parent: this.camera,
        velocity: new THREE.Vector3(side * 0.9, 0, 0),
        life: 0.12 + Math.random() * 0.04,
        shrink: true,
      });
    }
  }

  swordSwing(strike = 0) { this.tone(160 + strike * 25, 0.08, 0.035, 'sawtooth', 95); }
  swordHit(strike = 0) {
    this.tone(680 - strike * 80, 0.12 + strike * 0.03, 0.055, 'triangle', 180);
    this.#cameraFlash(0xffd78f, 0.07, 0.65);
  }
  block() {
    this.tone(980, 0.13, 0.06, 'square', 280);
    this.#cameraFlash(0xffd38a, 0.09, 0.8);
  }
  parry() {
    this.tone(1550, 0.22, 0.075, 'square', 420);
    this.tone(760, 0.16, 0.045, 'triangle', 1260);
    this.#cameraFlash(0xaeefff, 0.12, 1.25);
  }
  guardBreak() {
    this.tone(310, 0.23, 0.08, 'square', 85);
    this.#cameraFlash(0xff744d, 0.14, 1.15);
  }
  fireball() {
    this.tone(180, 0.25, 0.06, 'sawtooth', 70);
    this.tone(520, 0.09, 0.035, 'triangle', 260);
    this.#cameraFlash(0xff8a2b, 0.08, 0.58);
  }
  dash() {
    this.tone(420, 0.12, 0.045, 'sine', 880);
    this.#dashStreaks();
  }

  wallClang(point) {
    this.tone(1320, 0.24, 0.09, 'square', 240);
    this.tone(470, 0.31, 0.055, 'triangle', 110);
    this.sparks(point, 0xffd48a, 14);
  }

  sparks(point, color = 0xffbd6b, count = 10) {
    const material = this.#basicMaterial(color);
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(this.sparkGeometry, material);
      mesh.position.set(point.x, point.y, point.z);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.#addTransient(mesh, {
        velocity: dir.multiplyScalar(3 + Math.random() * 3),
        life: 0.24 + Math.random() * 0.18,
        shrink: true,
        gravity: 8,
        spin: new THREE.Vector3(5, 7, 4),
      });
    }
  }

  #ember(point, projectileVelocity = null) {
    const material = this.emberMaterials[Math.random() < 0.55 ? 0 : 1];
    const mesh = new THREE.Mesh(this.emberGeometry, material);
    mesh.position.set(
      point.x + (Math.random() - 0.5) * 0.07,
      point.y + (Math.random() - 0.5) * 0.07,
      point.z + (Math.random() - 0.5) * 0.07,
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.65, Math.random() * 0.45, (Math.random() - 0.5) * 0.65);
    if (projectileVelocity) {
      const backwards = new THREE.Vector3(-projectileVelocity.x, -projectileVelocity.y, -projectileVelocity.z);
      if (backwards.lengthSq() > 1e-6) velocity.add(backwards.normalize().multiplyScalar(0.55 + Math.random() * 0.35));
    }

    this.#addTransient(mesh, {
      velocity,
      life: 0.18 + Math.random() * 0.15,
      shrink: true,
      gravity: 1.8,
      spin: new THREE.Vector3(3, 4, 5),
    });
  }

  impact(point) {
    const worldPoint = new THREE.Vector3(point.x, point.y, point.z);
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);
    const presentation = impactWorldPresentation(cameraPosition.distanceTo(worldPoint));

    if (presentation.cameraFlash) this.#cameraFlash(0xff8a2b, 0.1, 0.78);

    if (presentation.showWorldBurst) {
      const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xffd18a));
      flash.position.copy(worldPoint);
      flash.scale.setScalar(presentation.worldScale);
      this.#addTransient(flash, { life: 0.13, expand: 5.4, shrink: true });

      const shell = new THREE.Mesh(this.impactShellGeometry, this.impactShellMaterial);
      shell.position.copy(worldPoint);
      shell.scale.setScalar(presentation.worldScale);
      this.#addTransient(shell, { life: 0.22, expand: 4.6, spin: new THREE.Vector3(2.5, 3.5, 1.8) });

      if (presentation.showRings) {
        for (let axis = 0; axis < 2; axis += 1) {
          const ring = new THREE.Mesh(this.impactRingGeometry, this.impactRingMaterial);
          ring.position.copy(worldPoint);
          ring.scale.setScalar(presentation.worldScale);
          ring.rotation.x = axis === 0 ? Math.PI / 2 : 0;
          ring.rotation.y = axis === 1 ? Math.PI / 2 : 0;
          this.#addTransient(ring, { life: 0.2, expand: 6.1 });
        }
      }
    }

    for (let i = 0; i < 18; i += 1) this.#ember(point);
    this.sparks(point, 0xff8a3c, 12);
    this.tone(95, 0.28, 0.085, 'sawtooth', 45);
    this.tone(260, 0.16, 0.045, 'triangle', 70);
  }

  #createProjectile() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.projectileCoreGeometry, this.projectileCoreMaterial);
    const shell = new THREE.Mesh(this.projectileShellGeometry, this.projectileShellMaterial);
    shell.rotation.set(0.4, 0.2, 0.1);
    group.add(core, shell);

    const light = new THREE.PointLight(0xff6b24, 7.5, 5, 2);
    group.add(light);
    this.scene.add(group);

    return {
      group,
      core,
      shell,
      light,
      phase: Math.random() * Math.PI * 2,
      lastPosition: null,
      trailCarry: 0,
    };
  }

  syncProjectiles(projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p.id);
      let effect = this.projectiles.get(p.id);
      if (!effect) {
        effect = this.#createProjectile();
        this.projectiles.set(p.id, effect);
      }

      const next = { x: p.position.x, y: p.position.y, z: p.position.z };
      if (effect.lastPosition) {
        const trail = sampleTrailSegment(effect.lastPosition, next, {
          spacing: 0.16,
          carry: effect.trailCarry,
          maxSamples: 5,
        });
        effect.trailCarry = trail.carry;
        for (const point of trail.points) this.#ember(point, p.velocity);
      }

      effect.group.position.set(next.x, next.y, next.z);
      effect.lastPosition = next;
    }

    for (const [id, effect] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(effect.group);
        this.projectiles.delete(id);
      }
    }
  }

  update(dt) {
    for (const effect of this.projectiles.values()) {
      effect.phase += dt * 8;
      effect.shell.rotation.x += dt * 2.9;
      effect.shell.rotation.y += dt * 4.1;
      effect.shell.rotation.z -= dt * 2.2;
      effect.shell.scale.setScalar(0.92 + Math.sin(effect.phase) * 0.07);
      effect.core.scale.setScalar(0.98 + Math.sin(effect.phase * 1.7) * 0.05);
      effect.light.intensity = 6.8 + Math.sin(effect.phase * 1.4) * 1.2;
    }

    for (let i = this.transients.length - 1; i >= 0; i -= 1) {
      const transient = this.transients[i];
      transient.life -= dt;
      transient.age += dt;
      transient.mesh.position.addScaledVector(transient.velocity, dt);
      transient.velocity.y -= transient.gravity * dt;

      const scale = transientScale(transient.age, transient.maxLife, transient.expand, transient.shrink);
      transient.mesh.scale.copy(transient.baseScale).multiplyScalar(scale);

      if (transient.spin) {
        transient.mesh.rotation.x += transient.spin.x * dt;
        transient.mesh.rotation.y += transient.spin.y * dt;
        transient.mesh.rotation.z += transient.spin.z * dt;
      }

      if (transient.life <= 0) {
        transient.parent.remove(transient.mesh);
        this.transients.splice(i, 1);
      }
    }
  }
}
