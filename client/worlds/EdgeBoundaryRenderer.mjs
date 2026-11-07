// Edge of Victory's visual language: a modest brass line in the stone,
// NOT a magic dome, damaging storm, collision object or new combat system.
import * as THREE from 'three';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { edgePresentedRadius } from '../../shared/src/edgeBoundary.mjs';

const SEGMENTS = 144, TAU = Math.PI * 2;
const MAX_VERTS = SEGMENTS * 8;
const BRASS = 0xbfa165;
const STONE_PLINTH = 0x6e685c;
const SPELL_COLOURS = Object.freeze({
  fireball: 0xce7138,
  frostfire: 0x8bcddf,
  steel: 0xc8c9c4,
  gale: 0x80c7ad,
});

const line = (opacity) => {
  const geometry = new THREE.BufferGeometry();
  const buffer = new Float32Array(MAX_VERTS * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity, depthWrite: false });
  const object = new THREE.LineSegments(geometry, material);
  object.renderOrder = 5;
  return object;
};

function drawGroundRing(object, world, center, radius, pattern) {
  const attr = object.geometry.getAttribute('position'), data = attr.array;
  let count = 0;
  if (!Number.isFinite(radius) || radius <= 0) { object.geometry.setDrawRange(0, 0); return; }

  // 1. Perimeter ring segments
  for (let i = 0; i < SEGMENTS; i++) {
    if (i % pattern.every >= pattern.on) continue;
    const a = TAU * i / SEGMENTS, b = TAU * (i + 1) / SEGMENTS;
    const ax = center.x + Math.cos(a) * radius, az = center.z + Math.sin(a) * radius;
    const bx = center.x + Math.cos(b) * radius, bz = center.z + Math.sin(b) * radius;
    const ay = surfaceHeightAt(ax, az, 100, world), by = surfaceHeightAt(bx, bz, 100, world);
    if (ay === null || by === null || Math.abs(ay - by) > 0.28) continue;
    if ((count + 1) * 2 > MAX_VERTS) break;
    const off = count * 6;
    data[off] = ax; data[off + 1] = ay + 0.045; data[off + 2] = az;
    data[off + 3] = bx; data[off + 4] = by + 0.045; data[off + 5] = bz;
    count++;

    // 2. Shimmering vertical ward staves rising from the boundary
    if (i % 6 === 0 && (count + 1) * 2 <= MAX_VERTS) {
      const staffOff = count * 6;
      data[staffOff] = ax; data[staffOff + 1] = ay + 0.045; data[staffOff + 2] = az;
      data[staffOff + 3] = ax; data[staffOff + 4] = ay + 0.58; data[staffOff + 5] = az;
      count++;
    }
  }

  // 3. Heraldic compass tick glyphs at 8 compass directions
  for (let k = 0; k < 8; k++) {
    if ((count + 1) * 2 > MAX_VERTS) break;
    const ca = (TAU * k) / 8;
    const rIn = radius - 0.35, rOut = radius + 0.35;
    const x0 = center.x + Math.cos(ca) * rIn, z0 = center.z + Math.sin(ca) * rIn;
    const x1 = center.x + Math.cos(ca) * rOut, z1 = center.z + Math.sin(ca) * rOut;
    const y0 = surfaceHeightAt(x0, z0, 100, world);
    const y1 = surfaceHeightAt(x1, z1, 100, world);
    if (y0 !== null && y1 !== null && Math.abs(y0 - y1) <= 0.3) {
      const tickOff = count * 6;
      data[tickOff] = x0; data[tickOff + 1] = y0 + 0.05; data[tickOff + 2] = z0;
      data[tickOff + 3] = x1; data[tickOff + 4] = y1 + 0.05; data[tickOff + 5] = z1;
      count++;
    }
  }

  attr.needsUpdate = true;
  object.geometry.setDrawRange(0, count * 2);
  object.geometry.computeBoundingSphere();
}

function makePickup(spell) {
  const group = new THREE.Group();
  const tint = SPELL_COLOURS[spell] ?? BRASS;
  const geometries = [], materials = [];

  // Ground plinth: stays visible as an arena landmark even after collection
  const plinth = new THREE.Group();
  group.add(plinth);

  const stoneMat = new THREE.MeshStandardMaterial({ color: STONE_PLINTH, roughness: 0.82, metalness: 0.1 });
  materials.push(stoneMat);

  const brassMat = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.72, roughness: 0.35 });
  materials.push(brassMat);

  const baseGeo = new THREE.CylinderGeometry(0.52, 0.58, 0.14, 8);
  geometries.push(baseGeo);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
  baseMesh.position.y = 0.07;
  baseMesh.receiveShadow = true;
  plinth.add(baseMesh);

  const shaftGeo = new THREE.BoxGeometry(0.54, 0.22, 0.54);
  geometries.push(shaftGeo);
  const shaftMesh = new THREE.Mesh(shaftGeo, stoneMat);
  shaftMesh.position.y = 0.25;
  shaftMesh.receiveShadow = true;
  plinth.add(shaftMesh);

  const capitalGeo = new THREE.BoxGeometry(0.64, 0.08, 0.64);
  geometries.push(capitalGeo);
  const capitalMesh = new THREE.Mesh(capitalGeo, brassMat);
  capitalMesh.position.y = 0.40;
  capitalMesh.receiveShadow = true;
  plinth.add(capitalMesh);

  const runeMat = new THREE.MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.45,
    metalness: 0.2, roughness: 0.4,
  });
  materials.push(runeMat);

  const runeDishGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12);
  geometries.push(runeDishGeo);
  const runeDish = new THREE.Mesh(runeDishGeo, runeMat);
  runeDish.position.y = 0.45;
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
    this.active=line(.69);
    this.next=line(.2);
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
    drawGroundRing(this.active,world,edge.center,radius,{every:4,on:3});
    const nextStage=edge.stages?.find(s=>s.second > serverNow-(edge.startedAt??serverNow)+.005);
    const nextRadius=nextStage?.radius??null;
    if(nextRadius!==null&&nextRadius<radius-.03)
      drawGroundRing(this.next,world,edge.center,nextRadius,{every:6,on:2});
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
