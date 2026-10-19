import * as THREE from 'three';
import { CLOTH_COLLIDERS, CLOTH_GRID_SPECS, clothNode, createClothGrid, impulseClothGrid, loadedBoneName, resetClothGrid, stepClothGrid } from './clothGrid.mjs';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _dir0 = new THREE.Vector3();
const _side = new THREE.Vector3();
const _side0 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _world = new THREE.Quaternion();

// a bone by its Blender name: the glTF loader drops a name's dots ('cape.C.1' arrives as 'capeC1')
function node(root, name) {
  return root.getObjectByName(loadedBoneName(name)) ?? root.getObjectByName(name) ?? null;
}

/** Whether a model carries cloth grids (the cape and tabard as columns of bones). */
export function hasClothGrids(root) {
  return Object.values(CLOTH_GRID_SPECS).some((spec) => node(root, `${spec.prefix}.${spec.columns[0]}.1`));
}

// The cape and tabard as cloth (clothGrid): read the cloth's drape and the body from the skeleton the mixer has just
// posed, step the cloth, then turn each cloth bone to point from its node to the next, keeping the cloth's width the
// way it faces. Same interface as SpellbladeClothRig (apply, land, gust, reset), for models with cloth grids.
export class ClothGridRig {
  constructor(root) {
    this.root = root;
    this.grids = [];
    for (const spec of Object.values(CLOTH_GRID_SPECS)) {
      const anchor = node(root, spec.anchor);
      const bones = spec.columns.map((column) => Array.from({ length: spec.rows }, (_, r) => node(root, `${spec.prefix}.${column}.${r + 1}`)));
      if (!anchor || bones.some((column) => column.some((bone) => !bone))) continue;
      const colliders = spec.colliders.map((name) => {
        const c = CLOTH_COLLIDERS[name];
        const from = node(root, c.from);
        const to = node(root, c.to);
        return from && to ? { from, to, radius: c.radius } : null;
      }).filter(Boolean);
      // the drape: each bone's own rest turn (the bind pose), and its length (the last bone's as the one above it)
      const bind = bones.map((column) => column.map((bone) => bone.quaternion.clone()));
      // (a bone's length is where its child sits; the last one's, the one above it: the rows are evenly spaced)
      const lengths = bones.map((column) => column.map((bone, r) => (column[r + 1] ? column[r + 1].position.length() : (r > 0 ? bone.position.length() : 0.25))));
      this.grids.push({ spec, anchor, bones, bind, lengths, colliders, sim: null, drape: null, drapeTurn: null });
    }
    this.enabled = this.grids.length > 0;
    this.wind = [0, 0, 0];
  }

  // the cloth on its drape this frame: every cloth bone back on its bind turn, read off in the world
  #drape(grid) {
    grid.bones.forEach((column, c) => column.forEach((bone, r) => bone.quaternion.copy(grid.bind[c][r])));
    grid.anchor.updateWorldMatrix(true, true);
    const targets = [];
    const turns = [];
    grid.bones.forEach((column, c) => {
      const nodes = [];
      const columnTurns = [];
      column.forEach((bone, r) => {
        nodes.push(bone.getWorldPosition(_v).toArray());
        columnTurns.push(bone.getWorldQuaternion(new THREE.Quaternion()));
        if (r === column.length - 1) nodes.push(bone.localToWorld(_v.set(0, grid.lengths[c][r], 0)).toArray());
      });
      targets.push(nodes);
      turns.push(columnTurns);
    });
    return { targets, turns };
  }

  #colliders(grid) {
    return grid.colliders.map(({ from, to, radius }) => ({ a: from.getWorldPosition(_a).toArray(), b: to.getWorldPosition(_b).toArray(), radius }));
  }

  // each cloth bone turned so it runs from its node to the next, and its width (the way to its neighbouring columns)
  // lies as the cloth's does there
  #write(grid, drape) {
    const columns = grid.bones.length;
    for (let r = 0; r < grid.spec.rows; r += 1) {
      grid.bones.forEach((column, c) => {
        const bone = column[r];
        _dir.fromArray(clothNode(grid.sim, c, r + 1)).sub(_a.fromArray(clothNode(grid.sim, c, r)));
        _dir0.fromArray(drape.targets[c][r + 1]).sub(_a.fromArray(drape.targets[c][r]));
        if (_dir.lengthSq() < 1e-10 || _dir0.lengthSq() < 1e-10) return;
        _dir.normalize(); _dir0.normalize();
        _q.setFromUnitVectors(_dir0, _dir);
        if (columns > 1) {
          const left = Math.max(0, c - 1);
          const right = Math.min(columns - 1, c + 1);
          _side.fromArray(clothNode(grid.sim, right, r)).sub(_a.fromArray(clothNode(grid.sim, left, r)));
          _side0.fromArray(drape.targets[right][r]).sub(_a.fromArray(drape.targets[left][r])).applyQuaternion(_q);
          _side.addScaledVector(_dir, -_side.dot(_dir));
          _side0.addScaledVector(_dir, -_side0.dot(_dir));
          if (_side.lengthSq() > 1e-10 && _side0.lengthSq() > 1e-10) {
            _side.normalize(); _side0.normalize();
            const angle = Math.atan2(_v.crossVectors(_side0, _side).dot(_dir), _side0.dot(_side));
            _twist.setFromAxisAngle(_dir, angle);
            _q.premultiply(_twist);
          }
        }
        _world.copy(_q).multiply(drape.turns[c][r]);
        bone.parent.getWorldQuaternion(_parent).invert();
        bone.quaternion.copy(_parent).multiply(_world);
        bone.updateWorldMatrix(false, false);
      });
    }
  }

  // Call right after the mixer (and the procedural layer) has written this frame's pose.
  apply(dt) {
    if (!this.enabled) return;
    this.root.updateWorldMatrix(true, false);
    const ground = this.root.getWorldPosition(_v).y + 0.02;
    for (const grid of this.grids) {
      const drape = this.#drape(grid);
      if (!grid.sim) grid.sim = createClothGrid(grid.spec, drape.targets);
      else if (dt > 0) stepClothGrid(grid.sim, dt, { targets: drape.targets, colliders: this.#colliders(grid), ground, wind: this.wind });
      else resetClothGrid(grid.sim, drape.targets);
      this.#write(grid, drape);
    }
    // (a gust passes)
    this.wind = this.wind.map((w) => w * Math.exp(-3 * Math.max(dt, 0)));
  }

  /** A landing (strength 0..1): the cloth, still falling, folds down and flips back out. */
  land(strength) {
    if (!this.enabled) return;
    for (const grid of this.grids) if (grid.sim) impulseClothGrid(grid.sim, [0, -2.2 * Math.max(0, Math.min(1, strength)), 0]);
  }

  /** A gust of wind across the knight ({ x, z } in the world, m/s): the cloth is flung the way it blows. */
  gust(wind) {
    if (!this.enabled || !wind) return;
    const push = [wind.x ?? 0, 0.15 * Math.hypot(wind.x ?? 0, wind.z ?? 0), wind.z ?? 0];
    for (const grid of this.grids) if (grid.sim) impulseClothGrid(grid.sim, push.map((w) => w * 0.6));
    this.wind = push;
  }

  reset() {
    for (const grid of this.grids) grid.sim = null;
    this.wind = [0, 0, 0];
  }
}
