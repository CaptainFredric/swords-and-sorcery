(async()=>{
 const THREE=await import('three');const {WeaponView}=await import('/client/game/WeaponView.mjs');
 const {VIEW_LAYER}=await import('/client/game/viewLayers.mjs');const {SPRINT,MOVEMENT}=await import('/shared/src/movement.mjs');
 const rt=__ssRuntime,cam=rt.camera;__ssLink.setInspectionFrozen(true);
 const original=rt.weapon;rt.running=false;original.group.visible=false;let shown=null,t=100;
 const view={position:cam.position.clone(),rotation:cam.rotation.clone(),fov:cam.fov};
 const render=camera=>{const bg=rt.scene.background,clear=rt.renderer.autoClear,shadow=rt.renderer.shadowMap.autoUpdate;camera.layers.set(0);rt.renderer.render(rt.scene,camera);rt.scene.background=null;rt.renderer.autoClear=false;rt.renderer.shadowMap.autoUpdate=false;rt.renderer.clearDepth();camera.layers.set(VIEW_LAYER);rt.renderer.render(rt.scene,camera);camera.layers.set(0);rt.scene.background=bg;rt.renderer.autoClear=clear;rt.renderer.shadowMap.autoUpdate=shadow;};
 const rows=[];
 window.__gauntletPose=async name=>{
  if(shown){shown.dispose();shown.group.removeFromParent();}
  t=100;cam.position.copy(view.position);cam.rotation.copy(view.rotation);cam.fov=78;cam.updateProjectionMatrix();
  const w=new WeaponView(cam,{now:()=>t});shown=w;
  for(let n=0;!w.productionInstance&&n<100;n++)await new Promise(r=>setTimeout(r,20));
  if(!w.productionInstance)throw Error('Production view model did not load');
  for(let n=0;n<30;n++){t+=1/60;w.update(t,1/60);}
  const began=t;
  let age=1,speed=0,grounded=true;
  if(name==='guard'||name==='parry'){w.setGuard(true);if(name==='parry'){w.parry();age=.12;}}
  if(name.startsWith('attack-')){w.setAttack(true);age=[.4,1.08,1.8][Number(name.slice(-1))-1];}
  if(name==='sprint')speed=SPRINT.speed;
  if(name==='dash'){w.dash();age=.10;speed=MOVEMENT.dashDistance/MOVEMENT.dashDuration;grounded=false;}
  if(name==='air'){grounded=false;age=.25;}
  if(name==='landing'){for(let n=0;n<20;n++){t+=1/60;w.update(t,1/60,{grounded:false,speed:3});}age=.16;}
  if(['fireball','frostfire','gale'].includes(name)){w.cast({spell:name,gatherSec:.3});age=.20;}
  if(name==='steel'){w.clench();w.setSteel(1);age=.15;}
  if(name==='chivalry'){w.concurrent=true;w.setGuard(true);w.setAttack(true);w.cast({spell:'fireball',gatherSec:.3});age=.4;speed=SPRINT.speed;}
  const start=t;
  while(t<start+age-1e-6){const dt=Math.min(1/60,start+age-t);t+=dt;const m=w.update(t,dt,{speed,grounded,yaw:0,pitch:0});cam.rotation.set(view.rotation.x+m.camera.pitch,view.rotation.y+m.camera.yaw,m.camera.roll,'YXZ');cam.fov=m.fov;cam.updateProjectionMatrix();}
  render(cam);rt.scene.updateMatrixWorld(true);
  const hand=w.productionInstance.animator.bone('hand.R');const at=new THREE.Vector3();hand.localToWorld(at.set(-.0259134937,.0591134056,-.0065584332));
  if(['close','grip-above','grip-side'].includes(name)){
   const eye=new THREE.PerspectiveCamera(52,cam.aspect,.001,180);const q=cam.getWorldQuaternion(new THREE.Quaternion());
   const offsets={close:[.05,.15,.32],'grip-above':[0,.32,.04],'grip-side':[.27,.02,.055]};eye.position.copy(at).add(new THREE.Vector3(...offsets[name]).applyQuaternion(q));eye.up.set(0,1,0);eye.lookAt(at);render(eye);
  }
  const row={name,time:t,sourceRevision:w.productionInstance.sourceRevision,hand:at.toArray(),viewport:[innerWidth,innerHeight],fov:cam.fov,production:w.visualKind};rows.push(row);
  window.__gauntletRows=rows;
  return row;
 };
 window.__gauntletRestore=()=>{if(shown){shown.dispose();shown.group.removeFromParent();}original.group.visible=true;cam.position.copy(view.position);cam.rotation.copy(view.rotation);cam.fov=view.fov;cam.updateProjectionMatrix();};
 return 'Production WeaponView pose review ready; no source geometry is changed by this inspection helper';
})()
