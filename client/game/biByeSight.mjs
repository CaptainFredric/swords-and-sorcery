import {biByeConstrainAim} from '../../shared/sim/biByeComponents.mjs';
import {getBiByeMuzzlePosition,getBiByeMuzzleDirection} from '../../shared/sim/biByeLlista.mjs';
const RAD=Math.PI/180,ratio=Math.tan(24*RAD)/Math.tan(39*RAD);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function clearOptics(blend,baseFov,active,dt){
 const target=active?1:0;
 blend=target+(blend-target)*Math.exp(-14*Math.max(0,dt));
 if(Math.abs(blend-target)<.0001)blend=target;
 const gain=1+(ratio-1)*blend;
 return {blend,gain,fov:2*Math.atan(Math.tan(baseFov*RAD/2)*gain)/RAD};
}
// Intersect a straight physical muzzle ray with the plane through the current
// aim surface. This is a sight projection, never a projectile steering command.
export function sightPlanePoint(origin,direction,camera,forward,range){
 const denominator=dot(direction,forward);
 if(denominator<=.01)return null;
 const t=(range-dot(origin.map((v,i)=>v-camera[i]),forward))/denominator;
 return t>0?origin.map((v,i)=>v+direction[i]*t):null;
}
export function sightWeaponRay(b,kind){
 const committed=b.coupling==='FIRING'&&b.committedAim&&(kind==='siege'?b.mainReleasedAt==null:b.upperReleasedAt==null)?b.committedAim:null;
 return {origin:Object.values(getBiByeMuzzlePosition(b,kind,committed)),direction:Object.values(getBiByeMuzzleDirection(b,kind,committed))};
}
export function sightLimits(b,aim,upper){
 const limits=[];
 for(const [side,key,delta]of [['left','yaw',-.012],['right','yaw',.012],['up','pitch',.012],['down','pitch',-.012]]){
  const wanted={...aim,[key]:aim[key]+delta},actual=biByeConstrainAim(b,wanted,upper);
  const error=key==='yaw'?Math.atan2(Math.sin(actual[key]-wanted[key]),Math.cos(actual[key]-wanted[key])):actual[key]-wanted[key];
  if(Math.abs(error)>.006)limits.push(side);
 }
 return limits;
}
// A sight ray can extend beyond the scene's draw distance. Project its bearing
// in camera space; the near/far rendering planes do not define aiming authority.
export function sightScreenPoint(local,fov,aspect){
 if(local[2]>=-.01)return null;
 const depth=-local[2]*Math.tan(fov*RAD/2),x=local[0]/(depth*aspect),y=local[1]/depth;
 return Math.abs(x)>.95||Math.abs(y)>.9?null:{x,y};
}
