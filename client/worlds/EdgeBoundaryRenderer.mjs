// Edge of Victory's visual language: a modest brass line in the stone,
// NOT a magic dome, damaging storm, collision object or new combat system.
import * as THREE from 'three';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { edgePresentedRadius } from '../../shared/src/edgeBoundary.mjs';

const SEGMENTS = 160, TAU = Math.PI * 2;
// a ribbon of two triangles per segment, and eight heraldic shields of six triangles each (plus their charge)
const MAX_TRIS = SEGMENTS * 2 + 8 * 12;
const BRASS = 0xbfa165;
const STONE_PLINTH = 0x6e685c;
const SPELL_COLOURS = Object.freeze({
  fireball: 0xce7138,
  frostfire: 0x8bcddf,
  steel: 0xc8c9c4,
  gale: 0x80c7ad,
});

// The boundary is inlaid in the ground: a flat brass band that follows the floor (a hand's breadth wide, never
// raised, never solid) with a heraldic shield at each of the eight compass points, its point toward the centre.
// The coming stage's line is a fainter, broken band. Seen from a knight's eye it reads as metalwork in the paving,
// not as light or a wall.
const ribbon = (opacity, color = BRASS) => {
  const geometry = new THREE.BufferGeometry();
  const buffer = new Float32Array(MAX_TRIS * 9);
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const object = new THREE.Mesh(geometry, material);
  object.renderOrder = 5;
  object.frustumCulled = false;
  return object;
};

function drawGroundRing(object, world, center, radius, pattern) {
  const attr = object.geometry.getAttribute('position'), data = attr.array;
  let tris = 0;
  const tri = (a, b, c) => {
    if (tris >= MAX_TRIS) return;
    data.set(a, tris * 9); data.set(b, tris * 9 + 3); data.set(c, tris * 9 + 6);
    tris++;
  };
  if (!Number.isFinite(radius) || radius <= 0) { object.geometry.setDrawRange(0, 0); return; }
  const half = pattern.width / 2;
  const lift = 0.03;
  const ground = (x, z) => surfaceHeightAt(x, z, 100, world);

  // 1. The band: each segment a quad on the ground, left out where the floor steps (a stair, a heap, a wall's foot)
  for (let i = 0; i < SEGMENTS; i++) {
    if (i % pattern.every >= pattern.on) continue;
    const a = TAU * i / SEGMENTS, b = TAU * (i + 1) / SEGMENTS;
    const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
    const ay = ground(center.x + ca * radius, center.z + sa * radius);
    const by = ground(center.x + cb * radius, center.z + sb * radius);
    if (ay === null || by === null || Math.abs(ay - by) > 0.28) continue;
    const p = (c, s, r, y) => [center.x + c * r, y + lift, center.z + s * r];
    const ai = p(ca, sa, radius - half, ay), ao = p(ca, sa, radius + half, ay);
    const bi = p(cb, sb, radius - half, by), bo = p(cb, sb, radius + half, by);
    tri(ai, ao, bo); tri(ai, bo, bi);
  }

  // 2. A heraldic shield at each compass point, just inside the band: a heater shield's outline with a chevron
  if (pattern.shields) {
    for (let k = 0; k < 8; k++) {
      const angle = (TAU * k) / 8;
      const c = Math.cos(angle), sn = Math.sin(angle);
      const r0 = radius - half - 0.12;
      const y = ground(center.x + c * (r0 - 0.35), center.z + sn * (r0 - 0.35));
      const yOut = ground(center.x + c * r0, center.z + sn * r0);
      if (y === null || yOut === null || Math.abs(y - yOut) > 0.2) continue;
      // local frame: u along the ring (tangent), v toward the centre
      const at = (u, v) => [center.x + c * (r0 - v) - sn * u, y + lift + 0.002, center.z + sn * (r0 - v) + c * u];
      const w = 0.3, h = 0.62;
      const top = [at(-w, 0), at(w, 0)];
      const mid = [at(-w, h * 0.45), at(w, h * 0.45)];
      const point = at(0, h);
      tri(top[0], top[1], mid[1]); tri(top[0], mid[1], mid[0]);
      tri(mid[0], mid[1], point);
      // its chevron, a hair above (drawn in the same brass: the shield reads by its outline against the stone)
      const cw = w * 0.7;
      tri(at(-cw, h * 0.28), at(0, h * 0.12), at(0, h * 0.2));
      tri(at(cw, h * 0.28), at(0, h * 0.2), at(0, h * 0.12));
    }
  }

  attr.needsUpdate = true;
  object.geometry.setDrawRange(0, tris * 3);
}

function makePickup(spell) {
  const group = new THREE.Group();
  const tint = SPELL_COLOURS[spell] ?? BRASS;
  const geometries = [], materials = [];

  // Ground plinth: low floor ornament (total height 0.18m) so it never obstructs combat motion or spells
  const plinth = new THREE.Group();
  group.add(plinth);

  const stoneMat = new THREE.MeshStandardMaterial({ color: STONE_PLINTH, roughness: 0.82, metalness: 0.1 });
  materials.push(stoneMat);

  const brassMat = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.72, roughness: 0.35 });
  materials.push(brassMat);

  const baseGeo = new THREE.CylinderGeometry(0.52, 0.58, 0.10, 8);
  geometries.push(baseGeo);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
  baseMesh.position.y = 0.05;
  baseMesh.receiveShadow = true;
  plinth.add(baseMesh);

  const capitalGeo = new THREE.BoxGeometry(0.60, 0.04, 0.60);
  geometries.push(capitalGeo);
  const capitalMesh = new THREE.Mesh(capitalGeo, brassMat);
  capitalMesh.position.y = 0.12;
  capitalMesh.receiveShadow = true;
  plinth.add(capitalMesh);

  const runeMat = new THREE.MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.45,
    metalness: 0.2, roughness: 0.4,
  });
  materials.push(runeMat);

  const runeDishGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12);
  geometries.push(runeDishGeo);
  const runeDish = new THREE.Mesh(runeDishGeo, runeMat);
  runeDish.position.y = 0.15;
  plinth.add(runeDish);

  // Floating spell orb: consumed on collection
  const orb = new THREE.Group();
  group.add(orb);

  const gemMat = new THREE.MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.65,
    metalness: 0.15, roughness: 0.25, transparent: true, opacity: 0.92,
  });
  materials.push(gemMat);

  const ringGeo = new THREE.TorusGeometry(0.33, 0.026, 6, 28);
  geometries.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, brassMat);
  ring.rotation.x = Math.PI / 2;
  orb.add(ring);

  const coreGeo = new THREE.OctahedronGeometry(0.22, 0);
  geometries.push(coreGeo);
  const core = new THREE.Mesh(coreGeo, gemMat);
  orb.add(core);

  const tickGeo = new THREE.BoxGeometry(0.075, 0.025, 0.04);
  geometries.push(tickGeo);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    const tick = new THREE.Mesh(tickGeo, brassMat);
    tick.position.set(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48);
    tick.rotation.y = -a;
    orb.add(tick);
  }

  group.userData.plinth = plinth;
  group.userData.orb = orb;
  group.userData.runeMat = runeMat;
  group.userData.tint = tint;
  group.userData.materials = materials;
  group.userData.geometries = geometries;
  return group;
}

export class EdgeBoundaryRenderer {
  constructor(scene) {
    this.scene=scene;
    this.group=new THREE.Group();
    this.active=ribbon(.82);
    this.next=ribbon(.3);
    this.group.add(this.active,this.next);
    this.pickups=new Map();
    this.scene.add(this.group);
    this.group.visible=false;
  }
  update(edge,world,serverNow,receivedAt=serverNow) {
    const active=Boolean(edge?.center&&world);
    this.group.visible=active;
    if(!active)return;
    const radius=edgePresentedRadius(edge,serverNow,receivedAt);
    drawGroundRing(this.active,world,edge.center,radius,{every:1,on:1,width:.16,shields:true});
    const nextStage=edge.stages?.find(s=>s.second > serverNow-(edge.startedAt??serverNow)+.005);
    const nextRadius=nextStage?.radius??null;
    if(nextRadius!==null&&nextRadius<radius-.03)
      drawGroundRing(this.next,world,edge.center,nextRadius,{every:5,on:2,width:.08,shields:false});
    else this.next.geometry.setDrawRange(0,0);
    const seen=new Set();
    for (const pickup of edge.pickups ?? []) {
      seen.add(pickup.id);
      let view = this.pickups.get(pickup.id);
      if (!view) {
        view = makePickup(pickup.spell);
        this.pickups.set(pickup.id, view);
        this.group.add(view);
      }
      view.visible = true;
      const { plinth, orb, runeMat } = view.userData;
      if (plinth) plinth.position.set(pickup.position.x, pickup.position.y, pickup.position.z);
      const available = Boolean(pickup.available);
      if (orb) {
        orb.visible = available;
        if (available) {
          orb.position.set(
            pickup.position.x,
            pickup.position.y + 0.95 + Math.sin(serverNow * 2 + this.pickups.size) * 0.075,
            pickup.position.z,
          );
          orb.rotation.y = serverNow * 0.55;
        }
      }
      if (runeMat) {
        runeMat.emissiveIntensity = available ? 0.45 : 0.05;
      }
    }
    for(const [id,obj] of this.pickups)if(!seen.has(id)){
      this.group.remove(obj);
      for(const g of obj.userData.geometries??[])g.dispose();
      for(const m of obj.userData.materials??[])m.dispose();
      this.pickups.delete(id);
    }
  }
  dispose(){
    this.scene.remove(this.group);
    for(const object of [this.active,this.next]){object.geometry.dispose();object.material.dispose();}
    for(const view of this.pickups.values()){
      for(const g of view.userData.geometries??[])g.dispose();
      for(const m of view.userData.materials??[])m.dispose();
    }
    this.pickups.clear();
  }
}
