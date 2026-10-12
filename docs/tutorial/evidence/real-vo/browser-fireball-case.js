(()=>{
 const session=__ssTutorial,host=__ssLink.local,input=__ssRuntime.input,e=__voEvidence;
 session.stage('fireball');session.director.resumeAt('fireball-prompt');
 host.player.position={x:55,y:0,z:-70};
 const rival=host.room.players.get(session.rivalId);rival.position={x:55,y:0,z:-74};rival.health=10;rival.lastDamageAt=host.now();
 const originalMovement=input.movement;
 input.enabled=true;
 input.movement=()=>({forward:0,right:0,yaw:input.yaw,pitch:0,sprint:false,jump:false,attack:false,guard:false});
 const events=[];
 const off=host.on('events',batch=>events.push(...batch.events));
 const started=performance.now();let fired=false;
 const timer=setInterval(()=>{
  const p=host.player.position,r=rival.position;
  input.yaw=Math.atan2(-(r.x-p.x),-(r.z-p.z));input.pitch=0;
  if(!fired&&performance.now()-started>1800){session.rival.enter('rival-escape',host.now());input.cast();fired=true;}
  const last=e.takes.find(t=>t.key==='tutorial.cannot-settled'&&t.endedAt);
  if(!last)return;
  clearInterval(timer);clearInterval(e.monitor);off();input.releaseInputs();input.movement=originalMovement;input.enabled=false;
  e.recorder?.stop();e.restoreSound();__ssSound.sound.master.disconnect(e.audioDest);
  const output={fixture:'Recently wounded Rival at 10 HP on the straight escape lane. Ordinary first Fireball, live AAC playback, unchanged physics and damage.',tutorialAt:e.tutorialAt,endedAt:(performance.now()-e.began)/1000,takes:e.takes,speech:e.speech,events,samples:e.samples.filter((_,i)=>i%5===0),firstFacts:e.firstFacts};
  document.getElementById('vo-test-result').textContent=JSON.stringify(output);
 },25);
 return 'Simultaneous hit and constitution case running with real audio';
})()
