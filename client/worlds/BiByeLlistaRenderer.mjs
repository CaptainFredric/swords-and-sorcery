import * as THREE from 'three';
import { everywhere } from '../game/viewLayers.mjs';
import { BI_BYE_LLISTA_CONFIG, BI_BYE_STATES, BI_BYE_MODES } from '../../shared/sim/biByeLlista.mjs';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Mobile Siege Engine Renderer.
 * Provides procedural representation of the six-wheeled carriage,
 * deployable outriggers, swiveling dual launchers, projectile visuals,
 * and destroyed wreck state.
 */
export class BiByeLlistaRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = options;
    this.group = new THREE.Group();
    this.group.name = 'Bi-Bye-llista Emplacement';

    const cfg = BI_BYE_LLISTA_CONFIG.emplacement;
    this.group.position.set(cfg.x, cfg.y, cfg.z);

    this.materials = this.#initMaterials();
    this.wheels = [];
    this.outriggers = [];
    this.lastPosition = { x: cfg.x, z: cfg.z };

    this.#buildMobileChassis();
    this.#buildTurntableAndCradle();
    this.#buildPitchAssembly();

    this.currentState = BI_BYE_STATES.LOADED;
    this.currentMode = BI_BYE_MODES.MOBILE;

    // Projectile visual tracking
    this.projectileMeshes = new Map();

    scene.add(this.group);
  }

  #initMaterials() {
    return {
      timber: new THREE.MeshStandardMaterial({ color: 0x4a321f, roughness: 0.85, metalness: 0.05 }),
      timberDark: new THREE.MeshStandardMaterial({ color: 0x332012, roughness: 0.9, metalness: 0.05 }),
      charred: new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.95, metalness: 0.1 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.55, metalness: 0.85 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x7c8594, roughness: 0.35, metalness: 0.95 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xa88434, roughness: 0.4, metalness: 0.8 }),
      arcaneCyan: new THREE.MeshStandardMaterial({
        color: 0x22ccff,
        emissive: 0x0099cc,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
      rope: new THREE.MeshStandardMaterial({ color: 0x94826b, roughness: 0.95 }),
      boltFeather: new THREE.MeshStandardMaterial({ color: 0xa62b24, roughness: 0.7 }),
    };
  }

  #buildMobileChassis() {
    this.chassisGroup = new THREE.Group();
    this.chassisGroup.name = 'BiBye_Chassis';

    // Main heavy timber wagon bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.4), this.materials.timber);
    bed.position.set(0, 0.45, 0);
    bed.castShadow = true;
    this.chassisGroup.add(bed);

    // Side reinforcement armor plates
    for (const side of [-0.72, 0.72]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 0.08), this.materials.iron);
      plate.position.set(0, 0.52, side);
      this.chassisGroup.add(plate);
    }

    // 6 Spoked heavy iron-banded timber wheels (3 per side)
    const wheelPositions = [
      [-0.85, -0.8], [0, -0.8], [0.85, -0.8],
      [-0.85, 0.8], [0, 0.8], [0.85, 0.8],
    ];

    for (const [wx, wz] of wheelPositions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wx, 0.42, wz);

      // Iron rim / tire
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16), this.materials.iron);
      rim.rotation.x = Math.PI / 2;
      wheelGroup.add(rim);

      // Wooden hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8), this.materials.timberDark);
      hub.rotation.x = Math.PI / 2;
      wheelGroup.add(hub);

      // 4 Crossed spokes
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 0.05), this.materials.timber);
        spoke.rotation.z = (s * Math.PI) / 4;
        wheelGroup.add(spoke);
      }

      this.wheels.push(wheelGroup);
      this.chassisGroup.add(wheelGroup);
    }

    // 4 Deployable Outrigger Stabilizers
    const outriggerPositions = [
      { x: -0.9, z: -0.7, dirZ: -1 },
      { x: 0.9, z: -0.7, dirZ: -1 },
      { x: -0.9, z: 0.7, dirZ: 1 },
      { x: 0.9, z: 0.7, dirZ: 1 },
    ];

    for (const pos of outriggerPositions) {
      const outriggerPivot = new THREE.Group();
      outriggerPivot.position.set(pos.x, 0.45, pos.z);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.65), this.materials.timberDark);
      leg.position.set(0, -0.15, pos.dirZ * 0.32);
      outriggerPivot.add(leg);

      const footpad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 8), this.materials.iron);
      footpad.position.set(0, -0.38, pos.dirZ * 0.6);
      outriggerPivot.add(footpad);

      outriggerPivot.userData = { dirZ: pos.dirZ };
      this.outriggers.push(outriggerPivot);
      this.chassisGroup.add(outriggerPivot);
    }

    // Heavy iron turntable collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.25, 16), this.materials.iron);
    collar.position.set(0, 0.65, 0);
    this.chassisGroup.add(collar);

    this.group.add(this.chassisGroup);
  }

  #buildTurntableAndCradle() {
    this.turntableGroup = new THREE.Group();
    this.turntableGroup.position.set(0, 0.78, 0);

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16), this.materials.iron);
    this.turntableGroup.add(plate);

    // Twin stanchions
    for (const side of [-0.42, 0.42]) {
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.28), this.materials.timber);
      stanchion.position.set(0, 0.38, side);
      this.turntableGroup.add(stanchion);

      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 12), this.materials.iron);
      bearing.rotation.x = Math.PI / 2;
      bearing.position.set(0, 0.72, side);
      this.turntableGroup.add(bearing);
    }

    // Operator footplate platform behind weapon
    const footrest = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.7), this.materials.timberDark);
    footrest.position.set(-0.85, -0.25, 0);
    this.turntableGroup.add(footrest);

    this.chassisGroup.add(this.turntableGroup);
  }

  #buildPitchAssembly() {
    this.pitchGroup = new THREE.Group();
    this.pitchGroup.position.set(0, 0.72, 0);

    // Main heavy stock (trough)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 0.38), this.materials.timber);
    stock.position.set(0.3, 0, 0);
    this.pitchGroup.add(stock);

    // Lower Siege Launcher track
    const lowerTrack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.16), this.materials.steel);
    lowerTrack.position.set(0.3, 0.18, 0);
    this.pitchGroup.add(lowerTrack);

    // Massive steel bow limbs
    this.limbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.35), this.materials.steel);
    this.limbLeft.position.set(1.4, 0, 0.65);
    this.pitchGroup.add(this.limbLeft);

    this.limbRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.35), this.materials.steel);
    this.limbRight.position.set(1.4, 0, -0.65);
    this.pitchGroup.add(this.limbRight);

    // Heavy main bowstring
    this.mainBowstring = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), this.materials.rope);
    this.mainBowstring.position.set(0.2, 0.2, 0);
    this.pitchGroup.add(this.mainBowstring);

    // Winch drum and winding handles
    this.winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 12), this.materials.brass);
    this.winchDrum.rotation.x = Math.PI / 2;
    this.winchDrum.position.set(-0.75, 0, 0);
    this.pitchGroup.add(this.winchDrum);

    // Main Steel Siege Bolt
    this.siegeBoltMesh = new THREE.Group();
    const boltShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), this.materials.timberDark);
    boltShaft.rotation.z = Math.PI / 2;
    this.siegeBoltMesh.add(boltShaft);

    const boltHead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), this.materials.steel);
    boltHead.rotation.z = -Math.PI / 2;
    boltHead.position.set(0.95, 0, 0);
    this.siegeBoltMesh.add(boltHead);

    for (let a = 0; a < 4; a++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.02), this.materials.boltFeather);
      fin.position.set(-0.75, 0, 0);
      fin.rotation.x = (a * Math.PI) / 2;
      this.siegeBoltMesh.add(fin);
    }
    this.siegeBoltMesh.position.set(0.45, 0.22, 0);
    this.pitchGroup.add(this.siegeBoltMesh);

    // Upper Launcher: Enchanted Frost Conditioning Rail
    const upperLauncher = new THREE.Group();
    upperLauncher.position.set(0, 0.5, 0);

    const uTrack = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.18), this.materials.steel);
    uTrack.position.set(0.2, 0, 0);
    upperLauncher.add(uTrack);

    // Arcane glow rail inlays
    const runeInlay = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.06), this.materials.arcaneCyan);
    runeInlay.position.set(0.2, 0.07, 0);
    upperLauncher.add(runeInlay);

    // Small upper bow limbs
    const uLimbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.65), this.materials.steel);
    uLimbLeft.position.set(1.1, 0, 0.32);
    upperLauncher.add(uLimbLeft);

    const uLimbRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.65), this.materials.steel);
    uLimbRight.position.set(1.1, 0, -0.32);
    upperLauncher.add(uLimbRight);

    // Conditioning Dart (Shot I)
    this.conditioningDartMesh = new THREE.Group();
    const dartShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), this.materials.steel);
    dartShaft.rotation.z = Math.PI / 2;
    this.conditioningDartMesh.add(dartShaft);

    const dartTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 6), this.materials.arcaneCyan);
    dartTip.rotation.z = -Math.PI / 2;
    dartTip.position.set(0.55, 0, 0);
    this.conditioningDartMesh.add(dartTip);

    this.conditioningDartMesh.position.set(0.2, 0.08, 0);
    upperLauncher.add(this.conditioningDartMesh);

    this.pitchGroup.add(upperLauncher);
    this.turntableGroup.add(this.pitchGroup);
  }

  /**
   * Update visual transforms, mobility, deployment, reload, and in-flight projectiles.
   */
  update(timeSec, ballistaData, projectilesData = []) {
    if (!ballistaData) return;

    // 1. Position and Chassis Heading
    const dx = ballistaData.x - this.lastPosition.x;
    const dz = ballistaData.z - this.lastPosition.z;
    const movedDist = Math.hypot(dx, dz);
    this.lastPosition = { x: ballistaData.x, z: ballistaData.z };

    this.group.position.set(ballistaData.x, ballistaData.y, ballistaData.z);

    if (Number.isFinite(ballistaData.heading)) {
      this.chassisGroup.rotation.y = -(ballistaData.heading - BI_BYE_LLISTA_CONFIG.emplacement.baseYaw);
    }

    // 2. Wheels rolling
    if (movedDist > 1e-4) {
      const rollDelta = movedDist / 0.42;
      for (const w of this.wheels) {
        w.children[0].rotation.z += rollDelta;
      }
    }

    // 3. Outrigger Stabilizer Deployment
    const pDeploy = Math.max(0, Math.min(1, ballistaData.deployProgress ?? 0));
    for (const out of this.outriggers) {
      // Swing out and down when deployed (p = 1.0)
      out.rotation.x = out.userData.dirZ * pDeploy * 0.45;
    }

    // 4. Turret Yaw & Pitch
    if (Number.isFinite(ballistaData.yaw)) {
      this.turntableGroup.rotation.y = -(ballistaData.yaw - ballistaData.heading);
    }
    if (Number.isFinite(ballistaData.pitch)) {
      this.pitchGroup.rotation.z = ballistaData.pitch;
    }

    // 5. Destroyed wreck state
    if (ballistaData.mode === BI_BYE_MODES.DESTROYED) {
      this.chassisGroup.position.y = -0.2;
      this.chassisGroup.rotation.z = 0.15;
      this.conditioningDartMesh.visible = false;
      this.siegeBoltMesh.visible = false;
      this.limbLeft.rotation.y = 0.5;
      this.limbRight.rotation.y = -0.5;
      return;
    }

    // 6. Weapon visual states & Reload
    this.conditioningDartMesh.visible = Boolean(ballistaData.smallBoltReady);
    this.siegeBoltMesh.visible = Boolean(ballistaData.mainBoltLoaded);

    if (ballistaData.state === BI_BYE_STATES.RELOADING) {
      const p = Math.max(0, Math.min(1, ballistaData.reloadProgress ?? 0));
      this.winchDrum.rotation.x = timeSec * 6.0;

      this.limbLeft.rotation.y = 0.05 + p * 0.30;
      this.limbRight.rotation.y = -0.05 - p * 0.30;
      this.mainBowstring.position.x = 0.9 - p * 0.7;

      if (p > 0.5) {
        this.siegeBoltMesh.visible = true;
        this.siegeBoltMesh.position.x = -0.3 + p * 0.75;
      }
    } else if (ballistaData.state === BI_BYE_STATES.LOADED) {
      this.limbLeft.rotation.y = 0.35;
      this.limbRight.rotation.y = -0.35;
      this.mainBowstring.position.x = 0.2;
    }

    // 7. Projectiles in-flight
    this.#updateProjectiles(projectilesData);
  }

  #updateProjectiles(projectilesData = []) {
    const liveIds = new Set();

    for (const proj of (projectilesData ?? [])) {
      liveIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);

      if (!mesh) {
        mesh = this.#createProjectileMesh(proj.subKind);
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }

      mesh.position.set(proj.position.x, proj.position.y, proj.position.z);

      const vx = proj.velocity.x;
      const vy = proj.velocity.y;
      const vz = proj.velocity.z;
      const len = Math.hypot(vx, vy, vz);
      if (len > 0.1) {
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(vx / len, vy / len, vz / len)
        );
      }
    }

    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        this.#disposeGroup(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  #createProjectileMesh(subKind) {
    const group = new THREE.Group();

    if (subKind === 'conditioning') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), this.materials.steel);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), this.materials.arcaneCyan);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.75;
      group.add(tip);

      const light = everywhere(new THREE.PointLight(0x00ccff, 1.2, 4));
      light.position.z = 0.5;
      group.add(light);
    } else {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.1, 8), this.materials.timberDark);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), this.materials.steel);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 1.3;
      group.add(tip);

      for (let a = 0; a < 4; a++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.38), this.materials.boltFeather);
        fin.position.z = -0.85;
        fin.rotation.z = (a * Math.PI) / 2;
        group.add(fin);
      }
    }

    return group;
  }

  #disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.#disposeGroup(this.group);

    for (const mesh of this.projectileMeshes.values()) {
      this.scene.remove(mesh);
      this.#disposeGroup(mesh);
    }
    this.projectileMeshes.clear();

    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
  }
}
