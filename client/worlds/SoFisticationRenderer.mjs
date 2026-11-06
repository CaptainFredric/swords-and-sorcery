import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MachineAnimationComposition} from './MachineAnimationComposition.mjs';
import {ramWreckClip} from './flightAnimationState.mjs';
import {ramHitMaterial} from './ramHitFlash.mjs';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {boxWorld} from '../../shared/src/orientedBox.mjs';
import {siegeRock} from '../../shared/sim/siegeImpact.mjs';
import {SO_FIST_SCALE,SO_FIST_FIT,SO_FIST_STATION,soFistTiming,SO_FIST_WHEELS,soFistWheelSteering,soFistFrame,soFistPose} from '../../shared/sim/soFistGeometry.mjs';
import {SO_FIST_LIFT,soFistPitchCylinderPose} from '../../shared/sim/soFistElevation.mjs';
import {RAM_FIST} from '../../shared/sim/soFistDetachedFist.mjs';
import {authoredHierarchyIssues,RAM_REQUIRED_PARENTS,FIST_REQUIRED_PARENTS} from './soFistAssetHierarchy.mjs';

// The original authored asset loads when requested through Practice. Authority owns
// locomotion and strike time; the mixer supplies the matching mechanical motion.
// Where the operator's right fist comes down on the machine (a thump as its fist goes out, spellbladeGestures.mjs): the
// flat top of the console between the handlebars, 15 cm ahead of the right grip and 20 cm in from it, at the grips'
// height. Measured on the production model by casting down onto it around the grip.
const OPERATOR_CASING=Object.freeze([SO_FIST_STATION.rightHand[0]+.2,SO_FIST_STATION.rightHand[1]-.01,SO_FIST_STATION.rightHand[2]+.15]);
// Procedural failure representation until a source-authored fractured-fist GLB exists.
function brokenFistParts(size){
 const root=new THREE.Group();root.name='BrokenFistArmorAndHardware';
 const shell=new THREE.MeshStandardMaterial({color:0x807b72,metalness:.83,roughness:.42,flatShading:true});
 const edge=new THREE.MeshStandardMaterial({color:0x363a39,metalness:.68,roughness:.62,flatShading:true});
 const steel=new THREE.MeshStandardMaterial({color:0xb5b3a5,metalness:.91,roughness:.32});
 const x=Math.max(.45,size.x),y=Math.max(.38,size.y),z=Math.max(.55,size.z);
 const add=(geometry,material,position,rotation=[0,0,0])=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);
  mesh.rotation.set(...rotation);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
 };
 add(new THREE.CylinderGeometry(x*.09,x*.12,z*.82,9),steel,[0,-y*.06,0],[Math.PI/2,0,0]);
 for(const sign of [-1,1]){
  add(new THREE.CylinderGeometry(x*.135,x*.135,y*.5,9),edge,[sign*x*.17,-y*.08,0],[0,0,sign*.16]);
  add(new THREE.BoxGeometry(x*.39,y*.13,z*.58),shell,[sign*x*.27,y*.29,-z*.13],[sign*.16,sign*.20,sign*.32]);
  add(new THREE.TetrahedronGeometry(Math.min(x,y,z)*.24,0),steel,[sign*x*.48,y*.05,sign*z*.24],[.2,sign*.4,.35]);
 }
 add(new THREE.BoxGeometry(x*.63,y*.10,z*.30),shell,[x*.10,-y*.33,z*.28],[.42,.14,-.38]);
 const sparks=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
  new THREE.Float32BufferAttribute([-.2,.12,0,.12,.42,.19,.1,-.08,.2,.36,.24,.33,-.24,0,.06,-.43,.22,-.07],3)),
  new THREE.LineBasicMaterial({color:0xffce7f,transparent:true,opacity:.85}));
 sparks.visible=false;root.add(sparks);
 return {root,sparks};
}
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
  const loader=new GLTFLoader();
  const latest=appUrl('/client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb?v=bab81d9861a80e83');
  const fallback=appUrl('/client/assets/props/so-fist-ication/so-fist-ication-v2_7.glb?v=21219a43541c7892');
  const failed=error=>{this.error=true;this.loading=false;resolve(false);
    console.error('SoFistication authored asset failed to load',error);};
  const received=(gltf,articulated)=>{
   const hierarchyIssues=articulated?authoredHierarchyIssues(gltf.scene,RAM_REQUIRED_PARENTS):[];
   if(hierarchyIssues.length){
    console.error('SO-FIST-ICATION GLB hierarchy mismatch; using rollback',hierarchyIssues);
    this.destroyMeshes(gltf.scene);
    loader.load(fallback,g=>received(g,false),undefined,failed);
    return;
   }
   this.authoredElevation=articulated;
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
   this.animation=new MachineAnimationComposition(this.model,gltf.animations);
   // New elevation pivots are deliberately NOT controlled by an animation
   // clip. Capture their rests once: additive per-frame lifting would drift.
   this.liftRest=new Map(['Upper_Ram_Lift','Upper_Elevation_Pivot',
     'Hydraulic_Lift_Stage1_Mid','Elevation_Pitch_Barrels_Lower',
     'Elevation_Pitch_Rods_Upper','Ram_Assembly'].flatMap(name=>{
    const o=this.nodes.get(name);return o?[[name,{position:o.position.clone(),rotation:o.rotation.clone()}]]:[];
   }));
   this.loading=false;resolve(true);
  };
  loader.load(latest,g=>received(g,true),undefined,error=>{
   // Existing installations must remain playable before the two new GLBs
   // are committed. Never silently claim full 3D articulation on rollback.
   console.warn('SO-FIST-ICATION new hydraulic GLB unavailable; using v2.7 visual fallback',error);
   loader.load(fallback,g=>received(g,false),undefined,failed);
  });
  });return this.loadingPromise;
 }
 loadDetached(){
  if(this.disposed||this.detachedTemplate||this.detachedLoading||this.detachedUnavailable)return;
  this.detachedLoading=true;
  // Separate standalone asset: the launcher and pickup share one authored
  // COM/cuff frame. A legacy fist clone remains a visual fallback until the
  // binary handoff is installed alongside the upgraded main machine.
  new GLTFLoader().load(appUrl('/client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb?v=5e7802eacdb8ff25'),gltf=>{
   this.detachedLoading=false;
   if(this.disposed){this.destroyMeshes(gltf.scene);return;}
   const fistIssues=authoredHierarchyIssues(gltf.scene,FIST_REQUIRED_PARENTS);
   if(fistIssues.length){
    console.warn('SO-FIST-ICATION standalone fist hierarchy mismatch; using model clone',fistIssues);
    this.detachedUnavailable=true;this.destroyMeshes(gltf.scene);return;
   }
   this.detachedTemplate=gltf.scene;
   this.clearDetachedVisual();
  },undefined,error=>{
   this.detachedLoading=false;this.detachedUnavailable=true;
   console.warn('SO-FIST-ICATION detached-fist GLB unavailable; using the attached-fist mesh',error);
  });
 }
 update(now,b){
  this.presentationData=b;this.group.visible=Boolean(b&&!b.retired&&!b.wreckVisualExpired);
  if(!b||b.retired){this.clearDebris();this.clearDetachedVisual();return;}
  if(this.id!==b.id){this.id=b.id;this.clearDebris();this.clearDetachedVisual();this.pendingHits=[];for(const entry of this.materials)entry.hitTimes=[-Infinity,-Infinity];}
  if(this.debris)this.debris.visible=!b.wreckVisualExpired;
  if(b.wreckVisualExpired){this.clearDetachedVisual();this.clearDebris();return;}
  this.load();const frame=soFistFrame(b);
  this.group.position.set(b.position?.x??b.x,b.position?.y??b.y,b.position?.z??b.z);
  this.basis.makeBasis(...frame.axes.map(a=>new THREE.Vector3(...a)));this.group.quaternion.setFromRotationMatrix(this.basis);
  const rock=siegeRock(b,now);
  if(rock.pitch||rock.roll)this.group.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-rock.pitch,0,rock.roll,'XYZ')));
  if(!this.model)return;
  const destroyed=b.mode==='DESTROYED'||(b.health??1)<=0;
  const dt=this.lastAt==null?0:Math.min(.1,Math.max(0,now-this.lastAt));this.lastAt=now;
  this.animation.begin(dt);
  if(destroyed){
   this.animation.sample({clip:ramWreckClip(b),time:now-(b.destroyedAt??now)},()=>true);
  }else{
   this.animation.sample({clip:'01_Ram_Strike_Full_Cycle',time:Math.min(3.999,soFistPose(b,now).clipAge)},k=>!k.startsWith('Wheel_')&&!k.startsWith('BattleRam_Root'));
   this.nodes.get('Ram_Assembly').position.z+=(soFistPose(b,now).jitter??0)/SO_FIST_SCALE;
   for(let i=0;i<this.wheels.length;i++){
    const {o,rest,position}=this.wheels[i],failed=b.components?.[SO_FIST_WHEELS[i].id]?.health<=0;
    o.position.copy(position);o.position.y+=(b.wheelOffsets?.[i]??0)/SO_FIST_SCALE;
    this.turn.setFromAxisAngle(new THREE.Vector3(0,1,0),soFistWheelSteering(b)[i]);this.spin.setFromAxisAngle(new THREE.Vector3(1,0,0),b.wheelRolls?.[i]??0);o.quaternion.copy(this.turn).multiply(rest).multiply(this.spin);
    if(failed){o.position.y-=.07;o.rotation.z+=(i%2?1:-1)*.12;}
    const c=b.components?.[SO_FIST_WHEELS[i].id],weight=c?.maxHealth?1-c.health/c.maxHealth:0;
    this.animation.sample({clip:'10_Comp_Wheel_And_Drive_Damage_Repairable',time:now,loop:true},k=>k.startsWith(o.name+'.'),{additive:true,weight:Math.max(0,weight)*.35});
   }
   const drive=b.components?.Drive,weight=drive?.maxHealth?1-drive.health/drive.maxHealth:0;
   this.animation.sample({clip:'10_Comp_Wheel_And_Drive_Damage_Repairable',time:now,loop:true},k=>!k.startsWith('Wheel_'),{additive:true,weight:Math.max(0,weight)});
  }
  this.animation.end();
  // Source-backed hydraulics: the Stage 1 rods climb half the upper saddle
  // travel, and the pitched rods rotate coaxially with the rear trunnion.
  // Rollback v2.7 keeps the preexisting fitted hinge approximation.
  const lift=(b.ramLiftY??0)/SO_FIST_SCALE,tilt=b.ramElevPitch??0;
  const upper=this.nodes.get('Upper_Ram_Lift');
  if(upper){
   upper.position.y=(this.liftRest.get('Upper_Ram_Lift')?.position.y??0)+lift;
   const pivot=this.nodes.get('Upper_Elevation_Pivot');
   if(pivot)pivot.rotation.x=(this.liftRest.get('Upper_Elevation_Pivot')?.rotation.x??0)-tilt;
   const stage=this.nodes.get('Hydraulic_Lift_Stage1_Mid');
   if(stage)stage.position.y=(this.liftRest.get('Hydraulic_Lift_Stage1_Mid')?.position.y??0)+lift*.5;
   // Closed-form cylinder alignment from the delivered Argon handoff.
   // These objects are independent of the Ram_Assembly strike animation.
   const cylinders=soFistPitchCylinderPose(tilt);
   const lowerPitch=this.nodes.get('Elevation_Pitch_Barrels_Lower');
   if(lowerPitch)lowerPitch.rotation.x=(this.liftRest.get('Elevation_Pitch_Barrels_Lower')?.rotation.x??0)+cylinders.barrelX;
   const upperPitch=this.nodes.get('Elevation_Pitch_Rods_Upper');
   if(upperPitch)upperPitch.rotation.x=(this.liftRest.get('Elevation_Pitch_Rods_Upper')?.rotation.x??0)+cylinders.rodX;
  }else{
   const ram=this.nodes.get('Ram_Assembly');
   if(ram){
    // The legacy GLB is animated around its authored object origin, but the
    // hydraulic hinge is offset. Preserve the animation's independent stroke,
    // then rigidly transform the assembly about the SAME fitted trunnion used
    // by the authoritative world OBBs. All calculations occur in the ram's
    // actual parent frame, so neither model scale nor chassis pitch can skew it.
    this.group.updateMatrixWorld(true);
    const hinge=new THREE.Vector3(...SO_FIST_LIFT.pivot).multiplyScalar(1/SO_FIST_SCALE);
    const pivotWorld=this.model.localToWorld(hinge.clone());
    const liftedWorld=this.model.localToWorld(hinge.clone().add(new THREE.Vector3(0,lift,0)));
    const center=ram.parent.worldToLocal(pivotWorld);
    const uplift=ram.parent.worldToLocal(liftedWorld).sub(center);
    const axisWorld=this.model.localToWorld(new THREE.Vector3(1,0,0)).sub(
      this.model.localToWorld(new THREE.Vector3(0,0,0))).normalize();
    const axis=axisWorld.transformDirection(ram.parent.matrixWorld.clone().invert());
    const delta=new THREE.Quaternion().setFromAxisAngle(axis,-tilt);
    ram.position.sub(center).applyQuaternion(delta).add(center).add(uplift);
    ram.quaternion.premultiply(delta);
   }
  }
  const fist=this.nodes.get('Armored_Fist'),broken=b.components?.Fist?.health<=0;
  const ring=this.nodes.get('Wrist_Resonator_Ring');
  if(broken&&!this.debris&&fist){
   this.group.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(fist);
   const center=bounds.getCenter(new THREE.Vector3());
   const remote=b.detachedFist?.state==='destroyed'?b.detachedFist:null;
   if(remote?.position)center.set(remote.position.x,remote.position.y,remote.position.z);
   const damage=brokenFistParts(bounds.getSize(new THREE.Vector3()));
   this.debris=damage.root;this.debrisSparks=damage.sparks;this.scene.add(this.debris);
   this.debrisStart=center;this.debrisGround=(b.position?.y??b.y)+Math.max(.3,bounds.getSize(new THREE.Vector3()).y*.24);
   this.debrisHeading=remote?.launchHeading??b.heading;this.brokenAt=b.fistBrokenAt??now;
  }
  if(!broken&&this.debris)this.clearDebris();
  if(fist)fist.visible=!broken&&b.fistMounted!==false;
  // The bayonet collar remains visibly attached to the piston when the
  // fist is destroyed or launched, so the exposed striker never looks hollow.
  if(ring)ring.visible=true;
  const remote=b.detachedFist;
  if(remote&&['flying','falling','resting'].includes(remote.state)){
   if(!this.detachedTemplate&&!this.detachedUnavailable)this.loadDetached();
   if(!this.detachedVisual&&fist){
    // Both GLBs have the same named center locator. Rebase the standalone
    // origin onto the authoritative swept-body center rather than spawning
    // from the rear coupling socket or cloning chassis world transforms.
    const root=this.detachedTemplate?this.detachedTemplate.clone(true):fist.clone(true);
    root.visible=true;root.position.set(0,0,0);root.quaternion.identity();
    root.scale.setScalar(SO_FIST_SCALE);
    root.updateMatrixWorld(true);
    const anchor=root.getObjectByName('fist_projectile_body_center');
    const com=anchor?anchor.getWorldPosition(new THREE.Vector3()):
      new THREE.Vector3(0,.015*SO_FIST_SCALE,.215*SO_FIST_SCALE);
    root.position.sub(com);
    const pivot=new THREE.Group();pivot.name='DetachedRamFist';
    pivot.add(root);pivot.updateMatrixWorld(true);
    this.detachedRestHeight=-new THREE.Box3().setFromObject(pivot).min.y;
    this.detachedVisual=pivot;this.scene.add(pivot);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.53,.64,36),
      new THREE.MeshBasicMaterial({color:0xd0b77d,side:THREE.DoubleSide,
        transparent:true,opacity:.52,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.name='FistPickupFootprint';
    ring.visible=false;this.scene.add(ring);this.fistPickupRing=ring;
   }
   if(this.detachedVisual){
    const resting=remote.state==='resting';
    const groundY=remote.position.y-RAM_FIST.groundRadius;
    this.detachedVisual.position.set(remote.position.x,
      resting?groundY+this.detachedRestHeight:remote.position.y,remote.position.z);
    // Preserve the launch orientation independently of later steering on the
    // carriage. Tumble about the modeled COM, not the bayonet coupling.
    const originFrame=soFistFrame({...b,heading:remote.launchHeading??b.heading});
    const basis=new THREE.Matrix4().makeBasis(...originFrame.axes.map(a=>new THREE.Vector3(...a)));
    const orientation=new THREE.Quaternion().setFromRotationMatrix(basis);
    if(!resting){
      orientation.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1,0,0),-(remote.launchPitch??0)));
      const spin=remote.spin??{x:0,y:0,z:0};
      orientation.multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(spin.x??0,spin.y??0,spin.z??0,'XYZ')));
    }
    this.detachedVisual.quaternion.copy(orientation);
    if(this.fistPickupRing){
     this.fistPickupRing.visible=resting;
     if(resting){
      this.fistPickupRing.position.set(remote.position.x,groundY+.04,remote.position.z);
      this.fistPickupRing.material.opacity=.42+.075*(1+Math.sin(now*3));
     }
    }
   }
  }else this.clearDetachedVisual();
  if(this.debris){
   const age=Math.max(0,Math.min(1.1,now-this.brokenAt));
   this.debris.position.copy(this.debrisStart);
   this.debris.position.y=Math.max(this.debrisGround,this.debrisStart.y+1.2*age-4.9*age*age);
   this.debris.position.x-=Math.sin(this.debrisHeading)*age*.75;
   this.debris.position.z-=Math.cos(this.debrisHeading)*age*.75;
   if(this.debrisSparks)this.debrisSparks.visible=age<.22;
  }
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
  const steelActive=Boolean(b?.siegeSteel&&b.siegeSteel.state!=='expired'&&now<(b.siegeSteel.protectionUntil??0));
  const pulse=steelActive?0.65+0.35*Math.sin(now*3.5):0;
  for(const {m,id,color,emission,intensity,hit,hitTimes}of this.materials){
   hit.uRamHitAge.value=hitTimes.map(t=>now-t>=0&&now-t<.3?now-t:-1);const c=id==='hull'?b:b.components?.[id],damage=destroyed?1:1-(c?.health??1)/(c?.maxHealth??1);
   m.color.copy(color).multiplyScalar(1-damage*(destroyed?.55:.32));
   if(steelActive&&!destroyed&&(c?.health??1)>0){
     m.emissive.copy(emission).lerp(new THREE.Color(0x386899),0.5*pulse);
     m.emissiveIntensity=intensity+0.35*pulse;
   }else{
     m.emissive.copy(emission);m.emissiveIntensity=intensity;
   }
  }
 }
 hit(event){if(event.type==='soFistDamaged'&&event.machineId===this.presentationData?.id&&event.amount>0&&event.point&&Object.values(event.point).every(Number.isFinite)){this.pendingHits.push(event);if(this.pendingHits.length>24)this.pendingHits.shift();}}
 getOperatorStation(now=0){
  const b=this.presentationData;if(!b)return null;const frame=soFistFrame(b),point=p=>new THREE.Vector3(...boxWorld(frame,p));
  const pose=soFistPose(b,now),recoil=pose.active?Math.max(0,pose.velocity)/14:Math.max(0,1-Math.abs(pose.age-soFistTiming(b).peak)/.25)*.4;
  return Object.fromEntries([...['pelvis','leftHand','rightHand','leftFoot','rightFoot'].map(key=>[key,point(SO_FIST_STATION[key])]),['casing',point(OPERATOR_CASING)],['forward',new THREE.Vector3(...frame.axes[2])],['up',new THREE.Vector3(...frame.axes[1])],['recoil',Math.min(1,recoil)]]);
 }
 getOperatorGrips(){const station=this.getOperatorStation(this.presentationData?.poseTime??0);return station?{left:station.leftHand,right:station.rightHand}:null;}
 getComponentWorldPosition(componentId){
  const b=this.presentationData;if(!b||b.mode==='DESTROYED'||(b.health??0)<=0)return null;
  let node=null;
  if(componentId==='hull'&&(b.health??0)>0)node=this.nodes?.get?.('Chassis')??this.group;
  else if(componentId==='Fist'&&(b.components?.Fist?.health??0)>0&&b.fistMounted!==false)
   node=this.nodes?.get?.('Armored_Fist');
  else if(this.wheels){
    const index=SO_FIST_WHEELS.findIndex(w=>w.id===componentId);
    if(index>=0&&(b.components?.[componentId]?.health??0)>0)node=this.wheels[index]?.o;
  }
  if(!node)return null;
  this.group.updateMatrixWorld(true);
  return node.getWorldPosition(new THREE.Vector3());
 }
 clearDetachedVisual(){
  if(this.detachedVisual){this.scene.remove(this.detachedVisual);this.detachedVisual=null;}
  if(this.fistPickupRing){
   this.scene.remove(this.fistPickupRing);
   this.fistPickupRing.geometry.dispose();this.fistPickupRing.material.dispose();
   this.fistPickupRing=null;
  }
 }
 clearDebris(){
  if(this.debris){
   this.scene.remove(this.debris);const materials=new Set();
   this.debris.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat())if(m)materials.add(m);});
   for(const m of materials)m.dispose();this.debris=null;
  }
  this.debrisSparks=null;
 }
 destroyMeshes(root){const mats=new Set(),textures=new Set();root.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat()){if(!m)continue;mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const t of textures)t.dispose();for(const m of mats)m.dispose();}
 dispose(){this.disposed=true;this.clearDebris();this.clearDetachedVisual();this.mixer?.stopAllAction();this.scene.remove(this.group);this.destroyMeshes(this.group);if(this.detachedTemplate)this.destroyMeshes(this.detachedTemplate);this.environment?.dispose();}
}
