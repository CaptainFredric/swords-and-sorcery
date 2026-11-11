import { resolvePlayerWorld, segmentAabbHit, surfaceHeightAt } from './collision.mjs';
import { edgeClipTeleport, edgeInside } from './edgeBoundary.mjs';
import { MOVEMENT } from './movement.mjs';
import { oneHitTeleportReach } from './oneHitOfWondersRules.mjs';

const xyz = p => [p.x,p.y,p.z];
export const oneHitAlong = (a,b,t) => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });

export function planOneHitTeleport({ origin, yaw, pitch, aerial, holdSec, world, solids = world.solids ?? [], edge }) {
  const distance = Math.max(.65, oneHitTeleportReach(Math.max(0, holdSec)));
  const angle = aerial ? pitch : 0;
  const wanted = { x:origin.x-Math.sin(yaw)*Math.cos(angle)*distance,
    y:origin.y+Math.sin(angle)*distance, z:origin.z-Math.cos(yaw)*Math.cos(angle)*distance };
  const target = edge ? edgeClipTeleport(origin,wanted,edge,MOVEMENT.playerRadius) : wanted;
  if (!target) return { end: origin, legal: false };
  const a=[origin.x,origin.y+1,origin.z],b=[target.x,target.y+1,target.z];
  const rayLength=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
  let t=1;
  for(const box of solids) {
    const hit=segmentAabbHit(a,b,box);
    if(hit)t=Math.min(t,Math.max(0,hit.t-.55/Math.max(rayLength,.01)));
  }
  if(aerial){
    const ground=oneHitWorldContact(origin,target,{floors:world.floors,ramps:world.ramps});
    if(ground)t=Math.min(t,Math.max(0,ground.t-.12/Math.max(rayLength,.01)));
  }
  let end=oneHitAlong(origin,target,t);
  if(aerial&&((world.floors?.length??0)+(world.ramps?.length??0))>0){
    // An aerial arrival must still be over the world: with no ground anywhere beneath it, the knight would only fall
    // out of the arena. The aim is drawn back along its own line to the last point that has ground under it.
    const supported=point=>surfaceHeightAt(point.x,point.z,point.y+.5,world)!==null;
    const stepBack=.5/Math.max(rayLength,.01);
    while(t>0&&!supported(end)){t=Math.max(0,t-stepBack);end=oneHitAlong(origin,target,t);}
    if(!supported(end))return {end,legal:false};
  }
  const resolved=resolvePlayerWorld(end,MOVEMENT.playerRadius,solids);
  if(Math.hypot(resolved.x-end.x,resolved.z-end.z)>.1 ||
    (edge&&!edgeInside(end,edge.center,edge.radius,MOVEMENT.playerRadius)))return {end,legal:false};
  if(!aerial) {
    const floor=surfaceHeightAt(end.x,end.z,end.y,world);
    if(floor===null||Math.abs(floor-end.y)>2)return {end,legal:false};
    end.y=floor;
  }
  return {end,legal:true};
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
