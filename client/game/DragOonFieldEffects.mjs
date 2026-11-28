// Bounded world-space spatial VFX for DRAG-OON fields & events:
// - Desolation Spray volumetric flame plumes & Steel+Gale near-solid barricades
// - Steam the Team circumferential expanding annulus rings
// - Raze the Pasture expanding fuel ring + lingering ground fires
// - Flight Like Hell scorch suppression markers
// - Fire's the Limit launch/slam bursts & All Abort! detonation
import * as THREE from 'three';
import { DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';
import { dragOonCannonRays } from '../../shared/sim/dragOonGeometry.mjs';

const ELEMENT_HEX = Object.freeze({
  fire: 0xff6224,
  frost: 0x6cd8ff,
  gale: 0x86ffc2,
  lightning: 0xc292ff,
  steel: 0xd0dce8,
});

function flameColorForSegment(seg) {
  const t = seg.tiers ?? {};
  if ((t.frost ?? 0) >= 1) return ELEMENT_HEX.frost;
  if ((t.lightning ?? 0) >= 1) return ELEMENT_HEX.lightning;
  if ((t.steel ?? 0) >= 1 && (t.gale ?? 0) >= 1) return 0xb8d4e8;
  if ((t.steel ?? 0) >= 1) return ELEMENT_HEX.steel;
  if ((t.gale ?? 0) >= 1) return ELEMENT_HEX.gale;
  return ELEMENT_HEX.fire;
}

export class DragOonFieldEffects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'DragOonFieldEffects';
    scene.add(this.group);

    this.flameGeo = new THREE.SphereGeometry(1, 8, 6);
    this.ringGeo = new THREE.TorusGeometry(1, 0.14, 8, 28);
    this.ringGeo.rotateX(Math.PI / 2);
    this.discGeo = new THREE.RingGeometry(0.15, 1, 24);
    this.discGeo.rotateX(-Math.PI / 2);
    this.barricadeGeo = new THREE.CylinderGeometry(0.95, 1.05, 2.2, 10, 1, true);
    // Open cone with apex at (0, 0, 0) pointing downward along -Y to wide base (radius 1 at y = -1)
    this.coneGeo = new THREE.ConeGeometry(1, 1, 18, 1, true);
    this.coneGeo.translate(0, -0.5, 0);

    this.flameMeshes = [];
    this.ringMeshes = [];
    this.razeMeshes = [];
    this.scorchMeshes = [];
    this.coneMeshes = [];
    this.bursts = [];
  }

  onEvent(event) {
    if (!event) return;
    if (event.type === 'dragOonLeapPhase' && (event.phase === 'launch' || event.phase === 'landing') && (event.point || event.origin)) {
      this.#spawnBurst(event.point ?? event.origin, event.steelRupture ? 0xc8d8e8 : 0xff6620, event.phase === 'landing' ? 4.8 : 3.2, 0.48);
    } else if (event.type === 'dragOonRiteAscended' && event.point) {
      this.#spawnBurst(event.point, 0xff5a18, 3.4, 0.48);
    } else if (event.type === 'dragOonDestroyed' && event.point) {
      const dur = event.isRiteOfAscension ? 1.35 : 0.9;
      const hex = event.isRiteOfAscension ? 0xff4210 : (event.brimming ? 0xff3b18 : 0xff7728);
      this.#spawnBurst(event.point, hex, Math.min(12, event.radius ?? 8), dur);
    }
  }

  #spawnBurst(point, hex, maxRadius, duration) {
    const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.flameGeo, mat);
    mesh.position.set(point.x, (point.y ?? 0) + 0.35, point.z);
    this.group.add(mesh);
    this.bursts.push({ mesh, mat, age: 0, duration, maxRadius });
  }

  #syncPool(pool, count, createFn) {
    while (pool.length < count) {
      const item = createFn();
      this.group.add(item.mesh);
      pool.push(item);
    }
    for (let i = 0; i < pool.length; i++) {
      pool[i].mesh.visible = i < count;
    }
  }

  update(snapshot, serverNow, dt = 1 / 60, resolveOrigin = null) {
    // Active bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const frac = b.age / b.duration;
      if (frac >= 1) {
        b.mesh.removeFromParent();
        b.mat.dispose();
        this.bursts.splice(i, 1);
      } else {
        const s = 0.6 + b.maxRadius * frac;
        b.mesh.scale.set(s, s * 0.55, s);
        b.mat.opacity = 0.72 * (1 - frac);
      }
    }

    if (!snapshot) return;

    // Emit dynamic exhaust plumes from V4.1 nodes for active Flight Like Hell, Camp Fire rings, & Rite of Ascension
    if (typeof resolveOrigin === 'function') {
      for (const m of snapshot.machines ?? []) {
        if (!m || m.kind !== 'dragoon' || m.retired || m.health <= 0) continue;
        if (m.rite?.active) {
          const core = resolveOrigin(m.id, 'fx_launch_explosion');
          if (core && (this._nextRitePlumeAt ?? 0) <= serverNow) {
            this._nextRitePlumeAt = serverNow + 0.06;
            this.#spawnBurst(core, 0xff5a18, 2.8, 0.34);
          }
        } else if (m.campFire?.flamesActive) {
          const ringPt = resolveOrigin(m.id, `fx_campfire_ring_0${(Math.floor(serverNow * 12) % 8) + 1}`);
          if (ringPt && (this._nextCampPlumeAt ?? 0) <= serverNow) {
            this._nextCampPlumeAt = serverNow + 0.11;
            this.#spawnBurst(ringPt, 0xff6a24, 1.35, 0.35);
          }
        }
      }
    }

    // 1. Desolation Spray segments + Steel/Gale flame barricades
    const flames = (snapshot.dragOonFlames ?? []).filter(f => serverNow < f.expiresAt);
    this.#syncPool(this.flameMeshes, flames.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6224, transparent: true, opacity: 0.5, depthWrite: false });
      const mesh = new THREE.Mesh(this.flameGeo, mat);
      const wallMat = new THREE.MeshBasicMaterial({ color: 0xb8d4e8, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false });
      const wall = new THREE.Mesh(this.barricadeGeo, wallMat);
      mesh.add(wall);
      return { mesh, mat, wall, wallMat };
    });
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], item = this.flameMeshes[i];
      const life = Math.max(0.05, Math.min(1, (f.expiresAt - serverNow) / Math.max(0.1, f.expiresAt - f.bornAt)));
      item.mesh.position.set(f.position.x, f.position.y, f.position.z);
      const r = f.radius ?? 0.95;
      item.mesh.scale.setScalar(r);
      item.mat.color.setHex(flameColorForSegment(f));
      item.mat.opacity = 0.42 * life;
      item.wall.visible = Boolean(f.barricade || (f.steelTier ?? 0) >= 2);
      item.wallMat.opacity = 0.32 * life;
    }

    // 2. Steam the Team expanding rings
    const rings = (snapshot.dragOonSteamRings ?? []).filter(r => serverNow < (r.visualUntil ?? r.expiresAt));
    this.#syncPool(this.ringMeshes, rings.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.55, depthWrite: false });
      return { mesh: new THREE.Mesh(this.ringGeo, mat), mat };
    });
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], item = this.ringMeshes[i];
      const age = Math.max(0, serverNow - r.bornAt);
      const rad = Math.max(0.5, Math.min(r.maxRadius ?? 12.5, age * (r.speed ?? 16)));
      const fade = Math.max(0, Math.min(1, ((r.visualUntil ?? r.expiresAt) - serverNow) / Math.max(0.2, (r.visualUntil ?? r.expiresAt) - r.bornAt)));
      item.mesh.position.set(r.origin.x, (r.origin.y ?? 0) + 0.85, r.origin.z);
      item.mesh.scale.set(rad, (r.height ?? 2.8) * 0.45, rad);
      item.mat.color.setHex((r.tiers?.fire ?? 0) >= 1 ? 0xffb380 : (r.tiers?.steel ?? 0) >= 1 ? 0xcfdce8 : 0xe4f6ff);
      item.mat.opacity = 0.52 * fade;
    }

    // 3. Raze the Pasture expanding targeting rings + active burning pasture fields
    const razeEntries = [];
    for (const m of snapshot.machines ?? []) {
      if (m?.raze?.center && ['holding', 'delay'].includes(m.raze.phase)) {
        razeEntries.push({ center: m.raze.center, radius: m.raze.radius ?? 3.2, prep: true, frac: 1 });
      }
    }
    for (const rf of snapshot.dragOonRazeFields ?? []) {
      if (serverNow < rf.expiresAt) {
        razeEntries.push({
          center: rf.center,
          radius: rf.radius ?? 4,
          prep: false,
          frac: Math.max(0.1, (rf.expiresAt - serverNow) / Math.max(0.1, rf.expiresAt - rf.bornAt)),
        });
      }
    }
    this.#syncPool(this.razeMeshes, razeEntries.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5518, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
      return { mesh: new THREE.Mesh(this.discGeo, mat), mat };
    });
    for (let i = 0; i < razeEntries.length; i++) {
      const e = razeEntries[i], item = this.razeMeshes[i];
      item.mesh.position.set(e.center.x, (e.center.y ?? 0) + 0.08, e.center.z);
      item.mesh.scale.setScalar(e.radius);
      item.mat.color.setHex(e.prep ? 0xffbb44 : 0xff4c16);
      item.mat.opacity = e.prep ? 0.5 : 0.36 * e.frac;
    }

    // Oriented articulated downward inferno plumes matching authoritative cone direction/reach
    const activeCones = [];
    const coneDown = new THREE.Vector3(0, -1, 0);
    const coneDirVec = new THREE.Vector3();
    for (const m of snapshot.machines ?? []) {
      if (!m || m.kind !== 'dragoon' || m.retired || m.health <= 0) continue;
      const isRite = Boolean(m.rite?.active);
      const isFlight = Boolean(m.flightLikeHell?.active);
      if (!isRite && !isFlight) continue;
      const rays = dragOonCannonRays(m);
      coneDirVec.set(0, 0, 0);
      for (const r of rays) {
        coneDirVec.x += r.direction.x;
        coneDirVec.y += r.direction.y;
        coneDirVec.z += r.direction.z;
      }
      if (coneDirVec.lengthSq() < 1e-6) coneDirVec.set(0, -1, 0);
      else coneDirVec.normalize();
      const length = isRite ? DRAG_OON_TUNING.riteOfAscension.exhaustConeLength : DRAG_OON_TUNING.flightLikeHell.coneLength;
      const halfAngle = (isRite ? DRAG_OON_TUNING.riteOfAscension.exhaustConeHalfAngleDeg : DRAG_OON_TUNING.flightLikeHell.coneHalfAngleDeg) * (Math.PI / 180);
      const radius = Math.tan(halfAngle) * length;
      const tiers = isRite ? (m.rite?.frozenTiers ?? m.infusions?.tiers ?? {}) : (m.infusions?.tiers ?? {});
      const apex = [(m.x ?? 0), (m.y ?? 0) + 0.45, (m.z ?? 0)];
      const quat = new THREE.Quaternion().setFromUnitVectors(coneDown, coneDirVec.clone());
      activeCones.push({
        apex,
        quat,
        radius: radius * 0.52,
        length: length * 0.92,
        color: isRite ? 0xffb347 : flameColorForSegment({ tiers }),
        opacity: isRite ? 0.46 : 0.34,
      });
      activeCones.push({
        apex,
        quat,
        radius,
        length,
        color: isRite ? 0xff4c12 : flameColorForSegment({ tiers }),
        opacity: isRite ? 0.16 : 0.12,
      });
    }
    this.#syncPool(this.coneMeshes, activeCones.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
      return { mesh: new THREE.Mesh(this.coneGeo, mat), mat };
    });
    for (let i = 0; i < activeCones.length; i++) {
      const c = activeCones[i], item = this.coneMeshes[i];
      item.mesh.position.set(c.apex[0], c.apex[1], c.apex[2]);
      item.mesh.quaternion.copy(c.quat);
      item.mesh.scale.set(c.radius, c.length, c.radius);
      item.mat.color.setHex(c.color);
      item.mat.opacity = c.opacity * (0.88 + 0.12 * Math.sin(serverNow * 24));
    }

    // 4. Flight Like Hell & Rite scorched suppression zones
    const scorches = (snapshot.dragOonSuppressionZones ?? []).filter(z => serverNow < z.expiresAt);
    this.#syncPool(this.scorchMeshes, scorches.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a1518, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
      return { mesh: new THREE.Mesh(this.discGeo, mat), mat };
    });
    for (let i = 0; i < scorches.length; i++) {
      const s = scorches[i], item = this.scorchMeshes[i];
      const frac = Math.max(0.1, (s.expiresAt - serverNow) / Math.max(0.1, s.expiresAt - s.bornAt));
      item.mesh.position.set(s.center.x, (s.center.y ?? 0) + 0.05, s.center.z);
      item.mesh.scale.setScalar(s.radius ?? 5.2);
      item.mat.opacity = 0.56 * frac;
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.flameGeo.dispose();
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.barricadeGeo.dispose();
    this.coneGeo.dispose();
    for (const p of [...this.flameMeshes, ...this.ringMeshes, ...this.razeMeshes, ...this.scorchMeshes, ...this.coneMeshes]) {
      p.mat.dispose();
      p.wallMat?.dispose();
    }
    for (const b of this.bursts) b.mat.dispose();
    this.bursts.length = 0;
  }
}
