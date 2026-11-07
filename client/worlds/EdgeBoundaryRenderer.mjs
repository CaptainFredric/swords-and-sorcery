// Edge of Victory's visual language: a modest brass line in the stone,
// NOT a magic dome, damaging storm, collision object or new combat system.
import * as THREE from 'three';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { edgePresentedRadius } from '../../shared/src/edgeBoundary.mjs';

const SEGMENTS = 144, TAU = Math.PI * 2;
const BRASS = 0xbfa165;
const SPELL_COLOURS = Object.freeze({
  fireball:0xce7138, frostfire:0x8bcddf, steel:0xc8c9c4, gale:0x80c7ad,
});
const line = (opacity) => {
  const geometry = new THREE.BufferGeometry();
  const buffer = new Float32Array(SEGMENTS * 6);
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material = new THREE.LineBasicMaterial({color:BRASS,transparent:true,opacity,depthWrite:false});
  const object = new THREE.LineSegments(geometry,material);
  object.renderOrder=5;
  return object;
};

function drawGroundRing(object,world,center,radius,pattern) {
  const attr=object.geometry.getAttribute('position'),data=attr.array;
  let count=0;
  if(!Number.isFinite(radius)||radius<=0){object.geometry.setDrawRange(0,0);return;}
  for(let i=0;i<SEGMENTS;i++){
    if(i%pattern.every>=pattern.on)continue;
    const a=TAU*i/SEGMENTS,b=TAU*(i+1)/SEGMENTS;
    const ax=center.x+Math.cos(a)*radius,az=center.z+Math.sin(a)*radius;
    const bx=center.x+Math.cos(b)*radius,bz=center.z+Math.sin(b)*radius;
    const ay=surfaceHeightAt(ax,az,100,world),by=surfaceHeightAt(bx,bz,100,world);
    // Floors on opposite sides of the keep's gallery or a cliff are not
    // connected by an imaginary suspended ring.
    if(ay===null||by===null||Math.abs(ay-by)>.28)continue;
    const off=count*6;
    data[off]=ax;data[off+1]=ay+.045;data[off+2]=az;
    data[off+3]=bx;data[off+4]=by+.045;data[off+5]=bz;
    count++;
  }
  attr.needsUpdate=true;
  object.geometry.setDrawRange(0,count*2);
  object.geometry.computeBoundingSphere();
}

function makePickup(spell) {
  const group=new THREE.Group();
  const tint=SPELL_COLOURS[spell]??BRASS;
  const metal=new THREE.MeshStandardMaterial({color:BRASS,metalness:.65,roughness:.38,
    emissive:BRASS,emissiveIntensity:.13,transparent:true,opacity:.85});
  const gem=new THREE.MeshStandardMaterial({color:tint,emissive:tint,emissiveIntensity:.45,
    metalness:.12,roughness:.34,transparent:true,opacity:.88});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.33,.026,5,26),metal);
  ring.rotation.x=Math.PI/2;
  group.add(ring);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),gem);
  group.add(core);
  // Four tiny compass-tick rivets: heraldic equipment, rather than loot crates.
  const tickGeometry=new THREE.BoxGeometry(.075,.025,.04);
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*3/2]){
    const tick=new THREE.Mesh(tickGeometry,metal);
    tick.position.set(Math.cos(a)*.48,0,Math.sin(a)*.48);
    tick.rotation.y=-a;
    group.add(tick);
  }
  group.userData.materials=[metal,gem];
  group.userData.geometries=[ring.geometry,core.geometry,tickGeometry];
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
    for(const pickup of edge.pickups??[]) {
      seen.add(pickup.id);
      let view=this.pickups.get(pickup.id);
      if(!view){
        view=makePickup(pickup.spell);
        this.pickups.set(pickup.id,view);
        this.group.add(view);
      }
      view.visible=Boolean(pickup.available);
      if(!view.visible)continue;
      view.position.set(pickup.position.x,pickup.position.y+1.0+
        Math.sin(serverNow*2+this.pickups.size)*.075,pickup.position.z);
      view.rotation.y=serverNow*.55;
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
