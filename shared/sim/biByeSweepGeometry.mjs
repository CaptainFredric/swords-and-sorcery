// Extracted from the *actual* Argon 26-clip GLB animation accessors. All
// numbers below are exported keyframes, not fabricated hit event markers.
// This collision-only representation is limited to the two main bow limbs.
// Original PBR GLB SHA256: 9d1a8e7920b445c29546336d1bf00190b6837549941bd84c75858f64662619e6
import {biByeFrames} from './biByeComponents.mjs';
import {boxWorld} from '../src/orientedBox.mjs';

const SINGLE_TIMES=[0,.26,.45,.68,.86,1.04,1.32,1.65];
// Node-local quaternions [x,y,z,w], preserving the real GLB's 25-degree
// mirrored Y hinges and the additional X/Z articulation during impact.
const SINGLE_L=[
 [0,-.21643962,0,.97629601],
 [-.03051365,-.24851371,.11798751,.96093124],
 [-.01748735,-.14242306,.12060817,.98227471],
 [-.01590714,-.12955326,.12082674,.98405480],
 [-.01725217,-.16414344,.10309492,.98088264],
 [-.01509806,-.21591240,.06810297,.97391784],
 [0,-.21643962,0,.97629601],
 [0,-.21643962,0,.97629601]];
const SINGLE_R=[
 [0,.21643962,0,.97629601],
 [-.03051365,.24851371,-.11798751,.96093124],
 [-.01748735,.14242306,-.12060817,.98227471],
 [-.01590714,.12955326,-.12082674,.98405480],
 [-.01725217,.16414344,-.10309492,.98088264],
 [-.01509806,.21591240,-.06810297,.97391784],
 [0,.21643962,0,.97629601],
 [0,.21643962,0,.97629601]];
// Clip 26 fully lowered stance at .45 seconds; 23 itself has *rest*
// limb tracks, so they must never cancel the lowered stance on the renderer.
const STANCE_L=[-.02637736,-.21482633,.11898056,.96901888];
const STANCE_R=[-.02637736,.21482633,-.11898056,.96901888];
const REST_L=SINGLE_L[0],REST_R=SINGLE_R[0];
const normalize=q=>{const m=Math.hypot(...q);return q.map(v=>v/m);};
function slerp(a,b,t){
 if(t<=0)return a;if(t>=1)return b;
 let dot=a.reduce((n,x,i)=>n+x*b[i],0);
 if(dot<0){b=b.map(x=>-x);dot=-dot;}
 if(dot>.9995)return normalize(a.map((x,i)=>x+(b[i]-x)*t));
 const arc=Math.acos(Math.max(-1,Math.min(1,dot))),sin=Math.sin(arc);
 const x=Math.sin((1-t)*arc)/sin,y=Math.sin(t*arc)/sin;
 return a.map((v,i)=>v*x+b[i]*y);
}
export function authoredSweepLimbQuaternion(sign,clipTime=null,lower=1){
 const rest=sign<0?REST_L:REST_R,stance=sign<0?STANCE_L:STANCE_R;
 if(!Number.isFinite(clipTime))return slerp(rest,stance,Math.max(0,Math.min(1,lower)));
 const times=SINGLE_TIMES,quats=sign<0?SINGLE_L:SINGLE_R;
 for(let k=1;k<times.length;k++)if(clipTime<=times[k])
   return slerp(quats[k-1],quats[k],Math.max(0,Math.min(1,(clipTime-times[k-1])/(times[k]-times[k-1]))));
 return quats.at(-1);
}
const rotate=(v,q)=>{
 const [x,y,z,w]=q,[vx,vy,vz]=v;
 const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
 return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
};
// Tight mesh POSITION bounds from Main_Limb_[L/R] (GLB meshes 13,14).
// The original mesh is *offset* relative to its hinge, so the collision box
// must include both the quaternion and the actual local AABB center.
const LIMB_HALF=[.99638453,.23000001,.31736018],MESH_CENTRE=.83438453,MESH_Z=-.00364564;
export function authoredBiByeSweepVolumes(ballista,{clipTime=null}={}){
 const cradle=biByeFrames(ballista).cradle,lower=ballista.sweep?.lower??1;
 return [-1,1].map((sign,i)=>{
  const q=authoredSweepLimbQuaternion(sign,clipTime,lower);
  const hinge=boxWorld(cradle,[sign*.88,.18,1.04]);
  const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>boxWorld(cradle,rotate(v,q),true));
  const offset=boxWorld(cradle,rotate([sign*MESH_CENTRE,0,MESH_Z],q),true);
  return {id:'bibye-sweep-limb-'+(sign<0?'L':'R'),componentId:'hull',
   center:hinge.map((v,j)=>v+offset[j]),axes:basis,
   size:LIMB_HALF.map(v=>v*2),assembly:'main',material:'timber',kind:'siege-sweep'};
 });
}
