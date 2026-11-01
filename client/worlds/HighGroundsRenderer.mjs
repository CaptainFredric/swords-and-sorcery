import * as THREE from 'three';
import { HIGH_GROUNDS } from '../../shared/worlds/highGrounds.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';
import { buildHighGroundsDecks, buildHighGroundsSurroundings, buildHighGroundsDetail, highGroundsSceneryMaterials } from './highGroundsScenery.mjs';

// Intentionally simple, instanced-friendly forms: a very large map should
// remain legible and run in the HTML5/mobile renderer without texture atlases.
export const HIGH_GROUNDS_LIGHTING = Object.freeze({
  cameraFar: 610,
  background: 0xb2cbd2,
  fog: Object.freeze({ color: 0xb2cbd2, density: 0.0017 }),
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
    // A constructed ballista must be rendered in High Grounds just as it is
    // in Castleward and Outerworks; authority still owns all simulation.
    this.biByeLlista = new BiByeLlistaRenderer(scene);
    this.biByeMotion = new BiByeMotion();
    this.biByeRoomCode = null;
    this.biByeServerTime = null;
    this.biByePresentationOptions = null;
    this.materials = {
      timber: mat(0x7a5740), stone: mat(0x9b9a83), iron: mat(0x444c50, .55),
      wood: mat(0x52372b), brass: mat(0xb3914d, .67),
      rose: mat(BLOOM_COLOR.rose), ivory: mat(BLOOM_COLOR.ivory), gold: mat(BLOOM_COLOR.gold),
      leaf: mat(0x718e60), azure: mat(TEAM_COLOR.ATTACKERS),
      crimson: mat(TEAM_COLOR.DEFENDERS), neutral: mat(0xcabf97),
      ...highGroundsSceneryMaterials(),
    };
    this.standards = new Map();
    this.#build();
    scene.add(this.group);
  }
  #build() {
    // Visibly contiguous upper world, using exactly one deck per region.
    // The original individual overlapping boxes flickered at both entrances.
    buildHighGroundsSurroundings(this.group, HIGH_GROUNDS, this.materials);
    buildHighGroundsDecks(this.group, HIGH_GROUNDS, this.materials);
    for (const s of HIGH_GROUNDS.solids) {
      if (s.id.startsWith('trunk-')) continue;
      mesh(this.group, new THREE.BoxGeometry(...s.size), this.materials[s.material] ?? this.materials.timber, s.center, true);
    }
    // Use literal server ramp endpoints instead of two independently rotated
    // overlapping rectangular boxes. No diagonal clipping at the landings.
    for (const ramp of HIGH_GROUNDS.ramps) {
      const zAxis = ramp.axis === 'z';
      const x0=ramp.minX,x1=ramp.maxX,z0=ramp.minZ,z1=ramp.maxZ;
      const start=ramp.startY+.015,end=ramp.endY+.015;
      const pts=zAxis
        ? [[x0,start,z0],[x1,start,z0],[x0,end,z1],[x1,end,z1]]
        : [[x0,start,z0],[x0,start,z1],[x1,end,z0],[x1,end,z1]];
      const corners=[pts[0],pts[2],pts[1],pts[1],pts[2],pts[3]];
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(corners.flat(),3));
      g.computeVertexNormals();
      const m=mesh(this.group,g,this.materials.timber,[0,0,0]);
      m.name='ramp-deck-'+ramp.id;
      m.material.side=THREE.DoubleSide;
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
    buildHighGroundsDetail(this.group, HIGH_GROUNDS, this.materials);
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
      const updated = owners.find(s => s.id === id);
      const owner = updated ? updated.owner : HIGH_GROUNDS.objectives.find(s => s.id === id)?.initialOwner;
      standard.material = this.materials[owner === 'ATTACKERS' ? 'azure' : owner === 'DEFENDERS' ? 'crimson' : 'neutral'];
    }
  }
  setBiByeState(snapshot, serverNow = snapshot?.serverTime, options = {}) {
    if (this.biByeRoomCode !== snapshot?.roomCode) {
      this.biByeRoomCode = snapshot?.roomCode;
      this.biByeMotion = new BiByeMotion();
    }
    if ((snapshot?.bibyeRevision ?? 0) < this.biByeMotion.revision) return;
    this.biByePresentationOptions = options;
    this.biByeMotion.push(snapshot?.bibyeBallista ?? null,
      snapshot?.bibyeProjectiles ?? [], snapshot?.serverTime ?? serverNow,
      snapshot?.bibyeRevision ?? 0);
    this.biByeServerTime = serverNow;
  }
  update(timeSec) {
    const view = this.biByeMotion.sample(this.biByeServerTime ?? timeSec,
      this.biByePresentationOptions?.local, this.biByePresentationOptions?.frozen);
    this.biByeLlista.update(view.clock, view.ballista, view.projectiles);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.biByeLlista.dispose();
    this.scene.remove(this.group);
    this.group.traverse(obj => { obj.geometry?.dispose?.(); });
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
