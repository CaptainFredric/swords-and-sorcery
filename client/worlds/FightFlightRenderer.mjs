// Authored Fight-and-Flight v3.0 presentation. No replacement helicopter or baked-in Spellblade.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {FlightRigAnimation} from './FlightRigAnimation.mjs';
import {FLIGHT_REPEATER,flightRepeaterAim,flightMuzzle,flightDirection,flightRepeaterPitchLimits} from '../../shared/src/flightRepeaterAim.mjs';
import {ramHitMaterial} from './ramHitFlash.mjs';
import {createQuarrelDetail,ornamentQuarrelSlot,disposeQuarrelDetail} from './flightQuarrelDetail.mjs';

// v2.6 remains checked into this directory as a verifiable rollback.
const ASSET='/client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb?v=b7967ba87ffa';
const QUARREL='/client/assets/props/fight-and-flight/fight-and-flight-v2.7-quarrel.glb?v=f0fb5f44c1ee';
import {stableFlightCockpitEye} from '../game/flightCameraSafety.mjs';
const SLOT_NAMES=['Quarrel_Visual_Chambered','Quarrel_Visual_Feed_Next','Quarrel_Visual_Hopper_Top','Quarrel_Visual_Slot_4','Quarrel_Visual_Slot_5','Quarrel_Visual_Slot_6'];
export class FightFlightRenderer{
  constructor(scene){
    this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='Fight-and-Flight';
    this.group.visible=false;scene.add(this.group);this.nodes=new Map();this.state=null;
    this.pendingHits=[];this.modelMaterials=[];this.lastMode=null;this.clip=null;this.disposed=false;
    this.bolts=new Map();this.boltGeometry=new THREE.CylinderGeometry(.027,.032,.33,6);
    this.quarrelPrototype=null;this.quarrelDetail=createQuarrelDetail();this.lastSwordChain=null;this.operator=null;this.ejectionAt=null;
    this.boltMaterial=new THREE.MeshStandardMaterial({color:0xb7a17b,metalness:.35,roughness:.55});
    // Ground fire is authoritative aftermath, not part of the wreck model:
    // it remains visible after the apparatus disappears.
    this.burnRoot=everywhere(new THREE.Group());this.scene.add(this.burnRoot);
    this.burnGeometry=new THREE.RingGeometry(.94,1,48);
    this.burnCoreGeometry=new THREE.CircleGeometry(1,48);
    this.burnFlameGeometry=new THREE.ConeGeometry(.18,.72,5);
    this.burnSmokeGeometry=new THREE.IcosahedronGeometry(1,1);
    this.burnCrackGeometry=new THREE.PlaneGeometry(1,.06);
    this.burnZones=new Map();
    // Persistent aftershock visuals are separate from the craft mesh: they
    // continue rising after the pilot and apparatus have been destroyed.
    this.haloRoot=everywhere(new THREE.Group());this.scene.add(this.haloRoot);
    this.haloGeometry=new THREE.TorusGeometry(1,.085,7,56);
    this.blastCoreGeometry=new THREE.IcosahedronGeometry(1,2);
    this.halos=[];
    this.trailRoot=everywhere(new THREE.Group());this.scene.add(this.trailRoot);
    this.smokeGeometry=new THREE.IcosahedronGeometry(1,1);
    this.smokePuffs=Array.from({length:14},(_,i)=>{
      const cloud=new THREE.Mesh(this.smokeGeometry,new THREE.MeshBasicMaterial({
        color:i%3===0?0x34312f:0x202120,transparent:true,opacity:0,
        depthWrite:false,side:THREE.DoubleSide}));
      cloud.visible=false;cloud.renderOrder=5;this.trailRoot.add(cloud);return cloud;
    });
    this.trailFlameGeometry=new THREE.ConeGeometry(.13,.52,5);
    this.trailFlames=Array.from({length:6},(_,i)=>{
      const flame=new THREE.Mesh(this.trailFlameGeometry,new THREE.MeshBasicMaterial({
        color:i%2?0xffac49:0xd64c22,transparent:true,opacity:0,depthWrite:false,
        side:THREE.DoubleSide}));
      flame.visible=false;flame.renderOrder=6;this.trailRoot.add(flame);return flame;
    });
  }
  load(){
    if(this.pending||this.disposed)return this.pending??Promise.resolve(false);
    this.pending=new Promise(resolve=>new GLTFLoader().load(appUrl(ASSET),gltf=>{
      if(this.disposed){resolve(false);return;}
      this.model=gltf.scene;this.group.add(this.model);
      this.animation=new FlightRigAnimation(this.model,gltf.animations);
      this.model.traverse(n=>{
        if(n.name)this.nodes.set(n.name,n);
        if(n.isMesh&&n.geometry.attributes.position?.count){
          n.castShadow=true;n.receiveShadow=true;
          let component='main';
          for(let parent=n;parent&&parent!==this.model;parent=parent.parent){
            if(parent.name.startsWith('Rotor_')){component='rotor';break;}
            if(parent.name.startsWith('Protective_Brace_L')){component='braceL';break;}
            if(parent.name.startsWith('Protective_Brace_R')){component='braceR';break;}
          }
          const materials=[n.material].flat().map(original=>{
            const mat=original.clone();mat.userData={...original.userData};
            mat.userData.baseEmissive=mat.emissive.clone();mat.userData.baseEmission=mat.emissiveIntensity;
            const hit=ramHitMaterial(mat,component!=='main',{radius:.32,duration:.22});
            this.modelMaterials.push({mesh:n,material:mat,component,hit,times:[-Infinity,-Infinity]});
            return mat;
          });
          n.material=Array.isArray(n.material)?materials:materials[0];
        }
      });
      // Six individually ornamented GLB magazine quarrels. Detail groups are
      // attached to their actual moving nodes, so reload indexing and the
      // authoritative visible-ammo count remain unchanged.
      SLOT_NAMES.forEach((name,i)=>ornamentQuarrelSlot(this.nodes.get(name),this.quarrelDetail,i));
      // Emblem deliberately unapproved: display the authored plain crimson cloth.
      const crest=this.nodes.get('Rear_Banner_Heraldic_Emblem');if(crest)crest.visible=false;
      this.setFirstPerson(this.isFirstPerson);
      this.setFailureParts();resolve(true);
      // A GLB quarrel points along its authored local +Z (tip at +0.415 m).
      // Failure leaves the legacy cylinder fallback, never changes ballistics.
      new GLTFLoader().load(appUrl(QUARREL),bolt=>{
        if(this.disposed)return;
        this.quarrelPrototype=bolt.scene;
      },undefined,e=>console.warn('Quarrel GLB unavailable; keeping fallback',e));
    },undefined,err=>{console.warn('Fight-and-Flight v2.7 asset failed to load',err);this.pending=null;resolve(false);}));
    return this.pending;
  }
  setFirstPerson(firstPerson){
    this.isFirstPerson=Boolean(firstPerson);if(this.animation)this.animation.isFirstPerson=this.isFirstPerson;
    // The v2.7 cockpit keeps BOTH protective shoulder mantlets visible;
    // only rear-only drive components/banner obstruct the visor camera.
    for(const name of ['Rear_Drive_Assembly','Rear_Trident_Banner']){
      const node=this.nodes.get(name);if(node)node.visible=!this.isFirstPerson;
    }
  }
  noteEjection(at){
    if(Number.isFinite(at))this.ejectionAt=at;
  }
  setFailureParts(){
    const m=this.state;if(!m)return;
    const dead=m.mode==='DESTROYED'||m.health<=0;
    for(const side of ['L','R']){
      const broken=(m['brace'+side+'HP']??80)<=0;
      const intact=this.nodes.get('Protective_Brace_'+side),ruin=this.nodes.get('Protective_Brace_'+side+'_Damaged');
      if(intact)intact.visible=!broken;
      if(ruin)ruin.visible=broken||dead;
    }
    SLOT_NAMES.forEach((name,i)=>{const n=this.nodes.get(name);if(n)n.visible=!dead&&Math.floor(m.ammo??0)>i;});
    const rotorAlive=m.rotorHP>0;
    for(const name of ['Rotor_Sword_Blade_L','Rotor_Sword_Blade_R']){const n=this.nodes.get(name);if(n)n.visible=rotorAlive;}
    for(const name of ['Rotor_Hub_Fractured_Collar','Rotor_Blade_L_Fractured_Stump','Rotor_Blade_L_Detached_Segment']){
      const n=this.nodes.get(name);if(n)n.visible=!rotorAlive||dead;
    }
  }
  update(now,m,projectiles=[],snapshotTime=now,zones=[],aim=null,operator=null){
    this.drawBolts(projectiles,now,snapshotTime);
    this.drawBurnZones(zones,now);
    this.drawTerminalSmoke(now,m);
    this.drawTerminalHalos(now);
    if(this.state?.id!==m?.id){this.pendingHits=[];this.lastMode=null;for(const e of this.modelMaterials)e.times=[-Infinity,-Infinity];}
    this.state=m;this.operator=operator;this.group.visible=Boolean(m&&!m.retired&&!m.wreckVisualExpired);
    // High Grounds (including remote team production) does not pass through
    // Practice's explicit asset preload. Begin one lazy load per new machine,
    // never retry a missing GLB every render frame.
    if (this.group.visible && !this.model && this.autoLoadMachineId !== m.id) {
      this.autoLoadMachineId=m.id;
      void this.load();
    }
    if(!m?.operatorId)this.lastSwordChain=null;
    if(!this.group.visible)return;
    this.load();
    const at=m.position??m;
    this.group.position.set(at.x,at.y,at.z);
    // Exported crossbow faces local +Z; Castleward's yaw-zero forward is world -Z.
    this.group.rotation.set(0,(m.heading??0)+Math.PI,0);
    if(!this.model)return;
    // Authored pitched flight pose and actual pilot machine silhouette share
    // the same authoritative run tilt; no unrelated camera dip is applied.
    const dt=this.lastUpdateAt!=null?Math.min(.1,Math.max(0,now-this.lastUpdateAt)):0;
    this.lastUpdateAt=now;
    this.animation.update(m,now,dt,operator,this.ejectionAt);
    // GLB tracks may sample a root posture, but authoritative flight attitude
    // (and the pilot's rotor collision frame) must win after all blending.
    this.model.rotation.x=m.runPitch??0;
    // Gimbal motion follows the machine's authoritative replicated joint angles,
    // never a second, visually convenient convergence calculation.
    const rel=Math.atan2(Math.sin((m.crossbowYaw??m.heading??0)-(m.heading??0)),
      Math.cos((m.crossbowYaw??m.heading??0)-(m.heading??0)));
    const yaw=Math.max(-FLIGHT_REPEATER.maxTraverse,Math.min(FLIGHT_REPEATER.maxTraverse,rel));
    const pitchLimits=flightRepeaterPitchLimits(m);
    const pitch=Math.max(pitchLimits.minPitch,Math.min(pitchLimits.maxPitch,m.crossbowPitch??0));
    const gimbal=this.nodes.get('Crossbow_Yaw_Gimbal');
    const cradle=this.nodes.get('Crossbow_Pitch_Cradle');
    const tilter=this.nodes.get('Crossbow_Aim_Tilter_Link');
    if(gimbal&&cradle){
      gimbal.rotation.set(0,yaw,0);
      cradle.rotation.set(-pitch,0,0);
      if(tilter){
        const xAxis=new THREE.Vector3(1,0,0),yAxis=new THREE.Vector3(0,1,0);
        const inverseCradle=new THREE.Quaternion().setFromAxisAngle(xAxis,pitch);
        const counterYaw=new THREE.Quaternion().setFromAxisAngle(yAxis,-.75*yaw);
        const counterPitch=new THREE.Quaternion().setFromAxisAngle(xAxis,-.32*pitch);
        tilter.quaternion.copy(inverseCradle.multiply(counterYaw).multiply(counterPitch));
      }
    }
    this.setFailureParts();
    this.group.updateMatrixWorld(true);
    for(const event of this.pendingHits.filter(e=>e.at<=now)){
      let point=event.pointLocal?this.model.localToWorld(new THREE.Vector3(event.pointLocal.x,event.pointLocal.y,event.pointLocal.z)):
        new THREE.Vector3(event.point.x,event.point.y,event.point.z);
      // Component OBB contact can lie just off the authored bevel. Seat the
      // small mark on the nearest real triangle, then retain it in mesh space.
      let closest=null;
      const meshes=new Set(this.modelMaterials.filter(e=>e.component===event.component).map(e=>e.mesh));
      for(const mesh of meshes){
        const local=mesh.worldToLocal(point.clone()),g=mesh.geometry,p=g.attributes.position,index=g.index;
        const tri=new THREE.Triangle(),q=new THREE.Vector3();let best=Infinity,bestPoint=null;
        for(let i=0,n=index?.count??p.count;i<n;i+=3){
          tri.a.fromBufferAttribute(p,index?index.getX(i):i);tri.b.fromBufferAttribute(p,index?index.getX(i+1):i+1);tri.c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
          tri.closestPointToPoint(local,q);const d=q.distanceToSquared(local);if(d<best){best=d;bestPoint=q.clone();}
        }
        if(bestPoint){const world=mesh.localToWorld(bestPoint),d=world.distanceToSquared(point);if(!closest||d<closest.d)closest={point:world,d};}
      }
      if(closest)point=closest.point;
      for(const entry of this.modelMaterials)if(entry.component===event.component){
        const slot=entry.times[0]<=entry.times[1]?0:1;entry.times[slot]=event.at;
        entry.hit.uRamHitFrom.value[slot].copy(entry.mesh.worldToLocal(point.clone()));
      }
    }
    this.pendingHits=this.pendingHits.filter(e=>e.at>now&&e.at<now+2);
    for(const entry of this.modelMaterials)entry.hit.uRamHitAge.value=entry.times.map(t=>now-t>=0&&now-t<.22?now-t:-1);
    const steelActive = Boolean(m?.siegeSteel && m.siegeSteel.state !== 'expired' && now < (m.siegeSteel.protectionUntil ?? 0));
    if (this.modelMaterials) {
      const pulse = steelActive ? 0.65 + 0.35 * Math.sin(now * 3.5) : 0;
      for (const { mesh, material } of this.modelMaterials) {
        if (!material.userData.baseEmissive) continue;
        if (steelActive && mesh.visible && (m.health ?? 1) > 0) {
          material.emissive.copy(material.userData.baseEmissive).lerp(new THREE.Color(0x386899), 0.5 * pulse);
          material.emissiveIntensity = material.userData.baseEmission + 0.35 * pulse;
        } else {
          material.emissive.copy(material.userData.baseEmissive);
          material.emissiveIntensity = material.userData.baseEmission;
        }
      }
    }
  }
  hit(event){
    if(event.type==='fightFlightComponentHit'&&event.machineId===this.state?.id&&event.damage>0&&event.point&&Object.values(event.point).every(Number.isFinite)){
      this.pendingHits.push(event);if(this.pendingHits.length>24)this.pendingHits.shift();
    }
  }
  drawBolts(projectiles,now,stamp){
    const keep=new Set();
    for(const p of projectiles){
      keep.add(p.id);let mesh=this.bolts.get(p.id);
      if(!mesh){
        mesh=new THREE.Group();mesh.name='Authored_Flight_Quarrel_'+p.id;
        if(this.quarrelPrototype)mesh.add(this.quarrelPrototype.clone(true));
        else{
          const fallback=new THREE.Mesh(this.boltGeometry,this.boltMaterial);
          fallback.rotation.x=Math.PI/2;mesh.add(fallback);
        }
        mesh.add(this.quarrelDetail.clone(true));
        mesh.traverse(n=>{if(n.isMesh)n.castShadow=true;});
        this.scene.add(mesh);this.bolts.set(p.id,mesh);}
      const span=Math.max(0,Math.min(.12,now-stamp));
      mesh.position.set(p.position.x+p.velocity.x*span,p.position.y+p.velocity.y*span,p.position.z+p.velocity.z*span);
      const dir=new THREE.Vector3(p.velocity.x,p.velocity.y,p.velocity.z).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
    }
    for(const [id,mesh] of this.bolts)if(!keep.has(id)){mesh.removeFromParent();this.bolts.delete(id);}
  }
  // The glowing capelike cloth leads a deterministic ribbon of dark smoke.
  // Pooling the meshes avoids allocating particle objects every render frame.
  drawTerminalSmoke(now,m){
    const diving=Boolean(m?.terminalDive&&!m.terminalDive.resolved&&
      m.mode!=='DESTROYED'&&!m.retired);
    const age=diving?m.terminalDive.simulatedSec??0:0;
    const intensity=Math.max(0,Math.min(1,(age+.75)/5));
    const heading=m?.heading??0;
    const backward={x:Math.sin(heading),z:Math.cos(heading)};
    const side={x:Math.cos(heading),z:-Math.sin(heading)};
    const speed=Math.hypot(m?.velocity?.x??0,m?.velocity?.z??0);
    for(let i=0;i<this.smokePuffs.length;i++){
      const puff=this.smokePuffs[i];puff.visible=diving;
      if(!diving)continue;
      const phase=((now*.53+i/this.smokePuffs.length)%1+1)%1;
      const trail=.2+phase*(2.6+speed*.3);
      const drift=Math.sin(i*2.399+now*.45)*phase*.9;
      puff.position.set(m.x+backward.x*(.75+trail)+side.x*drift,
        m.y+1.24+phase*(.7+intensity*1.9)+Math.sin(i*1.37)*.15,
        m.z+backward.z*(.75+trail)+side.z*drift);
      puff.scale.setScalar(.15+phase*(.62+intensity*.65));
      puff.material.opacity=(.10+.25*intensity)*(1-phase)**.8;
    }
    for(let i=0;i<this.trailFlames.length;i++){
      const flame=this.trailFlames[i];flame.visible=diving;
      if(!diving)continue;
      const phase=(i+.5)/this.trailFlames.length;
      const flicker=.7+.3*Math.sin(now*16+i*2.6);
      flame.position.set(m.x+backward.x*(.52+phase*.65)+side.x*Math.sin(i*2.2)*.22,
        m.y+1.01+phase*.47,m.z+backward.z*(.52+phase*.65)+side.z*Math.sin(i*2.2)*.22);
      flame.scale.set(.65,.56+intensity*.82,.65);
      flame.material.opacity=(.25+.55*intensity)*flicker;
      flame.rotation.set(-.3*Math.sin(heading),i*.73,.25*Math.cos(heading));
    }
  }
  // A short-lived 3D aftershock; the brighter fireball and heavy shrapnel
  // come from Effects.valkyrieDetonation. This never creates a damage zone.
  spawnTerminalHalo(point,startedAt,duration,blastRadius=8,condition=.5){
    if(!point||![point.x,point.y,point.z].every(Number.isFinite))return;
    const radius=Math.max(2,Math.min(13,blastRadius));
    const power=Math.max(0,Math.min(1,condition));
    const lifetime=Math.min(5,Math.max(2.6,(Number(duration)||7)*.45));
    const group=new THREE.Group();
    group.position.set(point.x,point.y,point.z);
    const core=new THREE.Mesh(this.blastCoreGeometry,new THREE.MeshBasicMaterial({
      color:0xffce75,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,
      depthWrite:false}));
    group.add(core);
    const rings=[0,1].map(i=>{
      const ring=new THREE.Mesh(this.haloGeometry,new THREE.MeshBasicMaterial({
        color:i?0x65605b:0xf6a14a,transparent:true,opacity:.5,
        depthWrite:false,side:THREE.DoubleSide}));
      ring.rotation.x=i?0:-Math.PI/2;
      ring.renderOrder=4;group.add(ring);return ring;
    });
    const smoke=Array.from({length:12},(_,i)=>{
      const cloud=new THREE.Mesh(this.burnSmokeGeometry,new THREE.MeshBasicMaterial({
        color:i%4===0?0x6c4939:i%3===0?0x433a35:0x262827,
        transparent:true,opacity:0,depthWrite:false}));
      cloud.renderOrder=5;group.add(cloud);return cloud;
    });
    this.haloRoot.add(group);
    this.halos.push({group,core,rings,smoke,startedAt,duration:lifetime,radius,power});
    // An event lost during a lag spike must never accumulate unbounded VFX.
    while(this.halos.length>5){
      const old=this.halos.shift();
      old.group.removeFromParent();
      old.group.traverse(node=>{if(node.isMesh)node.material.dispose();});
    }
  }
  drawTerminalHalos(now){
    for(const effect of [...this.halos]){
      const elapsed=Math.max(0,now-effect.startedAt);
      const {group,core,rings,smoke,radius,duration,power}=effect;
      if(elapsed>=duration){
        group.removeFromParent();
        group.traverse(node=>{if(node.isMesh)node.material.dispose();});
        this.halos.splice(this.halos.indexOf(effect),1);
        continue;
      }
      const shock=Math.min(1,elapsed/.72),ease=1-(1-shock)**3;
      core.visible=elapsed<.36;
      core.scale.setScalar(radius*(.12+.29*shock));
      core.material.opacity=.8*(1-Math.min(1,elapsed/.36))**2;
      rings[0].visible=elapsed<1.1;
      rings[0].scale.setScalar(radius*(.11+.89*ease));
      rings[0].material.opacity=.48*(1-Math.min(1,elapsed/1.1))**1.4;
      rings[1].visible=elapsed<1.7;
      rings[1].scale.setScalar(radius*(.09+.57*Math.min(1,elapsed/1.4)));
      rings[1].material.opacity=.31*(1-Math.min(1,elapsed/1.7));
      rings[1].rotation.y=elapsed*.5;
      for(let i=0;i<smoke.length;i++){
        const puff=smoke[i],angle=i*2.399963;
        const drift=radius*(.06+.3*Math.min(1,elapsed/2.4))*(.7+.3*(i%4)/3);
        puff.position.set(Math.cos(angle)*drift,
          .35+elapsed*(1.15+.27*(i%5))+.2*(i%3),
          Math.sin(angle)*drift);
        puff.scale.setScalar(radius*(.085+.075*(i%4)/3)+elapsed*(.25+.1*(i%3)));
        puff.material.opacity=(.16+.1*power)*(1-elapsed/duration)**1.5*
          Math.min(1,elapsed/.35);
      }
    }
  }
  drawBurnZones(zones,now){
    const active=new Set();
    for(const zone of zones??[]){
      if(!zone?.point||!(now<zone.expiresAt))continue;
      active.add(zone.id);
      let visual=this.burnZones.get(zone.id);
      if(!visual){
        const group=new THREE.Group();
        const scar=new THREE.Group();group.add(scar);
        // The near-black, charred earth remains visible beneath the flames,
        // while the thin glowing rim marks the EXACT authoritative radius.
        const core=new THREE.Mesh(this.burnCoreGeometry,new THREE.MeshBasicMaterial({
          color:0x170f0c,transparent:true,opacity:.36,depthWrite:false,
          polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}));
        core.rotation.x=-Math.PI/2;core.renderOrder=1;scar.add(core);
        const glow=new THREE.Mesh(this.burnCoreGeometry,new THREE.MeshBasicMaterial({
          color:0xcc480c,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,
          depthWrite:false,side:THREE.DoubleSide}));
        glow.rotation.x=-Math.PI/2;glow.position.y=.009;glow.renderOrder=2;scar.add(glow);
        const edge=new THREE.Mesh(this.burnGeometry,new THREE.MeshBasicMaterial({
          color:0xff8e38,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,
          depthWrite:false,side:THREE.DoubleSide}));
        edge.rotation.x=-Math.PI/2;edge.position.y=.02;edge.renderOrder=3;scar.add(edge);
        const cracks=[];
        for(let i=0;i<11;i++){
          const angle=i*2.399963,distance=.13+.057*(i%8);
          const crack=new THREE.Mesh(this.burnCrackGeometry,new THREE.MeshBasicMaterial({
            color:i%3===0?0xffa844:0xc64617,transparent:true,opacity:.5,
            blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
          crack.position.set(Math.cos(angle)*distance,.028,Math.sin(angle)*distance);
          crack.rotation.set(-Math.PI/2,0,angle);
          crack.scale.set(.17+.075*(i%4),.72,1);
          crack.renderOrder=4;scar.add(crack);cracks.push(crack);
        }
        const flames=[];
        for(let i=0;i<20;i++){
          const mesh=new THREE.Mesh(this.burnFlameGeometry,new THREE.MeshBasicMaterial({
            color:i%5===0?0xffed9a:i%3===0?0xffb045:i%2?0xed6124:0xff872f,
            transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}));
          mesh.rotation.y=i*2.4;mesh.renderOrder=5;
          group.add(mesh);flames.push(mesh);
        }
        const soot=[];
        for(let i=0;i<9;i++){
          const cloud=new THREE.Mesh(this.burnSmokeGeometry,new THREE.MeshBasicMaterial({
            color:i%3===0?0x5d4e42:0x322b29,transparent:true,opacity:0,
            depthWrite:false,side:THREE.DoubleSide}));
          cloud.renderOrder=6;group.add(cloud);soot.push(cloud);
        }
        // One small, unshadowed firelight per active authoritative zone.
        const light=new THREE.PointLight(0xff702b,1.0,13,2);
        light.position.y=.6;group.add(light);
        visual={group,scar,edge,core,glow,cracks,flames,soot,light};
        this.burnRoot.add(group);this.burnZones.set(zone.id,visual);
      }
      const duration=Math.max(.1,zone.expiresAt-zone.startedAt);
      const remaining=Math.max(0,Math.min(1,(zone.expiresAt-now)/duration));
      const extinguish=Math.min(1,remaining/.16);
      const radius=Number.isFinite(zone.radius)?Math.max(.1,zone.radius):4;
      // The brightening flare forecasts the next ACTUAL server fire tick.
      // Those ticks become less frequent with age; a constant strobe would
      // imply damage pulses that the authoritative fire no longer delivers.
      const untilTick=(zone.nextTickAt??Infinity)-now;
      const nextPulse=untilTick>=0&&untilTick<.16?1-untilTick/.16:0;
      const pulse=1+.08*remaining*Math.sin(now*5)+.24*remaining*nextPulse;
      visual.group.position.set(zone.point.x,zone.point.y+.038,zone.point.z);
      visual.scar.scale.set(radius,1,radius);
      visual.core.material.opacity=.35*extinguish;
      visual.glow.material.opacity=(.05+.13*remaining)*pulse*extinguish;
      visual.edge.material.opacity=(.22+.43*remaining)*pulse*extinguish;
      for(const [i,crack] of visual.cracks.entries())
        crack.material.opacity=(.16+.5*remaining)*(1+.18*Math.sin(now*3+i))*extinguish;
      for(let i=0;i<visual.flames.length;i++){
        const flame=visual.flames[i],angle=i*2.399963;
        const distance=radius*(.18+.64*((i*7)%19)/19);
        const flicker=.71+.29*Math.sin(now*(9+(i%5))+.88*i);
        const height=(.47+.09*radius)*flicker*(.32+.68*remaining)*extinguish;
        flame.position.set(Math.sin(angle)*distance,height*.46,
          Math.cos(angle)*distance);
        flame.rotation.y=angle+Math.sin(now*1.5+i)*.13;
        flame.scale.set(.7+radius*.04,height/.72,.7+radius*.04);
        flame.material.opacity=(.2+.58*remaining)*flicker*extinguish;
      }
      for(let i=0;i<visual.soot.length;i++){
        const cloud=visual.soot[i],angle=i*2.399963;
        const phase=((now*.38+i/visual.soot.length)%1+1)%1;
        const distance=radius*(.19+.45*((i*5)%13)/13);
        cloud.position.set(Math.sin(angle)*distance+.25*Math.sin(now+i),
          .18+phase*(.95+radius*.21),
          Math.cos(angle)*distance+.25*Math.cos(now+i));
        cloud.scale.setScalar(.17+phase*(.33+radius*.035));
        cloud.material.opacity=.19*remaining*(1-phase)**1.4*extinguish;
      }
      visual.light.intensity=1.2*remaining*extinguish*(.92+.08*Math.sin(now*11));
      visual.light.distance=radius*2.2;
    }
    for(const [id,visual] of this.burnZones)if(!active.has(id)){
      visual.group.removeFromParent();
      visual.group.traverse(node=>{if(node.isMesh)node.material.dispose();});
      this.burnZones.delete(id);
    }
  }
  getOperatorGrips(){return this.animation?.grips()??null;}
  getMountedCameraPosition(view,out=new THREE.Vector3()){
    const m=this.state;if(!m)return null;
    const first=view==='sight';
    if(first){
      const eye=this.nodes.get('operator_first_person_camera');
      let authored=null;
      if(eye){
        this.group.updateMatrixWorld(true);
        authored=eye.getWorldPosition(out);
      }
      // At Valkyrie's ~90-degree real chassis pitch the authored marker moves
      // below the operator's feet. Keep aiming from a stabilized visor position
      // while the pitched sword rotor and its hitboxes remain fully physical.
      const stable=stableFlightCockpitEye(m,authored);
      return out.set(stable.x,stable.y,stable.z);
    }
    const heading=Number.isFinite(m.heading)?m.heading:0;
    const distance=5.5;
    out.set(m.x+Math.sin(heading)*distance,m.y+3.05,m.z+Math.cos(heading)*distance);
    return out;
  }
  getCrossbowAim(aim=null){
    const m=this.state;if(!m)return null;
    if(aim)return flightRepeaterAim(m,aim);
    return {yaw:m.crossbowYaw??m.heading??0,pitch:m.crossbowPitch??0};
  }
  getMuzzlePosition(aim=null){
    const m=this.state;if(!m)return null;
    const computed=this.getCrossbowAim(aim);
    return flightMuzzle(m,computed);
  }
  getFireDirection(aim=null){
    const m=this.state;if(!m)return null;
    const computed=this.getCrossbowAim(aim);
    return flightDirection(m,computed);
  }
  getComponentWorldPosition(componentId){
    const m=this.state;if(!m||m.mode==='DESTROYED'||(m.health??0)<=0)return null;
    let node=null;
    if(componentId==='rotor'&&m.rotorHP>0)node=this.nodes.get('Rotor_Hub');
    else if(componentId==='braceL'&&m.braceLHP>0)node=this.nodes.get('Protective_Brace_L');
    else if(componentId==='braceR'&&m.braceRHP>0)node=this.nodes.get('Protective_Brace_R');
    else if(componentId==='main'&&(m.health??0)>0)node=this.nodes.get('Main_Apparatus_Chassis');
    if(!node)return null;
    this.group.updateMatrixWorld(true);
    return node.getWorldPosition(new THREE.Vector3());
  }
  dispose(){this.disposed=true;for(const mesh of this.bolts.values())mesh.removeFromParent();this.bolts.clear();
    this.boltGeometry.dispose();this.boltMaterial.dispose();
    disposeQuarrelDetail(this.quarrelDetail);
    this.quarrelPrototype?.traverse(n=>{if(n.isMesh)n.geometry?.dispose();});
    this.drawBurnZones([],Infinity);this.burnRoot.removeFromParent();
    this.burnGeometry.dispose();this.burnCoreGeometry.dispose();this.burnFlameGeometry.dispose();
    this.burnSmokeGeometry.dispose();this.burnCrackGeometry.dispose();
    this.drawTerminalHalos(Infinity);
    this.haloRoot.removeFromParent();this.haloGeometry.dispose();this.blastCoreGeometry.dispose();
    this.trailRoot.removeFromParent();
    for(const puff of this.smokePuffs)puff.material.dispose();
    for(const flame of this.trailFlames)flame.material.dispose();
    this.smokeGeometry.dispose();this.trailFlameGeometry.dispose();
    this.group.removeFromParent();this.mixer?.stopAllAction();this.model?.traverse(o=>{if(o.isMesh){o.geometry?.dispose();for(const mat of [o.material].flat())mat?.dispose();}});}
}
