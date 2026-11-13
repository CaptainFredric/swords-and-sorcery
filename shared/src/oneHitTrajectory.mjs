import { resolvePlayerWorld, segmentAabbHit, surfaceHeightAt } from './collision.mjs';
import { edgeClipTeleport, edgeInside } from './edgeBoundary.mjs';
import { MOVEMENT } from './movement.mjs';
import { oneHitTeleportReach } from './oneHitOfWondersRules.mjs';

const xyz = p => [p.x,p.y,p.z];
export const oneHitAlong = (a,b,t) => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });

// Aiming comes from the CURRENT view at release, not the facing at charge
// startup. Any azimuth is legal; only Full Gale grants elevation (up to
// directly overhead/underfoot). This same function drives server and guide.
export function oneHitAimDirection(yaw, pitch, allowVertical = false) {
  const heading=Number.isFinite(yaw)?yaw:0;
  const elevation=allowVertical && Number.isFinite(pitch)
    ?Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch)):0;
  return {x:-Math.sin(heading)*Math.cos(elevation),
    y:Math.sin(elevation),z:-Math.cos(heading)*Math.cos(elevation)};
}

export function planOneHitTeleport({
  origin,yaw,pitch,aerial=false,allowVertical=aerial,holdSec,world,
  solids=world.solids??[],edge,
}) {
  const distance=Math.max(.65,oneHitTeleportReach(Math.max(0,holdSec)));
  const aim=oneHitAimDirection(yaw,pitch,allowVertical);
  const wanted={x:origin.x+aim.x*distance,
    y:origin.y+aim.y*distance,z:origin.z+aim.z*distance};
  const target=edge?edgeClipTeleport(origin,wanted,edge,MOVEMENT.playerRadius):wanted;
  if(!target)return {end:origin,legal:false};
  const a=[origin.x,origin.y+1,origin.z],b=[target.x,target.y+1,target.z];
  const rayLength=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
  let t=1;
  for(const box of solids){
    const hit=segmentAabbHit(a,b,box);
    if(hit)t=Math.min(t,Math.max(0,hit.t-.55/Math.max(rayLength,.01)));
  }
  const floorAt=point=>surfaceHeightAt(point.x,point.z,
    Math.max(point.y,origin.y)+1,world);
  // Feet begin ON the floor. Casting a downward ray from the feet hit
  // that same floor at t=0, so every downward Full Gale aim silently
  // teleported in place. A grounded cast aims from eye height instead;
  // an airborne descent retains its original feet-to-ground contact.
  const originFloor=floorAt(origin);
  const standing=allowVertical&&!aerial&&originFloor!==null&&
    Math.abs(origin.y-originFloor)<=.24;
  const eyeOffset=standing?1.45:0;
  if(allowVertical){
    const from={...origin,y:origin.y+eyeOffset};
    const to={...target,y:target.y+eyeOffset};
    const ground=oneHitWorldContact(from,to,{floors:world.floors,ramps:world.ramps});
    if(ground?.kind==='ground')t=Math.min(t,ground.t);
  }
  let end=oneHitAlong(origin,target,t);
  let floor=floorAt(end);
  // The teleport ends with the knight's FEET on the surface hit by the
  // eye ray; the camera ray's height is not a displacement into the soil.
  if(standing&&floor!==null&&end.y<floor)end.y=floor;
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
    // Lightning alone uses a horizontal projection of the player's look.
    // Its feet remain on supported ground. A lower platform beyond a ledge
    // is a legal DESTINATION: traverse at the original altitude, then drop
    // vertically to support, never gain altitude because the view looked up.
    if(floor===null||floor>origin.y+1.1)return {end,legal:false};
    if(floor<end.y-.24){
      const dropFrom=[end.x,end.y+1.05,end.z],dropTo=[end.x,floor+1.05,end.z];
      if(solids.some(box=>segmentAabbHit(dropFrom,dropTo,box)))
        return {end,legal:false};
    }
    const landing={...end,y:floor};
    const clear=resolvePlayerWorld(landing,MOVEMENT.playerRadius,solids);
    if(Math.hypot(clear.x-end.x,clear.z-end.z)>.1)return {end,legal:false};
    end.y=floor;
    return {end,legal:true,grounded:true,groundLocked:true,
      verticalDrop:Math.max(0,origin.y-floor)};
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
