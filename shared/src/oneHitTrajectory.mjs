import { resolvePlayerWorld, segmentAabbHit, surfaceHeightAt } from './collision.mjs';
import { edgeClipTeleport, edgeInside } from './edgeBoundary.mjs';
import { MOVEMENT } from './movement.mjs';
import { oneHitTeleportReach } from './oneHitOfWondersRules.mjs';

const xyz = p => [p.x,p.y,p.z];
export const oneHitAlong = (a,b,t) => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });

export function planOneHitTeleport({
  origin,yaw,pitch,aerial=false,allowVertical=aerial,holdSec,world,
  solids=world.solids??[],edge,
}) {
  const distance=Math.max(.65,oneHitTeleportReach(Math.max(0,holdSec)));
  const angle=allowVertical?Math.max(-1.45,Math.min(1.45,pitch||0)):0;
  const wanted={x:origin.x-Math.sin(yaw)*Math.cos(angle)*distance,
    y:origin.y+Math.sin(angle)*distance,z:origin.z-Math.cos(yaw)*Math.cos(angle)*distance};
  const target=edge?edgeClipTeleport(origin,wanted,edge,MOVEMENT.playerRadius):wanted;
  if(!target)return {end:origin,legal:false};
  const a=[origin.x,origin.y+1,origin.z],b=[target.x,target.y+1,target.z];
  const rayLength=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
  let t=1;
  for(const box of solids){
    const hit=segmentAabbHit(a,b,box);
    if(hit)t=Math.min(t,Math.max(0,hit.t-.55/Math.max(rayLength,.01)));
  }
  // A downward 3D teleport can ARRIVE ON the floor; do not always stop a
  // hand's breadth above it and insist on the aerial wave. World contact is
  // one-sided so upward teleports through an ordinary floor are not blocked.
  if(allowVertical){
    const ground=oneHitWorldContact(origin,target,{floors:world.floors,ramps:world.ramps});
    if(ground?.kind==='ground')t=Math.min(t,ground.t);
  }
  let end=oneHitAlong(origin,target,t);
  const floorAt=point=>surfaceHeightAt(point.x,point.z,
    Math.max(point.y,origin.y)+1,world);
  let floor=floorAt(end);
  const hasTerrain=((world.floors?.length??0)+(world.ramps?.length??0))>0;
  if(allowVertical&&hasTerrain){
    // Never teleport over the void. Clip to the nearest supported part of
    // this SAME ray; a failed destination cannot grant arbitrary flight.
    const stepBack=.5/Math.max(rayLength,.01);
    while(t>0&&floor===null){
      t=Math.max(0,t-stepBack);
      end=oneHitAlong(origin,target,t);
      floor=floorAt(end);
    }
    if(floor===null)return {end,legal:false};
  }
  const resolved=resolvePlayerWorld(end,MOVEMENT.playerRadius,solids);
  if(Math.hypot(resolved.x-end.x,resolved.z-end.z)>.1||
     (edge&&!edgeInside(end,edge.center,edge.radius,MOVEMENT.playerRadius)))
    return {end,legal:false};
  if(!allowVertical){
    // Full Lightning without Gale is still a ground-distance teleport.
    if(floor===null||Math.abs(floor-end.y)>2)return {end,legal:false};
    end.y=floor;
    return {end,legal:true,grounded:true};
  }
  // Form is an ARRIVAL fact, not the takeoff state. A grounded ascent
  // becomes aerial; a descending aerial teleport can become a ground slam.
  const grounded=floor!==null&&Math.abs(end.y-floor)<=.23;
  if(grounded)end.y=floor;
  return {end,legal:true,grounded};
}

// Floors and ramps are one-sided supporting planes, not necessarily in solids.
export function oneHitWorldContact(from,to,world) {
  const a=xyz(from),b=xyz(to);
  let result=null;
  for(const box of world.solids??[]) {
    const hit=segmentAabbHit(a,b,box);
    if(hit&&(!result||hit.t<result.t))result={t:hit.t,kind:'solid',normal:hit.normal};
  }
  const plane=(startHeight,endHeight,minX,maxX,minZ,maxZ)=>{
    const start=from.y-startHeight,end=to.y-endHeight;
    if(start<0||end>0||start-end<1e-8)return;
    const t=start/(start-end);
    if(result&&t>=result.t)return;
    const p=oneHitAlong(from,to,t);
    if(p.x>=minX&&p.x<=maxX&&p.z>=minZ&&p.z<=maxZ)result={t,kind:'ground',normal:[0,1,0]};
  };
  for(const floor of world.floors??[]) {
    const [x,,z]=floor.center,[w,,l]=floor.size;
    plane(floor.y,floor.y,x-w/2,x+w/2,z-l/2,z+l/2);
  }
  for(const ramp of world.ramps??[]) {
    const alongZ=ramp.axis==='z';
    const lo=alongZ?ramp.minZ:ramp.minX, hi=alongZ?ramp.maxZ:ramp.maxX;
    if(hi<=lo)continue;
    const height=p=>ramp.startY+(ramp.endY-ramp.startY)*((alongZ?p.z:p.x)-lo)/(hi-lo);
    plane(height(from),height(to),ramp.minX,ramp.maxX,ramp.minZ,ramp.maxZ);
  }
  return result;
}
