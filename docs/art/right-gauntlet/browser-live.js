(async()=>{
 // Developer scenario through production input and local authority. This does not replace animation poses.
 const rt=__ssRuntime,input=rt.input,link=__ssLink,oldEnabled=input.enabled,rows=[];
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));input.enabled=true;input.releaseInputs();
 const stream=rt.renderer.domElement.captureStream(30),chunks=[];
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 const video=new Promise(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});
 const began=performance.now(),sample=setInterval(()=>rows.push({at:(performance.now()-began)/1000,position:{...link.local.player.position},sprinting:link.local.player.sprinting,guarding:link.local.player.guarding,spell:link.local.player.spell,weaponState:rt.weapon.lastPoseState,framePlan:rt.weapon.lastPlan?.clip}),50);
 try {
  link.practiceSpawnDummy('GUARDING');await wait(500);recorder.start();
  input.keys.add(input.bindings.forward[0]);await wait(220);input.keys.delete(input.bindings.forward[0]);
  input.setAttack(true);await wait(2100);input.setAttack(false);await wait(500);
  input.setGuard(true);await wait(1500);input.setGuard(false);await wait(450);
  input.cast();await wait(1200);
  input.keys.add(input.bindings.forward[0]);input.keys.add(input.bindings.sprint[0]);await wait(1400);
  input.dash();await wait(700);input.keys.delete(input.bindings.sprint[0]);
  input.keys.add(input.bindings.jump[0]);await wait(200);input.keys.delete(input.bindings.jump[0]);await wait(1000);
  input.keys.delete(input.bindings.forward[0]);await wait(600);
 }finally{input.releaseInputs();input.enabled=oldEnabled;clearInterval(sample);recorder.stop();}
 const result={sourceRevision:rt.weapon.productionInstance.sourceRevision,rows,video:await video};stream.getTracks().forEach(t=>t.stop());
 const el=document.createElement('script');el.id='gauntlet-live-result';el.type='application/json';el.textContent=JSON.stringify(result);document.body.append(el);
 return 'Live local authority action scenario complete';
})()
