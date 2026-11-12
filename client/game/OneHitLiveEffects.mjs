import * as THREE from 'three';
import { createConductDischarge, updateConductAppearance, ConductHandEffects } from './ConductVisuals.mjs';
import { DisasterElementEffects } from './DisasterElementEffects.mjs';

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

// The sword wave: ONE crescent of cut air, the shape the blade left, with fainter pressure arcs trailing it. What it
// carries changes that same body, never adds another: Steel makes it denser and darker, Fire burns along its lower
// limb, Frost rimes its tips and inner edge. (Lightning runs along it as branches: DisasterElementEffects.waveBody.)
// Its size is its real reach: Fire's wave catches further out, so it is drawn that much larger.
const WAVE_ARC=75*Math.PI/180;
function crescent(tiers,{width=.24,fade=1}={}) {
  const steps=26,positions=[],colors=[],index=[];
  const base=new THREE.Color(0xeef1f0),steel=new THREE.Color(0x8d959f),fire=new THREE.Color(0xff7a1c),hot=new THREE.Color(0xffc45a),
    frost=new THREE.Color(0xbfeaff),c=new THREE.Color();
  for(let i=0;i<=steps;i++){
    const t=i/steps,a=-WAVE_ARC+2*WAVE_ARC*t,taper=Math.pow(Math.max(0,Math.cos(a*1.12)),.8);
    const outer=1.25,inner=outer-(width*taper+.015),bow=.34*Math.cos(a*1.15); // (bowed forward at its middle)
    for(const [r,edge] of [[outer,0],[inner,1]]){
      positions.push(Math.sin(a)*r,Math.cos(a)*r-.55,bow-(edge?.07:0));
      c.copy(base);
      if(tiers.steel)c.lerp(steel,tiers.steel===2?.85:.6);
      // Fire: along the lower limb, hottest at the leading edge
      if(tiers.fire&&t<.46)c.lerp(edge?fire:hot,Math.min(1,(.46-t)/.3)*(tiers.fire===2?1:.8));
      // Frost: the tips and the inner edge go white-blue
      if(tiers.frost){const tip=Math.max(0,(Math.abs(t-.5)-.3)/.2);c.lerp(frost,Math.min(1,Math.max(tip,edge?.55:0))*(tiers.frost===2?1:.75));}
      colors.push(c.r*fade,c.g*fade,c.b*fade);
    }
    if(i){const k=(i-1)*2;index.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(index);
  return geometry;
}
function swordWave(tiers={}) {
  const group=new THREE.Group(),body=new THREE.Group();
  const dense=tiers.steel?.16:0;
  const layer=(width,opacity,back,scale)=>{
    const m=new THREE.Mesh(crescent(tiers,{width}),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity,
      depthWrite:false,side:THREE.DoubleSide}));
    m.position.z=-back;m.scale.setScalar(scale);body.add(m);return m;
  };
  layer(.26,.9+dense*.5,0,1);                 // the cut itself
  const arcs=[layer(.5,.34+dense,.28,.93),layer(.8,.17+dense*.6,.62,.84)]; // the pressure it drags
  // (held a little off the vertical, as the blade was swung)
  body.rotation.z=.42;
  body.scale.setScalar((tiers.fire??0)>=1?1.5/.9:1);
  group.add(body);
  group.userData.breathe=clock=>{arcs.forEach((arc,i)=>{arc.position.z=-(i?.62:.28)-.05*Math.sin(clock*17+i*2);});};
  return group;
}

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
    // The old single line was difficult to read in three dimensions,
    // particularly when aiming ABOVE or BEHIND the current facing. A target
    // glyph marks the actual server-planned destination in world space.
    this.teleportTarget=new THREE.Group();
    this.teleportTarget.name='Disaster teleport destination (3D aim)';
    this.teleportTarget.visible=false;
    const destinationMaterial=new THREE.MeshBasicMaterial({
      color:0xffd65d,transparent:true,opacity:.83,depthWrite:false,
      side:THREE.DoubleSide
    });
    const destinationShape=new THREE.Mesh(new THREE.OctahedronGeometry(.21,0),destinationMaterial);
    const horizon=new THREE.Mesh(new THREE.TorusGeometry(.46,.024,5,32),
      destinationMaterial.clone());
    horizon.rotation.x=Math.PI/2;
    const meridian=new THREE.Mesh(new THREE.TorusGeometry(.46,.024,5,32),
      destinationMaterial.clone());
    this.teleportTarget.add(destinationShape,horizon,meridian);
    this.root.add(this.teleportTarget);
    this.conductHands=new Map();
    this.visualClock=0;
    this.density=1;
    // gathering, eruption, fields and statuses: the elements themselves
    this.elements=new DisasterElementEffects(this.root,remotePlayers);
  }
  setDensity(density) { this.density=clamp(Number(density)||.45,.45,1);this.elements.setDensity(this.density); }
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
    this.elements.bolt(origin,origin.clone().addScaledVector(direction.clone().normalize(),length),
      {width:.026*strength,ttl,forks:1});
  }
  #burst(point,tiers={},form='ground') {
    // the ground itself: slabs heaved up round where the blade went in (more of them, further out, for Steel).
    // Thrown stone, dust and every element's own eruption are DisasterElementEffects'.
    if(form!=='ground')return;
    const p=v(point),steel=tiers.steel??0;
    const slabs=this.#detail(steel===2?22:steel===1?16:12);
    for(let i=0;i<slabs;i++){
      const a=i*TAU/slabs+(i%2)*.085,dist=(1.4+.47*(i%4))*(steel===2?1.35:1);
      const slab=new THREE.Mesh(STONE_SHAPE,new THREE.MeshStandardMaterial({color:i%2?0x746b60:0x8a8072,roughness:.9}));
      slab.scale.set(.30+(i%3)*.06,.22+(i%4)*.08,.36+(i%3)*.04).multiplyScalar((steel===2?.95:.8)*(.75+(i%5)*.1));
      slab.position.set(p.x+Math.cos(a)*dist,p.y-.15,p.z+Math.sin(a)*dist);
      slab.rotation.set(Math.sin(a)*.33,a,Math.cos(a)*.4);
      slab.userData.oneHitSlab={groundY:p.y-.2,topY:p.y+.16+(i%4)*.09+(steel?.12:0)};
      this.#add(slab,1.35);
    }
  }
  setChargeGuide(origin,plan) {
    this.reticle.visible=Boolean(origin&&plan);
    this.teleportTarget.visible=this.reticle.visible;
    if(!this.reticle.visible)return;
    const pos=this.reticle.geometry.attributes.position;
    pos.setXYZ(0,origin.x,origin.y+1,origin.z);
    pos.setXYZ(1,plan.end.x,plan.end.y+1,plan.end.z);
    pos.needsUpdate=true;
    const color=plan.legal?0xffd65d:0xc16a3a;
    this.reticle.material.color.setHex(color);
    this.reticle.material.opacity=plan.legal?.87:.31;
    this.teleportTarget.position.set(plan.end.x,plan.end.y+1,plan.end.z);
    for(const child of this.teleportTarget.children){
      child.material.color.setHex(color);
      child.material.opacity=plan.legal?.83:.3;
    }
  }
  #stepZones(snapshot,now) {
    const seen=new Set();
    for(const zone of snapshot?.oneHitBurnZones??[]){
      if(zone.until<=now)continue;
      seen.add(zone.id);
      let obj=this.zones.get(zone.id);
      if(!obj){
        obj=new THREE.Group();obj.position.copy(v(zone.position));
        const coals=new THREE.Mesh(new THREE.CircleGeometry(zone.radius,48),M(0x532d1a,.33));
        coals.rotation.x=-Math.PI/2;coals.position.y=.042;
        // (scorched ground only: the flames, embers and smoke on it are DisasterElementEffects', dying with the fire)
        obj.add(coals);
        this.root.add(obj);this.zones.set(zone.id,obj);
      }
      const left=clamp((zone.until-now)/Math.max(.01,zone.until-zone.bornAt),0,1);
      obj.children[0].material.opacity=.2+.3*left;
    }
    for(const [id,obj] of this.zones)if(!seen.has(id)){this.#discard(obj);this.zones.delete(id);}
  }
  #stepStatuses(snapshot,now) {
    const seen=new Set();
    for(const player of snapshot?.players??[]){
      if(!player.alive)continue;
      const frozen=(player.oneHitFrozenUntil??0)>now;
      if(!frozen)continue;
      seen.add(player.id);
      let entry=this.statuses.get(player.id);
      if(!entry){
        const root=new THREE.Group(),ice=new THREE.Group();
        for(let i=0;i<7;i++){
          const a=i*TAU/7,mesh=new THREE.Mesh(SHARD,M(i%3===0?0xe7fbff:0x83cafa,.66));
          mesh.position.set(Math.cos(a)*.38,.67+(i%3)*.19,Math.sin(a)*.38);
          mesh.scale.set(.22,1.32+(i%3)*.24,.21);mesh.rotation.set(.32*Math.sin(a),a,-.33*Math.cos(a));
          ice.add(mesh);
        }
        root.add(ice);this.root.add(root);
        entry={root,ice,wasFrozen:false};this.statuses.set(player.id,entry);
      }
      const shell=player.id===this.remotePlayers?.localId?this.remotePlayers.self:this.remotePlayers?.rigs?.get(player.id);
      const position=shell?.root?.visible?shell.root.position:player.position;
      entry.root.position.copy(position);
      entry.ice.visible=frozen;
      const freezeAge=.9-Math.max(0,(player.oneHitFrozenUntil??0)-now);
      if(frozen)entry.ice.scale.setScalar(clamp(.36+freezeAge*7, .36,1));
      if(entry.wasFrozen&&!frozen)for(let i=0;i<5;i++){
        const a=i*TAU/5;
        this.#particle(SHARD,0xc8f5ff,v(position).add(new THREE.Vector3(0,.88,0)),[.11,.36,.11],.33,
          {velocity:new THREE.Vector3(Math.cos(a)*1.6,1.6,Math.sin(a)*1.6),gravity:6,spin:5});
      }
      entry.wasFrozen=frozen;
    }
    for(const [id,entry] of this.statuses)if(!seen.has(id)){this.#discard(entry.root);this.statuses.delete(id);}
  }
  #flash(point) {
    const center=v(point).add(new THREE.Vector3(0,.63,0));
    for(let i=0;i<5;i++){
      const a=i*TAU/5;
      this.#fork(center,new THREE.Vector3(Math.cos(a),.45+i*.19,Math.sin(a)),.72+i*.055,.19);
    }
  }
  #conduct(origin,end,handOrigin=null){
    // The server's origin and endpoint govern BOTH the flash and the dangerous
    // one-second wire. A short hand connection is purely cosmetic.
    const bolt=createConductDischarge(origin,end,{handOrigin});
    this.#add(bolt,1);
  }
  event(event,snapshot=null){
    this.elements.event(event,snapshot);
    if(event.type==='oneHitImpact'){
      if(event.impactId){
        if(this.resolvedWaves.has(event.impactId))return;
        this.resolvedWaves.set(event.impactId,this.visualClock+2);
        const old=this.waves.get(event.impactId);
        if(old){this.#discard(old);this.waves.delete(event.impactId);}
      }
      this.#burst(event.point,event.tiers,event.form);
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
        mesh=swordWave(wave.tiers);
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
      // (one blade of air, held as it was cut: its pressure arcs breathe behind it; nothing spins)
      mesh.userData.breathe?.(this.visualClock);
      this.elements.waveBody(wave,mesh,frame);
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
    this.elements.update(frame,snapshot,now);
  }
  dispose(){
    for(const t of this.transients)this.#discard(t.mesh);
    for(const g of this.waves.values())this.#discard(g);
    for(const g of this.auras.values())this.#discard(g);
    for(const g of this.zones.values())this.#discard(g);
    for(const e of this.statuses.values())this.#discard(e.root);
    this.#discard(this.reticle);this.#discard(this.teleportTarget);this.zones.clear();this.statuses.clear();
    for(const entry of this.conductHands.values())entry.effect.dispose();
    this.transients=[];this.waves.clear();this.resolvedWaves.clear();this.auras.clear();this.conductHands.clear();
    this.elements.dispose();
    this.root.parent?.remove(this.root);
  }
}
