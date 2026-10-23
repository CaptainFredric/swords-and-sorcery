import { BI_BYE_COMPONENTS, biByeRootFrame, biByeHitVolumes, biByeWheelSteering } from './biByeComponents.mjs';
import { boxWorld } from '../src/orientedBox.mjs';

const RAD=Math.PI/180, R=.55, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const BI_BYE_TERRAIN=Object.freeze({mobileGrade:22*RAD,deployedGrade:8*RAD,step:.25,wheelTravel:.125,padAdjustment:.08});
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const inside=(s,x,z)=>x>=s.x0-1e-7&&x<=s.x1+1e-7&&z>=s.z0-1e-7&&z<=s.z1+1e-7;
const height=(s,x,z)=>s.a*x+s.c*z+s.d;
function flat(box,y){return {x0:box.center[0]-box.size[0]/2,x1:box.center[0]+box.size[0]/2,z0:box.center[2]-box.size[2]/2,z1:box.center[2]+box.size[2]/2,a:0,c:0,d:y};}
export function biByeTerrainContext(world,b,others=[]){
 const near=s=>s.x1>=b.x-5&&s.x0<=b.x+5&&s.z1>=b.z-5&&s.z0<=b.z+5;
 const surfaces=(world?.floors??[]).map(f=>flat(f,f.y??f.center[1]+f.size[1]/2));
 for(const r of world?.ramps??[]){const axis=r.axis==='x'?'x':'z',lo=axis==='x'?r.minX:r.minZ,hi=axis==='x'?r.maxX:r.maxZ,k=(r.endY-r.startY)/(hi-lo);surfaces.push({x0:r.minX,x1:r.maxX,z0:r.minZ,z1:r.maxZ,a:axis==='x'?k:0,c:axis==='z'?k:0,d:r.startY-k*lo});}
 // Empty worlds used by simulation fixtures represent an implicit flat plane.
 if(!world||!('floors' in world)&&!('ramps' in world))surfaces.push({x0:-Infinity,x1:Infinity,z0:-Infinity,z1:Infinity,a:0,c:0,d:b.y??0});
 const ground=surfaces.filter(near),solids=[...(world?.solids??[]),...others].filter(s=>!String(s.id??'').startsWith('bibye-'));
 const obstacles=solids.filter(s=>near(flat(s,0)));
 for(const s of obstacles){
  if(s.axes||s.size[1]>BI_BYE_TERRAIN.step+1e-7)continue;
  const top=s.center[1]+s.size[1]/2,bottom=top-s.size[1];
  if(ground.some(g=>inside(g,s.center[0],s.center[2])&&Math.abs(height(g,s.center[0],s.center[2])-bottom)<.025))ground.push({...flat(s,top),solid:s});
 }
 return {surfaces:ground,solids:[...obstacles,...(world?.floors??[]).filter(f=>near(flat(f,0))).map(f=>({...f,terrainFloor:true}))]};
}
function groundAt(ctx,x,z,ceiling=Infinity){
 let best=null;for(const s of ctx.surfaces)if(inside(s,x,z)){const h=height(s,x,z);if(h<=ceiling+1e-7&&(best===null||h>best))best=h;}return best;
}
// Maximise the lower semicircle against each rectangular ground plane. Including
// rectangle intersections makes a curb roll continuous instead of sampling steps.
function circleSupport(ctx,p,u,v,ceiling){
 let best=-Infinity;
 for(const s of ctx.surfaces){
  if(p[0]+R+.18<s.x0||p[0]-R-.18>s.x1||p[2]+R+.18<s.z0||p[2]-R-.18>s.z1)continue;
  const A=s.a*u[0]+s.c*u[2]-u[1],B=-s.a*v[0]-s.c*v[2]+v[1];
  const ts=[-Math.PI/2,0,Math.PI/2,Math.atan2(A,B)];
  for(const [axis,edge] of [[0,s.x0],[0,s.x1],[2,s.z0],[2,s.z1]]){
   const P=u[axis],Q=-v[axis],mag=Math.hypot(P,Q);if(!Number.isFinite(edge)||mag<1e-9)continue;
   const k=(edge-p[axis])/mag;if(Math.abs(k)>1)continue;
   const phase=Math.atan2(Q,P),asin=Math.asin(k);
   for(const base of [asin-phase,Math.PI-asin-phase])for(const n of [-1,0,1])ts.push(base+n*2*Math.PI);
  }
  for(const t of ts){if(t< -Math.PI/2-1e-7||t>Math.PI/2+1e-7)continue;
   const x=p[0]+u[0]*Math.sin(t)-v[0]*Math.cos(t),z=p[2]+u[2]*Math.sin(t)-v[2]*Math.cos(t);
   if(!inside(s,x,z)||height(s,x,z)>ceiling)continue;
   best=Math.max(best,height(s,p[0],p[2])+A*Math.sin(t)+B*Math.cos(t));
  }
 }
 return best;
}
function planeFit(points){
 const n=points.length,m=points.reduce((s,p)=>s+p[2],0)/n;
 const mx=points.reduce((s,p)=>s+p[0],0)/n,mz=points.reduce((s,p)=>s+p[1],0)/n;
 let xx=0,zz=0,xz=0,xy=0,zy=0;
 for(const [x,z,y]of points){xx+=(x-mx)**2;zz+=(z-mz)**2;xz+=(x-mx)*(z-mz);xy+=(x-mx)*(y-m);zy+=(z-mz)*(y-m);}
 const det=xx*zz-xz*xz,a=(xy*zz-zy*xz)/det,c=(zy*xx-xy*xz)/det;
 return {a,c,d:m-a*mx-c*mz};
}
export function biByeTerrainPose(b,ctx){
 let pose={...b},contacts=[];
 const steering=biByeWheelSteering(b.steer??0),wheelDefs=BI_BYE_COMPONENTS.slice(0,6);
 for(let iteration=0;iteration<5;iteration++){
  const root=biByeRootFrame(pose),v=root.axes[1].map(n=>n*R);
  contacts=wheelDefs.map((def,i)=>{
   const p=boxWorld(root,def.pivot),dir=boxWorld(root,[Math.sin(steering[i]),0,Math.cos(steering[i])],true),u=dir.map(n=>n*R);
   const direct=groundAt(ctx,p[0],p[2],p[1]+.35);
   if(direct===null||p[1]-direct>R+.32||direct-p[1]>BI_BYE_TERRAIN.step)return null;
   let y=-Infinity;
   for(const lane of [-.13,0,.13]){const q=p.map((n,k)=>n+root.axes[0][k]*lane);y=Math.max(y,circleSupport(ctx,q,u,v,p[1]+.35)-root.axes[0][1]*lane);}
   return Number.isFinite(y)?[def.pivot[0],def.pivot[2],y]:null;
  });
  if(contacts.some(p=>!p))return null;
  const plane=planeFit(contacts),pitch=Math.asin(clamp(plane.c,-1,1)),roll=Math.asin(clamp(plane.a/Math.cos(pitch),-1,1));
  const grade=Math.acos(clamp(Math.cos(pitch)*Math.cos(roll),-1,1));
  if(grade>BI_BYE_TERRAIN.mobileGrade+.002)return null;
  pose={...pose,chassisPitch:Math.abs(pitch)<1e-10?0:pitch,chassisRoll:Math.abs(roll)<1e-10?0:roll,y:plane.d-R*Math.cos(pitch)*Math.cos(roll)};
 }
 const root=biByeRootFrame(pose),up=root.axes[1][1];
 let offsets=contacts.map(([x,z,y],i)=>(y-boxWorld(root,wheelDefs[i].pivot)[1])/up);
 const center=(Math.max(...offsets)+Math.min(...offsets))/2;
 pose.y+=center*up;offsets=offsets.map(v=>v-center);
 if(offsets.some(v=>Math.abs(v)>BI_BYE_TERRAIN.wheelTravel+1e-6))return null;
 return {y:pose.y,chassisPitch:pose.chassisPitch,chassisRoll:pose.chassisRoll,wheelOffsets:offsets};
}
function overlaps(a,b){
 const B=b.axes??[[1,0,0],[0,1,0],[0,0,1]],delta=b.center.map((n,i)=>n-a.center[i]);
 for(const axis of [...a.axes,...B,...a.axes.flatMap(u=>B.map(v=>cross(u,v)))]){
  if(dot(axis,axis)<1e-10)continue;
  const radius=(box,axes)=>axes.reduce((n,v,i)=>n+Math.abs(dot(v,axis))*box.size[i]/2,0);
  if(Math.abs(dot(delta,axis))>=radius(a,a.axes)+radius(b,B)-.002)return false;
 }return true;
}
export function biByeTerrainClear(b,ctx){
 const volumes=biByeHitVolumes(b).filter(v=>!v.componentId.startsWith('Stabilizer_'));
 for(const v of volumes){
  for(const solid of ctx.solids){
   const low=ctx.surfaces.some(s=>s.solid===solid);
   if((low||solid.terrainFloor)&&v.componentId.startsWith('Wheel_'))continue;
   if(overlaps(v,solid))return false;
  }
  if(v.componentId==='hull'&&v.assembly==='carriage'){
   for(const x of [-.5,.5])for(const z of [-.5,0,.5]){
    const p=boxWorld(v,[x*v.size[0],-.5*v.size[1],z*v.size[2]]),g=groundAt(ctx,p[0],p[2],p[1]+.4);
    if(g!==null&&g>p[1]+.012)return false;
   }
  }
 }
 return true;
}
export function biByeDeploymentSupport(b,world){
 const ctx=biByeTerrainContext(world,b),root=biByeRootFrame(b),grade=Math.acos(clamp(root.axes[1][1],-1,1));
 if(grade>BI_BYE_TERRAIN.deployedGrade+1e-6)return {ok:false,reason:'Too steep to deploy. Find flatter ground.'};
 const tilts=[];
 for(const def of BI_BYE_COMPONENTS.slice(6)){
  if((b.components?.[def.id]?.health??150)<=0){tilts.push(0);continue;}
  const sign=def.side==='L'?-1:1;
  const shoe=t=>{const x=sign*.71,y=-.765-.055;return boxWorld(root,[def.pivot[0]+x*Math.cos(t)-y*Math.sin(t),def.pivot[1]+x*Math.sin(t)+y*Math.cos(t),def.pivot[2]]);};
  let lo=-BI_BYE_TERRAIN.padAdjustment,hi=-lo;
  for(let k=0;k<16;k++){const mid=(lo+hi)/2,p=shoe(mid),g=groundAt(ctx,p[0],p[2],p[1]+.2);if(g===null)return {ok:false,reason:'Stabilizers need supported ground.'};if((p[1]-g)*sign>0)hi=mid;else lo=mid;}
  const tilt=(lo+hi)/2,p=shoe(tilt),g=groundAt(ctx,p[0],p[2],p[1]+.2);
  if(g===null||Math.abs(p[1]-g)>.035)return {ok:false,reason:'Stabilizers cannot reach stable ground.'};
  for(const dx of [-.2,.2])for(const dz of [-.2,.2]){const q=boxWorld(root,[def.pivot[0]+sign*.71+dx,0,def.pivot[2]+dz]),h=groundAt(ctx,q[0],q[2],p[1]+.3);if(h===null||Math.abs(h-g)>.09)return {ok:false,reason:'Stabilizers need supported ground.'};}
  tilts.push(tilt);
 }
 return {ok:true,tilts};
}
