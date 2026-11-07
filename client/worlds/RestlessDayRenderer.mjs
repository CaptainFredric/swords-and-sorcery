import * as THREE from 'three';
import { RESTLESS_DAY_WORLD } from '../../shared/worlds/restlessDay.mjs';

// Procedural placeholder only. Argon's verified Renowner GLB can replace the
// torso rig without changing server hitboxes, pedestal, or animation events.
export const RESTLESS_DAY_LIGHTING=Object.freeze({
 cameraFar:310,background:0xb8d0df,
 fog:Object.freeze({color:0xb8d0df,density:.0017}),
 hemisphere:Object.freeze({skyColor:0xeaf1e7,groundColor:0x5d615d,intensity:1.75}),
 sun:Object.freeze({color:0xffd795,intensity:2.25,position:[-55,70,-25]}),
});
const palette=Object.freeze({stone:0xb9b3a3,timber:0x755644,iron:0x464e55,brass:0xb68e49,canvas:0xd7c5a0});
const material=(color,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness});
function box(parent,dimensions,where,mat){
 const m=new THREE.Mesh(new THREE.BoxGeometry(...dimensions),mat);m.position.set(...where);
 m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function pipe(parent,from,to,radius,mat){
 const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
 const v=new THREE.Vector3().subVectors(b,a);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,v.length(),7),mat);
 mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
 mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function rampMesh(parent,ramp,mat){
 const x0=ramp.minX,x1=ramp.maxX,z0=ramp.minZ,z1=ramp.maxZ;
 const y0=ramp.startY+.025,y1=ramp.endY+.025;
 const p=ramp.axis==='z'
  ?[[x0,y0,z0],[x1,y0,z0],[x0,y1,z1],[x1,y1,z1]]
  :[[x0,y0,z0],[x0,y0,z1],[x1,y1,z0],[x1,y1,z1]];
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([p[0],p[2],p[1],p[1],p[2],p[3]].flat(),3));
 g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,mat);mesh.material.side=THREE.DoubleSide;
 mesh.receiveShadow=true;parent.add(mesh);
}
export class RestlessDayRenderer{
 constructor(scene){
  this.scene=scene;this.lighting=RESTLESS_DAY_LIGHTING;
  this.group=new THREE.Group();this.group.name='Restless Day — Two Curtains';
  this.materials={
   stone:material(palette.stone),timber:material(palette.timber),
   iron:material(palette.iron,.72),brass:material(palette.brass,.64),
   canvas:material(palette.canvas),shadow:material(0x2d3940,.35),
   crimson:material(0x9c3336),stoneLight:material(0xd2c9ad),
  };
  for(const floor of RESTLESS_DAY_WORLD.floors)box(this.group,floor.size,floor.center,this.materials[floor.material]??this.materials.stone);
  for(const solid of RESTLESS_DAY_WORLD.solids){
   if(solid.id==='renowner-body')continue; // articulated visual has same game dimensions
   box(this.group,solid.size,solid.center,this.materials[solid.material]??this.materials.stone);
  }
  for(const r of RESTLESS_DAY_WORLD.ramps)rampMesh(this.group,r,this.materials.stone);
  this.#buildMonument();
  this.ladders=new Map();
  this.lastMode=null;this.lastLadderKey='';
  scene.add(this.group);
 }
 #buildMonument(){
  const parent=new THREE.Group();parent.name='Rightful Renowner | placeholder articulation';
  parent.position.set(0,1.4,56);this.group.add(parent);this.monument=parent;
  box(parent,[2.45,2.4,1.75],[0,2.35,0],this.materials.iron);
  box(parent,[2.75,.4,2.1],[0,3.64,0],this.materials.brass);
  box(parent,[1.75,1.35,1.6],[0,4.05,0],this.materials.iron);
  box(parent,[1.85,.21,1.75],[0,4.63,0],this.materials.brass);
  const visor=box(parent,[1.6,.18,.14],[0,4.12,.83],this.materials.shadow);
  visor.name='Renowner iron visor';
  for(let side of [-1,1]){
   box(parent,[.69,1.85,.8],[side*1.43,2.55,0],this.materials.iron);
   box(parent,[.78,.29,.92],[side*1.43,2.8,0],this.materials.brass);
  }
  const sword=new THREE.Group();sword.name='Renowner articulated sword';
  sword.position.set(.3,2.9,.92);parent.add(sword);this.sword=sword;
  pipe(sword,[0,0,0],[0,0,1.9],.14,this.materials.brass);
  box(sword,[1.85,.16,.22],[0,0,1.9],this.materials.brass);
  box(sword,[.33,.22,5],[0,0,4.1],this.materials.stoneLight);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.38,.72,4),this.materials.stoneLight);
  tip.rotation.x=Math.PI/2;tip.position.z=6.93;tip.castShadow=true;sword.add(tip);
  // Small coin tray: the solemn monument's institution survives the silliness.
  box(this.group,[1.25,.24,.85],[0,1.45,52.6],this.materials.brass);
  // Grimoirelee standards belong to the surrounding architecture. No obsolete trident emblem.
  for(const x of [-21,21]){
    pipe(this.group,[x,6,-24],[x,9.6,-24],.11,this.materials.iron);
    box(this.group,[1.9,1.3,.1],[x+1,8.45,-24],this.materials.crimson);
  }
 }
 #replaceLadders(list){
  const key=JSON.stringify(list.map(l=>[l.id,l.state,l.wall,l.position.x,l.position.y,l.position.z,l.health]));
  if(key===this.lastLadderKey)return;this.lastLadderKey=key;
  for(const g of this.ladders.values()){
    this.group.remove(g);g.traverse(obj=>obj.geometry?.dispose?.());
  }
  this.ladders.clear();
  for(const l of list){
    if(l.state==='broken')continue;
    const grp=new THREE.Group();grp.name='Metal siege ladder '+l.id;
    const deployed=l.state==='deployed',w=deployed?RESTLESS_DAY_WORLD.walls[l.wall]:null;
    const z0=deployed?w.approachZ:0,z1=deployed?w.z-(l.wall===0?1.8:1.9)-z0:7.4;
    const y1=deployed?w.height:.3;
    const end0=[0,.15,deployed?z0-l.position.z:0];
    const end1=[0,y1,deployed?z1:7.4];
    for(const x of [-1.23,1.23]){
      pipe(grp,[x,end0[1],end0[2]],[x,end1[1],end1[2]],.12,this.materials.iron);
    }
    for(let i=1;i<12;i++){
      const t=i/12,y=end0[1]+(end1[1]-end0[1])*t,z=end0[2]+(end1[2]-end0[2])*t;
      pipe(grp,[-1.25,y,z],[1.25,y,z],.095,this.materials.brass);
    }
    grp.position.set(l.position.x,l.position.y,l.position.z);
    if(!deployed)grp.rotation.x=l.state==='carrying'?-.33:Math.PI/2;
    this.group.add(grp);this.ladders.set(l.id,grp);
  }
 }
 setRestlessDayState(state,snapshot=null){
  this.lastMode=state;this.lastServerTime=snapshot?.serverTime??0;
  this.#replaceLadders(state?.ladders??[]);
  if(this.monument){
    this.monument.visible=(state?.renowner?.health??1)>0;
    this.monument.rotation.y=state?.renowner?.yaw??Math.PI;
  }
 }
 update(now){
  const attack=this.lastMode?.renowner?.attack;
  if(attack){
    const t=Math.max(0,(now-attack.startedAt));
    const swing=Math.max(0,Math.min(1,(now-attack.contactAt+.16)/.4));
    this.sword.rotation.x=attack.type==='downstroke'?-Math.sin(swing*Math.PI)*1.25:0;
    this.sword.rotation.y=attack.type==='sweep'?(swing-.5)*2.3:0;
  }else{this.sword.rotation.x=0;this.sword.rotation.y=0;}
 }
 dispose(){
  this.scene.remove(this.group);
  this.group.traverse(x=>x.geometry?.dispose?.());
  for(const mat of Object.values(this.materials))mat.dispose();
 }
}
