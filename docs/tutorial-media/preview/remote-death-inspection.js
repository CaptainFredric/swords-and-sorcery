(async()=>{
 const THREE=await import('three');
 const {RemotePlayers}=await import('/client/game/RemotePlayers.mjs');
 const {createSpellbladeAsset}=await import('/client/game/SpellbladeAssets.mjs');
 const warm=await createSpellbladeAsset(); warm.dispose();
 const source=structuredClone(window.__ssRuntime.latestSnapshot.players[0]);
 const scene=new THREE.Scene(); scene.background=new THREE.Color('#242a31');
 const camera=new THREE.PerspectiveCamera(40,800/500,.1,100);camera.position.set(3,2.2,4.5);camera.lookAt(0,.65,0);
 scene.add(new THREE.HemisphereLight(0xe4efff,0x3b3430,2.5));
 const sun=new THREE.DirectionalLight(0xffe4bf,3);sun.position.set(3,5,2);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({color:0x535a62,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(800,500);renderer.setPixelRatio(1);
 const pane=document.createElement('section');pane.style='position:fixed;inset:0;z-index:9999;background:#242a31;color:#eedcb9;display:grid;align-content:center;justify-content:center;font:18px Georgia;';
 const label=document.createElement('p');pane.append(label,renderer.domElement);document.body.append(pane);
 const remote=new RemotePlayers(scene,'local-fixture');
 const player={...source,id:'corpse-fixture',name:'Spellblade',position:{x:0,y:0,z:0},yaw:0,pitch:0,velocity:{x:0,y:0,z:0},alive:true,health:100,attackActive:false,guarding:false,crouched:false,sprinting:false,castingSpell:null,ultimateState:null,steelUntil:0,staggerUntil:0,respawnAt:0};
 remote.pushSnapshot({players:[player],serverTime:9},9000);
 for(let n=0;n<4;n++) await new Promise(requestAnimationFrame);
 const results=[];
 const pose=(age,alive=false,y=0)=>{
   const time=10+age;
   const p={...player,alive,health:alive?100:0,respawnAt:alive?0:13,position:{x:alive?1:0,y,z:0}};
   remote.pushSnapshot({players:[p],serverTime:time},time*1000);remote.update(time*1000+100,1/60);
   scene.updateMatrixWorld(true);renderer.render(scene,camera);
   const shell=remote.rigs.get(p.id),animator=shell.visualInstance.animator;
   const row={age,alive,visible:shell.root.visible,position:shell.root.position.toArray(),bodies:remote.bodies().length,clip:animator.activeClip,time:animator.activeAction?.time,duration:animator.activeAction?.getClip().duration,loop:animator.activeAction?.loop,clamp:animator.activeAction?.clampWhenFinished,
     bones:['pelvis','spine','head','upper_arm.L','upper_arm.R'].map(n=>{const b=animator.bone(n);return b?{name:n,p:b.position.toArray(),q:b.quaternion.toArray()}:null;})};
   results.push(row);label.textContent=alive?'Production model: first respawn frame':`Production model: settled Death at ${age.toFixed(1)} seconds`;
   return row;
 };
 pose(0,true);pose(.01);for(let n=1;n<=110;n++) pose(Math.min(1.8,n/60));
 window.__deathFixture={remote,pose,results,renderer,pane,dispose(){remote.dispose();renderer.dispose();pane.remove();}};
 return JSON.stringify({kind:remote.rigs.get(player.id).visualKind,late:pose(2.8)});
})()
