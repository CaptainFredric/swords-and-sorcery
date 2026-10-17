// Development debug visualization tool for the continuous curved sword damage heatmap.
//
// In ordinary player gameplay, this tool is completely disabled with ZERO performance overhead.
// When toggled via:
//   - URL parameter `?debugHeatmap`
//   - F3 debug mode / `window.__ssRuntime.debugBladeHeatmap = true`
//
// It renders the 3D cutting ribbon of the active sword strike in the player's view frame,
// with vertices colored continuously from Cool Blue (marginal) -> Green (ordinary) ->
// Yellow (solid) -> Orange (strong) -> Red (peak sweet spot).
// It also renders the contact point and quality breakdown if a contact occurred.

import * as THREE from 'three';
import { BLADE, aimFrame, bladeDirection } from '../../shared/src/blade.mjs';
import { MELEE_CONTACT } from '../../shared/src/combat.mjs';
import { STRIKE_HEATMAPS, evaluateBladeHeatmap, qualityColor, sampleStrikeHeatmap } from '../../shared/src/bladeHeatmap.mjs';

export class BladeHeatmapDebug {
  constructor(scene, { enabled = false } = {}) {
    this.scene = scene;
    const queryEnabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugHeatmap');
    this.enabled = enabled || queryEnabled;
    this.currentStrike = 0;
    this.group = new THREE.Group();
    this.group.name = 'BladeHeatmapDebug';
    this.group.visible = false;
    this.scene.add(this.group);

    // Ribbon grid geometry
    this.stepsDt = 20;
    this.stepsReach = 6;
    this.ribbonGeometry = new THREE.BufferGeometry();
    this.ribbonMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      wireframe: false,
    });
    this.ribbonMesh = new THREE.Mesh(this.ribbonGeometry, this.ribbonMaterial);
    this.group.add(this.ribbonMesh);

    // Wireframe overlay for cutting slice outlines
    this.wireGeometry = new THREE.BufferGeometry();
    this.wireMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    this.wireLines = new THREE.LineSegments(this.wireGeometry, this.wireMaterial);
    this.group.add(this.wireLines);

    // Contact point indicator
    const markerGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.markerMesh = new THREE.Mesh(markerGeo, markerMat);
    this.markerMesh.visible = false;
    this.group.add(this.markerMesh);

    this.lastBuiltStrike = -1;
    this.lastBuiltYaw = null;
    this.lastBuiltPitch = null;
  }

  /**
   * Update the debug visualizer frame.
   *
   * @param {object} params
   * @param {THREE.Camera} params.camera Active camera
   * @param {number} [params.strikeIndex] Current strike index (0..2)
   * @param {boolean} [params.debugVisible] Global debug flag from InputController / F3
   * @param {object} [params.lastContact] Latest contact info { point, quality, damage }
   */
  update({
    camera,
    strikeIndex = 0,
    debugVisible = false,
    lastContact = null,
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

    // Rebuild ribbon geometry when strike or view changes significantly
    this.#updateRibbonGeometry(strikeIndex, camera);

    // Update contact marker
    if (lastContact?.point) {
      this.markerMesh.position.set(lastContact.point.x, lastContact.point.y, lastContact.point.z);
      const col = qualityColor(lastContact.quality ?? 0);
      this.markerMesh.material.color.setRGB(col.r, col.g, col.b);
      this.markerMesh.visible = true;
    } else {
      this.markerMesh.visible = false;
    }
  }

  #updateRibbonGeometry(strikeIndex, camera) {
    const eye = camera.position;
    // Extract camera yaw and pitch
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));

    const frame = aimFrame(yaw, pitch);
    const grid = sampleStrikeHeatmap(strikeIndex, {
      stepsDt: this.stepsDt,
      stepsReach: this.stepsReach,
      eye: { x: eye.x, y: eye.y, z: eye.z },
      frame,
      blade: BLADE,
      contact: MELEE_CONTACT,
    });

    const positions = [];
    const colors = [];
    const indices = [];

    // Build triangular ribbon strip mesh
    let vertexCount = 0;
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

        // Two triangles per quad
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    this.ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.ribbonGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.ribbonGeometry.setIndex(indices);
    this.ribbonGeometry.computeVertexNormals();

    // Wireframe segment lines for slice inspection
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
    this.wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
    this.wireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(wireColors, 3));
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.ribbonGeometry.dispose();
    this.ribbonMaterial.dispose();
    this.wireGeometry.dispose();
    this.wireMaterial.dispose();
    this.markerMesh.geometry.dispose();
    this.markerMesh.material.dispose();
  }
}
