import * as THREE from 'three';
import { oneHitBacklashRemaining } from '../../shared/src/oneHitInfusions.mjs';
import { createConductDischarge, updateConductAppearance, ConductHandEffects } from './ConductVisuals.mjs';

// Live Castleward presentation. Purely cosmetic: damage, Steel, infusions and
// teleport positions are owned by the shared simulation and come over snapshots.
const ELEMENTS=[
  ['fire',0xff6528],['frost',0x94d9ff],['gale',0x8de9ad],['lightning',0xffcc50],
];
const STONE=0x85776c;
const Z=new THREE.Vector3(0,0,1);
const Y=new THREE.Vector3(0,1,0);
const TAU=2*Math.PI;
const SHARD=new THREE.ConeGeometry(1,1,5);
const STONE_SHAPE=new THREE.DodecahedronGeometry(1,0);
const EMBER=new THREE.OctahedronGeometry(1);
const SMOKE=new THREE.IcosahedronGeometry(1,0);
const FIRE_FOOTPRINT=new THREE.RingGeometry(.965,1,48);
const SWEEP=new THREE.TorusGeometry(1,.07,5,28,Math.PI*.87);
const SHARED=new Set([SHARD,STONE_SHAPE,EMBER,SMOKE,FIRE_FOOTPRINT,SWEEP]);
const matrix=new THREE.Object3D();
const M=(color,opacity=.84)=>new THREE.MeshBasicMaterial({color,transparent:true,
  opacity,depthWrite:false,side:THREE.DoubleSide});
const v=p=>new THREE.Vector3(p.x,p.y,p.z);
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

export class OneHitLiveEffects {
  constructor(scene,remotePlayers=null,weapon=null) {
    this.scene=scene;
    this.remotePlayers=remotePlayers;
    this.weapon=weapon;
    this.root=new THREE.Group();
    this.root.name='One Hit of Wonders (presentation only)';
    scene.add(this.root);
    this.transients=[];
    this.waves=new Map();
    this.resolvedWaves=new Map();
    this.auras=new Map();
    this.zones=new Map();
    this.statuses=new Map();
    this.reticle=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),
      new THREE.LineBasicMaterial({color:0xffd65d,transparent:true,opacity:.86,depthWrite:false}));
    this.reticle.frustumCulled=false;
    this.reticle.visible=false;
    this.root.add(this.reticle);
    this.conductHands=new Map();
    this.visualClock=0;
    this.density=1;
  }
  setDensity(density) { this.density=clamp(Number(density)||.45,.45,1); }
  #detail(count) { return Math.max(2,Math.round(count*this.density)); }
  #add(mesh,ttl,velocity=null,spin=0) {
    if(this.transients.length>=185){
      const old=this.transients.shift();this.#discard(old.mesh);
    }
    this.root.add(mesh);
    this.transients.push({mesh,ttl,life:ttl,velocity,spin});
    return mesh;
  }
  #discard(mesh) {
    mesh.parent?.remove(mesh);
    mesh.traverse?.(node=>{
      if(node.geometry&&!SHARED.has(node.geometry))node.geometry.dispose();
      if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());
      else node.material?.dispose?.();
    });
  }
  #particle(geometry,color,position,scale,ttl,{velocity=null,gravity=0,spin=0,grow=0,opacity=.85}={}) {
    const m=new THREE.Mesh(geometry,M(color,opacity));
    m.position.copy(position);m.scale.set(...scale);
    m.userData.motion={gravity,grow,opacity,scale};
    return this.#add(m,ttl,velocity,spin);
  }
  #fork(origin,direction,length,ttl,strength=1) {
    const sideways=new THREE.Vector3(-direction.z,.08,direction.x).normalize();
    const points=[];
    for(let i=0;i<=6;i++)points.push(origin.clone().addScaledVector(direction,length*i/6)
      .addScaledVector(sideways,(i===0||i===6?0:(i%2?1:-1))*.14*strength));
    const line=(p,c,o)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),
      new THREE.LineBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false}));
    this.#add(line(points,0xffd552,.97),ttl);
    this.#add(line([points[2],points[3].clone().addScaledVector(sideways,.24),points[4].clone().addScaledVector(sideways,.57)],
      0xfff1ab,.88),ttl*.77);
  }
  #burst(point,tiers={},form='ground',normal=null) {
    const p=v(point),ground=form==='ground'||normal?.[1]>.6;
    const rocks=this.#detail(18),slabs=this.#detail(12);
    if(ground)for(let i=0;i<rocks;i++){
      const a=i*TAU/rocks,span=1.4+(i%5)*.45,size=.11+(i%5)*.05;
      const velocity=new THREE.Vector3(Math.cos(a)*span,1.65+(i%4)*.68,Math.sin(a)*span);
      this.#particle(STONE_SHAPE,STONE,p.clone().add(new THREE.Vector3(Math.cos(a)*.65,.12,Math.sin(a)*.65)),
        [size,size*.85,size],.85,{velocity,gravity:10,spin:3,opacity:1});
    }
    if(ground&&form==='ground')for(let i=0;i<slabs;i++){
      const a=i*TAU/slabs+(i%2)*.085,dist=1.4+.47*(i%4);
      const slab=new THREE.Mesh(STONE_SHAPE,new THREE.MeshStandardMaterial({color:i%2?0x746b60:0x8a8072,roughness:.9}));
      slab.scale.set(.30+(i%3)*.06,.22+(i%4)*.08,.36+(i%3)*.04);
      slab.position.set(p.x+Math.cos(a)*dist,p.y-.15,p.z+Math.sin(a)*dist);
      slab.rotation.set(Math.sin(a)*.33,a,Math.cos(a)*.4);
      slab.userData.oneHitSlab={groundY:p.y-.2,topY:p.y+.16+(i%4)*.09};
      this.#add(slab,1.35);
    }
    const pressure=this.#particle(SWEEP,tiers.gale?0x9cf1bd:0xd1c9ba,
      p.clone().add(new THREE.Vector3(0,.12,0)),[.89,.89,.52],.45,{grow:2.15,opacity:.5});
    if(ground)pressure.quaternion.setFromUnitVectors(Z,Y);
    else if(normal)pressure.quaternion.setFromUnitVectors(Z,new THREE.Vector3(...normal).normalize());
    if(tiers.fire){
      const full=tiers.fire===2;
      this.#particle(EMBER,0xffedaf,p.clone().add(new THREE.Vector3(0,.48,0)),[.48,.62,.48],.17,{grow:1.8});
      for(let i=0;i<this.#detail(full?18:10);i++){
        const a=i*2.39996,r=.45+(i%4)*.19;
        const outward=new THREE.Vector3(Math.cos(a),.22+(i%6)*.11,Math.sin(a));
        const start=p.clone().addScaledVector(outward,r);
        const flame=this.#particle(i%3?SHARD:EMBER,[0xffdc77,0xff8032,0xd84225][i%3],start,
          [.075+(i%3)*.035,.26+(i%4)*.105,.105],.36+(i%5)*.095,
          {velocity:outward.clone().multiplyScalar(full?5.1:3.4),gravity:3,spin:1.3,grow:.55,opacity:.81});
        flame.quaternion.setFromUnitVectors(Y,outward.normalize());
        if(i%3===0)this.#particle(SMOKE,0x422d25,start,[.37,.41,.37],1.38+(i%2)*.2,
          {velocity:new THREE.Vector3(Math.cos(a)*.65,.95,Math.sin(a)*.65),grow:1.6,opacity:.34});
      }
    }
    if(tiers.frost)for(let i=0;i<this.#detail(tiers.frost===2?11:6);i++){
      const a=i*2.39996,dir=new THREE.Vector3(Math.cos(a),.64+(i%3)*.34,Math.sin(a));
      const shard=this.#particle(SHARD,i%3===0?0xe8fdff:0x7ed7f5,p.clone().addScaledVector(dir,.48),
        [.11+(i%3)*.035,.48+(i%4)*.25,.14],.75+(i%3)*.1,
        {velocity:dir.clone().multiplyScalar(2),gravity:4,spin:1.7,opacity:.78});
      shard.quaternion.setFromUnitVectors(Y,dir.normalize());
    }
    if(tiers.gale)for(let i=0;i<this.#detail(tiers.gale===2?5:3);i++){
      const arc=this.#particle(SWEEP,i%2?0xedfff0:0x7de5aa,p.clone().add(new THREE.Vector3(0,.36+i*.18,0)),
        [.68+i*.095,.68+i*.095,.33],.43+i*.065,{grow:1.72,spin:6-i*.6,opacity:.52});
      arc.rotation.set(1.22+i*.12,i*.86,.24*i);
    }
    const forks=this.#detail(tiers.lightning===2?8:4);
    if(tiers.lightning)for(let i=0;i<forks;i++){
      const a=i*TAU/forks;
      this.#fork(p.clone().add(new THREE.Vector3(0,.18,0)),new THREE.Vector3(Math.cos(a),.16+(i%3)*.3,Math.sin(a)),
        2+(i%4)*.46, .21+(i%4)*.06);
    }
  }
  setChargeGuide(origin,plan) {
    this.reticle.visible=Boolean(origin&&plan);
    if(!this.reticle.visible)return;
    const pos=this.reticle.geometry.attributes.position;
    pos.setXYZ(0,origin.x,origin.y+1,origin.z);
    pos.setXYZ(1,plan.end.x,plan.end.y+1,plan.end.z);
    pos.needsUpdate=true;
    this.reticle.material.color.setHex(plan.legal?0xffd65d:0xc16a3a);
    this.reticle.material.opacity=plan.legal?.87:.31;
  }
  #stepZones(snapshot,now) {
    const seen=new Set();
    for(const zone of snapshot?.oneHitBurnZones??[]){
      if(zone.until<=now)continue;
      seen.add(zone.id);
      let obj=this.zones.get(zone.id);
      if(!obj){
        obj=new THREE.Group();obj.position.copy(v(zone.position));
        const rim=new THREE.Mesh(FIRE_FOOTPRINT,M(0xff9a52,.54));
        rim.rotation.x=-Math.PI/2;rim.position.y=.057;rim.scale.setScalar(zone.radius);
        const coals=new THREE.Mesh(new THREE.CircleGeometry(zone.radius,48),M(0x532d1a,.33));
        coals.rotation.x=-Math.PI/2;coals.position.y=.042;
        const tongues=new THREE.InstancedMesh(EMBER,M(0xffa448,.78),19);
        tongues.frustumCulled=false;
        for(let i=0;i<19;i++)tongues.setColorAt(i,new THREE.Color([0xffb965,0xff742f,0xd94d26][i%3]));
        obj.add(coals,rim,tongues);
        this.root.add(obj);this.zones.set(zone.id,obj);
      }
      const left=clamp((zone.until-now)/4,0,1);
      const [coals,rim,tongues]=obj.children;
      coals.material.opacity=.17+.24*left;
      rim.material.opacity=.28+.36*left;
      tongues.material.opacity=.36+.47*left;
      tongues.count=7+Math.ceil(left*12*this.density);
      for(let i=0;i<tongues.count;i++){
        const a=i*2.39996,r=zone.radius*(.19+((i*7)%18)/24);
        const gust=.77+.23*Math.sin(now*11+i*3);
        matrix.position.set(Math.sin(a)*r,.13+(i%4)*.09*left,Math.cos(a)*r);
        matrix.rotation.set(.15*Math.sin(now*6+i),a,.25*Math.cos(now*7+i));
        matrix.scale.set(.13+.15*left,(.18+.45*left)*gust,.12+.12*left);
        matrix.updateMatrix();tongues.setMatrixAt(i,matrix.matrix);
      }
      tongues.instanceMatrix.needsUpdate=true;
    }
    for(const [id,obj] of this.zones)if(!seen.has(id)){this.#discard(obj);this.zones.delete(id);}
  }
  #stepStatuses(snapshot,now) {
    const seen=new Set();
    for(const player of snapshot?.players??[]){
      if(!player.alive)continue;
      const frozen=(player.oneHitFrozenUntil??0)>now,slow=(player.oneHitFrostSlow?.until??0)>now;
      const backlash=oneHitBacklashRemaining(player.electricalBacklash,now);
      if(!slow&&!frozen&&backlash<=0)continue;
      seen.add(player.id);
      let entry=this.statuses.get(player.id);
      if(!entry){
        const root=new THREE.Group(),ice=new THREE.Group(),mist=new THREE.Mesh(FIRE_FOOTPRINT,M(0xb9e8ff,.5));
        mist.rotation.x=-Math.PI/2;mist.position.y=.09;mist.scale.setScalar(.68);
        for(let i=0;i<7;i++){
          const a=i*TAU/7,mesh=new THREE.Mesh(SHARD,M(i%3===0?0xe7fbff:0x83cafa,.66));
          mesh.position.set(Math.cos(a)*.38,.67+(i%3)*.19,Math.sin(a)*.38);
          mesh.scale.set(.22,1.32+(i%3)*.24,.21);mesh.rotation.set(.32*Math.sin(a),a,-.33*Math.cos(a));
          ice.add(mesh);
        }
        root.add(ice,mist);this.root.add(root);
        entry={root,ice,mist,wasFrozen:false,sparkAt:0};this.statuses.set(player.id,entry);
      }
      const shell=player.id===this.remotePlayers?.localId?this.remotePlayers.self:this.remotePlayers?.rigs?.get(player.id);
      const position=shell?.root?.visible?shell.root.position:player.position;
      entry.root.position.copy(position);
      entry.ice.visible=frozen;
      entry.mist.visible=slow||frozen;
      const freezeAge=.9-Math.max(0,(player.oneHitFrozenUntil??0)-now);
      if(frozen)entry.ice.scale.setScalar(clamp(.36+freezeAge*7, .36,1));
      if(entry.wasFrozen&&!frozen)for(let i=0;i<5;i++){
        const a=i*TAU/5;
        this.#particle(SHARD,0xc8f5ff,v(position).add(new THREE.Vector3(0,.88,0)),[.11,.36,.11],.33,
          {velocity:new THREE.Vector3(Math.cos(a)*1.6,1.6,Math.sin(a)*1.6),gravity:6,spin:5});
      }
      entry.wasFrozen=frozen;
      if(backlash>.1&&this.visualClock>entry.sparkAt){
        entry.sparkAt=this.visualClock+.28;
        const a=this.visualClock*13+player.position.x;
        this.#fork(v(position).add(new THREE.Vector3(Math.cos(a)*.42,.64,Math.sin(a)*.42)),
          new THREE.Vector3(-Math.cos(a),.92,-Math.sin(a)),.64+backlash/24,.15);
      }
    }
    for(const [id,entry] of this.statuses)if(!seen.has(id)){this.#discard(entry.root);this.statuses.delete(id);}
  }
  #flash(point,tiers={}) {
    const center=v(point).add(new THREE.Vector3(0,.63,0));
    for(let i=0;i<5;i++){
      const a=i*TAU/5;
      this.#fork(center,new THREE.Vector3(Math.cos(a),.45+i*.19,Math.sin(a)),.72+i*.055,.19);
    }
    for(const [i,[id,color]] of ELEMENTS.entries())if(tiers[id]>0){
      const arc=this.#particle(SWEEP,color,center.clone().add(new THREE.Vector3(0,i*.09,0)),
        [.48+i*.06,.6,.31],.25,{grow:.58,spin:3,opacity:.43});
      arc.rotation.set(1.07,i*.72,i*.85);
    }
  }
  #conduct(origin,end,handOrigin=null){
    // The server's origin and endpoint govern BOTH the flash and the dangerous
    // one-second wire. A short hand connection is purely cosmetic.
    const bolt=createConductDischarge(origin,end,{handOrigin});
    this.#add(bolt,1);
  }
  event(event){
    if(event.type==='oneHitImpact'){
      if(event.impactId){
        if(this.resolvedWaves.has(event.impactId))return;
        this.resolvedWaves.set(event.impactId,this.visualClock+2);
        const old=this.waves.get(event.impactId);
        if(old){this.#discard(old);this.waves.delete(event.impactId);}
      }
      this.#burst(event.point,event.tiers,event.form,event.normal);
    }
    if(event.type==='oneHitTeleport')this.#flash(event.to,event.tiers);
    if(event.type==='lineConductDischarge'){
      // The wire's far endpoint is authoritative, but its visible source
      // emerges from the REAL Sorcery socket rather than the server's
      // abstract eye position. Falls back to eye while the model loads.
      const shell=event.playerId===this.remotePlayers?.localId
        ?this.remotePlayers.self:this.remotePlayers?.rigs?.get(event.playerId);
      const thirdHand=shell?.visualInstance?.sockets?.sorcery;
      const source=event.playerId===this.remotePlayers?.localId
        ?(this.weapon?.magicLight??thirdHand):thirdHand;
      const origin=source?.getWorldPosition?.(new THREE.Vector3());
      this.#conduct(event.origin,event.end,
        origin?{x:origin.x,y:origin.y,z:origin.z}:null);
    }
  }
  update(dt,snapshot,now=snapshot?.serverTime??0){
    const frame=clamp(Number(dt)||0,0,.06);
    this.visualClock+=frame;
    for(let i=this.transients.length-1;i>=0;i--){
      const t=this.transients[i];t.life-=frame;
      if(t.life<=0){this.#discard(t.mesh);this.transients.splice(i,1);continue;}
      const ratio=t.life/t.ttl;
      if(t.mesh.material?.opacity!==undefined)t.mesh.material.opacity=Math.min(t.mesh.material.opacity,ratio);
      if(t.mesh.userData?.conductDischarge){
        // Reveal without rebuilding geometry. Fade the heavy impact while a
        // separate narrow line remains at the exact collision coordinates.
        updateConductAppearance(t.mesh,t.ttl-t.life);
      }
      if(t.mesh.userData?.oneHitSlab){
        const slab=t.mesh.userData.oneHitSlab,elapsed=1-ratio;
        const rise=Math.min(1,elapsed/.12);
        const sink=Math.max(0,(elapsed-.64)/.36);
        t.mesh.position.y=slab.groundY+(slab.topY-slab.groundY)*
          Math.pow(rise,.45)*(1-Math.min(1,sink));
      }
      if(t.velocity){
        t.mesh.position.addScaledVector(t.velocity,frame);
        t.velocity.y-=(t.mesh.userData.motion?.gravity??10)*frame;
      }
      if(t.spin)t.mesh.rotation.y+=frame*t.spin;
      const motion=t.mesh.userData.motion;
      if(motion){
        const k=1+motion.grow*(1-ratio);
        t.mesh.scale.set(motion.scale[0]*k,motion.scale[1]*k,motion.scale[2]*k);
        t.mesh.material.opacity=motion.opacity*Math.min(1,ratio*2.4);
      } else if(t.mesh.geometry?.type==='TorusGeometry')t.mesh.scale.setScalar(1+(1-ratio)*.65);
    }
    const tracked=new Set();
    for(const [id,until] of this.resolvedWaves)if(this.visualClock>=until)this.resolvedWaves.delete(id);
    for(const wave of snapshot?.oneHitWaves??[]){
      if(this.resolvedWaves.has(wave.id))continue;
      tracked.add(wave.id);
      let mesh=this.waves.get(wave.id);
      if(!mesh){
        mesh=new THREE.Group();
        const colors=[0xedfff1,0x83e5af,...ELEMENTS.filter(([id])=>wave.tiers?.[id]>0).map(([,color])=>color)];
        for(let i=0;i<colors.length;i++){
          const edge=new THREE.Mesh(SWEEP,M(colors[i],i===0?.94:i===1?.72:.64));
          edge.scale.set(1.28-i*.095,.71-i*.052,.88);
          edge.rotation.set(i%2?.21:-.14,.14,i*.25-.32);
          edge.position.set(0,.03*i,-i*.16);mesh.add(edge);
        }
        this.root.add(mesh);this.waves.set(wave.id,mesh);
      }
      mesh.position.copy(wave.position);
      if(mesh.userData.snapshot!==snapshot?.serverTime){
        mesh.userData.snapshot=snapshot?.serverTime;
        mesh.quaternion.setFromUnitVectors(Z,v(wave.direction).normalize());
      }
      // Extrapolate by at most a small fraction of a tick. The collision
      // event snaps to the authoritative point and removes the travelling mesh.
      const age=clamp(now-(snapshot?.serverTime??now),0,.018)*(wave.tiers.lightning?48:28);
      mesh.position.x+=wave.direction.x*age;mesh.position.y+=wave.direction.y*age;mesh.position.z+=wave.direction.z*age;
      mesh.rotateZ(frame*2.25);
    }
    this.#stepZones(snapshot,now);
    this.#stepStatuses(snapshot,now);
    for(const [id,mesh] of this.waves)if(!tracked.has(id)){
      this.#discard(mesh);this.waves.delete(id);
    }
    // Third-person Spellblades use the SAME actual left Sorcery hand socket.
    // A local first-person hand uses WeaponView's own socket-attached emitter.
    // Do not synthesize remote visual positions from networked feet.
    const electrified=new Set();
    for(const player of snapshot?.players??[]){
      if(!player.alive||player.operatingBallistaId||player.operatingRamId||player.operatingFightFlightId)continue;
      const casting=player.castingSpell==='line_of_conduct' &&
        (snapshot.serverTime??0)<(player.castEndsAt??0);
      if(player.spell!=='line_of_conduct'&&!casting)continue;
      const shell=player.id===this.remotePlayers?.localId
        ?this.remotePlayers.self:this.remotePlayers?.rigs?.get(player.id);
      const socket=shell?.visualInstance?.sockets?.sorcery;
      if(!socket)continue;
      electrified.add(player.id);
      let entry=this.conductHands.get(player.id);
      if(entry?.socket!==socket){
        entry?.effect.dispose();
        entry={socket,effect:new ConductHandEffects(socket)};
        this.conductHands.set(player.id,entry);
      }
      const progress=casting?clamp(((snapshot.serverTime??0)-(player.castStartedAt??0))/
        Math.max(.01,(player.castEndsAt??0)-(player.castStartedAt??0)),0,1):0;
      entry.effect.update(this.visualClock,{equipped:true,charging:casting,progress});
    }
    for(const [id,entry] of this.conductHands){
      if(electrified.has(id))continue;
      entry.effect.dispose();this.conductHands.delete(id);
    }
    const charging=new Set();
    for(const player of snapshot?.players??[]){
      const state=player.ultimateState;
      if(state?.id!=='one_hit_of_wonders'||state.phase!=='startup'||!player.alive)continue;
      charging.add(player.id);
      const tiers=state.preparedTiers??player.oneHitInfusions??{};
      let glow=this.auras.get(player.id);
      if(!glow){
        glow=new THREE.Group();this.root.add(glow);this.auras.set(player.id,glow);
      }
      // Rebuild only when a distinct stage combination is selected.
      const key=ELEMENTS.map(([id])=>String(tiers[id]||0)).join('');
      if(glow.userData.key!==key){
        for(const old of [...glow.children])this.#discard(old);
        glow.userData.key=key;
        glow.add(new THREE.Mesh(new THREE.TorusGeometry(.74,.03,4,32),M(0xc2bfba,.42)));
        for(const [element,color]of ELEMENTS)if((tiers[element]??0)>0){
          const tier=tiers[element];
          const ring=new THREE.Mesh(new THREE.TorusGeometry(
            tier===2?1.05:.88,.04,4,32),M(color,tier===2?.8:.48));
          ring.rotation.z=(ELEMENTS.findIndex(([id])=>id===element)+1)*.31;
          glow.add(ring);
        }
      }
      glow.position.set(player.position.x,player.position.y+1.02,player.position.z);
      glow.rotation.y+=frame*(tiers.gale===2&&!player.grounded?4.3:1.8);
      if(Number.isFinite(state.teleportHoldAt)&&this.visualClock>(glow.userData.nextArc??0)){
        glow.userData.nextArc=this.visualClock+.15;
        const a=this.visualClock*8;
        this.#fork(glow.position.clone().add(new THREE.Vector3(Math.sin(a)*.58,-.25,Math.cos(a)*.58)),
          new THREE.Vector3(-Math.sin(a),1.6,-Math.cos(a)),.88,.17,1.4);
      }
      for(const ring of glow.children)ring.rotation.x=Math.PI/2;
    }
    for(const [id,glow]of this.auras)if(!charging.has(id)){
      this.#discard(glow);this.auras.delete(id);
    }
  }
  dispose(){
    for(const t of this.transients)this.#discard(t.mesh);
    for(const g of this.waves.values())this.#discard(g);
    for(const g of this.auras.values())this.#discard(g);
    for(const g of this.zones.values())this.#discard(g);
    for(const e of this.statuses.values())this.#discard(e.root);
    this.#discard(this.reticle);this.zones.clear();this.statuses.clear();
    for(const entry of this.conductHands.values())entry.effect.dispose();
    this.transients=[];this.waves.clear();this.resolvedWaves.clear();this.auras.clear();this.conductHands.clear();
    this.root.parent?.remove(this.root);
  }
}
