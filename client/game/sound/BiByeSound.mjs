import { ring, spatialize } from './soundRecipes.mjs';

const noise=(freq,decay,gain,at=0,filter='bandpass',q=.7)=>({type:'noise',filter,freq,q,attack:.002,decay,gain,at});
const thud=(freq,decay,gain,at=0)=>({type:'tone',wave:'sine',freq,slideTo:Math.max(28,freq*.46),attack:.003,decay,gain,at});
const ticks=(count,step,freq,gain)=>Array.from({length:count},(_,i)=>noise(freq,.025,gain*(1-i/(count*1.4)),i*step,'highpass'));
export function biByeRecipe(kind,rand=Math.random){
 const wood=[noise(410,.16,.48),thud(115,.23,.60),{...ring(rand,185,{decay:.24,gain:.06,partials:3}),at:.015}];
 const metal=[noise(1900,.06,.3),thud(160,.13,.35),ring(rand,375,{decay:.42,gain:.12,partials:4})];
 const recipes={
  shotI:[noise(1400,.09,.36),thud(210,.15,.36),noise(650,.22,.22,.04),ring(rand,720,{decay:.38,gain:.055,partials:3})],
  shotII:[noise(580,.14,.72),thud(86,.38,.88),noise(2300,.04,.42),{...ring(rand,162,{decay:.65,gain:.14,partials:4}),at:.025},...ticks(4,.055,1100,.10)],
  deploy:[noise(280,.42,.25),thud(130,.24,.32),...ticks(5,.12,1450,.12)],
  retract:[noise(380,.37,.25),...ticks(5,.11,1750,.11),thud(165,.13,.25,.53)],
  settle:[noise(230,.25,.2),thud(100,.22,.25),...ticks(3,.07,950,.08)],
  catch:[noise(2150,.04,.3),thud(180,.11,.35),ring(rand,420,{decay:.23,gain:.07,partials:3})],
  wood,metal,wheel:[...wood,...ticks(3,.05,750,.10)],stabilizer:[...metal,noise(340,.22,.3)],
  failure:[...wood,noise(1200,.18,.28),...ticks(5,.07,1700,.16),thud(70,.45,.55,.06)],
  wreck:[noise(380,.65,.62),noise(1700,.3,.3),thud(58,.8,.8),...ticks(7,.09,1300,.18)],
  creak:[noise(260,.28,.13,0,'bandpass',5),noise(380,.21,.10,.06,'bandpass',7)],
  latch:[noise(2200,.025,.21),thud(240,.08,.25)],
  delay:[noise(2800,.02,.13),ring(rand,580,{decay:.15,gain:.035,partials:2}),...ticks(3,.06,2500,.055)],
  upperCatch:[noise(2850,.025,.15),thud(310,.065,.16)],
  release:[noise(1500,.04,.17),thud(180,.06,.13)],
  steamRelease:[noise(3100,.36,.52,0,'bandpass',1.3),noise(4400,.26,.35,.02,'highpass'),thud(90,.22,.42)],
  frost:[noise(2300,.3,.33),noise(5400,.12,.12),ring(rand,1100,{decay:.38,gain:.055,partials:3})],
  siegeImpact:[...wood,noise(2200,.09,.38),thud(72,.35,.55)],
 };
 return {tag:kind,layers:recipes[kind]??wood,reverb:kind==='shotII'?.32:kind==='wreck'?.4:.16};
}
// Two seconds of wood rumble and irregular metal contact, with no engine tone.
// The closed seam and bounded sample amplitude permit quiet continuous looping.
export function biByeLoopSamples(kind,rate=22050,seconds=2,rand=Math.random){
 const result=new Float32Array(Math.floor(rate*seconds));let low=0;
 for(let i=0;i<result.length;i++){
  const t=i/rate,white=rand()*2-1;low=.94*low+.06*white;
  const freq=kind==='roll'?6:kind==='recock'?14:kind==='ratchet'?22:kind==='pressure'?28:9;
  const phase=(t*freq)%1;
  const contact=Math.exp(-phase*(kind==='roll'?24:kind==='pressure'?18:kind==='ratchet'?55:45));
  const seam=Math.min(1,i/(rate*.02),(result.length-1-i)/(rate*.02));
  if(kind==='roll'){
    result[i]=seam*(low*.28+contact*Math.sin(2*Math.PI*91*t)*.12);
  }else if(kind==='ratchet'){
    result[i]=seam*(contact*(white*.2+Math.sin(2*Math.PI*1350*t)*.16));
  }else if(kind==='pressure'){
    result[i]=seam*(low*.24+white*.14+contact*Math.sin(2*Math.PI*175*t)*.15);
  }else{
    result[i]=seam*contact*(white*.12+Math.sin(2*Math.PI*(kind==='recock'?850:430)*t)*.08);
  }
 }return result;
}
export class BiByeSound {
 constructor(engine){this.engine=engine;this.loops=new Map();this.ones=[];this.seen=new Set();this.buffers=new Map();this.active=false;this.last=null;this.nextCreak=0;this.settleAt=null;}
 #place(b){return spatialize(this.options?.listener,this.options?.yaw??0,b.position??{x:b.x,y:b.y,z:b.z});}
 play(kind,b,gain=1){
  if(!this.active||!this.engine?.running)return;
  const place=this.#place(b);
  const handle=this.engine.play(biByeRecipe(kind),{bus:'sfx',pan:place.pan,gain:place.gain*gain});
  if(handle)this.ones.push(handle);if(this.ones.length>24)this.ones.shift();
 }
 #play(kind,b,gain=1){return this.play(kind,b,gain);}
 loop(kind,wanted,b,gain,rate=1){
  if(!wanted){this.loops.get(kind)?.stop(.08);this.loops.delete(kind);return;}
  const place=this.#place(b),options={bus:'sfx',pan:place.pan,gain:place.gain*gain,rate,loop:true,attack:.06};
  if(!this.loops.has(kind)){
   if(!this.buffers.has(kind))this.buffers.set(kind,this.engine.buffer(biByeLoopSamples(kind),22050));
   const handle=this.engine.playBuffer(this.buffers.get(kind),options);if(handle)this.loops.set(kind,handle);
  }else this.loops.get(kind).place({gain:options.gain,pan:options.pan,rate});
 }
 #loop(kind,wanted,b,gain,rate=1){return this.loop(kind,wanted,b,gain,rate);}
 update(b,options){
  const last=this.last;this.options=options;
  if(last&&(last.operatorId!==b?.operatorId||last.id!==b?.id||options.now<this.lastTime))this.stop();
  if(last&&(last.id!==b?.id||options.now<this.lastTime))this.seen.clear();
  this.lastTime=options.now;
  this.active=Boolean(options.active&&b&&this.engine?.running&&!this.engine?.muted);
  if(!this.active){this.stop();this.last=b;return;}
  if(last?.id!==b.id&&Number.isFinite(b.builtAt)&&options.now-b.builtAt<.75)this.#play('deploy',b,.55);
  const owned=Boolean(b.operatorId)&&b.mode!=='DESTROYED',moving=owned&&Math.abs(b.speed??0)>.04;
  this.#loop('roll',moving,b,.30,Math.max(.4,Math.abs(b.speed??0)/3.2));
  const elapsed=Math.max(.001,options.now-(this.poseAt??options.now));
  const turn=last ? Math.abs(Math.atan2(Math.sin((b.upperYaw??b.yaw)-(last.upperYaw??last.yaw)),Math.cos((b.upperYaw??b.yaw)-(last.upperYaw??last.yaw))))/elapsed : 0;
  this.#loop('turn',owned&&turn>.035,b,Math.min(.16,turn*.12),Math.max(.6,Math.min(1.4,turn/.8)));
  this.poseAt=options.now;
  const upper=b.upperFiredAt??b.mobileFiredAt;
  const recock=upper!=null&&options.now>upper+.85&&options.now<b.smallBoltReadyAt;
  const primed=owned&&b.skill?.phase==='primed';
  this.#loop('winch',owned&&b.state==='RELOADING',b,.23);
  this.#loop('recock',owned&&recock,b,.14,1.12);
  this.#loop('ratchet',primed,b,.13,1.05);
  if(last?.mode!==b.mode){if(b.mode==='DEPLOYING')this.#play('deploy',b);if(b.mode==='RETRACTING')this.#play('retract',b);}
  if(moving&&Math.abs((b.steer??0)-(last?.steer??0))>.25&&options.now>this.nextCreak){this.#play('creak',b,.7);this.nextCreak=options.now+.55;}
  if(this.settleAt!=null&&options.now>=this.settleAt){this.#play('settle',b);this.settleAt=null;}
  this.last={...b};
 }
 event(event,b,now){
  if((!event.type?.startsWith('bibye')&&event.type!=='siegeImpact')||!b||!this.active||
      event.ballistaId&&event.ballistaId!==b.id||event.type==='siegeImpact'&&event.machineId!==b.id||Math.abs(now-event.at)>1)return;
  const key=[event.type,event.ballistaId,event.at,event.componentId,event.shot,event.projectileId].join(':');
  if(this.seen.has(key))return;this.seen.add(key);if(this.seen.size>160)this.seen.delete(this.seen.values().next().value);
  let kind=null;
  if(event.type==='bibyeFired'){kind=event.shot.startsWith('II')?'shotII':'shotI';this.settleAt=event.at+(event.shot.startsWith('II')?.45:.3);}
  if(event.type==='bibyeReloadCompleted')kind='catch';
  if(event.type==='bibyeUpperRecocked')kind='upperCatch';
  if(event.type==='bibyeCouplingEngaged')kind='latch';
  if(event.type==='bibyeHeavyDelayTripped')kind='delay';
  if(event.type==='bibyeCouplingReleased')kind='release';
  if(event.type==='bibyeModeChanged')kind='catch';
  if(event.type==='bibyeDamaged'&&event.source!=='sword')kind=event.componentId?.startsWith('Wheel')?'wheel':event.componentId?.startsWith('Stabilizer')?'stabilizer':event.material==='metal'?'metal':'wood';
  if(event.type==='bibyeComponentFailed')kind='failure';
  if(event.type==='bibyeDestroyed'){this.stop();this.active=Boolean(this.options?.active);kind='wreck';}
  if(event.type==='bibyeBoltImpact')kind=event.subKind==='conditioning'?'frost':'siegeImpact';
   if(event.type==='siegeImpact'&&event.strength>.12)kind='siegeImpact';
  if(kind)this.#play(kind,event.point?{...b,position:event.point}:b,kind==='wreck'?.8:1);
 }
 stop(){this.active=false;for(const h of this.loops.values())h.stop(.06);this.loops.clear();for(const h of this.ones)h.stop?.(.06);this.ones=[];this.settleAt=null;}
 dispose(){this.stop();this.active=false;this.seen.clear();this.buffers.clear();}
}
