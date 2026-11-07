import * as THREE from 'three';
import { createConductDischarge, updateConductAppearance, ConductHandEffects } from './ConductVisuals.mjs';

// Live Castleward presentation. Purely cosmetic: damage, Steel, infusions and
// teleport positions are owned by the shared simulation and come over snapshots.
const ELEMENTS=[
  ['fire',0xff672d],['frost',0x9fdfff],['gale',0xe1eddf],['lightning',0xc9a4ff],
];
const STONE=0x85776c;
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
    this.auras=new Map();
    this.conductHands=new Map();
    this.visualClock=0;
  }
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
      if(node.geometry)node.geometry.dispose();
      if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());
      else node.material?.dispose?.();
    });
  }
  #ring(point,color,radius,ttl=.7,opacity=.7,vertical=false){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.045,5,44),M(color,opacity));
    ring.position.copy(v(point));
    if(!vertical)ring.rotation.x=Math.PI/2;
    this.#add(ring,ttl);
  }
  #burst(point,tiers={}) {
    const p=v(point);
    // Rocks always belong to the physical strike; magic never appears at 0 tiers.
    for(let i=0;i<24;i++){
      const angle=i*2*Math.PI/24,span=1.5+(i%5)*.36;
      const vel=new THREE.Vector3(Math.cos(angle)*span,(i%4)*.8+1.7,Math.sin(angle)*span);
      const size=.12+(i%5)*.065;
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(size,0),
        new THREE.MeshStandardMaterial({color:STONE,roughness:1}));
      rock.position.set(p.x+Math.cos(angle)*.5,p.y+.1,p.z+Math.sin(angle)*.5);
      this.#add(rock,1.05,vel,3+i%4);
    }
    // Argon's crater study: slabs are physical *displaced ground*, present
    // even when none of the four elemental tracks has been acquired.
    for(let i=0;i<16;i++){
      const a=i*Math.PI*2/16+(i%2)*.085,dist=1.7+(.5*(i%4));
      const slab=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),
        new THREE.MeshStandardMaterial({color:i%2?0x746b60:0x8a8072,
          flatShading:true,roughness:.9}));
      slab.scale.set(.30+(i%3)*.06,.22+(i%4)*.08,.36+(i%3)*.04);
      slab.position.set(p.x+Math.cos(a)*dist,p.y-.15,p.z+Math.sin(a)*dist);
      slab.rotation.set(Math.sin(a)*.33,a,Math.cos(a)*.4);
      slab.userData.oneHitSlab={groundY:p.y-.2,topY:p.y+.16+(i%4)*.09};
      this.#add(slab,1.55);
    }
    this.#ring({x:p.x,y:p.y+.07,z:p.z},0xa09a8e,2.4,.9,.75);
    for(const [element,color] of ELEMENTS){
      const tier=clamp(Number(tiers[element])||0,0,2);
      if(!tier)continue;
      const n=tier===2?11:5,reach=tier===2?3.8:2.6;
      this.#ring({x:p.x,y:p.y+.15,z:p.z},color,reach,.62,tier===2?.85:.52);
      for(let i=0;i<n;i++){
        const a=i*2*Math.PI/n,dist=.5+(i%3)*reach/3;
        if(element==='lightning'){
          // Narrow, branching electrical forks instead of arbitrary glowing
          // particles; the Full tier has stronger, longer discharges.
          const far=dist*(tier===2?1.4:1),fork=[];
          for(let j=0;j<6;j++){
            const t=j/5,zig=((j%2)*2-1)*(.14+(tier===2?.1:0));
            fork.push(new THREE.Vector3(
              p.x+Math.sin(a)*far*t+Math.cos(a)*zig,
              p.y+.15+t*(tier===2?1.2:.65),
              p.z+Math.cos(a)*far*t-Math.sin(a)*zig));
          }
          const bolt=new THREE.Line(new THREE.BufferGeometry().setFromPoints(fork),
            new THREE.LineBasicMaterial({color,transparent:true,
              opacity:tier===2?.95:.65,depthWrite:false}));
          this.#add(bolt,tier===2?.65:.4);
          continue;
        }
        const obj=element==='frost'?new THREE.ConeGeometry(.13,tier===2?1.3:.6,5):
          element==='fire'?new THREE.ConeGeometry(.13,tier===2?.8:.48,5):
          element==='gale'?new THREE.TorusGeometry(.3,.035,4,14):
            new THREE.OctahedronGeometry(tier===2?.16:.11);
        const mesh=new THREE.Mesh(obj,M(color,.75));
        mesh.position.set(p.x+Math.sin(a)*dist,p.y+(element==='frost'?.45:.35),p.z+Math.cos(a)*dist);
        mesh.rotation.set(element==='gale'?Math.PI/2:0,a,element==='frost'?.3:0);
        this.#add(mesh,tier===2?1.3:.8,element==='fire'?new THREE.Vector3(0,1,0):null,1);
      }
    }
  }
  #flash(point,tiers={}) {
    const pp={x:point.x,y:point.y+.9,z:point.z};
    this.#ring(pp,0xebebda,1.2,.5,.7,true);
    for(const [id,color] of ELEMENTS)if(Number(tiers?.[id])>0)
      this.#ring(pp,color,Number(tiers[id])===2?1.7:1.1,.5,.6,true);
  }
  #conduct(origin,end,handOrigin=null){
    // The server's origin and endpoint govern BOTH the flash and the dangerous
    // one-second wire. A short hand connection is purely cosmetic.
    const bolt=createConductDischarge(origin,end,{handOrigin});
    this.#add(bolt,1);
  }
  event(event){
    if(event.type==='oneHitImpact')this.#burst(event.point,event.tiers);
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
  update(dt,snapshot){
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
        t.velocity.y-=10*frame;
      }
      if(t.spin)t.mesh.rotation.y+=frame*t.spin;
      if(t.mesh.geometry?.type==='TorusGeometry')t.mesh.scale.setScalar(1+(1-ratio)*.65);
    }
    const tracked=new Set();
    for(const wave of snapshot?.oneHitWaves??[]){
      tracked.add(wave.id);
      let mesh=this.waves.get(wave.id);
      if(!mesh){
        mesh=new THREE.Group();
        mesh.add(new THREE.Mesh(new THREE.TorusGeometry(.95,.085,6,32),M(0xebefed,.92)));
        for(const [element,color]of ELEMENTS)if((wave.tiers?.[element]??0)>=1){
          const e=new THREE.Mesh(new THREE.TorusGeometry(
            wave.tiers[element]===2?1.3:1.12,.055,4,30),M(color,wave.tiers[element]===2?.8:.45));
          e.rotation.y=1.25;mesh.add(e);
        }
        this.root.add(mesh);this.waves.set(wave.id,mesh);
      }
      mesh.position.copy(v(wave.position));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v(wave.direction).normalize());
    }
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
      glow.rotation.y+=frame*1.8;
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
    for(const entry of this.conductHands.values())entry.effect.dispose();
    this.transients=[];this.waves.clear();this.auras.clear();this.conductHands.clear();
    this.root.parent?.remove(this.root);
  }
}
