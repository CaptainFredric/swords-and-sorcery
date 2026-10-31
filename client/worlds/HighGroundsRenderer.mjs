import * as THREE from 'three';
import { HIGH_GROUNDS } from '../../shared/worlds/highGrounds.mjs';

// Intentionally simple, instanced-friendly forms: a very large map should
// remain legible and run in the HTML5/mobile renderer without texture atlases.
export const HIGH_GROUNDS_LIGHTING = Object.freeze({
  background: 0x9ebac2,
  fog: Object.freeze({ color: 0x9ebac2, density: 0.0035 }),
  hemisphere: Object.freeze({ skyColor: 0xedf2e7, groundColor: 0x566755, intensity: 2.1 }),
  sun: Object.freeze({ color: 0xffdf9c, intensity: 2.35, position: Object.freeze([-65, 86, -40]) }),
});
function mesh(parent, geometry, material, position, shadows = false) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.castShadow = shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function mat(color, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: .87, metalness });
}
const TEAM_COLOR = Object.freeze({ ATTACKERS: 0x3673ba, DEFENDERS: 0xa63e37 });
const BLOOM_COLOR = Object.freeze({ rose: 0xd994ad, ivory: 0xf2e0b9, gold: 0xf6bf7c });
export class HighGroundsRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'The High Grounds';
    this.lighting = HIGH_GROUNDS_LIGHTING;
    this.disposed = false;
    this.materials = {
      timber: mat(0x7a5740), stone: mat(0x9b9a83), iron: mat(0x444c50, .55),
      wood: mat(0x52372b), brass: mat(0xb3914d, .67),
      rose: mat(BLOOM_COLOR.rose), ivory: mat(BLOOM_COLOR.ivory), gold: mat(BLOOM_COLOR.gold),
      leaf: mat(0x718e60), azure: mat(TEAM_COLOR.ATTACKERS),
      crimson: mat(TEAM_COLOR.DEFENDERS), neutral: mat(0xcabf97),
    };
    this.standards = new Map();
    this.#build();
    scene.add(this.group);
  }
  #build() {
    for (const fl of HIGH_GROUNDS.floors) {
      const material = this.materials[fl.material] ?? this.materials.timber;
      mesh(this.group, new THREE.BoxGeometry(...fl.size), material, fl.center);
      // Sparse ribs visually communicate suspended platforms, but the playable
      // surface remains exactly the authoritative shared floor geometry.
      if (fl.size[0] > 16 || fl.size[2] > 20) {
        const alongZ = fl.size[2] >= fl.size[0];
        const beam = alongZ ? [fl.size[0], .35, .48] : [.48, .35, fl.size[2]];
        for (const side of [-1, 1]) {
          const p = [...fl.center];
          p[1] -= .35;
          p[alongZ ? 2 : 0] += side * (fl.size[alongZ ? 2 : 0] / 2 - .24);
          mesh(this.group, new THREE.BoxGeometry(...beam), this.materials.wood, p);
        }
      }
    }
    for (const s of HIGH_GROUNDS.solids) {
      if (s.id.startsWith('trunk-')) continue;
      mesh(this.group, new THREE.BoxGeometry(...s.size), this.materials[s.material] ?? this.materials.timber, s.center, true);
    }
    for (const ramp of HIGH_GROUNDS.ramps) {
      const zAxis = ramp.axis === 'z';
      const run = zAxis ? ramp.maxZ - ramp.minZ : ramp.maxX - ramp.minX;
      const rise = ramp.endY - ramp.startY;
      const width = zAxis ? ramp.maxX - ramp.minX : ramp.maxZ - ramp.minZ;
      const g = new THREE.BoxGeometry(width, .4, Math.hypot(run, rise));
      const p = [(ramp.minX + ramp.maxX) / 2, (ramp.startY + ramp.endY) / 2 - .2,
        (ramp.minZ + ramp.maxZ) / 2];
      const m = mesh(this.group, g, this.materials.timber, p);
      if (zAxis) m.rotation.x = -Math.atan2(rise, run);
      else { m.rotation.y = Math.PI / 2; m.rotation.x = -Math.atan2(rise, run); }
    }
    // Massive tree silhouettes with angular bloom canopies. Individual petals
    // are low-poly billboards, never full alpha-blended particle fields.
    for (const tree of HIGH_GROUNDS.trees) {
      const bark = mesh(this.group,
        new THREE.CylinderGeometry(tree.radius * .57, tree.radius * .78, tree.height, 8),
        this.materials.wood, [tree.x, tree.height / 2 - 1, tree.z], true);
      bark.rotation.y = .18;
      const bloom = this.materials[tree.bloom] ?? this.materials.rose;
      const crownY = tree.height - 5;
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        const outer = (i % 2 ? 1 : .72) * tree.radius * 1.55;
        const x = tree.x + Math.cos(a) * outer;
        const z = tree.z + Math.sin(a) * outer;
        const y = crownY + (i % 3 - 1) * 2.3;
        mesh(this.group, new THREE.IcosahedronGeometry(tree.radius * .91, 0), bloom, [x, y, z]);
      }
      mesh(this.group, new THREE.IcosahedronGeometry(tree.radius * 1.05, 0),
        this.materials.leaf, [tree.x, crownY - 3.7, tree.z]);
    }
    // Three-dimensional standards on *all five* independent capture sites.
    for (const obj of HIGH_GROUNDS.objectives) {
      const parent = new THREE.Group();
      parent.name = 'capture-' + obj.id;
      parent.position.set(obj.x, obj.y, obj.z);
      this.group.add(parent);
      mesh(parent, new THREE.CylinderGeometry(.12, .17, 4.2, 7),
        this.materials.brass, [0, 2.1, 0]);
      const standard = mesh(parent, new THREE.BoxGeometry(2.2, 1.35, .11),
        this.materials.neutral, [1.12, 3.28, 0]);
      this.standards.set(obj.id, standard);
      // Ground brass ring: decorative; authoritative capture uses the shared
      // objective radius and vertical slab, not this geometry.
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(obj.radius - .5, .13, 5, 32),
        this.materials.brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .12;
      parent.add(ring);
    }
    // Buildings at both foundries stay *off* the operators' machine pads.
    for (const foundry of HIGH_GROUNDS.siegeFoundries) {
      const tone = foundry.team === 'ATTACKERS' ? this.materials.azure : this.materials.crimson;
      mesh(this.group, new THREE.CylinderGeometry(1.6, 2, .32, 8),
        this.materials.brass, [foundry.x, .16, foundry.z]);
      for (const dx of [-1.4, 1.4]) {
        mesh(this.group, new THREE.BoxGeometry(.2, 3.2, .2),
          this.materials.wood, [foundry.x + dx, 1.6, foundry.z - 3]);
      }
      mesh(this.group, new THREE.BoxGeometry(3.3, .7, .4), tone,
        [foundry.x, 3.1, foundry.z - 3]);
    }
  }
  setHighGroundsState(state) {
    const owners = state?.sites ?? [];
    for (const [id, standard] of this.standards) {
      const owner = owners.find(s => s.id === id)?.owner ?? HIGH_GROUNDS.objectives.find(s => s.id === id)?.initialOwner;
      standard.material = this.materials[owner === 'ATTACKERS' ? 'azure' : owner === 'DEFENDERS' ? 'crimson' : 'neutral'];
    }
  }
  update() {}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    this.group.traverse(obj => { obj.geometry?.dispose?.(); });
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
