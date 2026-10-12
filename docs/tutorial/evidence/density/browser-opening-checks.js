(async()=>{
 const voice=__ssTutorialVoice,sound=__ssSound.sound,h=__ssLink.local,rows=[];
 const levels={...sound.levels},play=sound.playBuffer,decode=sound.ctx.decodeAudioData.bind(sound.ctx),load=voice.fetch;
 const first=__ssTutorial.director.beats.find(b=>b.recordingKey),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const take=voice.takes[first.recordingKey],cached=await load(`/client/assets/tutorial-voice/${take.file}.m4a`);
 let row=null;
 sound.playBuffer=function(buffer,options){
  const handle=play.call(this,buffer,options);
  if(row&&handle&&options?.bus==='voice'&&voice.playing?.key===first.recordingKey)row.voiceAt??=performance.now()/1000-row.began;
  return handle;
 };
 try {
  for(const [name,muted,delay] of [['cached-restart',false,0],['muted',true,0],['slow-decode',false,1800],['stalled-decode',false,4000]]) {
   voice.stop();sound.setLevels({muted});
   if(delay){voice.fetch=(url,options)=>String(url).endsWith(`${take.file}.m4a`)?Promise.resolve(cached.clone()):load(url,options);voice.buffers.delete(first.recordingKey);sound.ctx.decodeAudioData=async(...args)=>{await wait(delay);return decode(...args)};}
   row={name,began:performance.now()/1000,samples:[]};rows.push(row);
   document.querySelector('[data-tutorial-restart]').click();
   const end=performance.now()+4500;
   while(performance.now()<end) {
    const panel=document.querySelector('[data-tutorial-caption]'),root=document.querySelector('#tutorial-lesson'),at=performance.now()/1000-row.began;
    const visible=!panel.hidden&&getComputedStyle(panel).visibility==='visible';
    if(visible)row.captionAt??=at;
    row.samples.push({at,visible,opacity:getComputedStyle(panel).opacity,titleHidden:document.querySelector('#arena-gate').classList.contains('hidden'),cue:__ssTutorial.director.current.id});
    await wait(16);
   }
   if(muted){document.querySelector('[data-tutorial-continue]').click();row.continueCue=__ssTutorial.director.current.id;}
   sound.ctx.decodeAudioData=decode;voice.fetch=load;
   await fetch('http://127.0.0.1:3172/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'opening-checks.json',payload:rows})});
  }
 }finally {voice.stop();sound.playBuffer=play;sound.ctx.decodeAudioData=decode;voice.fetch=load;sound.setLevels(levels);}
 return 'Cached, muted and two decode latency openings checked';
})()
