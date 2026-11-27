// Procedural V3.1 functional placeholder renderer for DRAG-OON.
// All dimensions, wheel pivots, cannon mounts, nozzles, apertures, and heat zones read from
// shared/src/dragOonConfig.mjs so Gemini Neon's final production GLB replaces this cleanly.
import * as THREE from 'three';
import { everywhere } from '../game/viewLayers.mjs';
import { DRAG_OON_GEOMETRY, DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';

const ELEMENT_COLORS = Object.freeze({
  fire: 0xff6a24,
  frost: 0x62d4ff,
  gale: 0x7bffb8,
  lightning: 0xd0a2ff,
  steel: 0xc8d2dc,
});

function setEmissiveGlow(mat, baseHex, glowHex, intensity) {
  if (!mat) return;
  if (intensity <= 0.01) {
    mat.emissive?.setHex(baseHex);
    mat.emissiveIntensity = 0;
  } else {
    mat.emissive?.setHex(glowHex);
    mat.emissiveIntensity = intensity;
  }
}

export class DragOonRenderer {
  constructor(scene) {
    this.scene = scene;
    this.root = everywhere(new THREE.Group());
    this.root.name = 'DragOonPrototype';
    this.root.visible = false;
    scene.add(this.root);

    this.chassisPivot = new THREE.Group();
    this.root.add(this.chassisPivot);

    // Per-instance unique materials (isolated thermal emissive glow per machine!)
    this.hullMat = new THREE.MeshStandardMaterial({ color: 0x45494e, metalness: 0.78, roughness: 0.44 });
    this.trimMat = new THREE.MeshStandardMaterial({ color: 0x7a3428, metalness: 0.52, roughness: 0.5 });
    this.furnaceMat = new THREE.MeshStandardMaterial({ color: 0x2a1a16, metalness: 0.6, roughness: 0.55, emissive: 0xff5a18, emissiveIntensity: 0.25 });
    this.undersideMat = new THREE.MeshStandardMaterial({ color: 0x303338, metalness: 0.75, roughness: 0.48, emissive: 0xff6620, emissiveIntensity: 0 });
    this.cannonMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.85, roughness: 0.34, emissive: 0xff5518, emissiveIntensity: 0 });
    this.wheelMat = new THREE.MeshStandardMaterial({ color: 0x26292d, metalness: 0.5, roughness: 0.78 });
    this.shutterMat = new THREE.MeshStandardMaterial({ color: 0x696e75, metalness: 0.82, roughness: 0.36 });
    this.infusionBeaconMat = new THREE.MeshStandardMaterial({ color: 0xc8d2dc, metalness: 0.4, roughness: 0.3, emissive: 0xff8030, emissiveIntensity: 0.2 });

    const g = DRAG_OON_GEOMETRY;
    this.componentMeshes = new Map();
    this.wheels = [];
    this.cannons = [];
    this.shutters = [];
    this.disposables = [];

    const trackGeo = (geo) => { this.disposables.push(geo); return geo; };

    // Armored enclosure core (provisional 4.143 x 2.798 x 5.746 m hull)
    const hullGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.82, g.height * 0.62, g.length * 0.88));
    const hullMesh = new THREE.Mesh(hullGeo, this.hullMat);
    hullMesh.position.set(0, g.height * 0.48, 0);
    hullMesh.castShadow = hullMesh.receiveShadow = true;
    this.chassisPivot.add(hullMesh);
    this.componentMeshes.set('hull', hullMesh);

    // Sloped prow + roof furnace ridge
    const roofGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.64, g.height * 0.24, g.length * 0.72));
    const roofMesh = new THREE.Mesh(roofGeo, this.trimMat);
    roofMesh.position.set(0, g.height * 0.88, 0.15);
    roofMesh.castShadow = roofMesh.receiveShadow = true;
    this.chassisPivot.add(roofMesh);

    // Visible furnace core glow grille inside/top of chassis
    const furnaceGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.55, 2.4));
    const furnaceMesh = new THREE.Mesh(furnaceGeo, this.furnaceMat);
    furnaceMesh.position.set(0, 1.45, 0.35);
    this.chassisPivot.add(furnaceMesh);
    this.componentMeshes.set('Drive', furnaceMesh);

    // Underside ignition shutter plate (emissive glow during Fire's the Limit launch)
    const underGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.56, 0.2, g.length * 0.56));
    const underMesh = new THREE.Mesh(underGeo, this.undersideMat);
    underMesh.position.set(...g.undersideIgnitionOrigin);
    this.chassisPivot.add(underMesh);

    // Element status crest above furnace
    const beaconGeo = trackGeo(new THREE.OctahedronGeometry(0.28, 0));
    this.beaconMesh = new THREE.Mesh(beaconGeo, this.infusionBeaconMat);
    this.beaconMesh.position.set(0, g.height + 0.32, 0.15);
    this.chassisPivot.add(this.beaconMesh);

    // Eight independent wheels along left & right flanks
    const wheelGeo = trackGeo(new THREE.CylinderGeometry(g.wheelRadius, g.wheelRadius, 0.38, 12));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const def of g.wheels) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(...def.pivot);
      const wheelMesh = new THREE.Mesh(wheelGeo, this.wheelMat);
      wheelMesh.castShadow = wheelMesh.receiveShadow = true;
      wheelPivot.add(wheelMesh);
      this.chassisPivot.add(wheelPivot);
      this.wheels.push({ id: def.id, group: wheelPivot, mesh: wheelMesh });
      this.componentMeshes.set(def.id, wheelMesh);
    }

    // Twin low-mounted articulated 4-nozzle cannons (Cannons component)
    const blockGeo = trackGeo(new THREE.BoxGeometry(0.62, 0.44, 0.92));
    const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.95, 8));
    barrelGeo.rotateX(Math.PI / 2);
    for (const sideDef of [g.cannons.left, g.cannons.right]) {
      const cannonPivot = new THREE.Group();
      cannonPivot.position.set(...sideDef.mount);
      const housing = new THREE.Mesh(blockGeo, this.cannonMat);
      housing.castShadow = housing.receiveShadow = true;
      cannonPivot.add(housing);
      for (const n of sideDef.nozzles) {
        const barrel = new THREE.Mesh(barrelGeo, this.cannonMat);
        barrel.position.set(n.local[0], n.local[1], n.local[2] * 0.55);
        barrel.castShadow = true;
        cannonPivot.add(barrel);
      }
      this.chassisPivot.add(cannonPivot);
      this.cannons.push(cannonPivot);
    }
    this.componentMeshes.set('Cannons', this.cannons[0]);

    // Aperture shutter indicators (slide shut during Camp Fire hatch sealing)
    const shutterGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.46, 0.72));
    for (const st of g.stations.passengers) {
      const shutter = new THREE.Mesh(shutterGeo, this.shutterMat);
      shutter.position.set(st.aperture[0], st.aperture[1], st.aperture[2]);
      if (Math.abs(st.aperture[2]) > Math.abs(st.aperture[0])) shutter.rotation.y = Math.PI / 2;
      this.chassisPivot.add(shutter);
      this.shutters.push({ mesh: shutter, openY: st.aperture[1] + 0.36, closedY: st.aperture[1] });
    }

    this.materials = [
      this.hullMat, this.trimMat, this.furnaceMat, this.undersideMat,
      this.cannonMat, this.wheelMat, this.shutterMat, this.infusionBeaconMat,
    ];
    this.hitFlashUntil = 0;
  }

  hit(event) {
    this.hitFlashUntil = performance.now() + 140;
  }

  getComponentWorldPosition(componentId) {
    const mesh = this.componentMeshes.get(componentId) ?? this.componentMeshes.get('hull');
    if (!mesh) return null;
    const out = new THREE.Vector3();
    mesh.getWorldPosition(out);
    return out;
  }

  getMountedCameraPosition(view, out = new THREE.Vector3()) {
    const pos = this.root.position;
    if (view === 'sight') {
      out.set(pos.x, pos.y + 2.35, pos.z);
      return out;
    }
    return null;
  }

  update(serverNow, m, dt = 1 / 60) {
    if (!m || m.retired) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const x = m.x ?? m.position?.x ?? 0;
    const y = m.y ?? m.position?.y ?? 0;
    const z = m.z ?? m.position?.z ?? 0;
    this.root.position.set(x, y, z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(m.chassisPitch ?? 0, m.heading ?? 0, m.chassisRoll ?? 0);

    // Destroyed visual tilt & darkened ash state
    const destroyed = m.mode === 'DESTROYED' || m.health <= 0;
    this.chassisPivot.position.y = m.campFire?.settled ? -0.18 : 0;
    this.chassisPivot.rotation.z = destroyed ? 0.14 : 0;

    // 8-wheel articulation + destroyed wheel hiding
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const hp = m.components?.[w.id]?.health ?? 1;
      w.mesh.visible = hp > 0;
      w.mesh.rotation.x = m.wheelRolls?.[i] ?? 0;
    }

    // Twin articulated cannon pitch/yaw
    const cy = m.cannonYaw ?? 0;
    const cp = m.cannonPitch ?? 0;
    for (const c of this.cannons) {
      c.rotation.order = 'YXZ';
      c.rotation.y = cy;
      c.rotation.x = cp;
    }

    // Camp Fire armor hatch seal state
    const sealed = Boolean(m.campFire?.sealed);
    for (const s of this.shutters) {
      s.mesh.position.y += ((sealed ? s.closedY : s.openY) - s.mesh.position.y) * Math.min(1, dt * 10);
    }

    // Separate emissive heat zones per instance (cannons, underside ignition, furnace interior)
    const heatNorm = Math.min(1.6, Math.max(0, (m.heat ?? 0) / DRAG_OON_TUNING.heatMax));
    const spraying = Boolean(m.sprayHeld || m.flightLikeHell?.active);
    const cannonGlow = destroyed ? 0 : (spraying ? 0.95 : 0) + heatNorm * 0.45;
    const underGlow = destroyed ? 0 : (m.leap?.phase === 'prep' || m.leap?.phase === 'airborne' ? 1.15 : 0) + heatNorm * 0.25;
    const furnaceGlow = destroyed ? 0 : (m.brimming?.active ? 1.2 : 0.15) + heatNorm * 0.65;

    const flash = performance.now() < this.hitFlashUntil;
    setEmissiveGlow(this.hullMat, 0x000000, 0x993a24, flash ? 0.45 : 0);
    setEmissiveGlow(this.cannonMat, 0x000000, 0xff5a18, cannonGlow);
    setEmissiveGlow(this.undersideMat, 0x000000, 0xff7020, underGlow);
    setEmissiveGlow(this.furnaceMat, 0x200c08, 0xff4210, furnaceGlow);

    // Cooperative elemental infusion status indicator above furnace crest
    const tiers = m.infusions?.tiers ?? {};
    const activeEls = Object.entries(tiers).filter(([, t]) => t >= 1);
    if (activeEls.length && !destroyed) {
      const idx = Math.floor(serverNow * 1.4) % activeEls.length;
      const [el, tier] = activeEls[idx];
      const hex = ELEMENT_COLORS[el] ?? 0xffffff;
      this.infusionBeaconMat.color.setHex(hex);
      setEmissiveGlow(this.infusionBeaconMat, hex, hex, tier >= 2 ? 1.1 : 0.55);
      this.beaconMesh.rotation.y += dt * (tier >= 2 ? 2.8 : 1.4);
    } else {
      setEmissiveGlow(this.infusionBeaconMat, 0x33373d, 0x33373d, 0);
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const g of this.disposables) g.dispose?.();
    for (const m of this.materials) m.dispose?.();
  }
}
