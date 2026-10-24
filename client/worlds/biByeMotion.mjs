// Interpolate only between received authoritative poses. Never predict a heavy
// carriage through an obstacle. Animation and bolt visuals use the same clock.
const lerp=(a,b,t)=>a+(b-a)*t;
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export class BiByeMotion {
 constructor(){this.samples=[];this.presentationClock=null;this.revision=0;}
 push(ballista,projectiles,time,revision=0){
  if(revision<this.revision)return;
  if(revision>this.revision){this.samples=[];this.presentationClock=null;this.revision=revision;}
  const last=this.samples.at(-1);
  if(!ballista){this.samples=[];this.presentationClock=null;return;}
  if(last?.time===time)return;
  const repaired=last&&Object.entries(ballista.components??{}).some(([id,c])=>c.health>(last.ballista.components?.[id]?.health??c.health));
  if(last&&(repaired||last.ballista.id!==ballista.id||time<last.time||ballista.health>last.ballista.health||Math.hypot(ballista.position.x-last.ballista.position.x,ballista.position.z-last.ballista.position.z)>3)){this.samples=[];this.presentationClock=null;}
  this.samples.push({ballista,projectiles,time});if(this.samples.length>8)this.samples.shift();
 }
 sample(now,local=false,frozen=false,dt=null){
  const list=this.samples,last=list.at(-1);
  if(!last)return {ballista:null,projectiles:[],clock:now};
  const desired=now-(local?1/30:.075);
  // serverNow is anchored to packet arrival, so network jitter changes its offset.
  // Slew only the presentation clock; authority, local prediction and aim keep
  // their ordinary clocks. Never extrapolate a carriage beyond received poses.
  if(local||frozen||!(dt>0))this.presentationClock=null;
  else if(this.presentationClock==null||Math.abs(desired-this.presentationClock)>.5)this.presentationClock=desired;
  else {const next=this.presentationClock+dt,error=desired-next;this.presentationClock=next+Math.max(-dt*.1,Math.min(dt*.1,error*.08));}
  if(this.presentationClock!=null)this.presentationClock=Math.min(last.time,this.presentationClock);
  const clock=frozen?last.time:Math.max(list[0].time,Math.min(last.time,this.presentationClock??desired));
  let a=list[0],b=last;
  for(let i=1;i<list.length;i++){if(list[i].time>=clock){b=list[i];a=list[i-1];break;}a=list[i];}
  const t=a===b?0:Math.max(0,Math.min(1,(clock-a.time)/(b.time-a.time)));
  const discrete=clock>=b.time-1e-8?b.ballista:a.ballista;
  const ballista={...discrete,position:{},poseTime:clock};
  for(const k of ['x','y','z']){ballista[k]=lerp(a.ballista.position[k],b.ballista.position[k],t);ballista.position[k]=ballista[k];}
  for(const k of ['heading','yaw','mainYaw','upperYaw'])ballista[k]=angle(a.ballista[k]??a.ballista.yaw??a.ballista.heading??0,b.ballista[k]??b.ballista.yaw??b.ballista.heading??0,t);
  for(const k of ['pitch','mainPitch','upperPitch','steer','speed','chassisPitch','chassisRoll'])ballista[k]=lerp(a.ballista[k]??0,b.ballista[k]??0,t);
  ballista.wheelRolls=(a.ballista.wheelRolls??[]).map((v,i)=>lerp(v,b.ballista.wheelRolls?.[i]??v,t));
  for(const key of ['wheelOffsets','stabilizerTilts'])ballista[key]=(a.ballista[key]??[]).map((v,i)=>lerp(v,b.ballista[key]?.[i]??v,t));
  const old=new Map(a.projectiles.map(p=>[p.id,p]));
  const projectiles=[];
  for(const p of b.projectiles){
   if(p.bornAt>clock)continue;
   const before=old.get(p.id);
   const position={};
   for(const k of ['x','y','z'])position[k]=before?lerp(before.position[k],p.position[k],t):p.position[k]+(p.velocity?.[k]??0)*(clock-b.time);
   projectiles.push({...p,position});
  }
  return {ballista,projectiles,clock};
 }
}
