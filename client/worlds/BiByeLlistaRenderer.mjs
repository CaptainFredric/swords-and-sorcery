import * as THREE from 'three';
import { everywhere } from '../game/viewLayers.mjs';
import { BI_BYE_LLISTA_CONFIG, BI_BYE_STATES } from '../../shared/sim/biByeLlista.mjs';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Practice Yard Renderer.
 * Provides a crisp, unmistakable procedural visual representation of the two-stage
 * siege engine, prepared for direct handoff to Argon's authored GLB animations.
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
    this.#buildChassisAndStabilizers();
    this.#buildTurntableAndCradle();
    this.#buildPitchAssembly();

    this.currentState = BI_BYE_STATES.LOADED;
    this.lastState = null;
    this.animTime = 0;

    // Projectile visual tracking
    this.projectileMeshes = new Map();

    scene.add(this.group);
  }

  #initMaterials() {
    return {
      timber: new THREE.MeshStandardMaterial({ color: 0x4a321f, roughness: 0.85, metalness: 0.05 }),
      timberDark: new THREE.MeshStandardMaterial({ color: 0x332012, roughness: 0.9, metalness: 0.05 }),
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

  #buildChassisAndStabilizers() {
    // Ground base chassis (stationary on the turf)
    const baseGroup = new THREE.Group();
    baseGroup.name = '05_BiBye_Stabilizer_Deploy';

    // Cross-timber sled beams
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.35), this.materials.timber);
    beam1.position.set(0, 0.11, 0);
    beam1.castShadow = true;
    baseGroup.add(beam1);

    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 2.2), this.materials.timber);
    beam2.position.set(0, 0.11, 0);
    beam2.castShadow = true;
    baseGroup.add(beam2);

    // Diagonal stabilizer legs with iron ground stakes
    for (const [sx, sz] of [[-1.1, -1.0], [1.1, -1.0], [-1.1, 1.0], [1.1, 1.0]]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.6, 6), this.materials.iron);
      stake.position.set(sx, 0.15, sz);
      stake.rotation.x = sz > 0 ? 0.3 : -0.3;
      baseGroup.add(stake);

      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), this.materials.timberDark);
      brace.position.set(sx * 0.6, 0.25, sz * 0.6);
      brace.lookAt(sx, 0, sz);
      baseGroup.add(brace);
    }

    // Heavy iron pivot collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.32, 16), this.materials.iron);
    collar.position.set(0, 0.35, 0);
    collar.castShadow = true;
    baseGroup.add(collar);

    this.group.add(baseGroup);
  }

  #buildTurntableAndCradle() {
    // Yaw assembly rotates horizontally
    this.turntableGroup = new THREE.Group();
    this.turntableGroup.position.set(0, 0.5, 0);

    // Turntable platform plate
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), this.materials.iron);
    plate.position.set(0, 0, 0);
    this.turntableGroup.add(plate);

    // Vertical twin stanchions (A-frame supports)
    for (const side of [-0.42, 0.42]) {
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.28), this.materials.timber);
      stanchion.position.set(side, 0.38, 0);
      stanchion.castShadow = true;
      this.turntableGroup.add(stanchion);

      // Iron trunnion pillow block
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 12), this.materials.iron);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.set(side, 0.72, 0);
      this.turntableGroup.add(bearing);
    }

    // Operator platform footrest behind weapon
    const footrest = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.7), this.materials.timberDark);
    footrest.position.set(-0.85, -0.35, 0);
    this.turntableGroup.add(footrest);

    this.group.add(this.turntableGroup);
  }

  #buildPitchAssembly() {
    // Pitch assembly tilts vertically around trunnion axis at (0, 0.72, 0)
    this.pitchGroup = new THREE.Group();
    this.pitchGroup.position.set(0, 0.72, 0);

    // Central longitudinal stock / rail beam (3.2m long)
    const mainStock = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, 0.32), this.materials.timber);
    mainStock.position.set(0.4, 0, 0);
    mainStock.castShadow = true;
    this.pitchGroup.add(mainStock);

    // ==========================================
    // LOWER LAUNCHER (Shot II: Main Siege Bolt)
    // ==========================================
    const lowerLauncher = new THREE.Group();
    lowerLauncher.name = 'Lower_Main_Siege_Launcher';

    // Massive steel sword-shaped bow limbs (left and right)
    // Left sword limb
    this.limbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.35), this.materials.steel);
    this.limbLeft.position.set(1.4, 0.05, -0.85);
    this.limbLeft.rotation.y = 0.35;
    this.limbLeft.castShadow = true;
    lowerLauncher.add(this.limbLeft);

    // Right sword limb
    this.limbRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.35), this.materials.steel);
    this.limbRight.position.set(1.4, 0.05, 0.85);
    this.limbRight.rotation.y = -0.35;
    this.limbRight.castShadow = true;
    lowerLauncher.add(this.limbRight);

    // Heavy main bowstring
    this.mainBowstring = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), this.materials.rope);
    this.mainBowstring.rotation.x = Math.PI / 2;
    this.mainBowstring.position.set(0.2, 0.08, 0);
    lowerLauncher.add(this.mainBowstring);

    // Giant physical siege bolt (Shot II) resting on main stock track
    this.siegeBoltMesh = new THREE.Group();
    this.siegeBoltMesh.position.set(0.45, 0.16, 0);

    const boltShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.65, 8), this.materials.timberDark);
    boltShaft.rotation.z = Math.PI / 2;
    this.siegeBoltMesh.add(boltShaft);

    const boltHead = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 8), this.materials.steel);
    boltHead.rotation.z = -Math.PI / 2;
    boltHead.position.set(0.95, 0, 0);
    this.siegeBoltMesh.add(boltHead);

    // Red flights
    for (let a = 0; a < 3; a++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.02), this.materials.boltFeather);
      fin.position.set(-0.65, 0, 0);
      fin.rotation.x = (a * Math.PI * 2) / 3;
      this.siegeBoltMesh.add(fin);
    }
    lowerLauncher.add(this.siegeBoltMesh);

    // Rear winch drum and ratchet wheel
    this.winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 12), this.materials.iron);
    this.winchDrum.rotation.x = Math.PI / 2;
    this.winchDrum.position.set(-0.85, 0.05, 0);
    lowerLauncher.add(this.winchDrum);

    // Operator crank handle
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), this.materials.brass);
    crank.position.set(-0.85, 0.18, 0.26);
    lowerLauncher.add(crank);

    // Embossed Roman numeral "II" plaque
    const plaqueII = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.34), this.materials.brass);
    plaqueII.position.set(-0.1, 0, 0);
    lowerLauncher.add(plaqueII);

    this.pitchGroup.add(lowerLauncher);

    // ==========================================
    // UPPER LAUNCHER (Shot I: Conditioning Bolt)
    // ==========================================
    const upperLauncher = new THREE.Group();
    upperLauncher.name = 'Upper_Conditioning_Enchanted_Launcher';
    upperLauncher.position.set(0.35, 0.36, 0);

    // Elevated brass and steel housing
    const upperHousing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.22), this.materials.brass);
    upperHousing.position.set(0, 0, 0);
    upperHousing.castShadow = true;
    upperLauncher.add(upperHousing);

    // Miniature bow limbs
    const uLimbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.65), this.materials.steel);
    uLimbLeft.position.set(0.65, 0, -0.38);
    uLimbLeft.rotation.y = 0.28;
    upperLauncher.add(uLimbLeft);

    const uLimbRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.65), this.materials.steel);
    uLimbRight.position.set(0.65, 0, 0.38);
    uLimbRight.rotation.y = -0.28;
    upperLauncher.add(uLimbRight);

    // Glowing cyan runic guide rail
    const runeRail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.06), this.materials.arcaneCyan);
    runeRail.position.set(0.15, 0.09, 0);
    upperLauncher.add(runeRail);

    // Upper conditioning dart (Shot I)
    this.conditioningDartMesh = new THREE.Group();
    this.conditioningDartMesh.position.set(0.2, 0.12, 0);

    const dartShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), this.materials.steel);
    dartShaft.rotation.z = Math.PI / 2;
    this.conditioningDartMesh.add(dartShaft);

    const dartTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), this.materials.arcaneCyan);
    dartTip.rotation.z = -Math.PI / 2;
    dartTip.position.set(0.55, 0, 0);
    this.conditioningDartMesh.add(dartTip);

    upperLauncher.add(this.conditioningDartMesh);

    // Embossed Roman numeral "I" plaque
    const plaqueI = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.24), this.materials.iron);
    plaqueI.position.set(-0.35, 0, 0);
    upperLauncher.add(plaqueI);

    this.pitchGroup.add(upperLauncher);

    this.turntableGroup.add(this.pitchGroup);
  }

  /**
   * Updates ballista visual transforms, firing sequences, and reload progress.
   */
  update(timeSec, ballistaData, projectilesData = []) {
    this.animTime = timeSec;

    if (ballistaData) {
      // 1. Aim orientation
      if (Number.isFinite(ballistaData.yaw)) {
        this.turntableGroup.rotation.y = ballistaData.yaw - BI_BYE_LLISTA_CONFIG.emplacement.baseYaw;
      }
      if (Number.isFinite(ballistaData.pitch)) {
        this.pitchGroup.rotation.z = -ballistaData.pitch;
      }

      const state = ballistaData.state ?? BI_BYE_STATES.LOADED;
      this.currentState = state;

      // 2. Visual states mapping
      if (state === BI_BYE_STATES.LOADED) {
        // Both bolts loaded and ready
        this.conditioningDartMesh.visible = true;
        this.siegeBoltMesh.visible = true;
        this.conditioningDartMesh.position.x = 0.2;
        this.siegeBoltMesh.position.x = 0.45;
        this.mainBowstring.position.x = 0.2;
        this.limbLeft.rotation.y = 0.35;
        this.limbRight.rotation.y = -0.35;
      } else if (state === BI_BYE_STATES.FIRING) {
        // Shot I is airborne; Shot II launches ~0.20s later
        this.conditioningDartMesh.visible = false;
        // String snapped forward for Shot I
        const elapsedSinceFired = ballistaData.firedAt ? Math.max(0, timeSec - ballistaData.firedAt) : 0;
        if (elapsedSinceFired >= 0.200) {
          // Shot II also discharged
          this.siegeBoltMesh.visible = false;
          this.mainBowstring.position.x = 1.1; // String forward
          this.limbLeft.rotation.y = 0.05; // Limbs released
          this.limbRight.rotation.y = -0.05;
        } else {
          // Main bolt still tensioned waiting for 0.200s release
          this.siegeBoltMesh.visible = true;
        }
      } else if (state === BI_BYE_STATES.SPENT) {
        // Both discharged, spent recoil
        this.conditioningDartMesh.visible = false;
        this.siegeBoltMesh.visible = false;
        this.mainBowstring.position.x = 1.05;
      } else if (state === BI_BYE_STATES.RELOADING) {
        // Mechanical reload in progress
        const p = Math.max(0, Math.min(1, ballistaData.reloadProgress ?? 0));
        // Rotate winch drum continuously during reload
        this.winchDrum.rotation.z = timeSec * 6.5;

        // Limbs slowly tensioning back
        this.limbLeft.rotation.y = 0.05 + p * 0.30;
        this.limbRight.rotation.y = -0.05 - p * 0.30;
        this.mainBowstring.position.x = 1.05 - p * 0.85;

        // Bolts slide into place during latter half of reload (p > 0.5)
        if (p > 0.45) {
          this.siegeBoltMesh.visible = true;
          this.siegeBoltMesh.position.x = -0.5 + p * 0.95;
        } else {
          this.siegeBoltMesh.visible = false;
        }

        if (p > 0.65) {
          this.conditioningDartMesh.visible = true;
          this.conditioningDartMesh.position.x = -0.4 + p * 0.6;
        } else {
          this.conditioningDartMesh.visible = false;
        }
      }
    }

    // 3. Projectile in-flight rendering
    this.#updateProjectiles(projectilesData);
  }

  #updateProjectiles(projectilesData) {
    const liveIds = new Set();

    for (const proj of projectilesData) {
      liveIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);

      if (!mesh) {
        mesh = this.#createProjectileMesh(proj.subKind);
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }

      mesh.position.set(proj.position.x, proj.position.y, proj.position.z);

      // Align mesh along velocity vector
      const v = proj.velocity;
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 0.1) {
        const target = new THREE.Vector3(proj.position.x + v.x, proj.position.y + v.y, proj.position.z + v.z);
        mesh.lookAt(target);
      }
    }

    // Remove dead projectile meshes
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        mesh.traverse?.((obj) => obj.geometry?.dispose?.());
        this.projectileMeshes.delete(id);
      }
    }
  }

  #createProjectileMesh(subKind) {
    const group = new THREE.Group();
    group.name = `Projectile_${subKind}`;

    if (subKind === 'conditioning') {
      // Small fast glowing cyan enchanted dart
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
      // Giant heavy steel siege bolt
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.1, 8), this.materials.timberDark);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), this.materials.steel);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 1.3;
      group.add(tip);

      // Crimson flights
      for (let a = 0; a < 4; a++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.38), this.materials.boltFeather);
        fin.position.z = -0.85;
        fin.rotation.z = (a * Math.PI) / 2;
        group.add(fin);
      }
    }

    return group;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
    });
    for (const mesh of this.projectileMeshes.values()) {
      this.scene.remove(mesh);
      mesh.traverse?.((obj) => obj.geometry?.dispose?.());
    }
    this.projectileMeshes.clear();
    for (const mat of Object.values(this.materials)) {
      mat?.dispose?.();
    }
  }
}
