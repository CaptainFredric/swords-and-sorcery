// The sword in a Blazing Vortex: lit. As it is raised a faint light gathers along it; then a star catches at its
// point (the ignition: a bright twinkle, there and gone), the flame takes at the hilt and runs up the blade, sparks
// peeling off it; as the spin takes hold there is one short flare; and while it is swung it leaves a short hot trail
// where it has just been: seen from outside, the arc of fire the spin draws; from inside, a streak across the view.
// Nothing here is a wall of fire: the knight and whoever they fight stay plain to see.
//
// Only that knight's sword: its meshes wear a copy of the steel with the heat in it while it lasts (as Sunder's heat
// does, sunderBlade.mjs), and the flames, the star and the trail are its own.

import * as THREE from 'three';
import { puffTexture, starTexture } from './softTextures.mjs';
import { FIRST_PERSON_SWORD_ARM, THIRD_PERSON_SWORD_ARM } from './swordArmIK.mjs';

// the blade in each rig's grip socket: which way it points, and how long it is (m)
export const VORTEX_BLADES = Object.freeze({
  firstPerson: Object.freeze({ aim: FIRST_PERSON_SWORD_ARM.aim, length: 0.78 }),
  thirdPerson: Object.freeze({ aim: THIRD_PERSON_SWORD_ARM.aim, length: 0.94 }),
});

export const VORTEX_FIRE = Object.freeze({
  heat: 0xff6a14, heatLevel: 1.5,
  flames: 6, flameSize: 0.2,
  star: Object.freeze({ seconds: 0.5, size: 0.78 }),
  // sparks peeling off the lit blade: this many at once at most, each this long; how many a second while it is being
  // lit and while it spins
  sparks: Object.freeze({ count: 10, seconds: 0.32, litPerSec: 26, spinPerSec: 9, speed: 1.3, size: 0.07 }),
  // the flare as the spin takes hold
  flare: Object.freeze({ seconds: 0.2, size: 1.5 }),
  // the trail: this many moments of where the blade was, each kept this long
  trail: Object.freeze({ points: 16, seconds: 0.12, glow: 0.62 }),
});

const FLAME_COLORS = [0xffd9a0, 0xff9a3c, 0xff6a1c];

/**
 * instance: the knight's rig (its root and its sword socket); blade: VORTEX_BLADES.*; trailParent: what the trail is
 * drawn in (the scene for a knight seen from outside; my own arms' root for mine, so it stays with the view).
 */
export function createVortexBlade(instance, { blade = VORTEX_BLADES.thirdPerson, trailParent = null } = {}) {
  const root = instance?.root;
  const socket = instance?.sockets?.sword ?? null;
  const meshes = [];
  root?.traverse?.((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) meshes.push(object); });
  const originals = new Map();
  const heated = new Map();
  let lit = false;
  const heat = (material) => {
    if (!material?.isMeshStandardMaterial) return material;
    if (!heated.has(material)) {
      const copy = material.clone();
      copy.emissive.setHex(VORTEX_FIRE.heat);
      heated.set(material, copy);
    }
    return heated.get(material);
  };

  const along = (share, target = new THREE.Vector3()) => target.set(blade.aim[0], blade.aim[1], blade.aim[2]).multiplyScalar(blade.length * share);
  const group = new THREE.Group();
  group.name = 'vortex-blade-fire';
  group.visible = false;
  socket?.add(group);
  const texture = puffTexture();
  const flames = [];
  for (let i = 0; i < VORTEX_FIRE.flames; i += 1) {
    const material = new THREE.SpriteMaterial({ map: texture, color: FLAME_COLORS[i % FLAME_COLORS.length], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.frustumCulled = false;
    group.add(sprite);
    flames.push({ sprite, share: 0.16 + 0.84 * (i / (VORTEX_FIRE.flames - 1)), phase: i * 1.7 });
  }
  const starMaterial = new THREE.SpriteMaterial({ map: starTexture(), color: 0xfff3d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const star = new THREE.Sprite(starMaterial);
  star.frustumCulled = false;
  star.visible = false;
  along(1, star.position);
  socket?.add(star);
  let sparkAt = -Infinity;
  // the sparks: a small pool, each thrown off the blade a little way and gone
  const sparkMaterial = new THREE.SpriteMaterial({ map: starTexture(), color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  for (let i = 0; i < VORTEX_FIRE.sparks.count; i += 1) {
    const sprite = new THREE.Sprite(sparkMaterial.clone());
    sprite.frustumCulled = false;
    sprite.visible = false;
    socket?.add(sprite);
    sparks.push({ sprite, bornAt: -Infinity, from: new THREE.Vector3(), way: new THREE.Vector3() });
  }
  let sparkDue = 0;
  let lastTime = null;
  // the flare as the spin takes hold: one bright bloom at the middle of the blade
  const flareMaterial = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flare = new THREE.Sprite(flareMaterial);
  flare.frustumCulled = false;
  flare.visible = false;
  along(0.55, flare.position);
  socket?.add(flare);
  let flareAt = -Infinity;

  // the trail: a ribbon from the blade's foot to its point, through where they have just been
  const count = VORTEX_FIRE.trail.points;
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const index = [];
  for (let i = 0; i < count - 1; i += 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setIndex(index);
  const trail = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  trail.name = 'vortex-blade-trail';
  trail.frustumCulled = false;
  trail.visible = false;
  trailParent?.add(trail);
  const history = [];
  const foot = new THREE.Vector3();
  const point = new THREE.Vector3();
  const hot = new THREE.Color(0xff9a44);
  const ember = new THREE.Color(0xd8420c);

  const drawTrail = (timeSec, level) => {
    if (!socket || !trailParent) return;
    if (level > 0.05) {
      socket.updateWorldMatrix(true, false);
      socket.localToWorld(along(0.38, foot));
      socket.localToWorld(along(1, point));
      trailParent.worldToLocal(foot);
      trailParent.worldToLocal(point);
      history.unshift({ foot: foot.clone(), point: point.clone(), at: timeSec, level });
    }
    while (history.length && (history.length > count || timeSec - history[history.length - 1].at > VORTEX_FIRE.trail.seconds)) history.pop();
    trail.visible = history.length >= 2;
    if (!trail.visible) return;
    for (let i = 0; i < count; i += 1) {
      const sample = history[Math.min(i, history.length - 1)];
      const fresh = i < history.length ? Math.max(0, 1 - (timeSec - sample.at) / VORTEX_FIRE.trail.seconds) : 0;
      const glow = fresh * fresh * sample.level * VORTEX_FIRE.trail.glow;
      positions.set([sample.foot.x, sample.foot.y, sample.foot.z, sample.point.x, sample.point.y, sample.point.z], i * 6);
      // (dim and red at the blade's foot, hot at its point; all of it cooling as it ages)
      colors.set([ember.r * glow * 0.3, ember.g * glow * 0.3, ember.b * glow * 0.3, hot.r * glow, hot.g * glow, hot.b * glow], i * 6);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  };

  return {
    /** The star at the sword's point: the ignition (once, at `timeSec`). */
    spark(timeSec) {
      sparkAt = timeSec;
    },
    /** The flare as the spin takes hold (once, at `timeSec`). */
    flash(timeSec) {
      flareAt = timeSec;
    },
    /**
     * How alight the blade is (0..1) at `timeSec`; `swinging`: whether it leaves its trail now; `gather` (0..1): before
     * it is lit, how far the light has gathered along it; `spinning`: the spin has taken hold (fewer sparks than while
     * it is being lit).
     */
    set(level, timeSec = 0, { swinging = true, gather = 0, spinning = false } = {}) {
      const on = level > 0.01;
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, timeSec - lastTime));
      lastTime = timeSec;
      if (on && !lit) {
        for (const mesh of meshes) {
          originals.set(mesh, mesh.material);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(heat) : heat(mesh.material);
        }
      } else if (!on && lit) {
        for (const [mesh, material] of originals) mesh.material = material;
        originals.clear();
      }
      lit = on;
      const gathering = !on && gather > 0.01;
      group.visible = on || gathering;
      if (on) {
        const flicker = 0.85 + 0.15 * Math.sin(timeSec * 31);
        for (const copy of heated.values()) copy.emissiveIntensity = VORTEX_FIRE.heatLevel * level * flicker;
      }
      for (const flame of flames) {
        const beat = 0.5 + 0.5 * Math.sin(timeSec * 23 + flame.phase);
        along(flame.share + 0.03 * Math.sin(timeSec * 17 + flame.phase), flame.sprite.position);
        // lit, the flame takes at the hilt and runs up the blade; before that, a faint light gathers along it
        const caught = on ? Math.max(0, Math.min(1, (level * 1.2 - flame.share * 0.95) / 0.25)) : 0;
        const faint = gathering ? 0.16 * gather : 0;
        flame.sprite.scale.setScalar(VORTEX_FIRE.flameSize * (on ? (0.7 + 0.5 * beat) * (0.5 + 0.5 * caught) : 1.5 - 0.7 * gather));
        flame.sprite.material.opacity = Math.max(0.62 * caught * (0.65 + 0.35 * beat), faint);
        flame.sprite.material.rotation = timeSec * 3 + flame.phase;
      }
      // sparks peel off the lit blade (thick while it is being lit, a few while it spins)
      if (on) sparkDue += dt * (spinning ? VORTEX_FIRE.sparks.spinPerSec : VORTEX_FIRE.sparks.litPerSec) * level;
      for (const spark of sparks) {
        const age = timeSec - spark.bornAt;
        if (age >= VORTEX_FIRE.sparks.seconds && sparkDue >= 1 && on) {
          sparkDue -= 1;
          spark.bornAt = timeSec;
          along(0.2 + 0.8 * Math.random(), spark.from);
          spark.way.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(VORTEX_FIRE.sparks.speed * (0.5 + Math.random()));
        }
        const life = (timeSec - spark.bornAt) / VORTEX_FIRE.sparks.seconds;
        spark.sprite.visible = life >= 0 && life < 1;
        if (!spark.sprite.visible) continue;
        spark.sprite.position.copy(spark.from).addScaledVector(spark.way, life * VORTEX_FIRE.sparks.seconds);
        spark.sprite.scale.setScalar(VORTEX_FIRE.sparks.size * (1.2 - 0.7 * life));
        spark.sprite.material.opacity = 0.9 * (1 - life);
      }
      sparkDue = Math.min(sparkDue, 3);
      // the flare as the spin takes hold
      const bloom = (timeSec - flareAt) / VORTEX_FIRE.flare.seconds;
      flare.visible = bloom >= 0 && bloom < 1;
      if (flare.visible) {
        flare.scale.setScalar(VORTEX_FIRE.flare.size * (0.3 + 0.7 * bloom));
        flareMaterial.opacity = 0.9 * (1 - bloom) * (1 - bloom);
      }
      const age = timeSec - sparkAt;
      const twinkle = age >= 0 && age < VORTEX_FIRE.star.seconds ? Math.sin(Math.PI * age / VORTEX_FIRE.star.seconds) : 0;
      star.visible = twinkle > 0.01;
      if (star.visible) {
        star.scale.setScalar(VORTEX_FIRE.star.size * (0.25 + 0.75 * twinkle));
        starMaterial.opacity = twinkle;
        starMaterial.rotation = age * 2.2;
      }
      drawTrail(timeSec, on && swinging ? level : 0);
    },
    dispose() {
      this.set(0);
      history.length = 0;
      trail.visible = false;
      for (const copy of heated.values()) copy.dispose();
      heated.clear();
      for (const flame of flames) flame.sprite.material.dispose();
      for (const spark of sparks) { spark.sprite.material.dispose(); spark.sprite.removeFromParent(); }
      sparkMaterial.dispose();
      flareMaterial.dispose();
      flare.removeFromParent();
      starMaterial.dispose();
      group.removeFromParent();
      star.removeFromParent();
      trail.removeFromParent();
      geometry.dispose();
      trail.material.dispose();
    },
  };
}
