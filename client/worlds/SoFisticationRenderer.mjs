import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
import {SO_FIST_SCALE,SO_FIST_WHEELS,soFistWheelSteering,soFistFrame,soFistPose} from '../../shared/sim/soFistGeometry.mjs';

// The original authored asset loads when requested through Practice. Authority owns
// locomotion and strike time; the mixer supplies the matching mechanical motion.
export class SoFisticationRenderer {
 constructor(scene){
  this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='SoFistication';this.group.visible=false;scene.add(this.group);
  this.nodes=new Map();this.materials=[];this.basis=new THREE.Matrix4();this.turn=new THREE.Quaternion();this.spin=new THREE.Quaternion();this.hitColor=new THREE.Color(0xb7785c);
 }
 load(retry=false){
  if(this.error&&retry){this.loadingPromise=null;this.error=false;}
  if(this.loadingPromise)return this.loadingPromise;
  if(this.disposed||this.error)return Promise.resolve(false);this.loading=true;
  this.loadingPromise=new Promise(resolve=>{
  new GLTFLoader().load(appUrl('/client/assets/props/so-fist-ication/so-fist-ication.glb?v=64cdc7b09e88e31f'),gltf=>{
   if(this.disposed){this.destroyMeshes(gltf.scene);resolve(false);return;}
   this.model=gltf.scene;this.model.scale.setScalar(SO_FIST_SCALE);this.group.add(this.model);
   const sky=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++)sky.set([...(y<8?[192,203,211]:[94,89,76]),255],(y*32+x)*4);
   this.environment=new THREE.DataTexture(sky,32,16,THREE.RGBAFormat);this.environment.mapping=THREE.EquirectangularReflectionMapping;this.environment.colorSpace=THREE.SRGBColorSpace;this.environment.needsUpdate=true;
   this.model.traverse(o=>{
    if(o.name)this.nodes.set(o.name,o);
    if(o.isMesh){o.castShadow=o.receiveShadow=true;const id=o.name.startsWith('Wheel_')?o.name:['Armored_Fist','Wrist_Resonator_Ring'].includes(o.name)?'Fist':['Winch_Drum_And_Gears','Pinion_And_Release_Lever','Tension_Springs','Retraction_Chains_Aft'].includes(o.name)?'Drive':'hull';
     o.material=[o.material].flat().map(original=>{const m=original.clone();m.envMap=this.environment;m.envMapIntensity=.5;this.materials.push({m,id,color:m.color.clone(),emission:m.emissive.clone(),intensity:m.emissiveIntensity});return m;});if(o.material.length===1)o.material=o.material[0];
    }
   });
   this.wheels=SO_FIST_WHEELS.map(w=>{const o=this.nodes.get(w.id);return{o,rest:o.quaternion.clone(),position:o.position.clone()};});
   const clip=gltf.animations.find(c=>c.name==='01_Ram_Strike_Full_Cycle').clone();clip.tracks=clip.tracks.filter(t=>!t.name.startsWith('Wheel_'));
   this.mixer=new THREE.AnimationMixer(this.model);this.strike=this.mixer.clipAction(clip);this.strike.setLoop(THREE.LoopOnce,1);this.strike.clampWhenFinished=true;this.strike.play();this.strike.paused=true;
   this.loading=false;resolve(true);
  },undefined,error=>{this.error=true;this.loading=false;resolve(false);console.error('SoFistication authored asset failed to load',error);});
  });return this.loadingPromise;
 }
 update(now,b){
  this.presentationData=b;this.group.visible=Boolean(b&&!b.retired);
  if(!b){this.clearDebris();return;}
  if(this.id!==b.id){this.id=b.id;this.clearDebris();}
  this.load();const frame=soFistFrame(b);
  this.group.position.set(b.position?.x??b.x,b.position?.y??b.y,b.position?.z??b.z);
  this.basis.makeBasis(...frame.axes.map(a=>new THREE.Vector3(...a)));this.group.quaternion.setFromRotationMatrix(this.basis);
  if(!this.model)return;
  this.strike.time=Math.min(3.999,soFistPose(b,now).clipAge);this.strike.enabled=true;this.mixer.update(0);
  for(let i=0;i<this.wheels.length;i++){
   const {o,rest,position}=this.wheels[i],failed=b.components?.[SO_FIST_WHEELS[i].id]?.health<=0;
   o.position.copy(position);o.position.y+=(b.wheelOffsets?.[i]??0)/SO_FIST_SCALE;
   this.turn.setFromAxisAngle(new THREE.Vector3(0,1,0),soFistWheelSteering(b)[i]);this.spin.setFromAxisAngle(new THREE.Vector3(1,0,0),-(b.wheelRolls?.[i]??0));o.quaternion.copy(this.turn).multiply(rest).multiply(this.spin);
   if(failed){o.position.y-=.07;o.rotation.z+=(i%2?1:-1)*.12;}
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
  for(const {m,id,color,emission,intensity}of this.materials){const c=id==='hull'?b:b.components?.[id],damage=1-(c?.health??1)/(c?.maxHealth??1),pulse=Math.max(0,1-(now-(c?.lastHitAt??-Infinity))/.25)*.18;m.color.copy(color).multiplyScalar(1-damage*.32).lerp(this.hitColor,pulse);m.emissive.copy(emission);m.emissiveIntensity=intensity;}
 }
 getOperatorGrips(){const b=this.presentationData;if(!b)return null;const f=soFistFrame(b);return{left:new THREE.Vector3(...boxWorld(f,[-.4,1.15,-2.42])),right:new THREE.Vector3(...boxWorld(f,[.4,1.15,-2.42]))};}
 clearDebris(){if(this.debris){this.scene.remove(this.debris);this.debris=null;}}
 destroyMeshes(root){const mats=new Set(),textures=new Set();root.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat()){if(!m)continue;mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const t of textures)t.dispose();for(const m of mats)m.dispose();}
 dispose(){this.disposed=true;this.clearDebris();this.mixer?.stopAllAction();this.scene.remove(this.group);this.destroyMeshes(this.group);this.environment?.dispose();}
}
