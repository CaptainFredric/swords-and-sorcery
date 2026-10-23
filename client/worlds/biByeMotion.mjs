// Interpolate only between received authoritative poses. Never predict a heavy
// carriage through an obstacle. Animation and bolt visuals use the same clock.
const lerp=(a,b,t)=>a+(b-a)*t;
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export class BiByeMotion {
 constructor(){this.samples=[];}
 push(ballista,projectiles,time){
  const last=this.samples.at(-1);
  if(!ballista){this.samples=[];return;}
  if(last?.time===time)return;
  const repaired=last&&Object.entries(ballista.components??{}).some(([id,c])=>c.health>(last.ballista.components?.[id]?.health??c.health));
  if(last&&(repaired||last.ballista.id!==ballista.id||time<last.time||ballista.health>last.ballista.health||Math.hypot(ballista.position.x-last.ballista.position.x,ballista.position.z-last.ballista.position.z)>3))this.samples=[];
  this.samples.push({ballista,projectiles,time});if(this.samples.length>8)this.samples.shift();
 }
 sample(now,local=false,frozen=false){
  const list=this.samples,last=list.at(-1);
  if(!last)return {ballista:null,projectiles:[],clock:now};
  const clock=frozen?last.time:Math.max(list[0].time,Math.min(last.time,now-(local?1/30:.075)));
  let a=list[0],b=last;
  for(let i=1;i<list.length;i++){if(list[i].time>=clock){b=list[i];a=list[i-1];break;}a=list[i];}
  const t=a===b?0:Math.max(0,Math.min(1,(clock-a.time)/(b.time-a.time)));
  const discrete=clock>=b.time-1e-8?b.ballista:a.ballista;
  const ballista={...discrete,position:{},poseTime:clock};
  for(const k of ['x','y','z']){ballista[k]=lerp(a.ballista.position[k],b.ballista.position[k],t);ballista.position[k]=ballista[k];}
  for(const k of ['heading','yaw'])ballista[k]=angle(a.ballista[k],b.ballista[k],t);
  for(const k of ['pitch','steer','speed'])ballista[k]=lerp(a.ballista[k]??0,b.ballista[k]??0,t);
  ballista.wheelRolls=(a.ballista.wheelRolls??[]).map((v,i)=>lerp(v,b.ballista.wheelRolls?.[i]??v,t));
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
