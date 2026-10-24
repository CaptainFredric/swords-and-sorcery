import {biByeRootFrame} from './biByeComponents.mjs';
import {boxWorld,orientedBoxHit} from '../src/orientedBox.mjs';
export const SO_FIST_SCALE=2.65;
export const SO_FIST_WHEELS=Object.freeze(['FL','FR','RL','RR'].map(end=>({id:'Wheel_'+end,pivot:[(end[1]==='L'?.338:-.338)*2.65,.165*2.65,(end[0]==='F'?.325:-.42)*2.65],radius:.165*2.65,maxHealth:180})));
// Measured from the verified GLB, Ram_Assembly translation, relative to standby.
export const SO_FIST_STROKE=Object.freeze([[0,0],[.2,-.008],[.45,-.028],[.75,-.06],[1.05,-.088],[1.3,-.101],[1.45,-.105],[1.65,-.105],[1.85,-.105],[1.95,-.105],[2.02,-.105],[2.08,-.103],[2.13,-.02],[2.18,.145],[2.22,.335],[2.26,.445],[2.31,.402],[2.37,.428],[2.45,.412],[2.56,.418],[2.72,.415],[3,.31],[3.35,.165],[3.68,.048],[3.88,.006],[4,0]]);
export function soFistPose(b,now=b?.poseTime??0){
 const age=b.strikeAt==null?4:Math.max(0,now-b.strikeAt);
 if(age>=4)return{age,clipAge:0,offset:0,velocity:0,active:false};
 for(let i=1;i<SO_FIST_STROKE.length;i++){
  const [t,z]=SO_FIST_STROKE[i],[a,p]=SO_FIST_STROKE[i-1];if(age>=t-1e-8)continue;
  const offset=(p+(z-p)*(age-a)/(t-a))*2.65,velocity=(z-p)/(t-a)*2.65,active=age>=2.08&&age<2.26;
  if(b.strokeLimit!=null&&offset>b.strokeLimit){
   let clipAge=2.08;
   for(let j=12;j<=15;j++){const [v,q]=SO_FIST_STROKE[j],[u,r]=SO_FIST_STROKE[j-1];if(q*2.65>=b.strokeLimit){clipAge=u+(b.strokeLimit/2.65-r)/(q-r)*(v-u);break;}}
   return{age,clipAge,offset:b.strokeLimit,velocity:Math.min(Math.max(0,velocity),Math.max(0,(b.strokeLimit-(b.strokePreviousOffset??b.strokeLimit))/(b.strokeStepDt??1))),active:active&&now<=(b.strokeBlockedAt??-Infinity)+1e-8};
  }
  return{age,clipAge:age,offset,velocity,active};
 }
 return{age,clipAge:0,offset:0,velocity:0,active:false};
}
export function soFistTurnRate(b){return -(b.steer??0)*Math.sign(b.speed??0)*Math.min(1.15,Math.abs(b.speed??0)/3.25);}
export function soFistWheelSteering(b){
 const speed=Math.abs(b.speed??0),curvature=speed>.001?-soFistTurnRate({...b,speed})/speed:0;
 if(Math.abs(curvature)<1e-6)return [0,0,0,0];const radius=1/curvature;
 return SO_FIST_WHEELS.map((w,i)=>i<2?-Math.atan(1.97425/(radius+w.pivot[0])):0);
}
export const soFistFrame=b=>biByeRootFrame(b);
export function soFistVolumes(b,now=b?.poseTime??0){
 if(!b||b.retired)return[];const root=soFistFrame(b),pose=soFistPose(b,now),out=[];
 const add=(id,center,size,material='timber')=>out.push({id:`sofist-${b.id}-${id}`,componentId:id,material,center:boxWorld(root,center),axes:root.axes,size});
 // Side rails, underside and rear frame leave the real winch accessible.
 for(const x of [-.64,.64]){add('hull',[x,.55,-.5],[.25,.4,3.9]);add('hull',[x,1.46,-.5],[.23,.22,3.9]);}
 add('hull',[0,.27,-.5],[1.45,.28,3.9]);
 add('hull',[0,.9,-2.29],[1.5,1.25,.3]);
 add('hull',[0,.97,1.23],[1.25,1.2,.25],'metal');
 add('Drive',[0,1.05,-1.5],[1.05,.63,.88],'metal');
 for(const [i,w]of SO_FIST_WHEELS.entries()){add(w.id,[w.pivot[0],w.pivot[1]+(b.wheelOffsets?.[i]??0),w.pivot[2]],[.34,w.radius*2,w.radius*2]);if(i<2){const a=soFistWheelSteering(b)[i],c=Math.cos(a),s=Math.sin(a);out.at(-1).axes=[root.axes[0].map((v,k)=>v*c-root.axes[2][k]*s),root.axes[1],root.axes[0].map((v,k)=>v*s+root.axes[2][k]*c)];}}
 if((b.components?.Fist?.health??500)>0)add('Fist',[-.021,.353, .732].map((n,i)=>n*2.65+(i===2?pose.offset:0)),[.494,.436,.435].map(n=>n*2.65),'metal');
 add('Piston',[0,.967,-.262+pose.offset],[.88,.88,3.228],'metal');return out;
}
export function soFistStriker(b,now){
 const pose=soFistPose(b,now);
 return b.components.Fist.health>0?soFistVolumes(b,now).find(v=>v.componentId==='Fist'):{componentId:'Piston',axes:soFistFrame(b).axes,center:boxWorld(soFistFrame(b),[0,.965,1.347+pose.offset-.06]),size:[.848,.848,.12]};
}
export function soFistFirstHit(b,start,end,now,grow=0){let best=null;for(const box of soFistVolumes(b,now)){const h=orientedBoxHit(start,end,box,grow);if(h&&(!best||h.t<best.t))best=h;}return best;}
export function soFistSolids(b){return soFistVolumes(b).map(v=>({...v,kind:'siege-chassis'}));}
export function machineryOverlap(a,b){
 const dot=(x,y)=>x.reduce((n,v,i)=>n+v*y[i],0),cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],B=b.axes??[[1,0,0],[0,1,0],[0,0,1]],delta=b.center.map((v,i)=>v-a.center[i]);
 for(const axis of [...a.axes,...B,...a.axes.flatMap(u=>B.map(v=>cross(u,v)))]){if(dot(axis,axis)<1e-10)continue;const r=(box,axes)=>axes.reduce((n,v,i)=>n+Math.abs(dot(v,axis))*box.size[i]/2,0);if(Math.abs(dot(delta,axis))>=r(a,a.axes)+r(b,B)-.002)return false;}return true;
}
