import {SIEGE_SKILLS} from './siegeSkills.mjs';
import {biByeRootFrame} from './biByeComponents.mjs';
import {boxWorld,orientedBoxHit} from '../src/orientedBox.mjs';
export const SO_FIST_SCALE=2.85;
// Authored native dimensions. All world geometry, steering and operator locators
// derive from this single scale; meshes and authority share the same frame.
const native=p=>Object.freeze(p.map(v=>v*SO_FIST_SCALE));
export const SO_FIST_STATION=Object.freeze({
 entry:native([0,0,-1.25]),rider:native([0,.226,-.875]),pelvis:native([0,.515,-.885]),
 leftFoot:native([.115,.228,-.84]),rightFoot:native([-.115,.228,-.84]),
 leftHand:native([.12,.6,-.715]),rightHand:native([-.12,.6,-.715]),leverPull:native([0,.6,-.515]),
 sight:native([0,.835,-.82]),third:native([0,1.14,-2.1]),
 exits:Object.freeze([[0,0,-1.35],[.76,0,-.9],[-.76,0,-.9],[-.8,0,0],[.8,0,0]].map(native)),
});
export const SO_FIST_FIT=Object.freeze({wheelbase:1.145*SO_FIST_SCALE,frontTrack:.86*SO_FIST_SCALE,rearTrack:.74*SO_FIST_SCALE,operator:SO_FIST_STATION.rider,grips:SO_FIST_STATION.rightHand});
const fit=v=>v/2.65*SO_FIST_SCALE;
export const SO_FIST_WHEELS=Object.freeze(['FL','FR','RL','RR'].map(end=>({id:'Wheel_'+end,pivot:[(end[1]==='L'?1:-1)*(end[0]==='F'?.43:.37)*SO_FIST_SCALE,.165*SO_FIST_SCALE,(end[0]==='F'?.325:-.82)*SO_FIST_SCALE],radius:.165*SO_FIST_SCALE,maxHealth:180})));
// Sampled from the candidate's linear Ram_Assembly translation keys, relative to standby.
export const SO_FIST_TIMING=Object.freeze({release:.68,peak:.88,cycle:4});
export const soFistTiming=b=>b?.skillStroke?{release:b.skillStroke.prepare,peak:b.skillStroke.prepare+.2,cycle:4}:SO_FIST_TIMING;
export const SO_FIST_STROKE=Object.freeze([[0,0],[.08,-.008],[.18,-.028],[.29,-.06],[.4,-.088],[.49,-.101],[.55,-.105],[.59,-.105],[.62,-.105],[.64,-.105],[.66,-.105],[.68,-.103],[.73,-.02],[.79,.145],[.83,.335],[.88,.445],[.94,.402],[1,.428],[1.1,.412],[1.24,.418],[1.45,.415],[2.05,.31],[2.75,.165],[3.4,.048],[3.78,.006],[4,0]]);
// Map a recovery interruption onto the same authored physical stroke. Preparation
// starts at the current measured offset, including an obstacle-arrested stroke.
export function soFistPose(b,now=b?.poseTime??0){
 if(!b.skillStroke||b.strikeAt==null){const pose=normalSoFistPose(b,now),jitter=b.skill?.phase==='primed'?Math.sin(now*56.55)*SIEGE_SKILLS.beatToThePunch.shudder:0;return{...pose,offset:pose.offset+jitter,jitter};}
 const age=Math.max(0,now-b.strikeAt),{from,prepare}=b.skillStroke,rest=-.105*SO_FIST_SCALE;
 if(age>=4)return normalSoFistPose({...b,skillStroke:null,strikeAt:null},now);
 if(age<prepare){
  const t=age/prepare,offset=from+(rest-from)*(t*t*(3-2*t));
  let clipAge=.68;
  for(let i=1;i<SO_FIST_STROKE.length;i++){const [a,p]=SO_FIST_STROKE[i-1],[z,q]=SO_FIST_STROKE[i];if(a>=.68&&z<=.88&&offset<=q*SO_FIST_SCALE){clipAge=a+(offset/SO_FIST_SCALE-p)/(q-p)*(z-a);break;}}
  return{age,clipAge,offset,velocity:(rest-from)*6*t*(1-t)/prepare,active:false};
 }
 const outward=age-prepare,clipAge=outward<=.2?.68+outward:.88+(outward-.2)*3.12/(4-prepare-.2);
 const pose=normalSoFistPose({...b,strikeAt:now-clipAge},now);return{...pose,age};
}
function normalSoFistPose(b,now=b?.poseTime??0){
 const age=b.strikeAt==null?4:Math.max(0,now-b.strikeAt);
 if(age>=4)return{age,clipAge:0,offset:0,velocity:0,active:false};
 for(let i=1;i<SO_FIST_STROKE.length;i++){
  const [t,z]=SO_FIST_STROKE[i],[a,p]=SO_FIST_STROKE[i-1];if(age>=t-1e-8)continue;
  const offset=(p+(z-p)*(age-a)/(t-a))*SO_FIST_SCALE,velocity=(z-p)/(t-a)*SO_FIST_SCALE,active=age>=SO_FIST_TIMING.release&&age<SO_FIST_TIMING.peak;
  if(b.strokeLimit!=null&&offset>b.strokeLimit){
   let clipAge=SO_FIST_TIMING.release;
   for(let j=1;j<SO_FIST_STROKE.length;j++){
    const [v,q]=SO_FIST_STROKE[j],[u,r]=SO_FIST_STROKE[j-1];
    if(u<SO_FIST_TIMING.release-1e-6||v>SO_FIST_TIMING.peak+1e-6)continue;
    if(q*SO_FIST_SCALE>=b.strokeLimit){clipAge=u+(b.strokeLimit/SO_FIST_SCALE-r)/(q-r)*(v-u);break;}
   }
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
 for(const [z,span]of [[.325,.86],[-.82,.74]])native('hull',[0,.165,z],[span,.055,.055],'metal');
 native('hull',[0,.209,-.915],[.56,.034,.388]);
 for(const side of [-1,1]){native('hull',[side*.265,.36,-1.05],[.055,.32,.065],'metal');native('hull',[side*.268,.542,-.875],[.06,.06,.37]);}
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
 for(const [i,w]of SO_FIST_WHEELS.entries()){add(w.id,[w.pivot[0],w.pivot[1]+(b.wheelOffsets?.[i]??0),w.pivot[2]],[.144*SO_FIST_SCALE,w.radius*2,w.radius*2],'timber',true);if(i<2){const a=soFistWheelSteering(b)[i],c=Math.cos(a),s=Math.sin(a);out.at(-1).axes=[root.axes[0].map((v,k)=>v*c-root.axes[2][k]*s),root.axes[1],root.axes[0].map((v,k)=>v*s+root.axes[2][k]*c)];}}
 if((b.components?.Fist?.health??500)>0)add('Fist',[-.02845,.3849, .7288].map((n,i)=>n*SO_FIST_SCALE+(i===2?pose.offset:0)),[.5283,.4824,.4444].map(n=>n*SO_FIST_SCALE),'metal',true);
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
