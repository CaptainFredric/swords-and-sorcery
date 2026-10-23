import { segmentAabbHit } from '../src/collision.mjs';
import { boxNearest, boxWorld, orientedBoxHit } from '../src/orientedBox.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const DEG=Math.PI/180;
const ease=t=>{const k=clamp(t);return k*k*(3-2*k);};
export const BI_BYE_COMPONENTS=Object.freeze([
 ...['FL','FR','ML','MR','RL','RR'].map((end,i)=>Object.freeze({id:'Wheel_'+end,kind:'wheel',side:end[1],maxHealth:120,pivot:[end[1]==='L'?-1.075:1.075,.55,[1.2,-.34,-1.715][Math.floor(i/2)]]})),
 ...['FL','FR','RL','RR'].map(end=>Object.freeze({id:'Stabilizer_'+end,kind:'stabilizer',side:end[1],maxHealth:150,pivot:[end[1]==='L'?-1.18:1.18,.82,end[0]==='F'?1.05:-1.42]})),
]);
export function createBiByeComponents(){return Object.fromEntries(BI_BYE_COMPONENTS.map(d=>[d.id,{health:d.maxHealth,maxHealth:d.maxHealth,failedAt:null}]));}
export function biByeCondition(b = {}){
 const dead=BI_BYE_COMPONENTS.filter(d=>(b.components?.[d.id]?.health??d.maxHealth)<=0);
 const wheels=dead.filter(d=>d.kind==='wheel'), stabilizers=dead.filter(d=>d.kind==='stabilizer');
 const immobilized=wheels.length>=3||['L','R'].some(s=>wheels.filter(d=>d.side===s).length>=2);
 const alive=b.mode!=='DESTROYED'&&(b.health??1)>0;
 return {canDrive:alive&&!immobilized,driveScale:immobilized?0:wheels.length?Math.max(.45,1-wheels.length*.25):1,
  canDeploy:alive&&stabilizers.length<2,canSiege:alive&&stabilizers.length<2,failedWheels:wheels.length,failedStabilizers:stabilizers.length};
}
export function biByeDeployProgress(b,now=b.poseTime??0){
 if(b.mode==='DEPLOYED')return 1;
 if(b.mode==='DEPLOYING')return ease((now-b.modeTransitionStartedAt)/Math.max(.001,b.modeTransitionEndsAt-b.modeTransitionStartedAt));
 if(b.mode==='RETRACTING')return (b.retractFrom??1)*(1-ease((now-b.modeTransitionStartedAt)/Math.max(.001,b.modeTransitionEndsAt-b.modeTransitionStartedAt)));
 return 0;
}
export function biByeRootFrame(b) {
 return frame([b.x??b.position?.x??0,b.y??b.position?.y??0,b.z??b.position?.z??0],[(b.heading??0)+Math.PI,-(b.chassisPitch??0),b.chassisRoll??0]);
}
function localAim(parent,yaw,pitch) {
 const dir=[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
 const local=parent.axes.map(axis=>axis.reduce((n,v,i)=>n+v*dir[i],0));
 return {yaw:Math.atan2(local[0],local[2]),pitch:Math.asin(clamp(local[1],-1,1))};
}
export function biByeAimPose(b,now=b.poseTime??0){
 const heading=b.heading??0,root=biByeRootFrame(b);
 const main=(b.chassisPitch||b.chassisRoll)?localAim(root,b.mainYaw??b.yaw??heading,b.mainPitch??b.pitch??0):{yaw:Math.atan2(Math.sin((b.mainYaw??b.yaw??heading)-heading),Math.cos((b.mainYaw??b.yaw??heading)-heading)),pitch:b.mainPitch??b.pitch??0};
 let yaw=b.mode==='MOBILE'?0:main.yaw,pitch=b.mode==='MOBILE'?0:main.pitch;
 if(b.mode==='RETRACTING'){
  const start=Math.max(b.modeTransitionStartedAt,Math.min(b.couplingEndsAt??b.modeTransitionStartedAt,b.modeTransitionEndsAt-.001));
  const t=clamp((now-start)/Math.max(.001,b.modeTransitionEndsAt-start));
  yaw=(b.retractAim?.yaw??yaw)*(1-t);pitch=(b.retractAim?.pitch??pitch)*(1-t);
 }
 const traverse=frame([0,0,0],[yaw,0,0],root);
 const upper=localAim(traverse,b.upperYaw??b.yaw??heading,b.upperPitch??b.pitch??0);
 return {mainYaw:yaw,mainPitch:pitch,upperYaw:upper.yaw,upperPitch:upper.pitch};
}
export function biByeWheelSteering(steer){
 if(Math.abs(steer)<.001)return [0,0,0,0,0,0];
 const radius=4.25/Math.abs(steer),side=Math.sign(steer);
 const angle=(deg,x)=>Math.atan(Math.tan(deg*DEG)*radius/(radius-side*x))*side;
 return [-angle(18,-1.075),-angle(18,1.075),0,0,angle(10,-1.075),angle(10,1.075)];
}
// The same small, deterministic bends are used by hit geometry and presentation.
export function biByeComponentPose(b,def,now=b.poseTime??0){
 const c=b.components?.[def.id],damage=1-clamp((c?.health??def.maxHealth)/def.maxHealth);
 const failure=c?.health<=0?clamp((now-(c.failedAt??now))/.35):0;
 const sign=def.side==='L'?-1:1;
 if(def.kind==='wheel')return {pivot:[def.pivot[0],def.pivot[1]+(b.wheelOffsets?.[BI_BYE_COMPONENTS.indexOf(def)]??0)-.065*failure,def.pivot[2]],
  tilt:sign*(.035*damage+.22*failure),steer:(biByeWheelSteering(b.steer??0)[BI_BYE_COMPONENTS.indexOf(def)]??0)*(1-failure),damage};
 return {pivot:def.pivot,tilt:sign*(68*DEG*(1-biByeDeployProgress(b,now))+.26*failure)+(b.stabilizerTilts?.[BI_BYE_COMPONENTS.indexOf(def)-6]??0)*biByeDeployProgress(b,now),steer:0,damage};
}
export function biByeWheelTravel(a,b,steering){
 if(!a||Math.hypot(b.x-a.x,b.z-a.z)>3)return [0,0,0,0,0,0];
 const old=biByeRootFrame(a),next=biByeRootFrame(b);
 return BI_BYE_COMPONENTS.slice(0,6).map((d,i)=>{
  const p=boxWorld(old,[d.pivot[0],d.pivot[1]+(a.wheelOffsets?.[i]??0),d.pivot[2]]);
  const q=boxWorld(next,[d.pivot[0],d.pivot[1]+(b.wheelOffsets?.[i]??0),d.pivot[2]]);
  const direction=boxWorld(next,[Math.sin(steering[i]),0,Math.cos(steering[i])],true);
  return q.reduce((sum,v,k)=>sum+(v-p[k])*direction[k],0)/.55;
 });
}
function rotate(v,yaw=0,pitch=0,roll=0){
 let [x,y,z]=v;[x,y]=[x*Math.cos(roll)-y*Math.sin(roll),x*Math.sin(roll)+y*Math.cos(roll)];
 [y,z]=[y*Math.cos(pitch)-z*Math.sin(pitch),y*Math.sin(pitch)+z*Math.cos(pitch)];
 return [x*Math.cos(yaw)+z*Math.sin(yaw),y,-x*Math.sin(yaw)+z*Math.cos(yaw)];
}
function frame(origin,rotation,parent){
 const axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,...rotation));
 if(!parent)return {center:origin,axes};
 return {center:boxWorld(parent,origin),axes:axes.map(a=>boxWorld(parent,a,true))};
}
export function biByeFrames(b,now=b.poseTime??0){
 const root=biByeRootFrame(b);
 const p=biByeAimPose(b,now),traverse=frame([0,1.24,0],[p.mainYaw,0,0],root);
 const cradle=frame([0,.38,-.12],[0,-p.mainPitch,0],traverse);
 const upper=frame([0,1.54,.08],[p.upperYaw,-p.upperPitch,0],traverse);
 return {root,traverse,cradle,upper};
}
export function biByeHitVolumes(b,now=b.poseTime??0){
 if(!b)return [];
 const {root,traverse,cradle,upper}=biByeFrames(b,now),result=[];
 const add=(componentId,material,center,size,parent,rotation=[0,0,0],assembly=parent===upper?'upper':parent===cradle?'main':'carriage')=>result.push({...frame(center,rotation,parent),size,assembly,id:'bibye-hit-'+componentId+'-'+result.length,componentId,material,kind:'siege-component'});
 add('hull','timber',[0,.78,-.07],[2.1,.24,3.42],root);
 add('hull','timber',[0,.45,-.24],[.34,.4,3.2],root);
 add('hull','metal',[0,.74,-2.30],[.96,.2,.17],root);
 add('hull','metal',[0,.77,0],[.28,1.54,.28],traverse);
 if(b.mode==='DESTROYED'){result.length=1;result[0].center=boxWorld(root,[0,.65,-.374]);result[0].size=[2.46,1.3,4.022];return result;}
 // Small volumes cover actual stocks and mantlets rather than the empty bow span.
 if(b.mode!=='DESTROYED'){
  add('hull','timber',[0,.18,.3],[.32,.35,2.25],cradle);
  for(const sign of [-1,1])add('hull','metal',[sign*.85,.23,1.15],[.55,.8,.22],cradle);
  add('hull','metal',[0,.08,.03],[.55,.32,1.6],upper);
  for(const sign of [-1,1]){
   const mainLimb=frame([sign*.88,.18,1.04],[sign*25*DEG,0,0],cradle);
   add('hull','timber',[sign*.84,0,-.02],[1.98,.44,.48],mainLimb,[0,0,0],'main');
   const upperLimb=frame([sign*.3,.14,.26],[sign*25*DEG,0,0],upper);
   add('hull','metal',[sign*.436,0,-.025],[1.03,.23,.27],upperLimb,[0,0,0],'upper');
  }
  add('hull','metal',[0,.2,-.92],[1.61,.61,.5],traverse);result.at(-1).id='bibye-hit-winch';
  add('hull','metal',[-.42,.53,-.92],[.11,.47,.09],traverse);
  add('hull','timber',[0,.87,-1.86],[.57,.18,.36],root);result.at(-1).id='bibye-hit-cockpit-seat';
  add('hull','metal',[0,1.34,-2.07],[.56,.64,.12],root);result.at(-1).id='bibye-hit-cockpit-back';
  add('hull','metal',[0,.495,-1.49],[.88,.07,.5],root);result.at(-1).id='bibye-hit-cockpit-footrest';
  for(const x of [-.28,.28])add('hull','metal',[x,.91,-1.44],[.10,.78,.12],root);
 }
 for(const def of BI_BYE_COMPONENTS){
  const p=biByeComponentPose(b,def,now),f=frame(p.pivot,[p.steer,0,p.tilt],root),s=def.side==='L'?-1:1;
  if(def.kind==='wheel')add(def.id,'timber',[s*.0185,0,0],[.347,1.112,1.112],f);
  else {
   // Beam and planting shoe, not one large box containing the empty A frame.
   add(def.id,'timber',[s*.35,-.375,0],[.16,1.03,.14],f,[0,0,s*43*DEG]);
   add(def.id,'metal',[s*.24,-.41,0],[.09,.68,.10],f,[0,0,s*56*DEG]);
   add(def.id,'metal',[s*.71,-.765,0],[.45,.11,.45],f);
  }
 }
 return result;
}
export function biByeFirstHit(b,start,end,now=b.poseTime??0,grow=0,ignoreAssembly=null){
 let best=null;
 for(const box of biByeHitVolumes(b,now)){
  if(box.assembly===ignoreAssembly)continue;
  const h=orientedBoxHit(start,end,box,grow);if(h&&(!best||h.t<best.t))best=h;
 }return best;
}
export function biByeBlastAllocations(b,{point,radius,damage,excludeComponent=null},now=b.poseTime??0,solids=[]){
 if(!b||b.mode==='DESTROYED'||!(damage>0)||!(radius>0))return [];
 const origin=[point.x,point.y,point.z],volumes=biByeHitVolumes(b,now),weights=new Map();
 for(const box of volumes){
  if(box.componentId===excludeComponent||(box.componentId!=='hull'&&b.components[box.componentId].health<=0))continue;
  const near=boxNearest(box,origin),dist=Math.hypot(...near.map((v,i)=>v-origin[i]));if(dist>=radius)continue;
  // Stop just outside the surface. World and other machine components can shelter it.
  const end=near.map((v,i)=>origin[i]+(v-origin[i])*.999);
  const covered=solids.some(s=>!String(s.id??'').startsWith('bibye-')&&segmentAabbHit(origin,end,s))||
   volumes.some(other=>other.componentId!==box.componentId&&orientedBoxHit(origin,end,other));
  if(covered)continue;
  weights.set(box.componentId,Math.max(weights.get(box.componentId)??0,1-dist/radius));
 }
 const entries=[...weights],sum=entries.reduce((n,[,w])=>n+w,0);
 // Exposure cannot create more total damage than one central hit.
 return entries.map(([componentId,w])=>({componentId,amount:Math.floor(damage*w/Math.max(1,sum))})).filter(x=>x.amount>0);
}

// Clamp in the inclined mechanical frame, then return an ordinary world aim.
export function biByeConstrainAim(b,aim,upper=false){
 if(!(b.chassisPitch||b.chassisRoll)&&aim.pitch>=-.15&&aim.pitch<=.35&&(upper||Math.abs(Math.atan2(Math.sin(aim.yaw-(b.heading??0)),Math.cos(aim.yaw-(b.heading??0))))<=Math.PI/4))return {...aim};
 const root=biByeRootFrame(b),main=biByeAimPose(b),parent=upper?frame([0,0,0],[main.mainYaw,0,0],root):root;
 const local=localAim(parent,aim.yaw,aim.pitch),yaw=upper?local.yaw:clamp(local.yaw,-Math.PI/4,Math.PI/4),pitch=clamp(local.pitch,-.15,.35);
 const dir=boxWorld(parent,[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],true);
 return {yaw:Math.atan2(-dir[0],-dir[2]),pitch:Math.atan2(dir[1],Math.hypot(dir[0],dir[2]))};
}
