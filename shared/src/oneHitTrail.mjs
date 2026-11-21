// Server/client shared 3D geometry for Full Gale + Frost's elemental wake.
// A thin line, unlike an AoE sphere, has no ground projection and cannot
// reach enemies on the floor when the wave passes high above them.
export const ONE_HIT_WAKE=Object.freeze({
  baseRadius:.9,fireRadius:1.85,bodyRadius:.4,
  burnLick:2,burnInterval:.3,
});
export const galeFrostWakeEnabled=tiers=>(tiers?.gale??0)>=2&&(tiers?.frost??0)>=1;
export const galeFrostWakeRadius=tiers=>
  (tiers?.fire??0)>=1?ONE_HIT_WAKE.fireRadius:ONE_HIT_WAKE.baseRadius;
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export function closestWakePoint(points,point){
 if(!finite(point)||!Array.isArray(points)||!points.length)return null;
 let result=null;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[Math.min(i+1,points.length-1)];
  if(!finite(a)||!finite(b))continue;
  const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  const len=ab.x*ab.x+ab.y*ab.y+ab.z*ab.z;
  const frac=len?Math.max(0,Math.min(1,
    ((point.x-a.x)*ab.x+(point.y-a.y)*ab.y+(point.z-a.z)*ab.z)/len)):0;
  const nearest={x:a.x+ab.x*frac,y:a.y+ab.y*frac,z:a.z+ab.z*frac};
  const distance=Math.hypot(point.x-nearest.x,point.y-nearest.y,point.z-nearest.z);
  if(!result||distance<result.distance)
   result={...nearest,distance,segment:i,fraction:frac};
 }
 return result;
}
export function wakeContact(field,position){
 const near=closestWakePoint(field?.trailPoints,position);
 if(!near)return 0;
 const radius=Math.max(0,field.radius??ONE_HIT_WAKE.baseRadius);
 return Math.max(0,Math.min(1,(radius+ONE_HIT_WAKE.bodyRadius-near.distance)/
    (2*ONE_HIT_WAKE.bodyRadius)));
}
