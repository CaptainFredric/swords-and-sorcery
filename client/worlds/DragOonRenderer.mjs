// Production V4.1 renderer for DRAG-OON (master & LOD GLBs, isolated per-instance thermal materials,
// 4-layer Comp_* animation composition, procedural wheel/cannon articulation, and node/camera queries).
// Procedural geometry is retained strictly as a temporary loading / dev-failure fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { everywhere } from '../game/viewLayers.mjs';
import { MachineAnimationComposition } from './MachineAnimationComposition.mjs';
import { DRAG_OON_GEOMETRY, DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';

export const DRAG_OON_ASSETS = Object.freeze({
  master: '/client/assets/props/drag-oon/drag-oon-v4.1-master.glb?v=37d639e6f3eef173',
  lod: '/client/assets/props/drag-oon/drag-oon-v4.1-lod.glb?v=97937f893fda463e',
});

const LOD_SWITCH_OUT_DIST = 36;
const LOD_SWITCH_IN_DIST = 30;

const ELEMENT_COLORS = Object.freeze({
  fire: 0xff6a24,
  frost: 0x62d4ff,
  gale: 0x7bffb8,
  lightning: 0xd0a2ff,
  steel: 0xc8d2dc,
});

const HEAT_ZONE_MATERIALS = Object.freeze([
  'Mat_HeatZone_Cannons',
  'Mat_HeatZone_UndersideIgnition',
  'Mat_HeatZone_FurnaceInterior',
  'Mat_HeatZone_SteamVents',
]);

const ARMOR_MATERIALS = Object.freeze([
  'Mat_Rodin_DragonScale_Chassis',
  'Mat_Weathered_Medieval_Forge_Atlas',
]);

const ASSET_CACHE = new Map();

export function loadDragOonAsset(variant = 'master') {
  const key = variant === 'lod' ? 'lod' : 'master';
  if (!ASSET_CACHE.has(key)) {
    const loader = new GLTFLoader();
    const promise = loader.loadAsync(appUrl(DRAG_OON_ASSETS[key]))
      .then((gltf) => ({ variant: key, scene: gltf.scene, animations: gltf.animations ?? [] }))
      .catch((err) => {
        console.warn(`DRAG-OON V4.1 ${key} GLB failed to load; keeping fallback`, err);
        ASSET_CACHE.delete(key);
        return null;
      });
    ASSET_CACHE.set(key, promise);
  }
  return ASSET_CACHE.get(key);
}

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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sampleProgressClip(comp, clipName, filter, progress, weight = 1) {
  if (!comp || !(weight > 0.001)) return;
  const clip = comp.clips.get(clipName);
  if (!clip) return;
  const t = clamp(progress, 0, 1) * clip.duration;
  comp.sample({ clip: clipName, time: t, loop: false }, filter, { weight });
}

export class DragOonRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.preferMaster = Boolean(options.preferMaster);
    this.disposed = false;
    this.assetMode = 'fallback';
    this.requestedVariant = null;
    this.activeVariant = null;
    this.variantInstances = new Map(); // 'master' | 'lod' -> instance record

    this.root = everywhere(new THREE.Group());
    this.root.name = 'DragOonProductionRoot';
    this.root.visible = false;
    scene.add(this.root);

    this.chassisPivot = new THREE.Group();
    this.root.add(this.chassisPivot);

    // Explicit procedural fallback holder (visible only while GLB loads or on load failure).
    this.fallbackRoot = new THREE.Group();
    this.fallbackRoot.name = 'DragOonFallbackGeometry';
    this.chassisPivot.add(this.fallbackRoot);

    this.fallbackDisposables = [];
    this.fallbackMaterials = [];
    this.fallbackWheels = [];
    this.fallbackCannons = [];
    this.fallbackShutters = [];
    this.#buildFallbackGeometry();

    // Animation timers / hysteresis state
    this.hitFlashUntil = 0;
    this.steamBurstAt = -Infinity;
    this.lastSteamSeqSeen = null;
    this.campBlend = 0;
    this.bayBlend = 0;
    this.underShutterBlend = 0;
    this.shutterBlends = [0, 0, 0, 0];
    this.lastState = null;

    this.#ensureVariantLoaded('master');
    if (!this.preferMaster) this.#ensureVariantLoaded('lod');
  }

  #buildFallbackGeometry() {
    this.fbHullMat = new THREE.MeshStandardMaterial({ color: 0x45494e, metalness: 0.78, roughness: 0.44 });
    this.fbTrimMat = new THREE.MeshStandardMaterial({ color: 0x7a3428, metalness: 0.52, roughness: 0.5 });
    this.fbFurnaceMat = new THREE.MeshStandardMaterial({ color: 0x2a1a16, metalness: 0.6, roughness: 0.55, emissive: 0xff5a18, emissiveIntensity: 0.25 });
    this.fbUndersideMat = new THREE.MeshStandardMaterial({ color: 0x303338, metalness: 0.75, roughness: 0.48, emissive: 0xff6620, emissiveIntensity: 0 });
    this.fbCannonMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.85, roughness: 0.34, emissive: 0xff5518, emissiveIntensity: 0 });
    this.fbWheelMat = new THREE.MeshStandardMaterial({ color: 0x26292d, metalness: 0.5, roughness: 0.78 });
    this.fbShutterMat = new THREE.MeshStandardMaterial({ color: 0x696e75, metalness: 0.82, roughness: 0.36 });
    this.fbBeaconMat = new THREE.MeshStandardMaterial({ color: 0xc8d2dc, metalness: 0.4, roughness: 0.3, emissive: 0xff8030, emissiveIntensity: 0.2 });

    const g = DRAG_OON_GEOMETRY;
    const trackGeo = (geo) => { this.fallbackDisposables.push(geo); return geo; };

    const hullGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.82, g.height * 0.62, g.length * 0.88));
    const hullMesh = new THREE.Mesh(hullGeo, this.fbHullMat);
    hullMesh.position.set(0, g.height * 0.48, g.centerZOffset);
    hullMesh.castShadow = hullMesh.receiveShadow = true;
    this.fallbackRoot.add(hullMesh);

    const roofGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.64, g.height * 0.22, g.length * 0.7));
    const roofMesh = new THREE.Mesh(roofGeo, this.fbTrimMat);
    roofMesh.position.set(0, g.height * 0.86, g.centerZOffset + 0.1);
    roofMesh.castShadow = roofMesh.receiveShadow = true;
    this.fallbackRoot.add(roofMesh);

    const underGeo = trackGeo(new THREE.BoxGeometry(g.width * 0.56, 0.2, g.length * 0.56));
    const underMesh = new THREE.Mesh(underGeo, this.fbUndersideMat);
    underMesh.position.set(...g.undersideIgnitionOrigin);
    this.fallbackRoot.add(underMesh);

    const furnaceMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.5, 2.4)), this.fbFurnaceMat);
    furnaceMesh.position.set(...g.infusionCoreOrigin);
    this.fallbackRoot.add(furnaceMesh);

    this.fbBeaconMesh = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.28, 0)), this.fbBeaconMat);
    this.fbBeaconMesh.position.set(0, g.height + 0.28, 0);
    this.fallbackRoot.add(this.fbBeaconMesh);

    const wheelGeo = trackGeo(new THREE.CylinderGeometry(g.wheelRadius, g.wheelRadius, 0.38, 12));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const def of g.wheels) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(...def.pivot);
      const wheelMesh = new THREE.Mesh(wheelGeo, this.fbWheelMat);
      wheelMesh.castShadow = wheelMesh.receiveShadow = true;
      wheelPivot.add(wheelMesh);
      this.fallbackRoot.add(wheelPivot);
      this.fallbackWheels.push({ id: def.id, group: wheelPivot, mesh: wheelMesh });
    }

    const blockGeo = trackGeo(new THREE.BoxGeometry(0.62, 0.44, 0.92));
    const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.95, 8));
    barrelGeo.rotateX(Math.PI / 2);
    for (const sideDef of [g.cannons.left, g.cannons.right]) {
      const cannonPivot = new THREE.Group();
      cannonPivot.position.set(...sideDef.mount);
      const housing = new THREE.Mesh(blockGeo, this.fbCannonMat);
      cannonPivot.add(housing);
      for (const n of sideDef.nozzles) {
        const barrel = new THREE.Mesh(barrelGeo, this.fbCannonMat);
        barrel.position.set(n.local[0], n.local[1], n.local[2] * 0.55);
        cannonPivot.add(barrel);
      }
      this.fallbackRoot.add(cannonPivot);
      this.fallbackCannons.push(cannonPivot);
    }

    const shutterGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.46, 0.72));
    for (const st of g.stations.passengers) {
      const shutter = new THREE.Mesh(shutterGeo, this.fbShutterMat);
      shutter.position.set(st.aperture[0], st.aperture[1], st.aperture[2]);
      this.fallbackRoot.add(shutter);
      this.fallbackShutters.push({ mesh: shutter, openY: st.aperture[1] + 0.36, closedY: st.aperture[1] });
    }

    this.fallbackMaterials.push(
      this.fbHullMat, this.fbTrimMat, this.fbFurnaceMat, this.fbUndersideMat,
      this.fbCannonMat, this.fbWheelMat, this.fbShutterMat, this.fbBeaconMat,
    );
  }

  #buildProductionInstance(asset) {
    // Rotate GLB +Z forward into Castleward's -Z forward vehicle local frame.
    const wrapper = everywhere(new THREE.Group());
    wrapper.name = `DragOonV41_${asset.variant}`;
    const model = asset.scene.clone(true);
    model.rotation.y = Math.PI;
    wrapper.add(model);

    const nodes = new Map();
    const materialsByName = new Map();
    const clonedMaterials = [];

    model.traverse((n) => {
      if (n.name) nodes.set(n.name, n);
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        const list = Array.isArray(n.material) ? n.material : [n.material];
        const nextList = list.map((orig) => {
          const matName = orig?.name || 'Mat_Default';
          if (!materialsByName.has(matName)) {
            const mat = orig.clone();
            mat.userData = {
              ...(orig.userData ?? {}),
              baseEmissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
              baseEmissiveIntensity: mat.emissiveIntensity ?? 0,
            };
            materialsByName.set(matName, mat);
            clonedMaterials.push(mat);
          }
          return materialsByName.get(matName);
        });
        n.material = Array.isArray(n.material) ? nextList : nextList[0];
      }
    });

    const comp = new MachineAnimationComposition(model, asset.animations);
    const wheels = DRAG_OON_GEOMETRY.wheels.map(w => ({ id: w.id, node: nodes.get(w.id) ?? null }));
    const cannonMounts = {
      left: nodes.get('CannonMount_L') ?? null,
      right: nodes.get('CannonMount_R') ?? null,
      leftAsm: nodes.get('CannonAssembly_L') ?? null,
      rightAsm: nodes.get('CannonAssembly_R') ?? null,
    };
    const bodyNode = nodes.get('Chassis_Suspension_Body') ?? null;
    const bodyRestY = bodyNode ? bodyNode.position.y : 0;

    return {
      variant: asset.variant,
      wrapper,
      model,
      comp,
      nodes,
      materialsByName,
      clonedMaterials,
      wheels,
      cannonMounts,
      bodyNode,
      bodyRestY,
    };
  }

  #ensureVariantLoaded(variant) {
    if (this.variantInstances.has(variant)) return Promise.resolve(this.variantInstances.get(variant));
    return loadDragOonAsset(variant).then((asset) => {
      if (this.disposed || !asset) return null;
      if (!this.variantInstances.has(variant)) {
        const inst = this.#buildProductionInstance(asset);
        inst.wrapper.visible = false;
        this.chassisPivot.add(inst.wrapper);
        this.variantInstances.set(variant, inst);
        this.#syncActiveVariant();
      }
      return this.variantInstances.get(variant);
    });
  }

  preload(variant = 'master') {
    return this.#ensureVariantLoaded(variant);
  }

  #selectDesiredVariant(cameraPos, m) {
    if (this.preferMaster || !cameraPos || !m) return 'master';
    const dx = cameraPos.x - (m.x ?? m.position?.x ?? 0);
    const dy = cameraPos.y - (m.y ?? m.position?.y ?? 0);
    const dz = cameraPos.z - (m.z ?? m.position?.z ?? 0);
    const dist = Math.hypot(dx, dy, dz);
    if (this.activeVariant === 'lod') {
      return dist < LOD_SWITCH_IN_DIST ? 'master' : 'lod';
    }
    return dist > LOD_SWITCH_OUT_DIST ? 'lod' : 'master';
  }

  #syncActiveVariant() {
    const desired = this.requestedVariant || 'master';
    const picked = this.variantInstances.get(desired)
      ?? this.variantInstances.get('master')
      ?? this.variantInstances.get('lod')
      ?? null;
    this.activeVariant = picked?.variant ?? null;
    this.assetMode = picked ? picked.variant : 'fallback';
    this.fallbackRoot.visible = !picked;
    for (const [k, inst] of this.variantInstances) {
      inst.wrapper.visible = Boolean(picked && inst === picked);
    }
    return picked;
  }

  getActiveInstance() {
    if (!this.activeVariant) return null;
    return this.variantInstances.get(this.activeVariant) ?? null;
  }

  hit() {
    this.hitFlashUntil = performance.now() + 140;
  }

  onSteam(atSec) {
    if (Number.isFinite(atSec)) this.steamBurstAt = atSec;
  }

  getComponentWorldPosition(componentId) {
    const inst = this.getActiveInstance();
    if (inst) {
      const targetName = componentId === 'hull' ? 'Chassis_Suspension_Body'
        : componentId === 'Drive' ? 'fx_infusion_core'
        : componentId === 'Cannons' ? 'CannonMount_L'
        : componentId;
      const node = inst.nodes.get(targetName);
      if (node) {
        this.root.updateMatrixWorld(true);
        const out = new THREE.Vector3();
        node.getWorldPosition(out);
        return out;
      }
    }
    const out = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
    return out;
  }

  getNodeWorldPosition(nodeName, out = new THREE.Vector3()) {
    const inst = this.getActiveInstance();
    const node = inst?.nodes.get(nodeName);
    if (node) {
      this.root.updateMatrixWorld(true);
      return node.getWorldPosition(out);
    }
    return null;
  }

  /**
   * Resolves production GLB camera locators (noting GLB cameras look along local -Z)
   * or falls back smoothly to DRAG_OON_GEOMETRY camera definitions before load completes.
   */
  getMountedCameraPose(view, { role = 'operator', station = 0, airborne = false } = {}, outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const inst = this.getActiveInstance();
    const st = DRAG_OON_GEOMETRY.stations.passengers[clamp(station | 0, 0, 3)];
    let nodeName = 'cam_aim_external';
    if (role === 'passenger' && st) {
      nodeName = view === 'sight' ? `fx_spellcast_${st.id}` : st.cameraNode;
    } else if (view === 'sight') {
      nodeName = 'fp_camera';
    } else if (airborne) {
      nodeName = 'cam_airborne_down';
    }

    const node = inst?.nodes.get(nodeName);
    if (node) {
      this.root.updateMatrixWorld(true);
      node.getWorldPosition(outPos);
      node.getWorldQuaternion(outQuat);
      return { position: outPos, quaternion: outQuat, source: 'glb', nodeName };
    }

    // Fallback math aligned with Castleward frame
    const local = role === 'passenger' && st
      ? (view === 'sight' ? st.aperture : st.camera)
      : view === 'sight'
      ? DRAG_OON_GEOMETRY.cameras.fp
      : airborne
      ? DRAG_OON_GEOMETRY.cameras.airborneDown
      : DRAG_OON_GEOMETRY.cameras.aimExternal;

    this.root.updateMatrixWorld(true);
    outPos.set(local[0], local[1], local[2]).applyMatrix4(this.chassisPivot.matrixWorld);
    const yaw = (this.lastState?.heading ?? 0) + (role === 'passenger' && st ? st.yawOffset : 0);
    const pitch = role === 'passenger' && view !== 'sight' ? -0.35 : airborne ? -0.66 : -0.17;
    outQuat.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return { position: outPos, quaternion: outQuat, source: 'fallback', nodeName };
  }

  getMountedCameraPosition(view, out = new THREE.Vector3()) {
    return this.getMountedCameraPose(view, {}, out).position;
  }

  #updateMaterials(inst, serverNow, m, destroyed) {
    const heat = m.heat ?? 0;
    const heatNorm = clamp(heat / DRAG_OON_TUNING.heatMax, 0, 1.0);
    const overFrac = clamp((heat - DRAG_OON_TUNING.heatMax) / Math.max(1, DRAG_OON_TUNING.overpressureHeatMax - DRAG_OON_TUNING.heatMax), 0, 1);
    const spraying = Boolean(m.sprayHeld || m.flightLikeHell?.active || m.rite?.active);
    const leaping = Boolean(m.leap?.phase === 'prep' || m.leap?.phase === 'airborne' || m.flightLikeHell?.active || m.rite?.active);
    const steaming = (serverNow - this.steamBurstAt) < 1.1;
    const brimming = Boolean(m.brimming?.active || heat > DRAG_OON_TUNING.heatMax);
    const flash = performance.now() < this.hitFlashUntil;
    const brimPulse = brimming ? (0.85 + 0.15 * Math.sin(serverNow * (16 + overFrac * 18))) : 1;

    const cannonIntensity = destroyed ? 0 : (spraying ? 1.25 : 0) + heatNorm * 0.45 + overFrac * 0.85 * brimPulse;
    const underIntensity = destroyed ? 0 : (m.rite?.active ? 2.2 : leaping ? 1.45 : 0) + heatNorm * 0.2 + overFrac * 0.4;
    const furnaceIntensity = destroyed ? 0 : (0.15 + heatNorm * 0.65 + (brimming ? (0.75 + overFrac * 1.4) * brimPulse : 0));
    const steamIntensity = destroyed ? 0 : (steaming ? 1.35 : 0) + heatNorm * 0.25 + overFrac * 0.9 * brimPulse;

    const zoneHex = (m.infusions?.tiers?.frost ?? 0) >= 2 && (m.infusions?.tiers?.fire ?? 0) < 1 ? 0x62c6ff
      : (m.infusions?.tiers?.lightning ?? 0) >= 2 ? 0xc292ff
      : overFrac > 0.35 ? 0xff9234
      : 0xff5a18;

    setEmissiveGlow(inst.materialsByName.get('Mat_HeatZone_Cannons'), 0x000000, zoneHex, cannonIntensity);
    setEmissiveGlow(inst.materialsByName.get('Mat_HeatZone_UndersideIgnition'), 0x000000, 0xff6f22, underIntensity);
    setEmissiveGlow(inst.materialsByName.get('Mat_HeatZone_FurnaceInterior'), 0x200a06, overFrac > 0.4 ? 0xff6d1c : 0xff3b10, furnaceIntensity);
    setEmissiveGlow(inst.materialsByName.get('Mat_HeatZone_SteamVents'), 0x000000, steaming ? 0xd2efff : 0xff7030, steamIntensity);

    // Exterior armor retains recognizable dark iron/crimson scale identity (only flashes on direct impact hit).
    for (const armorMat of ARMOR_MATERIALS) {
      const mat = inst.materialsByName.get(armorMat);
      if (!mat) continue;
      setEmissiveGlow(mat, 0x000000, 0x993a24, flash ? 0.38 : 0);
    }
  }

  #composeProductionAnimations(inst, serverNow, m, dt, destroyed) {
    const comp = inst.comp;
    if (!comp) return;
    comp.begin(dt);

    // Track transitions smoothly
    const campTarget = !destroyed && m.campFire?.active && !m.campFire?.reopeningAt ? 1 : 0;
    const campRate = campTarget > this.campBlend
      ? 1 / Math.max(0.1, DRAG_OON_TUNING.campFire.settleSec)
      : 1 / Math.max(0.1, DRAG_OON_TUNING.campFire.reopenSec);
    this.campBlend = clamp(this.campBlend + Math.sign(campTarget - this.campBlend) * campRate * dt, 0, 1);

    const bayOpenTarget = !destroyed && !m.campFire?.sealed && !m.rite?.active && (m.crewTransitions?.length ?? 0) > 0 ? 1 : 0;
    this.bayBlend += (bayOpenTarget - this.bayBlend) * clamp(dt * 8, 0, 1);

    const underOpenTarget = !destroyed && (m.leap?.phase === 'prep' || m.leap?.phase === 'airborne' || m.flightLikeHell?.active || m.rite?.active) ? 1 : 0;
    this.underShutterBlend += (underOpenTarget - this.underShutterBlend) * clamp(dt * 14, 0, 1);

    // Detect fresh steam ring from snapshot if onSteam() event missed late joiner
    if (Number.isFinite(m.steamReadyAt) && (m.steamReadyAt - DRAG_OON_TUNING.steam.cooldownSec) > this.steamBurstAt) {
      const inferredAt = m.steamReadyAt - DRAG_OON_TUNING.steam.cooldownSec;
      if (serverNow - inferredAt >= 0 && serverNow - inferredAt < 1.5) this.steamBurstAt = inferredAt;
    }
    const steamClip = comp.clips.get('Comp_Steam_Vents_Radial_Discharge');
    const steamAge = serverNow - this.steamBurstAt;
    const steamActive = Boolean(!destroyed && steamClip && steamAge >= 0 && steamAge <= steamClip.duration);

    // ---- LAYER 1: Persistent Base Pose & Camp Fire Seals ----
    if (this.campBlend > 0.001) {
      sampleProgressClip(comp, 'Comp_CampFire_Suspension_Stance', name => name.startsWith('Chassis_Suspension_Body'), this.campBlend, 1);
      sampleProgressClip(comp, 'Comp_Visor_Shutter_Seal', name => name.startsWith('Operator_Visor_Shutter'), this.campBlend, 1);
      sampleProgressClip(comp, 'Comp_Cannons_Fortified_Tuck', name => name.startsWith('CannonMount_') || name.startsWith('CannonAssembly_'), this.campBlend, 1);
    }

    // ---- LAYER 2: Independent Shutters & Rear Boarding Bay ----
    if (this.bayBlend > 0.005) {
      sampleProgressClip(
        comp,
        'Comp_Rear_Boarding_Bay_OpenClose',
        name => name.startsWith('Rear_Access_Hatch_') || name.startsWith('Rear_Boarding_Ramp'),
        this.bayBlend,
        1
      );
    }

    const stationIds = ['L1', 'R1', 'L2', 'R2'];
    for (let i = 0; i < 4; i++) {
      const id = stationIds[i];
      const openTarget = !destroyed && !m.campFire?.sealed && !m.rite?.active && Boolean(m.passengers?.[i]) ? 1 : 0;
      this.shutterBlends[i] += (openTarget - this.shutterBlends[i]) * clamp(dt * 10, 0, 1);
      if (this.shutterBlends[i] > 0.005) {
        sampleProgressClip(
          comp,
          `Comp_Sorcery_Shutter_${id}_OpenClose`,
          name => name.startsWith(`Sorcery_Shutter_${id}`),
          this.shutterBlends[i],
          1
        );
      }
    }

    if (this.underShutterBlend > 0.005) {
      sampleProgressClip(
        comp,
        'Val_07_Underside_Shutters_OpenClose',
        name => name.startsWith('Ignition_Shutter_'),
        this.underShutterBlend,
        1
      );
    }

    // ---- LAYER 3: Steam Discharge + Procedural Cannons & 8 Wheels ----
    if (steamActive) {
      comp.sample(
        { clip: 'Comp_Steam_Vents_Radial_Discharge', time: steamAge, loop: false },
        name => name.startsWith('Steam_Shutter_'),
        { weight: 1 }
      );
    }

    // Procedural wheel articulation & broken wheel visibility
    for (let i = 0; i < inst.wheels.length; i++) {
      const w = inst.wheels[i];
      if (!w.node) continue;
      const hp = m.components?.[w.id]?.health ?? 1;
      w.node.visible = hp > 0;
      // Inside math.PI Y-rotated GLB (+Z fwd, +X left), forward roll (-m.wheelRolls) rotates top forward (-Z -> -X?):
      // Positive X rotation moves +Y toward +Z (GLB forward), so +wheelRolls matches forward travel along -Z sim!
      w.node.rotation.x += m.wheelRolls?.[i] ?? 0;
    }

    // Procedural twin cannon aim when not tucked inside Camp Fire
    if (this.campBlend < 0.75) {
      const aimWeight = 1 - this.campBlend / 0.75;
      const yaw = (m.cannonYaw ?? 0) * aimWeight;
      const pitch = (m.cannonPitch ?? 0) * aimWeight;
      if (inst.cannonMounts.left) inst.cannonMounts.left.rotation.y += yaw;
      if (inst.cannonMounts.right) inst.cannonMounts.right.rotation.y += yaw;
      // Negative rotation.x inside GLB +Z forward raises barrels upward; negative sim pitch (-1.25 down) -> positive rotation.x
      if (inst.cannonMounts.leftAsm) inst.cannonMounts.leftAsm.rotation.x -= pitch;
      if (inst.cannonMounts.rightAsm) inst.cannonMounts.rightAsm.rotation.x -= pitch;
    }

    // ---- LAYER 4: Additive Brimming Flutter & Grounded Vertical Safety Clamp ----
    const heat = m.heat ?? 0;
    const brimming = Boolean(!destroyed && (m.brimming?.active || heat > DRAG_OON_TUNING.heatMax));
    if (brimming) {
      const overFrac = clamp((heat - DRAG_OON_TUNING.heatMax) / Math.max(1, DRAG_OON_TUNING.overpressureHeatMax - DRAG_OON_TUNING.heatMax), 0, 1);
      const weight = clamp(0.35 + overFrac * 0.65, 0.25, 1.0);
      // Spec requirement: suppress Steam_Shutter_* flutter while Comp_Steam_Vents_Radial_Discharge is running!
      const filter = steamActive
        ? name => !name.startsWith('Steam_Shutter_')
        : () => true;
      comp.sample(
        { clip: 'Comp_Brimming_Shutter_Flutter', time: serverNow, loop: true },
        filter,
        { weight, additive: true }
      );
    }

    // Spec requirement: clamp grounded Suspension Body Y >= restY - 0.195 so additive vibration never breaks ground floor!
    if (inst.bodyNode && m.grounded) {
      inst.bodyNode.position.y = Math.max(inst.bodyRestY + DRAG_OON_GEOMETRY.campFireSettleY, inst.bodyNode.position.y);
    }

    comp.end();
  }

  update(serverNow, m, dt = 1 / 60, options = {}) {
    if (!m || m.retired || m.wreckVisualExpired) {
      this.root.visible = false;
      return;
    }
    this.lastState = m;
    this.root.visible = true;
    const x = m.x ?? m.position?.x ?? 0;
    const y = m.y ?? m.position?.y ?? 0;
    const z = m.z ?? m.position?.z ?? 0;
    this.root.position.set(x, y, z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(m.chassisPitch ?? 0, m.heading ?? 0, m.chassisRoll ?? 0);

    const destroyed = m.mode === 'DESTROYED' || m.health <= 0;
    this.chassisPivot.rotation.z = destroyed ? 0.12 : 0;

    // Select master vs LOD cleanly by camera distance & ensure requested variant loads async once
    const desired = this.#selectDesiredVariant(options.cameraPosition, m);
    if (desired !== this.requestedVariant) {
      this.requestedVariant = desired;
      this.#ensureVariantLoaded(desired);
    }
    const inst = this.#syncActiveVariant();

    if (inst) {
      this.chassisPivot.position.y = 0; // Suspension lowering owned cleanly by Comp_CampFire_Suspension_Stance
      this.#composeProductionAnimations(inst, serverNow, m, dt, destroyed);
      this.#updateMaterials(inst, serverNow, m, destroyed);
    } else {
      // Explicit fallback presentation while GLB loads
      this.chassisPivot.position.y = m.campFire?.settled ? DRAG_OON_GEOMETRY.campFireSettleY : 0;
      for (let i = 0; i < this.fallbackWheels.length; i++) {
        const w = this.fallbackWheels[i];
        const hp = m.components?.[w.id]?.health ?? 1;
        w.mesh.visible = hp > 0;
        w.mesh.rotation.x = m.wheelRolls?.[i] ?? 0;
      }
      const cy = m.cannonYaw ?? 0;
      const cp = m.cannonPitch ?? 0;
      for (const c of this.fallbackCannons) {
        c.rotation.order = 'YXZ';
        c.rotation.y = cy;
        c.rotation.x = cp;
      }
      const sealed = Boolean(m.campFire?.sealed);
      for (const s of this.fallbackShutters) {
        s.mesh.position.y += ((sealed ? s.closedY : s.openY) - s.mesh.position.y) * Math.min(1, dt * 10);
      }
      const heatNorm = clamp((m.heat ?? 0) / DRAG_OON_TUNING.heatMax, 0, 1.6);
      const spraying = Boolean(m.sprayHeld || m.flightLikeHell?.active || m.rite?.active);
      const leaping = Boolean(m.leap?.phase === 'prep' || m.leap?.phase === 'airborne' || m.rite?.active);
      setEmissiveGlow(this.fbHullMat, 0x000000, 0x993a24, performance.now() < this.hitFlashUntil ? 0.45 : 0);
      setEmissiveGlow(this.fbCannonMat, 0x000000, 0xff5a18, destroyed ? 0 : (spraying ? 0.95 : 0) + heatNorm * 0.45);
      setEmissiveGlow(this.fbUndersideMat, 0x000000, 0xff7020, destroyed ? 0 : (leaping ? 1.15 : 0) + heatNorm * 0.25);
      setEmissiveGlow(this.fbFurnaceMat, 0x200c08, 0xff4210, destroyed ? 0 : (m.brimming?.active ? 1.2 : 0.15) + heatNorm * 0.65);

      const tiers = m.infusions?.tiers ?? {};
      const activeEls = Object.entries(tiers).filter(([, t]) => t >= 1);
      if (activeEls.length && !destroyed) {
        const [el, tier] = activeEls[Math.floor(serverNow * 1.4) % activeEls.length];
        const hex = ELEMENT_COLORS[el] ?? 0xffffff;
        this.fbBeaconMat.color.setHex(hex);
        setEmissiveGlow(this.fbBeaconMat, hex, hex, tier >= 2 ? 1.1 : 0.55);
        this.fbBeaconMesh.rotation.y += dt * (tier >= 2 ? 2.8 : 1.4);
      } else {
        setEmissiveGlow(this.fbBeaconMat, 0x33373d, 0x33373d, 0);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    for (const inst of this.variantInstances.values()) {
      inst.wrapper.removeFromParent();
      for (const m of inst.clonedMaterials) m.dispose?.();
    }
    this.variantInstances.clear();
    for (const g of this.fallbackDisposables) g.dispose?.();
    for (const m of this.fallbackMaterials) m.dispose?.();
  }
}
