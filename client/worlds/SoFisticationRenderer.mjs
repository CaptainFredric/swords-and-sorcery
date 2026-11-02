import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ramHitMaterial} from './ramHitFlash.mjs';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
import {siegeRock} from '../../shared/sim/siegeImpact.mjs';
import {SO_FIST_SCALE,SO_FIST_FIT,SO_FIST_STATION,soFistTiming,SO_FIST_WHEELS,soFistWheelSteering,soFistFrame,soFistPose} from '../../shared/sim/soFistGeometry.mjs';

// The original authored asset loads when requested through Practice. Authority owns
// locomotion and strike time; the mixer supplies the matching mechanical motion.
export class SoFisticationRenderer {
 constructor(scene){
  this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='SoFistication';this.group.visible=false;scene.add(this.group);
  this.pendingHits=[];this.nodes=new Map();this.materials=[];this.basis=new THREE.Matrix4();this.turn=new THREE.Quaternion();this.spin=new THREE.Quaternion();this.hitColor=new THREE.Color(0xb7785c);
 }
 load(retry=false){
  if(this.error&&retry){this.loadingPromise=null;this.error=false;}
  if(this.loadingPromise)return this.loadingPromise;
  if(this.disposed||this.error)return Promise.resolve(false);this.loading=true;
  this.loadingPromise=new Promise(resolve=>{
  new GLTFLoader().load(appUrl('/client/assets/props/so-fist-ication/so-fist-ication-v2_5.glb?v=b1ea92edc3310114'),gltf=>{
   if(this.disposed){this.destroyMeshes(gltf.scene);resolve(false);return;}
   this.model=gltf.scene;this.model.scale.setScalar(SO_FIST_SCALE);this.group.add(this.model);
   const sky=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++)sky.set([...(y<8?[192,203,211]:[94,89,76]),255],(y*32+x)*4);
   this.environment=new THREE.DataTexture(sky,32,16,THREE.RGBAFormat);this.environment.mapping=THREE.EquirectangularReflectionMapping;this.environment.colorSpace=THREE.SRGBColorSpace;this.environment.needsUpdate=true;
   this.model.traverse(o=>{
    if(o.name)this.nodes.set(o.name,o);
    if(o.isMesh){o.castShadow=o.receiveShadow=true;let id='hull';
     // GLTFLoader splits multi-material objects into child meshes. Component
     // identity belongs to the named authored parent, not a generated child name.
     for(let owner=o;owner&&owner!==this.model;owner=owner.parent){
      if(SO_FIST_WHEELS.some(w=>w.id===owner.name)){id=owner.name;break;}
      if(['Armored_Fist','Wrist_Resonator_Ring'].includes(owner.name)){id='Fist';break;}
      if(['Winch_Drum_And_Gears','Pinion_And_Release_Lever','Tension_Springs','Retraction_Chains_Aft'].includes(owner.name)){id='Drive';break;}
     }
     o.material=[o.material].flat().map(original=>{
      const m=original.clone();
      const isWood=Boolean(original.name?.toLowerCase().includes('timber')||original.name?.toLowerCase().includes('walnut'));
      m.envMap=this.environment;
      m.envMapIntensity=isWood?0.12:0.55;
      if(isWood){m.roughness=Math.max(0.78,m.roughness??0.82);m.metalness=Math.min(0.06,m.metalness??0.05);}
      const hit=ramHitMaterial(m,id==='Fist');
      this.materials.push({m,id,o,hit,hitTimes:[-Infinity,-Infinity],color:m.color.clone(),emission:m.emissive.clone(),intensity:m.emissiveIntensity});
      return m;
     });if(o.material.length===1)o.material=o.material[0];
    }
   });
   this.wheels=SO_FIST_WHEELS.map(w=>{const o=this.nodes.get(w.id);return{o,rest:o.quaternion.clone(),position:o.position.clone()};});
   const clip=gltf.animations.find(c=>c.name==='01_Ram_Strike_Full_Cycle').clone();clip.tracks=clip.tracks.filter(t=>!t.name.startsWith('Wheel_')&&!t.name.startsWith('BattleRam_Root')); // Keep wheel/authority placement registered; recoil belongs to the mechanism and rider.
   this.mixer=new THREE.AnimationMixer(this.model);this.strike=this.mixer.clipAction(clip);this.strike.setLoop(THREE.LoopOnce,1);this.strike.clampWhenFinished=true;this.strike.play();this.strike.paused=true;
   this.loading=false;resolve(true);
  },undefined,error=>{this.error=true;this.loading=false;resolve(false);console.error('SoFistication authored asset failed to load',error);});
  });return this.loadingPromise;
 }
 update(now,b){
  this.presentationData=b;this.group.visible=Boolean(b&&!b.retired);
  if(!b){this.clearDebris();return;}
  if(this.id!==b.id){this.id=b.id;this.clearDebris();this.pendingHits=[];for(const entry of this.materials)entry.hitTimes=[-Infinity,-Infinity];}
  this.load();const frame=soFistFrame(b);
  this.group.position.set(b.position?.x??b.x,b.position?.y??b.y,b.position?.z??b.z);
  this.basis.makeBasis(...frame.axes.map(a=>new THREE.Vector3(...a)));this.group.quaternion.setFromRotationMatrix(this.basis);
  const rock=siegeRock(b,now);
  if(rock.pitch||rock.roll)this.group.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-rock.pitch,0,rock.roll,'XYZ')));
  if(!this.model)return;
  this.strike.time=Math.min(3.999,soFistPose(b,now).clipAge);this.strike.enabled=true;this.mixer.update(0);
  this.nodes.get('Ram_Assembly').position.z+=(soFistPose(b,now).jitter??0)/SO_FIST_SCALE;
  const destroyed=b.mode==='DESTROYED'||(b.health??1)<=0;
  for(let i=0;i<this.wheels.length;i++){
   const {o,rest,position}=this.wheels[i],failed=destroyed||b.components?.[SO_FIST_WHEELS[i].id]?.health<=0;
   o.position.copy(position);o.position.y+=(b.wheelOffsets?.[i]??0)/SO_FIST_SCALE;
   this.turn.setFromAxisAngle(new THREE.Vector3(0,1,0),soFistWheelSteering(b)[i]);this.spin.setFromAxisAngle(new THREE.Vector3(1,0,0),(b.wheelRolls?.[i]??0));o.quaternion.copy(this.turn).multiply(rest).multiply(this.spin);
   if(failed){o.position.y-=destroyed?.16:.07;o.rotation.z+=(i%2?1:-1)*(destroyed?.28:.12);}
  }
  if(destroyed){
    this.model.rotation.z = 0.18;
    this.model.position.y = -0.14;
    const piston = this.nodes.get('Ram_Shaft_Piston');
    if(piston) piston.rotation.x = -0.22;
  } else {
    this.model.rotation.z = 0;
    this.model.position.y = 0;
    const piston = this.nodes.get('Ram_Shaft_Piston');
    if(piston) piston.rotation.x = 0;
  }
  const fist=this.nodes.get('Armored_Fist'),broken=b.components?.Fist?.health<=0;
  const ring=this.nodes.get('Wrist_Resonator_Ring');
  if(broken&&!this.debris){
   this.group.updateMatrixWorld(true);this.debris=new THREE.Group();const bounds=new THREE.Box3().setFromObject(fist),center=bounds.getCenter(new THREE.Vector3());this.debris.position.copy(center);
   for(const part of [fist,ring]){const mesh=part.clone();part.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.position.sub(center);mesh.visible=true;this.debris.add(mesh);}
   this.scene.add(this.debris);this.debrisStart=center;this.debrisGround=(b.position?.y??b.y)+bounds.getSize(new THREE.Vector3()).y/2;this.debrisHeading=b.heading;this.brokenAt=b.fistBrokenAt??now;
  }
  fist.visible=ring.visible=!broken;
  if(this.debris){const age=Math.max(0,Math.min(1.1,now-this.brokenAt));this.debris.position.copy(this.debrisStart);this.debris.position.y=Math.max(this.debrisGround,this.debrisStart.y+1.2*age-4.9*age*age);this.debris.position.x-=Math.sin(this.debrisHeading)*age*.75;this.debris.position.z-=Math.cos(this.debrisHeading)*age*.75;}
  this.group.updateMatrixWorld(true);
  for(const event of this.pendingHits.filter(e=>e.at<=now)){
   const local=event.pointLocal?.slice();
   if(local&&['Fist','Piston'].includes(event.componentId))local[2]+=soFistPose(b,now).offset-(event.poseOffset??0);
   let point=local?this.group.localToWorld(new THREE.Vector3(...local)):new THREE.Vector3(event.point.x,event.point.y,event.point.z);
   // Authority intersects component OBBs. Anchor the small visual mark to the
   // nearest actual triangle when that conservative contact lies just off a facet.
   let closest=null;
   const parts=[...new Set(this.materials.filter(e=>e.id===event.componentId||(event.componentId==='Piston'&&e.o.name==='Ram_Shaft_Piston')).map(e=>e.o))];
   for(const o of parts){
    const from=o.worldToLocal(point.clone()),g=o.geometry,p=g.attributes.position,index=g.index,tri=new THREE.Triangle(),candidate=new THREE.Vector3();let best=Infinity,bestPoint=null;
    for(let i=0,n=index?.count??p.count;i<n;i+=3){tri.a.fromBufferAttribute(p,index?index.getX(i):i);tri.b.fromBufferAttribute(p,index?index.getX(i+1):i+1);tri.c.fromBufferAttribute(p,index?index.getX(i+2):i+2);tri.closestPointToPoint(from,candidate);const d=candidate.distanceToSquared(from);if(d<best){best=d;bestPoint=candidate.clone();}}
    if(bestPoint){const world=o.localToWorld(bestPoint),d=world.distanceToSquared(point);if(!closest||d<closest.d)closest={point:world,d};}
   }
   if(closest)point=closest.point;
   for(const entry of this.materials)if(entry.id===event.componentId||(event.componentId==='Piston'&&entry.o.name==='Ram_Shaft_Piston')){
    const slot=entry.hitTimes[0]<=entry.hitTimes[1]?0:1;entry.hitTimes[slot]=event.at;
    entry.hit.uRamHitFrom.value[slot].copy(entry.o.worldToLocal(point.clone()));
   }
  }
  this.pendingHits=this.pendingHits.filter(e=>e.at>now&&e.at<now+2);
  for(const {m,id,color,emission,intensity,hit,hitTimes}of this.materials){
   hit.uRamHitAge.value=hitTimes.map(t=>now-t>=0&&now-t<.3?now-t:-1);const c=id==='hull'?b:b.components?.[id],damage=destroyed?1:1-(c?.health??1)/(c?.maxHealth??1);m.color.copy(color).multiplyScalar(1-damage*(destroyed?.55:.32));m.emissive.copy(emission);m.emissiveIntensity=intensity;}
 }
 hit(event){if(event.type==='soFistDamaged'&&event.machineId===this.presentationData?.id&&event.amount>0&&event.point&&Object.values(event.point).every(Number.isFinite)){this.pendingHits.push(event);if(this.pendingHits.length>24)this.pendingHits.shift();}}
 getOperatorStation(now=0){
  const b=this.presentationData;if(!b)return null;const frame=soFistFrame(b),point=p=>new THREE.Vector3(...boxWorld(frame,p));
  const pose=soFistPose(b,now),recoil=pose.active?Math.max(0,pose.velocity)/14:Math.max(0,1-Math.abs(pose.age-soFistTiming(b).peak)/.25)*.4;
  return Object.fromEntries([...['pelvis','leftHand','rightHand','leftFoot','rightFoot'].map(key=>[key,point(SO_FIST_STATION[key])]),['forward',new THREE.Vector3(...frame.axes[2])],['up',new THREE.Vector3(...frame.axes[1])],['recoil',Math.min(1,recoil)]]);
 }
 getOperatorGrips(){const station=this.getOperatorStation(this.presentationData?.poseTime??0);return station?{left:station.leftHand,right:station.rightHand}:null;}
 clearDebris(){if(this.debris){this.scene.remove(this.debris);this.debris=null;}}
 destroyMeshes(root){const mats=new Set(),textures=new Set();root.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat()){if(!m)continue;mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const t of textures)t.dispose();for(const m of mats)m.dispose();}
 dispose(){this.disposed=true;this.clearDebris();this.mixer?.stopAllAction();this.scene.remove(this.group);this.destroyMeshes(this.group);this.environment?.dispose();}
}
