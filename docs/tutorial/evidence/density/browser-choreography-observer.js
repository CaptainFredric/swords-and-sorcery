(()=>{
 const s=__ssTutorial,runtime=__ssRuntime,e=__voEvidence;
 const out=document.createElement('script');out.id='density-shots';out.type='application/json';document.body.append(out);
 const metrics=document.createElement('script');metrics.id='density-metrics';metrics.type='application/json';document.body.append(metrics);
 const shots={},open=[],motion=[],clips={};let record=null;
 const original=runtime.renderer.render.bind(runtime.renderer);
 const began=performance.now();
 runtime.renderer.render=function(...args){
  original(...args);
  const r=s.rival.actor,p=s.host.player,now=s.host.now(),age=now-s.rival.recoveryAt;
  if(!r)return;
  const sample={at:(performance.now()-e.began)/1000,beat:s.director.current?.id,mode:s.rival.mode,player:{...p.position},rival:{...r.position},grounded:r.grounded,velocity:{...r.velocity},move:s.allows('move',false)};
  const wall=230;
  if(s.rival.mode==='recover'||r.position.z>-250&&r.position.z<-213)motion.push(sample);
  let key=null;
  if(s.rival.mode==='recover'&&age>.6)key='nonlethal-recovery';
  else if(r.position.z>-234&&r.position.z<-224&&!r.grounded)key=r.velocity.y>0?'rival-jump-rise':'rival-jump-fall';
  else if(s.director.current?.id==='minor-obstacle-gloat')key='rival-jump-gloat';
  else if(s.director.current?.id==='rises-occasion')key='jump-dialogue-approach';
  if(key&&!shots[key]){shots[key]={...sample,image:runtime.renderer.domElement.toDataURL('image/png')};out.textContent=JSON.stringify(shots);}
  const since=(performance.now()-began)/1000;
  if(since<4){
   const caption=document.querySelector('[data-tutorial-caption]'),gate=document.querySelector('#arena-gate');
   open.push({at:sample.at,caption:getComputedStyle(caption).visibility,opacity:getComputedStyle(caption).opacity,gateHidden:gate.classList.contains('hidden')});
  }
  const clip=s.rival.mode==='recover'?'recovery':r.position.z>-240&&r.position.z<-216&&!r.grounded?'jump':null;
  if(clip&&!clips[clip]&&!record){
   clips[clip]=true;const stream=runtime.renderer.domElement.captureStream(30),chunks=[];
   const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000});record=rec;
   rec.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
   rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>{const el=document.createElement('script');el.id='density-video-'+clip;el.type='application/json';el.textContent=reader.result;document.body.append(el);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));stream.getTracks().forEach(t=>t.stop());record=null;};
   rec.start();setTimeout(()=>rec.stop(),clip==='jump'?5000:4000);
  }
 };
 const timer=setInterval(()=>{
  metrics.textContent=JSON.stringify({open,motion:motion.filter((s,i)=>i%3===0),frames:window.__tutorialPlaytest?.frames,
    worldTriangles:runtime.world.triangleCount,batches:runtime.world.group.children.length,render:runtime.renderer.info.render});
  if(s.director.state!=='running'){runtime.renderer.render=original;clearInterval(timer);}
 },1000);
 return 'Opening, physical recovery and Jump observation enabled';
})()
