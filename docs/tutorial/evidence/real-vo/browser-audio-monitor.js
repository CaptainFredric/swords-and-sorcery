(()=>{
 const sound=__ssSound.sound;
 const e=window.__voEvidence={began:performance.now(),takes:[],samples:[],speech:[],last:null,firstFacts:{},chunks:[]};
 const live=document.createElement('script');live.id='vo-test-live';live.type='application/json';document.body.append(live);
 const result=document.createElement('script');result.id='vo-test-result';result.type='application/json';document.body.append(result);
 const recorded=document.createElement('script');recorded.id='vo-test-audio';recorded.type='application/json';document.body.append(recorded);
 const original=sound.playBuffer;
 e.restoreSound=()=>{sound.playBuffer=original;};
 sound.playBuffer=function(buffer,options){
  const playing=window.__ssTutorialVoice?.playing,h=original.call(this,buffer,options);
  if(h&&options?.bus==='voice'&&playing?.key){
   const row={key:playing.key,beat:playing.cue.id,run:playing.cue.runId,at:(performance.now()-e.began)/1000,seconds:buffer.duration,optional:!!playing.cue.branch};
   e.takes.push(row);
   h.source.addEventListener('ended',()=>{row.endedAt=(performance.now()-e.began)/1000;},{once:true});
   const stop=h.stop;
   h.stop=function(...args){row.stopAt??=(performance.now()-e.began)/1000;return stop.apply(this,args);};
  }
  return h;
 };
 e.monitor=setInterval(()=>{
  if(!e.recorder&&sound.ctx){const dest=sound.ctx.createMediaStreamDestination();sound.master.connect(dest);e.audioDest=dest;e.recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});e.recorder.ondataavailable=x=>{if(x.data.size)e.chunks.push(x.data);};e.recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{recorded.textContent=reader.result;};reader.readAsDataURL(new Blob(e.chunks,{type:'audio/webm'}));};e.recorder.start(1000);}
  const s=window.__ssTutorial,h=window.__ssLink?.local;
  if(!s?.active||!h?.player)return;
  const d=s.director,r=h.room.players.get(s.rivalId),cue=d.optionalCue??d.cue,id=cue?.id??null,at=(performance.now()-e.began)/1000;
  e.tutorialAt??=at;
  if(id!==e.last){e.speech.push({at,id,optional:!!cue?.branch});e.last=id;}
  for(const fact of ['sprint-started','stamina-decreased','sprint-sustained','player-winded','stamina-recovered','pursuit-head-start','pursuit-released','fireball-hit','bridge-crossed','rival-turned','rival-defeated'])if(d.facts.has(fact))e.firstFacts[fact]??=at;
  e.samples.push({at,beat:d.current?.id,spoken:id,mode:s.rival.mode,move:s.allows('move',false),stamina:h.player.guardStamina,sprinting:h.player.sprinting,player:{...h.player.position},rival:{...r?.position},rivalVelocity:{...r?.velocity},audioState:sound.ctx?.state,bridgeFailures:s.bridgeFailures,run:d.runId});
  live.textContent=JSON.stringify({at,beat:d.current?.id,state:d.state,mode:s.rival.mode,move:s.allows('move',false),audioState:sound.ctx?.state,takes:e.takes.length,lastTake:e.takes.at(-1),firstFacts:e.firstFacts,bridgeFailures:s.bridgeFailures,keys:Object.keys(window.__ssTutorialVoice?.takes??{}).length});
  if(d.state==='complete'&&!e.completeAt){e.completeAt=at;e.recorder?.stop();clearInterval(e.monitor);result.textContent=JSON.stringify({environment:{url:location.href,viewport:[innerWidth,innerHeight],audio:'Unmodified Claude processed AAC decoded through the real AudioContext; MP3 fallback remains installed'},began:e.began,tutorialAt:e.tutorialAt,completeAt:e.completeAt,firstFacts:e.firstFacts,takes:e.takes,speech:e.speech,samples:e.samples.filter((s,i)=>i%5===0),timeline:window.__tutorialPlaytest?.log,events:window.__tutorialPlaytest?.events,branches:[...d.branchesSeen],state:d.state});e.restoreSound();sound.master.disconnect(e.audioDest);}
 },100);
 return 'Processed take timing and game output recording enabled';
})()
