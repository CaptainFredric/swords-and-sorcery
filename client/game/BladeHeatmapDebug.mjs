// Development debug visualization tool for the continuous curved sword damage heatmap.
//
// In ordinary player gameplay, this tool is completely disabled with ZERO performance overhead.
// When toggled via:
//   - URL parameter `?debugHeatmap`
//   - F3 debug mode / `window.__ssRuntime.debugBladeHeatmap = true`
//
// Features:
//   1. Pre-builds and caches 3D cutting ribbons for all strikes (0: Forehand, 1: Backhand, 2: Chop/Slam).
//   2. Follows camera transforms directly via parent group positioning (ZERO geometry re-allocations per frame).
//   3. Renders the active cutting slice (blade line) distinctly from the entire potential strike heatmap.
//   4. Receives authoritative contact events, displaying the exact impact point and quality color.

import * as THREE from 'three';
import { BLADE, aimFrame, bladeDirection } from '../../shared/src/blade.mjs';
import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { STRIKE_HEATMAPS, qualityColor, sampleStrikeHeatmap } from '../../shared/src/bladeHeatmap.mjs';

export class BladeHeatmapDebug {
  constructor(scene, { enabled = false } = {}) {
    this.scene = scene;
    const queryEnabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugHeatmap');
    this.enabled = enabled || queryEnabled;
    this.currentStrike = 0;

    // Root group attached to scene
    this.group = new THREE.Group();
    this.group.name = 'BladeHeatmapDebug';
    this.group.visible = false;
    this.scene.add(this.group);

    // Camera-relative group for ribbons and active slice
    this.cameraGroup = new THREE.Group();
    this.group.add(this.cameraGroup);

    // Pre-build cached strike ribbons (0: Forehand, 1: Backhand, 2: Chop)
    this.strikeMeshes = [];
    this.strikeWires = [];
    this.stepsDt = 24;
    this.stepsReach = 6;

    for (let s = 0; s < 3; s += 1) {
      const { mesh, wire } = this.#createStrikeRibbon(s);
      mesh.visible = s === 0;
      wire.visible = s === 0;
      this.cameraGroup.add(mesh);
      this.cameraGroup.add(wire);
      this.strikeMeshes.push(mesh);
      this.strikeWires.push(wire);
    }

    // Active cutting slice indicator (highlights current blade position during swing)
    const sliceGeo = new THREE.BufferGeometry();
    const slicePos = new Float32Array([0, 0, -BLADE.from, 0, 0, -BLADE.to]);
    sliceGeo.setAttribute('position', new THREE.BufferAttribute(slicePos, 3));
    this.sliceMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.activeSliceLine = new THREE.Line(sliceGeo, this.sliceMaterial);
    this.activeSliceLine.visible = false;
    this.cameraGroup.add(this.activeSliceLine);

    // Authoritative contact point indicator (world space)
    const markerGeo = new THREE.SphereGeometry(0.08, 12, 12);
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.markerMesh = new THREE.Mesh(markerGeo, this.markerMaterial);
    this.markerMesh.visible = false;
    this.group.add(this.markerMesh);

    this.lastContact = null;
  }

  /**
   * Pre-build static ribbon mesh and wireframe in camera-local space for a given strike.
   */
  #createStrikeRibbon(strikeIndex) {
    const grid = sampleStrikeHeatmap(strikeIndex, {
      stepsDt: this.stepsDt,
      stepsReach: this.stepsReach,
      eye: { x: 0, y: 0, z: 0 },
      frame: aimFrame(0, 0),
      blade: BLADE,
      contact: MELEE_CONTACT,
    });

    const positions = [];
    const colors = [];
    const indices = [];

    for (let i = 0; i < grid.length; i += 1) {
      for (let j = 0; j < grid[i].length; j += 1) {
        const cell = grid[i][j];
        positions.push(cell.point.x, cell.point.y, cell.point.z);
        colors.push(cell.color.r, cell.color.g, cell.color.b);
      }
    }

    const cols = this.stepsReach + 1;
    for (let i = 0; i < this.stepsDt; i += 1) {
      for (let j = 0; j < this.stepsReach; j += 1) {
        const a = i * cols + j;
        const b = (i + 1) * cols + j;
        const c = (i + 1) * cols + (j + 1);
        const d = i * cols + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ribbonGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    ribbonGeo.setIndex(indices);
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ribbonGeo, ribbonMat);

    // Outlines
    const wirePositions = [];
    const wireColors = [];
    for (let i = 0; i < this.stepsDt; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        const p1 = grid[i][j];
        const p2 = grid[i + 1][j];
        wirePositions.push(p1.point.x, p1.point.y, p1.point.z, p2.point.x, p2.point.y, p2.point.z);
        wireColors.push(p1.color.r, p1.color.g, p1.color.b, p2.color.r, p2.color.g, p2.color.b);
      }
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
    wireGeo.setAttribute('color', new THREE.Float32BufferAttribute(wireColors, 3));
    const wireMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);

    return { mesh, wire };
  }

  /**
   * Record authoritative contact information from server swordHit event.
   */
  recordContact({ point, quality = 1, damage = 0, strike = 0, at = performance.now() } = {}) {
    if (!point) return;
    this.lastContact = { point, quality, damage, strike, at };
  }

  /**
   * Update the debug visualizer frame.
   *
   * @param {object} params
   * @param {THREE.Camera} params.camera Active camera
   * @param {number} [params.strikeIndex] Current strike index (0..2)
   * @param {boolean} [params.isSwinging] Whether the sword is in active swing
   * @param {boolean} [params.debugVisible] Global debug flag from InputController / F3
   * @param {number} [params.nowSec] Current presentation time in seconds
   * @param {number} [params.attackStartedAt] Timestamp when current attack chain began
   */
  update({
    camera,
    strikeIndex = 0,
    isSwinging = false,
    debugVisible = false,
    nowSec = 0,
    attackStartedAt = 0,
  } = {}) {
    const isVisible = this.enabled
      || debugVisible
      || Boolean(globalThis.__ssRuntime?.debugBladeHeatmap);

    if (!isVisible) {
      if (this.group.visible) this.group.visible = false;
      return;
    }

    this.group.visible = true;
    if (!camera) return;

    // Follow camera transform without rebuilding geometries
    this.cameraGroup.position.copy(camera.position);
    this.cameraGroup.quaternion.copy(camera.quaternion);

    // Switch active strike ribbon visibility
    const strike = Math.max(0, Math.min(2, Math.floor(strikeIndex)));
    if (strike !== this.currentStrike) {
      this.currentStrike = strike;
      for (let s = 0; s < 3; s += 1) {
        const active = s === strike;
        this.strikeMeshes[s].visible = active;
        this.strikeWires[s].visible = active;
      }
    }

    // Active cutting slice presentation
    if (isSwinging && Number.isFinite(nowSec) && Number.isFinite(attackStartedAt) && attackStartedAt > 0) {
      const contactTime = attackStartedAt + (SWORD_STRIKE_TIMES[strike] ?? 0.4);
      const dt = nowSec - contactTime;
      const localFrame = aimFrame(0, 0);
      const dir = bladeDirection(strike, dt, localFrame);
      const pStart = { x: dir.x * BLADE.from, y: dir.y * BLADE.from, z: dir.z * BLADE.from };
      const pEnd = { x: dir.x * BLADE.to, y: dir.y * BLADE.to, z: dir.z * BLADE.to };

      const posAttr = this.activeSliceLine.geometry.attributes.position;
      posAttr.setXYZ(0, pStart.x, pStart.y, pStart.z);
      posAttr.setXYZ(1, pEnd.x, pEnd.y, pEnd.z);
      posAttr.needsUpdate = true;
      this.activeSliceLine.visible = true;
    } else {
      this.activeSliceLine.visible = false;
    }

    // Authoritative contact marker update
    const nowMs = performance.now();
    if (this.lastContact && nowMs - this.lastContact.at < 2000) {
      const p = this.lastContact.point;
      this.markerMesh.position.set(p.x, p.y, p.z);
      const col = qualityColor(this.lastContact.quality);
      this.markerMaterial.color.setRGB(col.r, col.g, col.b);
      this.markerMesh.visible = true;
    } else {
      this.markerMesh.visible = false;
    }
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const mesh of this.strikeMeshes) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    for (const wire of this.strikeWires) {
      wire.geometry?.dispose();
      wire.material?.dispose();
    }
    this.activeSliceLine.geometry?.dispose();
    this.sliceMaterial?.dispose();
    this.markerMesh.geometry?.dispose();
    this.markerMaterial?.dispose();
  }
}
