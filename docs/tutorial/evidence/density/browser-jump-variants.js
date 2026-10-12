(async()=>{
 const {GREENER_ROUTE}=await import('/shared/worlds/greenerPastures.mjs');
 const s=__ssTutorial,h=s.host,runtime=__ssRuntime,input=runtime.input,voice=__ssTutorialVoice,sound=__ssSound.sound;
 const movement=input.movement.bind(input),play=sound.playBuffer,results=[];
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let current;
 sound.playBuffer=function(buffer,options){
  const playing=voice.playing,handle=play.call(this,buffer,options);
  if(handle&&playing?.key&&options?.bus==='voice'&&current){
   const row={key:playing.key,beat:playing.cue.id,at:h.now()-current.began,player:{...h.player.position},rival:{...s.rival.actor.position},seconds:buffer.duration};
   current.takes.push(row);handle.source.addEventListener('ended',()=>row.endedAt=h.now()-current.began,{once:true});
  }return handle;
 };
 try {
  for(const [style,pace,sprint] of [['normal',1,false],['fast',1,true],['slow',.8,false]]) {
   voice.stop();input.releaseInputs();s.stage('jump-obstacle');
   h.player.position={x:31,y:0,z:-90};runtime.localState.position={...h.player.position};input.yaw=0;input.pitch=0;input.enabled=true;
   const r=s.rival.actor;r.position={x:55,y:0,z:-224.8};r.velocity={x:0,y:0,z:0};r.guarding=false;
   s.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='jump-takeoff');
   current={style,pace,sprint,began:h.now(),takes:[],samples:[],shots:{}};results.push(current);
   s.director.resumeAt('jump-arrival');
   const path=[{x:31,z:-170},{x:55,z:-213},GREENER_ROUTE.jump.waitPoint];let waypoint=0;
   let state={forward:0,right:0,sprint:false,jump:false,crouch:false};
   input.movement=()=>({...state,yaw:input.yaw,pitch:input.pitch,attack:false,guard:false});
   while(h.now()-current.began<40&&s.director.current.segment==='jump-obstacle') {
    const p=h.player,beat=s.director.current;
    while(waypoint<path.length-1&&Math.hypot(p.position.x-path[waypoint].x,p.position.z-path[waypoint].z)<1.2)waypoint++;
    input.yaw=Math.atan2(-(path[waypoint].x-p.position.x),-(path[waypoint].z-p.position.z));
    state.forward=s.director.facts.has('jump-crossed')?0:pace;state.sprint=sprint;
    const requested=style==='fast'||['jump-instruction','jump-prompt','jump-crossing'].includes(beat.id);
    state.jump=requested&&p.position.z<=GREENER_ROUTE.jump.takeoff.z+1&&p.grounded&&!s.director.facts.has('jump-crossed');
    current.samples.push({at:h.now()-current.began,beat:beat.id,player:{...p.position},rival:{...r.position},grounded:r.grounded,yaw:r.yaw,move:s.allows('move',false)});
    if(!current.shots.jump&&!r.grounded){current.shots.jump=runtime.renderer.domElement.toDataURL('image/png');}
    await wait(50);
   }
   current.crossed=s.director.facts.has('jump-crossed');current.seconds=h.now()-current.began;state.forward=0;state.jump=false;
   await fetch('http://127.0.0.1:3172/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'jump-variants.json',payload:results})});
  }
 }finally {voice.stop();input.releaseInputs();input.movement=movement;sound.playBuffer=play;input.enabled=false;}
 const out=document.createElement('script');out.type='application/json';out.id='jump-variant-result';out.textContent=JSON.stringify(results.map(({shots,...r})=>r));document.body.append(out);
 return 'Three actual recorded Jump approaches finished';
})()
