(async()=>{
 const prior=window.__tutorialPlaytest;prior?.stop();
 const {GREENER_ROUTE}=await import('/shared/worlds/greenerPastures.mjs');
 const session=__ssTutorial,runtime=__ssRuntime,host=__ssLink.local,input=runtime.input;
 const originalMovement=input.movement.bind(input),state={forward:0,right:0,sprint:false,jump:false,crouch:false};
 const log=prior?.log??[],events=prior?.events??[],frames=prior?.frames??[];let current='',since=0,lastAttack=-Infinity,lastCast=-Infinity,lastDash=-Infinity,priorFrame=performance.now(),running=true;
 const began=prior?.began??host.now();input.enabled=true;
 const off=host.on('events',batch=>events.push(...batch.events.filter(e=>['dash','spellCast','damage','guardBreak','death'].includes(e.type))));
 input.movement=()=>({...state,attack:input.attackHeld,guard:input.guardHeld,yaw:input.yaw,pitch:input.pitch});
 function frame(t){if(!running)return;frames.push(t-priorFrame);priorFrame=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
 const stop=()=>{if(!running)return;running=false;clearInterval(timer);off();input.releaseInputs();input.movement=originalMovement;input.enabled=Boolean(input.pointerLocked||input.touchFocus);};
 const timer=setInterval(()=>{
  const now=host.now(),beat=session.director.current,p=host.player,r=host.room?.players.get(session.rivalId);
  if(!beat||!p||!r){stop();return;}
  const freshBeat=beat.id!==current;
  if(freshBeat){current=beat.id;since=now;log.push({at:+(now-began).toFixed(2),beat:current,mode:session.rival.mode,run:session.director.runId,health:p.health,stamina:p.guardStamina,position:{...p.position},rival:{...r.position}});}
  state.forward=0;state.right=0;state.sprint=false;state.jump=false;input.pitch=0;
  if(beat.kind==='dialogue'&&beat.presentation!=='reactive'){
   // Every spoken line belongs to the actual processed take and its real ended event.
   return;
  }
  let target=r.position,dx=target.x-p.position.x,dz=target.z-p.position.z,dist=Math.hypot(dx,dz),yaw=Math.atan2(-dx,-dz);
  if(beat.id==='look-prompt')input.turn(.026,0);
  else if(['approach','stamina'].includes(beat.segment)){
   input.yaw=yaw;state.forward=dist>2.5?1:0;state.sprint=beat.segment==='stamina'&&!['recover-prompt','reach-rival'].includes(beat.id);
   if(beat.id==='recover-prompt'||!session.allows('move',false)||freshBeat&&beat.id==='walk-prompt')state.forward=0;
  }else if(['first-attack','first-guard','health-regen','real-duel'].includes(beat.segment)){
   input.yaw=yaw;state.forward=dist>1.85?.6:0;
   if(session.rival.mode!=='duel'){
    input.setGuard(['guard-attack-start','guard-prompt'].includes(beat.id),'playtest');
    if(beat.id==='attack-prompt'&&now-lastAttack>1.5){input.setAttack(true);lastAttack=now;}
    else if(now-lastAttack>.3)input.setAttack(false);
   }
  }else if(session.allows('attack',false)&&beat.segment!=='title-ending'){
   if(session.rival.mode!=='final-fight'){input.setGuard(false,'playtest');input.setAttack(false);}
   const bridge=GREENER_ROUTE.bridge;
   const stile=GREENER_ROUTE.jump;
   if(p.position.z>stile.landing.z&&r.position.z<=stile.takeoff.z){
    target=p.position.z>stile.takeoff.z+1?stile.takeoff:stile.waitPoint;dx=target.x-p.position.x;dz=target.z-p.position.z;dist=Math.hypot(dx,dz);yaw=Math.atan2(-dx,-dz);
    if(p.position.z<=stile.takeoff.z+1&&session.allows('jump',false))state.jump=p.grounded;
   }
   if(p.position.z>bridge.ravineBounds.minZ&&r.position.z<bridge.ravineBounds.maxZ){target=p.position.z>bridge.gapBounds.minZ?bridge.dashStart:GREENER_ROUTE.waypointById['far-bank'];dx=target.x-p.position.x;dz=target.z-p.position.z;dist=Math.hypot(dx,dz);yaw=Math.atan2(-dx,-dz);}
   input.yaw=yaw;state.forward=dist>(target===bridge.dashStart||target===stile.takeoff?.1:1.8)?1:0;state.sprint=dist>10;
   if(['counterfire','complaint'].includes(session.rival.mode))state.right=Math.cos(now*2.8)*.8;
   if(p.position.z<=bridge.dashStart.z+1&&p.position.z>bridge.gapBounds.minZ){
    input.yaw=0;state.sprint=true;
    if(session.allows('dash',false)&&events.some(e=>e.type==='death'&&e.victimId===p.id&&e.source==='abyss')){state.forward=1;state.jump=p.grounded;if(!p.grounded&&p.velocity.y<=0&&now-lastDash>5.1){input.dash();lastDash=now;}}else if(session.allows('dash',false)){state.forward=1;state.sprint=false;state.jump=false;}else state.forward=0;
   }
   if(['fireball','counterfire'].includes(beat.segment)&&now-lastCast>4.1){input.yaw=Math.atan2(-(r.position.x-p.position.x),-(r.position.z-p.position.z));input.pitch=-.04;input.cast();lastCast=now;}
  }
  if(['duel','final-fight'].includes(session.rival.mode)){
   dx=r.position.x-p.position.x;dz=r.position.z-p.position.z;dist=Math.hypot(dx,dz);input.yaw=Math.atan2(-dx,-dz);state.forward=dist>1.85?.65:0;state.sprint=false;
   const mine=p.attackActive?p.attackStartedAt+([.4,1.1,1.8][p.attackNextStrike]??Infinity):Infinity,theirs=r.attackActive?r.attackStartedAt+([.4,1.1,1.8][r.attackNextStrike]??Infinity):Infinity;
   const guarding=now>=p.staggerUntil&&r.attackActive&&now-r.attackStartedAt>.27&&theirs<mine&&dist<3.2;
   input.setGuard(guarding,'playtest');input.setAttack(!guarding);
  }
  if(beat.id==='player-departure'){const at=GREENER_ROUTE.departure;input.yaw=Math.atan2(-(at.x-p.position.x),-(at.z-p.position.z));state.forward=1;}
  if(p.pendingSpell){const travelYaw=yaw,scale=state.forward,side=state.right;input.yaw=Math.atan2(-(r.position.x-p.position.x),-(r.position.z-p.position.z));input.pitch=-.04;const delta=input.yaw-travelYaw;state.forward=Math.cos(delta)*scale-Math.sin(delta)*side;state.right=Math.sin(delta)*scale+Math.cos(delta)*side;}
 },25);
 window.__tutorialPlaytest={log,events,frames,stop,get current(){return current;},began};
 return 'Real input playtest started; gameplay gates, health, damage and cooldowns are unchanged.';
})()
