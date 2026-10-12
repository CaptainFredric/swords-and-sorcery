(async()=>{
 const s=__ssTutorial,rt=__ssRuntime,p=s.host.player,i=rt.input;s.active=false;__ssTutorialVoice.stop();s.rival.mode='idle';i.releaseInputs();i.enabled=true;
 i.movement=()=>({forward:0,right:0,sprint:false,jump:false,crouch:false,attack:false,guard:false,yaw:i.yaw,pitch:0});
 p.position={x:15,y:0,z:-503};p.velocity={x:0,y:0,z:0};rt.localState.position={...p.position};i.yaw=p.yaw=0;i.pitch=0;
 const frames=[];let previous=performance.now(),start=previous;
 const result=await new Promise(resolve=>{function sample(now){const elapsed=now-start;if(elapsed>3000)frames.push(now-previous);previous=now;if(elapsed<63000)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);});
 const sorted=[...result].sort((a,b)=>a-b),value={build:location.port,viewport:[innerWidth,innerHeight],visible:document.visibilityState,seconds:60,frames:result.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],over33:result.filter(v=>v>33.4).length,over50:result.filter(v=>v>50).length,triangles:rt.world.triangleCount,batches:rt.world.group.children.length};
 const el=document.createElement('script');el.type='application/json';el.id='static-performance';el.textContent=JSON.stringify(value);document.body.append(el);
 return value;
})()
