import {biByeRootFrame} from './biByeComponents.mjs';
import {boxWorld,orientedBoxHit} from '../src/orientedBox.mjs';
export const SO_FIST_SCALE=2.85;
// Authored native dimensions. All world geometry, steering and operator locators
// derive from this single scale; meshes and authority share the same frame.
export const SO_FIST_FIT=Object.freeze({wheelbase:.745*SO_FIST_SCALE,frontTrack:.86*SO_FIST_SCALE,rearTrack:.74*SO_FIST_SCALE,operator:[0,0,-2.85/2.65].map(v=>v*SO_FIST_SCALE),grips:[.4,1.15,-2.42].map(v=>v/2.65*SO_FIST_SCALE)});
const fit=v=>v/2.65*SO_FIST_SCALE;
export const SO_FIST_WHEELS=Object.freeze(['FL','FR','RL','RR'].map(end=>({id:'Wheel_'+end,pivot:[(end[1]==='L'?1:-1)*(end[0]==='F'?.43:.37)*SO_FIST_SCALE,.165*SO_FIST_SCALE,(end[0]==='F'?.325:-.42)*SO_FIST_SCALE],radius:.165*SO_FIST_SCALE,maxHealth:180})));
// Measured from the verified GLB, Ram_Assembly translation, relative to standby.
export const SO_FIST_STROKE=Object.freeze([[0,0],[.2,-.008],[.45,-.028],[.75,-.06],[1.05,-.088],[1.3,-.101],[1.45,-.105],[1.65,-.105],[1.85,-.105],[1.95,-.105],[2.02,-.105],[2.08,-.103],[2.13,-.02],[2.18,.145],[2.22,.335],[2.26,.445],[2.31,.402],[2.37,.428],[2.45,.412],[2.56,.418],[2.72,.415],[3,.31],[3.35,.165],[3.68,.048],[3.88,.006],[4,0]]);
export function soFistPose(b,now=b?.poseTime??0){
 const age=b.strikeAt==null?4:Math.max(0,now-b.strikeAt);
 if(age>=4)return{age,clipAge:0,offset:0,velocity:0,active:false};
 for(let i=1;i<SO_FIST_STROKE.length;i++){
  const [t,z]=SO_FIST_STROKE[i],[a,p]=SO_FIST_STROKE[i-1];if(age>=t-1e-8)continue;
  const offset=(p+(z-p)*(age-a)/(t-a))*SO_FIST_SCALE,velocity=(z-p)/(t-a)*SO_FIST_SCALE,active=age>=2.08&&age<2.26;
  if(b.strokeLimit!=null&&offset>b.strokeLimit){
   let clipAge=2.08;
   for(let j=12;j<=15;j++){const [v,q]=SO_FIST_STROKE[j],[u,r]=SO_FIST_STROKE[j-1];if(q*SO_FIST_SCALE>=b.strokeLimit){clipAge=u+(b.strokeLimit/SO_FIST_SCALE-r)/(q-r)*(v-u);break;}}
   return{age,clipAge,offset:b.strokeLimit,velocity:Math.min(Math.max(0,velocity),Math.max(0,(b.strokeLimit-(b.strokePreviousOffset??b.strokeLimit))/(b.strokeStepDt??1))),active:active&&now<=(b.strokeBlockedAt??-Infinity)+1e-8};
  }
  return{age,clipAge:age,offset,velocity,active};
 }
 return{age,clipAge:0,offset:0,velocity:0,active:false};
}
export function soFistTurnRate(b){
 // Inner steering wheel is bounded to 45 degrees. Useful crawl steering remains
 // proportional to distance travelled; a parked carriage never pivots in place.
 const radius=SO_FIST_FIT.wheelbase+SO_FIST_FIT.frontTrack/2;
 return -(b.steer??0)*Math.sign(b.speed??0)*Math.min(1.4,Math.abs(b.speed??0)/radius);
}
export function soFistWheelSteering(b){
 const speed=Math.abs(b.speed??0),curvature=speed>.001?-soFistTurnRate({...b,speed})/speed:0;
 if(Math.abs(curvature)<1e-6)return [0,0,0,0];const radius=1/curvature;
 return SO_FIST_WHEELS.map((w,i)=>i<2?-Math.atan(SO_FIST_FIT.wheelbase/(radius+w.pivot[0])):0);
}
export const soFistFrame=b=>biByeRootFrame(b);
export function soFistVolumes(b,now=b?.poseTime??0){
 if(!b||b.retired)return[];const root=soFistFrame(b),pose=soFistPose(b,now),out=[];
 const add=(id,center,size,material='timber',native=false)=>{if(!native){center=center.map(fit);size=size.map(fit);}return out.push({id:`sofist-${b.id}-${id}`,componentId:id,material,center:boxWorld(root,center),axes:root.axes,size});};
 const native=(id,center,size,material='timber')=>add(id,center.map(v=>v*SO_FIST_SCALE),size.map(v=>v*SO_FIST_SCALE),material,true);
 // Physical framing is separate from the cylinder and drivetrain. The open
 // timber structure must not turn back into one large opaque damage box.
 for(const side of [-1,1]){
  native('hull',[side*.18,.19,-.10],[.18,.16,1.40]);native('hull',[side*.30,.55,-.10],[.18,.18,1.39]);
  native('hull',[side*.30,.343,.58],[.10,.55,.09]);native('hull',[side*.30,.40,-.77],[.10,.66,.09]);
  native('hull',[side*.215,.30,-.90],[.045,.265,.075],'metal');
  native('hull',[side*.29,.385,.575],[.055,.29,.055],'metal');
 }
 native('hull',[0,.106,-.172],[.55,.075,1.504]);
 for(const z of [.58,-.14,-.77])native('hull',[0,.155,z],[.75,.105,.10]);
 for(const [z,span]of [[.325,.86],[-.42,.74]])native('hull',[0,.165,z],[span,.055,.055],'metal');
 native('hull',[0,.433,-.90],[.43,.089,.071]);native('hull',[0,.56,.575],[.62,.045,.055],'metal');
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const d=Math.hypot(...a);return a.map(v=>v/d);};
 const brace=(a,b,width)=>{
  const delta=b.map((v,i)=>v-a[i]),forward=unit(delta),right=unit(cross([0,1,0],forward)),up=cross(forward,right);
  native('hull',a.map((v,i)=>(v+b[i])/2),[width,width,Math.hypot(...delta)]);
  out.at(-1).axes=[right,up,forward].map(axis=>boxWorld(root,axis,true));
 };
 for(const side of [-1,1]){
  for(const z of [.48,-.14,-.65])brace([side*.18,.18,z],[side*.30,.55,z],.09);
  brace([side*.30,.53,.50],[side*.18,.19,-.14],.095);brace([side*.18,.19,-.14],[side*.30,.53,-.70],.095);
 }
 native('Drive',[0,.385,-.56],[.53,.252,.224],'metal');
 for(const [i,w]of SO_FIST_WHEELS.entries()){add(w.id,[w.pivot[0],w.pivot[1]+(b.wheelOffsets?.[i]??0),w.pivot[2]],[.127*SO_FIST_SCALE,w.radius*2,w.radius*2],'timber',true);if(i<2){const a=soFistWheelSteering(b)[i],c=Math.cos(a),s=Math.sin(a);out.at(-1).axes=[root.axes[0].map((v,k)=>v*c-root.axes[2][k]*s),root.axes[1],root.axes[0].map((v,k)=>v*s+root.axes[2][k]*c)];}}
 if((b.components?.Fist?.health??500)>0)add('Fist',[-.021,.353, .732].map((n,i)=>n*SO_FIST_SCALE+(i===2?pose.offset:0)),[.494,.436,.435].map(n=>n*SO_FIST_SCALE),'metal',true);
 add('Piston',[0,.967,-.262+pose.offset*2.65/SO_FIST_SCALE],[.88,.88,3.228],'metal');return out;
}
export function soFistStriker(b,now){
 const pose=soFistPose(b,now);
 return b.components.Fist.health>0?soFistVolumes(b,now).find(v=>v.componentId==='Fist'):{componentId:'Piston',axes:soFistFrame(b).axes,center:boxWorld(soFistFrame(b),[0,fit(.965),fit(1.347-.06)+pose.offset]),size:[.848,.848,.12].map(fit)};
}
export function soFistFirstHit(b,start,end,now,grow=0){let best=null;for(const box of soFistVolumes(b,now)){const h=orientedBoxHit(start,end,box,grow);if(h&&(!best||h.t<best.t))best=h;}return best;}
export function soFistSolids(b){return soFistVolumes(b).map(v=>({...v,kind:'siege-chassis'}));}
const IDENTITY_AXES=[[1,0,0],[0,1,0],[0,0,1]];
export function machineryOverlap(a,b){
 const dot=(x,y)=>x.reduce((n,v,i)=>n+v*y[i],0),cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],B=b.axes??IDENTITY_AXES,delta=b.center.map((v,i)=>v-a.center[i]);
 const separated=axis=>{if(dot(axis,axis)<1e-10)return false;const r=(box,axes)=>axes.reduce((n,v,i)=>n+Math.abs(dot(v,axis))*box.size[i]/2,0);return Math.abs(dot(delta,axis))>=r(a,a.axes)+r(b,B)-.002;};
 // Most world pieces are far away. Reject on the face axes before constructing
 // any edge cross products; the exact same SAT axes still handle close pairs.
 for(const axis of a.axes)if(separated(axis))return false;
 for(const axis of B)if(separated(axis))return false;
 for(const u of a.axes)for(const v of B)if(separated(cross(u,v)))return false;
 return true;
}
